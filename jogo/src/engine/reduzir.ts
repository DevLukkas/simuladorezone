import { cartaPorId } from '../data/cartas.ts';
import { cartaAnexavel, defDaCriatura, temAptidao } from './cartasEmJogo.ts';
import type { Comando } from './comandos.ts';
import { podeSerAlvoDeAtaque } from './combate.ts';
import {
  agendarAtaque,
  agendarReacao,
  aoAnexar,
  aoEntrarEmCampo,
  ativarHabilidade,
  jogarComando,
  processarFila,
  responder,
  resolverFimDeTurno,
} from './efeitos.ts';
import type { Evento } from './eventos.ts';
import {
  MAO_INICIAL,
  SLOTS_POR_LADO,
  ladoOposto,
  type CriaturaEmCampo,
  type EstadoDoJogo,
  type LadoId,
} from './estado.ts';
import {
  aoAnexoIrParaDescarte,
  aoOutraCriaturaEntrar,
  heroiAoEntrarCriatura,
  heroiNoInicioDoTurno,
  regenerarNoInicioDoTurno,
} from './gatilhos.ts';
import { podeAnexarEm, podeAtacar, podeInvocarNormalmente } from './alvos.ts';
import { embaralhar, inteiroAleatorio } from './rng.ts';
import { comprarCartas } from './zonas.ts';

export interface Resultado {
  estado: EstadoDoJogo;
  eventos: Evento[];
  /** presente quando o comando foi recusado; o estado retornado é o original */
  erro?: string;
}

const MAX_ANEXOS_POR_CRIATURA = 2;

/**
 * Entrada única do motor. Pura: clona o estado, valida, aplica e devolve
 * `{ estado, eventos }` — ou `{ erro }` com o estado intacto. Nunca lança por
 * comando ilegal; lançar é reservado a violação de invariante interno.
 */
