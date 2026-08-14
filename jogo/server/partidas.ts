import crypto from 'node:crypto';
import { criarPartida } from '../src/engine/criar.ts';
import { aplicarComando } from '../src/engine/reduzir.ts';
import { redigirEvento, visaoPara } from '../src/engine/visao.ts';
import type { Comando } from '../src/engine/comandos.ts';
import { SEGUNDOS_DE_REACAO, SEGUNDOS_DO_TURNO } from '../src/engine/estado.ts';
import { NOME_DO_FORMATO, type Formato } from '../src/data/tipos.ts';
import type { EstadoDoJogo, LadoId } from '../src/engine/estado.ts';
import type { Evento } from '../src/engine/eventos.ts';
import { inteiro, texto } from './banco.ts';
import { comConta, contaDoPedido } from './contas.ts';
import { ok, recusado } from './http.ts';
import type { Banco } from './banco.ts';
import type { Rota } from './http.ts';
import type http from 'node:http';

// O coração do online: o servidor é o único que roda o engine. Clientes mandam
// comandos por POST e recebem eventos redigidos por SSE; a visão nunca carrega
// a mão nem o deck do oponente.

/** turnos seguidos perdidos por tempo até a derrota por W.O. */
const PASSES_ATE_WO = 3;

interface PartidaViva {
  id: number;
  estado: EstadoDoJogo;
  contas: Record<LadoId, number>;
  apelidos: Record<LadoId, string>;
  seq: number;
  assinantes: Map<http.ServerResponse, LadoId>;
  timer: ReturnType<typeof setTimeout> | null;
  prazoEmMs: number;
  passesSeguidos: Record<LadoId, number>;
}

const vivas = new Map<number, PartidaViva>();

export interface JogadorDaPartida {
  contaId: number;
  apelido: string;
  heroi: string;
  cartas: number[];
  formato: Formato;
}

