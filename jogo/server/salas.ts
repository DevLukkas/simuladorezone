import crypto from 'node:crypto';
import { inteiro, texto } from './banco.ts';
import { comConta } from './contas.ts';
import { deckParaPartida } from './decks.ts';
import { criado, ok, recusado } from './http.ts';
import { criarPartidaOnline, partidaAtualDaConta } from './partidas.ts';
import { NOME_DO_FORMATO, type Formato } from '../src/data/tipos.ts';
import type { Banco } from './banco.ts';
import type { Rota } from './http.ts';

// Duas portas para o PvP: fila (dois na fila = pareia) e sala com código de
// convite (EZ-XXXX). As duas desembocam em criarPartidaOnline; quem espera
// descobre a partida por GET /api/partidas/atual.

interface EsperaNaFila {
  contaId: number;
  apelido: string;
  deckId: number;
}

// uma fila POR formato: parear decks de formatos diferentes daria uma partida
// impossível, então quem entra com deck novo só encontra quem também está no novo
const filas = new Map<Formato, EsperaNaFila>();

const HORAS_DE_VIDA_DA_SALA = 2;

// alfabeto sem 0/O/1/I para código ditável por voz
const ALFABETO_DO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function gerarCodigo(): string {
  let codigo = 'EZ-';
  for (let i = 0; i < 4; i++) {
    codigo += ALFABETO_DO_CODIGO[crypto.randomInt(ALFABETO_DO_CODIGO.length)];
  }
  return codigo;
}

function deckValidoDoCorpo(
  banco: Banco,
  contaId: number,
  corpo: unknown,
): { deckId: number; heroi: string; cartas: number[]; formato: Formato } | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const deckId = Number((corpo as Record<string, unknown>).deckId);
  if (!Number.isInteger(deckId)) return null;
  const deck = deckParaPartida(banco, contaId, deckId);
  if (!deck) return null;
  return { deckId, ...deck };
}

export const rotasDeSalas = (banco: Banco): Rota[] => [
  {
    // entrar na fila: se já há alguém esperando, a partida nasce agora
    metodo: 'POST',
    padrao: '/api/fila',
    responder: comConta(banco, (pedido, conta) => {
      if (partidaAtualDaConta(banco, conta.id)) {
        return recusado(409, 'você já está numa partida');
      }
      const deck = deckValidoDoCorpo(banco, conta.id, pedido.corpo);
      if (!deck) return recusado(400, 'escolha um deck seu para jogar');

      const espera = filas.get(deck.formato);
      if (espera && espera.contaId !== conta.id) {
        filas.delete(deck.formato);
        const deckDaEspera = deckParaPartida(banco, espera.contaId, espera.deckId);
        if (deckDaEspera && deckDaEspera.formato === deck.formato) {
          const partidaId = criarPartidaOnline(
            banco,
            { contaId: espera.contaId, apelido: espera.apelido, ...deckDaEspera },
            {
              contaId: conta.id,
              apelido: conta.apelido,
              heroi: deck.heroi,
              cartas: deck.cartas,
              formato: deck.formato,
            },
          );
          return criado({ partidaId });
        }
      }

      filas.set(deck.formato, {
        contaId: conta.id,
        apelido: conta.apelido,
        deckId: deck.deckId,
      });
      return ok({ aguardando: true, formato: deck.formato });
    }),
  },
  {
    metodo: 'DELETE',
    padrao: '/api/fila',
    responder: comConta(banco, (_pedido, conta) => {
      for (const [formato, espera] of filas) {
        if (espera.contaId === conta.id) filas.delete(formato);
      }
      return ok({ saiu: true });
    }),
  },
  {
    metodo: 'POST',
    padrao: '/api/salas',
    responder: comConta(banco, (pedido, conta) => {
      if (partidaAtualDaConta(banco, conta.id)) {
        return recusado(409, 'você já está numa partida');
      }
      const deck = deckValidoDoCorpo(banco, conta.id, pedido.corpo);
      if (!deck) return recusado(400, 'escolha um deck seu para jogar');

      const codigo = gerarCodigo();
      banco.executar(
        'INSERT INTO salas (codigo, conta_host, deck_host, criada_em) VALUES (?, ?, ?, ?)',
        codigo,
        conta.id,
        deck.deckId,
        new Date().toISOString(),
      );
      return criado({ codigo });
    }),
  },
  {
    metodo: 'POST',
    padrao: '/api/salas/entrada',
    responder: comConta(banco, (pedido, conta) => {
      if (partidaAtualDaConta(banco, conta.id)) {
        return recusado(409, 'você já está numa partida');
      }
      const corpo = (pedido.corpo ?? {}) as Record<string, unknown>;
      const codigo = typeof corpo.codigo === 'string' ? corpo.codigo.trim().toUpperCase() : '';
      const deck = deckValidoDoCorpo(banco, conta.id, pedido.corpo);
      if (!deck) return recusado(400, 'escolha um deck seu para jogar');

      const validade = new Date(Date.now() - HORAS_DE_VIDA_DA_SALA * 3_600_000).toISOString();
      const sala = banco.uma(
        'SELECT * FROM salas WHERE codigo = ? AND partida_id IS NULL AND criada_em > ?',
        codigo,
        validade,
      );
      if (!sala) return recusado(404, 'sala não encontrada (código errado ou expirado)');

      const hostId = inteiro(sala.conta_host);
      if (hostId === conta.id) return recusado(409, 'você é o dono desta sala');
      const deckDoHost = deckParaPartida(banco, hostId, inteiro(sala.deck_host));
      if (!deckDoHost) return recusado(409, 'o deck do dono da sala sumiu');
      if (deckDoHost.formato !== deck.formato) {
        return recusado(
          409,
          `a sala é do formato ${NOME_DO_FORMATO[deckDoHost.formato]};` +
            ` escolha um deck desse formato.`,
        );
      }
      const apelidoDoHost =
        texto(banco.uma('SELECT apelido FROM contas WHERE id = ?', hostId)?.apelido) || 'Jogador';

      const partidaId = criarPartidaOnline(
        banco,
        { contaId: hostId, apelido: apelidoDoHost, ...deckDoHost },
        {
          contaId: conta.id,
          apelido: conta.apelido,
          heroi: deck.heroi,
          cartas: deck.cartas,
          formato: deck.formato,
        },
      );
      banco.executar('UPDATE salas SET partida_id = ? WHERE id = ?', partidaId, inteiro(sala.id));
      return criado({ partidaId });
    }),
  },
];