export function aplicarComando(estadoOriginal: EstadoDoJogo, comando: Comando): Resultado {
  const recusar = (erro: string): Resultado => ({ estado: estadoOriginal, eventos: [], erro });

  if (estadoOriginal.vencedor) return recusar('A partida já terminou.');

  const estado = structuredClone(estadoOriginal);
  const eventos: Evento[] = [];

  if (
    estado.pendencia &&
    comando.tipo !== 'RESPONDER' &&
    comando.tipo !== 'CONCEDER' &&
    comando.tipo !== 'TEMPO_ESGOTADO'
  ) {
    return recusar('Há uma escolha pendente.');
  }

  switch (comando.tipo) {
    case 'DECIDIR_MULLIGAN': {
      if (estado.fase !== 'mulligan') return recusar('Não é hora de mulligan.');
      const dono = estado.lados[comando.lado];
      if (dono.mulliganDecidido) return recusar('Mulligan já decidido.');
      if (comando.trocar) {
        const embaralhado = embaralhar(estado.rng, [...dono.mao, ...dono.deck]);
        estado.rng = embaralhado.rng;
        dono.mao = embaralhado.itens.slice(0, MAO_INICIAL);
        dono.deck = embaralhado.itens.slice(MAO_INICIAL);
      }
      dono.mulliganDecidido = true;
      eventos.push({ tipo: 'MULLIGAN_DECIDIDO', lado: comando.lado, trocou: comando.trocar });
      if (comando.trocar) {
        for (const carta of dono.mao) {
          eventos.push({ tipo: 'CARTA_COMPRADA', lado: comando.lado, carta });
        }
      }
      if (estado.lados.a.mulliganDecidido && estado.lados.b.mulliganDecidido) {
        comecarPrimeiroTurno(estado, eventos);
      }
      return { estado, eventos };
    }

    case 'INVOCAR': {
      const erro = validarAcaoPrincipal(estado, comando.lado);
      if (erro) return recusar(erro);
      const dono = estado.lados[comando.lado];
      if (dono.acoes.invocou) return recusar('Você já invocou neste turno.');
      if (!slotValido(comando.slot)) return recusar('Slot inválido.');
      if (dono.campo[comando.slot]) return recusar('Slot ocupado.');
      const indice = dono.mao.findIndex((carta) => carta.uid === comando.uidCarta);
      if (indice < 0) return recusar('Carta fora da mão.');
      const naZona = dono.mao[indice]!;
      const carta = cartaPorId(naZona.cartaId);
      if (carta.tipo !== 'criatura') return recusar('A carta não é uma criatura.');
      if (!podeInvocarNormalmente(carta)) return recusar('Esta criatura não pode ser invocada normalmente.');

      dono.mao.splice(indice, 1);
      const criatura = novaCriatura(estado, naZona.uid, naZona.cartaId, carta.efeito);
      dono.campo[comando.slot] = criatura;
      dono.acoes.invocou = true;
      eventos.push({ tipo: 'CRIATURA_INVOCADA', lado: comando.lado, slot: comando.slot, carta: naZona });

      heroiAoEntrarCriatura(estado, comando.lado, criatura, eventos);
      aoEntrarEmCampo(estado, comando.lado, comando.slot);
      aoOutraCriaturaEntrar(estado, comando.lado, criatura, eventos);
      agendarReacao(estado, ladoOposto(comando.lado), 'invocou uma criatura', 'comando');
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'ANEXAR': {
      const erro = validarAcaoPrincipal(estado, comando.lado);
      if (erro) return recusar(erro);
      const dono = estado.lados[comando.lado];
      if (!slotValido(comando.slot)) return recusar('Slot inválido.');
      const criatura = dono.campo[comando.slot];
      if (!criatura) return recusar('Não há criatura neste slot.');
      const indice = dono.mao.findIndex((carta) => carta.uid === comando.uidCarta);
      if (indice < 0) return recusar('Carta fora da mão.');
      const naZona = dono.mao[indice]!;
      const carta = cartaPorId(naZona.cartaId);
      if (!cartaAnexavel(carta)) return recusar('A carta não é anexável.');
      if (!podeAnexarEm(carta, criatura)) return recusar('Elemento incompatível.');

      if (criatura.anexos.length >= MAX_ANEXOS_POR_CRIATURA) {
        const substituir = criatura.anexos.findIndex(
          (anexo) => anexo.uid === comando.substituirAnexoUid,
        );
        if (substituir < 0) return recusar('A criatura já tem 2 anexos: indique qual substituir.');
        const [removido] = criatura.anexos.splice(substituir, 1);
        dono.descarte.push({ uid: removido!.uid, cartaId: removido!.cartaId });
        eventos.push({
          tipo: 'ANEXO_DESCARTADO',
          lado: comando.lado,
          slot: comando.slot,
          carta: { uid: removido!.uid, cartaId: removido!.cartaId },
        });
        aoAnexoIrParaDescarte(estado, comando.lado, removido!.uid, removido!.cartaId, true);
      }

      dono.mao.splice(indice, 1);
      criatura.anexos.push({ uid: naZona.uid, cartaId: naZona.cartaId });
      eventos.push({ tipo: 'CARTA_ANEXADA', lado: comando.lado, slot: comando.slot, carta: naZona });

      aoAnexar(estado, comando.lado, comando.slot, naZona.uid);
      dispararContagemDeAnexos(estado, comando.lado, criatura, naZona.cartaId, eventos);
      agendarReacao(estado, ladoOposto(comando.lado), 'anexou uma carta', 'comando');
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'JOGAR_CENARIO': {
      const erro = validarAcaoPrincipal(estado, comando.lado);
      if (erro) return recusar(erro);
      const dono = estado.lados[comando.lado];
      if (dono.acoes.cenario) return recusar('Você já jogou um cenário neste turno.');
      const indice = dono.mao.findIndex((carta) => carta.uid === comando.uidCarta);
      if (indice < 0) return recusar('Carta fora da mão.');
      const naZona = dono.mao[indice]!;
      if (cartaPorId(naZona.cartaId).tipo !== 'cenario') return recusar('A carta não é um cenário.');

      dono.mao.splice(indice, 1);
      if (dono.cenario) dono.descarte.push(dono.cenario);
      dono.cenario = naZona;
      dono.acoes.cenario = true;
      eventos.push({ tipo: 'CENARIO_JOGADO', lado: comando.lado, carta: naZona });
      return { estado, eventos };
    }

    case 'JOGAR_COMANDO': {
      const erro = validarAcaoPrincipal(estado, comando.lado);
      if (erro) return recusar(erro);
      const falha = jogarComando(estado, comando.lado, comando.uidCarta, comando.alvo, eventos);
      if (falha) return recusar(falha);
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'ATIVAR_HABILIDADE': {
      if (estado.ladoAtivo !== comando.lado) return recusar('Não é o seu turno.');
      if (estado.fase === 'mulligan') return recusar('A partida ainda não começou.');
      const falha = ativarHabilidade(
        estado,
        comando.lado,
        comando.origemUid,
        comando.habilidadeId,
        comando.elemento,
        eventos,
      );
      if (falha) return recusar(falha);
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'ATACAR': {
      if (estado.ladoAtivo !== comando.lado) return recusar('Não é o seu turno.');
      if (estado.fase !== 'batalha') return recusar('Ataques só na fase de batalha.');
      if (!slotValido(comando.slot)) return recusar('Slot inválido.');
      const atacanteLado = estado.lados[comando.lado];
      const criatura = atacanteLado.campo[comando.slot];
      if (!criatura) return recusar('Não há criatura neste slot.');
      if (!podeAtacar(estado, comando.lado, criatura)) return recusar('Esta criatura não pode atacar.');
      const defensor = estado.lados[ladoOposto(comando.lado)].campo[comando.slot];
      if (defensor && !podeSerAlvoDeAtaque(estado.turno, defensor, criatura, atacanteLado.campo)) {
        return recusar('A criatura à frente não pode ser alvo de ataques.');
      }

      eventos.push({ tipo: 'ATAQUE_DECLARADO', lado: comando.lado, slot: comando.slot });
      agendarAtaque(estado, comando.lado, comando.slot);
      agendarReacao(
        estado,
        ladoOposto(comando.lado),
        defensor ? 'atacou uma criatura' : 'atacou diretamente',
        'comando',
      );
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'AVANCAR_FASE': {
      if (estado.ladoAtivo !== comando.lado) return recusar('Não é o seu turno.');
      if (estado.fase !== 'principal') return recusar('Só é possível avançar da fase principal.');
      estado.fase = 'batalha';
      eventos.push({ tipo: 'FASE_MUDOU', fase: 'batalha' });
      agendarReacao(estado, ladoOposto(comando.lado), 'iniciou a fase de batalha', 'habilidade');
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'ENCERRAR_TURNO': {
      if (estado.ladoAtivo !== comando.lado) return recusar('Não é o seu turno.');
      if (estado.fase === 'mulligan') return recusar('A partida ainda não começou.');
      encerrarTurno(estado, eventos);
      processarFila(estado, eventos);
      return { estado, eventos };
    }

    case 'TEMPO_ESGOTADO': {
      if (estado.fase === 'mulligan') {
        for (const lado of ['a', 'b'] as const) {
          if (!estado.lados[lado].mulliganDecidido) {
            estado.lados[lado].mulliganDecidido = true;
            eventos.push({ tipo: 'MULLIGAN_DECIDIDO', lado, trocou: false });
          }
        }
        comecarPrimeiroTurno(estado, eventos);
        return { estado, eventos };
      }
      resolverPendenciasAutomaticamente(estado, eventos);
      if (!estado.vencedor) {
        encerrarTurno(estado, eventos);
        processarFila(estado, eventos);
        resolverPendenciasAutomaticamente(estado, eventos);
      }
      return { estado, eventos };
    }

    case 'CONCEDER': {
      const vencedor = ladoOposto(comando.lado);
      estado.vencedor = vencedor;
      estado.motivoDoFim = 'desistencia';
      estado.pendencia = null;
      estado.fila = [];
      eventos.push({ tipo: 'FIM_DE_JOGO', vencedor, motivo: 'desistencia' });
      return { estado, eventos };
    }

    case 'RESPONDER': {
      if (!estado.pendencia) return recusar('Nada pendente.');
      if (estado.pendencia.lado !== comando.lado) return recusar('A escolha não é sua.');
      if (estado.pendencia.id !== comando.pendenciaId) return recusar('Escolha desatualizada.');
      const falha = responder(estado, comando.lado, comando.opcaoId, eventos);
      if (falha) return recusar(falha);
      processarFila(estado, eventos);
      return { estado, eventos };
    }
  }
}

function validarAcaoPrincipal(estado: EstadoDoJogo, lado: LadoId): string | null {
  if (estado.ladoAtivo !== lado) return 'Não é o seu turno.';
  if (estado.fase !== 'principal') return 'Só na fase principal.';
  return null;
}

function slotValido(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOTS_POR_LADO;
}

function novaCriatura(
  estado: EstadoDoJogo,
  uid: string,
  cartaId: number,
  efeito: string | null,
): CriaturaEmCampo {
  return {
    uid,
    cartaId,
    dano: 0,
    marcadores: { attack: 0, defense: 0 },
    modificadoresTemporarios: [],
    anexos: [],
    invocadaNoTurno: estado.turno,
    podeAtacarAPartirDoTurno: temAptidao(efeito) ? estado.turno : estado.turno + 1,
    habilidadesUsadas: {},
  };
}

/** Tridente Poderoso de Atlas: N anexos de mesmo nome → oponente descarta. */
function dispararContagemDeAnexos(
  estado: EstadoDoJogo,
  lado: LadoId,
  criatura: CriaturaEmCampo,
  anexadaCartaId: number,
  eventos: Evento[],
): void {
  const carta = cartaPorId(anexadaCartaId);
  if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') return;
  for (const habilidade of carta.triggeredAbilities ?? []) {
    if (habilidade.trigger !== 'attached_count_reaches') continue;
    const nomeAlvo = (habilidade.attachedName ?? carta.nome).toLowerCase();
    const quantos = criatura.anexos.filter(
      (anexo) => cartaPorId(anexo.cartaId).nome.toLowerCase() === nomeAlvo,
    ).length;
    if (quantos !== habilidade.count) continue;
    if (habilidade.action.type !== 'opponent_discard_random') continue;

    const inimigo = estado.lados[ladoOposto(lado)];
    for (let i = 0; i < habilidade.action.discard && inimigo.mao.length; i++) {
      const sorteio = inteiroAleatorio(estado.rng, 0, inimigo.mao.length - 1);
      estado.rng = sorteio.rng;
      const [descartada] = inimigo.mao.splice(sorteio.valor, 1);
      if (!descartada) break;
      inimigo.descarte.push(descartada);
      eventos.push({
        tipo: 'CARTA_DESCARTADA',
        lado: ladoOposto(lado),
        carta: descartada,
        motivo: 'efeito',
      });
    }
  }
}

function comecarPrimeiroTurno(estado: EstadoDoJogo, eventos: Evento[]): void {
  estado.fase = 'principal';
  eventos.push({ tipo: 'TURNO_INICIADO', lado: estado.ladoAtivo, turno: estado.turno });
  regenerarNoInicioDoTurno(estado, estado.ladoAtivo, eventos);
  heroiNoInicioDoTurno(estado, estado.ladoAtivo, eventos);
}

function encerrarTurno(estado: EstadoDoJogo, eventos: Evento[]): void {
  // oferta de reação não atravessa a virada de turno
  estado.reacaoPendente = null;
  eventos.push({ tipo: 'TURNO_ENCERRADO', lado: estado.ladoAtivo, turno: estado.turno });

  resolverFimDeTurno(estado, eventos);

  for (const lado of ['a', 'b'] as const) {
    for (const criatura of estado.lados[lado].campo) {
      if (!criatura) continue;
      criatura.modificadoresTemporarios = criatura.modificadoresTemporarios.filter(
        (mod) => mod.expiraAposTurno > estado.turno,
      );
      // Sapomerlim: o elemento emprestado vale só até o fim do turno
      if (
        criatura.elementoAlteradoAteTurno !== undefined &&
        criatura.elementoAlteradoAteTurno <= estado.turno
      ) {
        const de = criatura.elementoAlterado!;
        delete criatura.elementoAlterado;
        delete criatura.elementoAlteradoAteTurno;
        eventos.push({
          tipo: 'ELEMENTO_ALTERADO',
          lado,
          criaturaUid: criatura.uid,
          de,
          para: defDaCriatura(criatura).elemento,
        });
      }
    }
  }

  if (estado.vencedor) return;

  estado.turno += 1;
  estado.ladoAtivo = ladoOposto(estado.ladoAtivo);
  estado.fase = 'principal';
  const ativo = estado.lados[estado.ladoAtivo];
  ativo.acoes = { invocou: false, anexou: false, cenario: false };
  for (const lado of ['a', 'b'] as const) estado.lados[lado].cenarioFlags = {};

  eventos.push({ tipo: 'TURNO_INICIADO', lado: estado.ladoAtivo, turno: estado.turno });
  comprarCartas(estado, estado.ladoAtivo, 1, eventos);
  regenerarNoInicioDoTurno(estado, estado.ladoAtivo, eventos);
  heroiNoInicioDoTurno(estado, estado.ladoAtivo, eventos);
}

/** Timer estourou com escolha aberta: recusa/rejeita tudo até destravar. */
function resolverPendenciasAutomaticamente(estado: EstadoDoJogo, eventos: Evento[]): void {
  let protecao = 0;
  while (estado.pendencia && protecao++ < 50) {
    const pendencia = estado.pendencia;
    const opcao = pendencia.podeRecusar
      ? 'recusar'
      : (pendencia.opcoes.find((o) => o.id === 'nao') ?? pendencia.opcoes[0])?.id;
    if (!opcao) break;
    responder(estado, pendencia.lado, opcao, eventos);
    processarFila(estado, eventos);
  }
}