export function criarPartidaOnline(
  banco: Banco,
  jogadorA: JogadorDaPartida,
  jogadorB: JogadorDaPartida,
): number {
  // uma partida corre num formato só; quem parear decks diferentes erra antes daqui
  if (jogadorA.formato !== jogadorB.formato) {
    throw new Error(
      `Formatos diferentes: ${NOME_DO_FORMATO[jogadorA.formato]} contra` +
        ` ${NOME_DO_FORMATO[jogadorB.formato]}.`,
    );
  }
  const formato = jogadorA.formato;
  const seed = crypto.randomInt(1, 0xffffffff);
  const criada = criarPartida({
    seed,
    formato,
    decks: {
      a: { heroi: jogadorA.heroi, cartas: jogadorA.cartas },
      b: { heroi: jogadorB.heroi, cartas: jogadorB.cartas },
    },
  });

  const agora = new Date().toISOString();
  banco.executar(
    `INSERT INTO partidas (conta_a, conta_b, seed, formato, estado_json, seq, criada_em, atualizada_em)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    jogadorA.contaId,
    jogadorB.contaId,
    seed,
    formato,
    JSON.stringify(criada.estado),
    agora,
    agora,
  );
  const id = inteiro(banco.uma('SELECT last_insert_rowid() AS id')?.id);

  const viva: PartidaViva = {
    id,
    estado: criada.estado,
    contas: { a: jogadorA.contaId, b: jogadorB.contaId },
    apelidos: { a: jogadorA.apelido, b: jogadorB.apelido },
    seq: 0,
    assinantes: new Map(),
    timer: null,
    prazoEmMs: 0,
    passesSeguidos: { a: 0, b: 0 },
  };
  vivas.set(id, viva);
  registrarEventos(banco, viva, criada.eventos);
  armarTimer(banco, viva);
  return id;
}

/** Recarrega uma partida viva depois de um restart do servidor. */
function carregarViva(banco: Banco, id: number): PartidaViva | null {
  const naMemoria = vivas.get(id);
  if (naMemoria) return naMemoria;

  const linha = banco.uma('SELECT * FROM partidas WHERE id = ?', id);
  if (!linha || texto(linha.vencedor)) return null;

  const apelidoDe = (contaId: number): string =>
    texto(banco.uma('SELECT apelido FROM contas WHERE id = ?', contaId)?.apelido) || 'Jogador';

  const viva: PartidaViva = {
    id,
    estado: JSON.parse(texto(linha.estado_json)) as EstadoDoJogo,
    contas: { a: inteiro(linha.conta_a), b: inteiro(linha.conta_b) },
    apelidos: { a: apelidoDe(inteiro(linha.conta_a)), b: apelidoDe(inteiro(linha.conta_b)) },
    seq: inteiro(linha.seq),
    assinantes: new Map(),
    timer: null,
    prazoEmMs: 0,
    passesSeguidos: { a: 0, b: 0 },
  };
  vivas.set(id, viva);
  armarTimer(banco, viva);
  return viva;
}

export function partidaAtualDaConta(banco: Banco, contaId: number): number | null {
  const linha = banco.uma(
    `SELECT id FROM partidas
      WHERE vencedor IS NULL AND (conta_a = ? OR conta_b = ?)
      ORDER BY id DESC LIMIT 1`,
    contaId,
    contaId,
  );
  return linha ? inteiro(linha.id) : null;
}

function ladoDaConta(viva: PartidaViva, contaId: number): LadoId | null {
  if (viva.contas.a === contaId) return 'a';
  if (viva.contas.b === contaId) return 'b';
  return null;
}

function registrarEventos(banco: Banco, viva: PartidaViva, eventos: Evento[]): void {
  banco.emTransacao(() => {
    for (const evento of eventos) {
      viva.seq += 1;
      banco.executar(
        'INSERT INTO partida_eventos (partida_id, seq, evento_json) VALUES (?, ?, ?)',
        viva.id,
        viva.seq,
        JSON.stringify(evento),
      );
    }
    banco.executar(
      'UPDATE partidas SET estado_json = ?, seq = ?, vencedor = ?, motivo = ?, atualizada_em = ? WHERE id = ?',
      JSON.stringify(viva.estado),
      viva.seq,
      viva.estado.vencedor,
      viva.estado.motivoDoFim ?? null,
      new Date().toISOString(),
      viva.id,
    );
  });

  let seqBase = viva.seq - eventos.length;
  for (const evento of eventos) {
    seqBase += 1;
    for (const [resposta, lado] of viva.assinantes) {
      escreverEvento(resposta, seqBase, redigirEvento(evento, lado));
    }
  }
}

function escreverEvento(resposta: http.ServerResponse, seq: number, evento: Evento): void {
  resposta.write(`id: ${seq}\ndata: ${JSON.stringify(evento)}\n\n`);
}

function armarTimer(banco: Banco, viva: PartidaViva): void {
  if (viva.timer) clearTimeout(viva.timer);
  if (viva.estado.vencedor) {
    viva.timer = null;
    return;
  }
  // janela de reação: prazo curto e recusa automática, sem contar como passe
  const reacao = viva.estado.pendencia?.reacao ? viva.estado.pendencia : null;
  const segundos = reacao ? SEGUNDOS_DE_REACAO : SEGUNDOS_DO_TURNO;
  viva.prazoEmMs = Date.now() + segundos * 1000;
  viva.timer = setTimeout(() => {
    if (reacao) recusarReacao(banco, viva, reacao.id, reacao.lado);
    else estourarTempo(banco, viva);
  }, segundos * 1000);
  // um timer parado não segura o processo vivo
  viva.timer.unref?.();
}

function recusarReacao(banco: Banco, viva: PartidaViva, pendenciaId: string, lado: LadoId): void {
  if (viva.estado.vencedor) return;
  if (viva.estado.pendencia?.id !== pendenciaId) return;
  aplicarNaViva(banco, viva, { tipo: 'RESPONDER', lado, pendenciaId, opcaoId: 'recusar' });
}

function estourarTempo(banco: Banco, viva: PartidaViva): void {
  if (viva.estado.vencedor) return;

  // W.O.: quem estoura o próprio turno seguidas vezes perde a partida
  const responsavel = viva.estado.fase === 'mulligan' ? null : viva.estado.ladoAtivo;
  if (responsavel) {
    viva.passesSeguidos[responsavel] += 1;
    if (viva.passesSeguidos[responsavel] >= PASSES_ATE_WO) {
      aplicarNaViva(banco, viva, { tipo: 'CONCEDER', lado: responsavel });
      return;
    }
  }
  aplicarNaViva(banco, viva, { tipo: 'TEMPO_ESGOTADO' });
}

function aplicarNaViva(banco: Banco, viva: PartidaViva, comando: Comando): string | null {
  const resultado = aplicarComando(viva.estado, comando);
  if (resultado.erro) return resultado.erro;

  viva.estado = resultado.estado;
  registrarEventos(banco, viva, resultado.eventos);
  armarTimer(banco, viva);

  if (viva.estado.vencedor) {
    for (const resposta of viva.assinantes.keys()) resposta.end();
    viva.assinantes.clear();
    if (viva.timer) clearTimeout(viva.timer);
    vivas.delete(viva.id);
  }
  return null;
}

function fotografia(viva: PartidaViva, lado: LadoId): Record<string, unknown> {
  return {
    partidaId: viva.id,
    seq: viva.seq,
    prazoEmMs: viva.prazoEmMs,
    apelidos: { eu: viva.apelidos[lado], oponente: viva.apelidos[lado === 'a' ? 'b' : 'a'] },
    visao: visaoPara(viva.estado, lado),
  };
}

export const rotasDePartidas = (banco: Banco): Rota[] => [
  {
    metodo: 'GET',
    padrao: '/api/partidas/atual',
    responder: comConta(banco, (_pedido, conta) => {
      const id = partidaAtualDaConta(banco, conta.id);
      return ok({ partidaId: id });
    }),
  },
  {
    metodo: 'GET',
    padrao: '/api/partidas/:id',
    responder: comConta(banco, (pedido, conta) => {
      const viva = carregarViva(banco, Number(pedido.parametros.id));
      if (!viva) return recusado(404, 'partida não encontrada ou encerrada');
      const lado = ladoDaConta(viva, conta.id);
      if (!lado) return recusado(403, 'você não joga esta partida');
      return ok(fotografia(viva, lado));
    }),
  },
  {
    metodo: 'POST',
    padrao: '/api/partidas/:id/comandos',
    responder: comConta(banco, (pedido, conta) => {
      const viva = carregarViva(banco, Number(pedido.parametros.id));
      if (!viva) return recusado(404, 'partida não encontrada ou encerrada');
      const lado = ladoDaConta(viva, conta.id);
      if (!lado) return recusado(403, 'você não joga esta partida');

      const corpo = pedido.corpo as { comando?: Comando } | null;
      const comando = corpo?.comando;
      if (!comando || typeof comando.tipo !== 'string') return recusado(400, 'comando malformado');
      if (comando.tipo === 'TEMPO_ESGOTADO') return recusado(403, 'só o servidor esgota o tempo');

      // autoridade: o lado do comando é SEMPRE o do jogador autenticado,
      // não o que o cliente diz que é
      const comandoDoLado = { ...comando, lado } as Comando;
      const erro = aplicarNaViva(banco, viva, comandoDoLado);
      if (erro) return recusado(422, erro);

      viva.passesSeguidos[lado] = 0;
      const aindaViva = vivas.get(viva.id);
      return ok(aindaViva ? fotografia(aindaViva, lado) : { encerrada: true, seq: viva.seq });
    }),
  },
  {
    metodo: 'GET',
    padrao: '/api/partidas/:id/eventos',
    bruta: (pedido, resposta) => {
      const conta = contaDoPedido(banco, {
        ...pedido,
        // EventSource não manda cabeçalhos: o token viaja na query string
        autorizacao: pedido.busca.get('token') ? `Bearer ${pedido.busca.get('token')}` : pedido.autorizacao,
      });
      if (!conta) {
        resposta.writeHead(401, { 'content-type': 'application/json' });
        resposta.end(JSON.stringify({ erro: 'é preciso estar em uma conta' }));
        return;
      }
      const viva = carregarViva(banco, Number(pedido.parametros.id));
      if (!viva) {
        resposta.writeHead(404, { 'content-type': 'application/json' });
        resposta.end(JSON.stringify({ erro: 'partida não encontrada ou encerrada' }));
        return;
      }
      const lado = ladoDaConta(viva, conta.id);
      if (!lado) {
        resposta.writeHead(403, { 'content-type': 'application/json' });
        resposta.end(JSON.stringify({ erro: 'você não joga esta partida' }));
        return;
      }

      resposta.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      resposta.write(':oi\n\n');

      // reentrega o que faltou (reconexão): ?desde=N ou Last-Event-ID
      const desde = Number(pedido.busca.get('desde')) || 0;
      if (desde < viva.seq) {
        const linhas = banco.todas(
          'SELECT seq, evento_json FROM partida_eventos WHERE partida_id = ? AND seq > ? ORDER BY seq',
          viva.id,
          desde,
        );
        for (const linha of linhas) {
          const evento = JSON.parse(texto(linha.evento_json)) as Evento;
          escreverEvento(resposta, inteiro(linha.seq), redigirEvento(evento, lado));
        }
      }

      viva.assinantes.set(resposta, lado);
      const batimento = setInterval(() => resposta.write(':hb\n\n'), 25_000);
      resposta.on('close', () => {
        clearInterval(batimento);
        viva.assinantes.delete(resposta);
      });
    },
  },
];
