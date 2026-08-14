import { cartaPorId, formatoDaCarta } from '../data/cartas.ts';
import type { Formato } from '../data/tipos.ts';
import { NOME_DO_FORMATO } from '../data/tipos.ts';
import type { Evento } from './eventos.ts';
import {
  MAO_INICIAL,
  SLOTS_POR_LADO,
  type CartaNaZona,
  type EstadoDoJogo,
  type EstadoDoLado,
  type LadoId,
} from './estado.ts';
import { embaralhar, inteiroAleatorio, normalizarSeed } from './rng.ts';

export interface DeckDoLado {
  heroi: string;
  /** ids de catálogo, já validados pelas regras de deck */
  cartas: number[];
}

export interface ConfiguracaoDaPartida {
  seed: number;
  decks: Record<LadoId, DeckDoLado>;
  /** ausente = clássico, o formato que já existia */
  formato?: Formato;
}

export interface PartidaCriada {
  estado: EstadoDoJogo;
  eventos: Evento[];
}

/**
 * Cria a partida: uids determinísticos por lado, embaralha, distribui 5 cartas
 * e sorteia quem começa. A partida abre na fase de mulligan — cada lado decide
 * com DECIDIR_MULLIGAN e o primeiro turno começa quando ambos decidirem.
 */
export function criarPartida(config: ConfiguracaoDaPartida): PartidaCriada {
  let rng = normalizarSeed(config.seed);
  const formato: Formato = config.formato ?? 'classico';
  const eventos: Evento[] = [];

  const sorteio = inteiroAleatorio(rng, 0, 1);
  rng = sorteio.rng;
  const primeiroLado: LadoId = sorteio.valor === 0 ? 'a' : 'b';

  const lados = {} as Record<LadoId, EstadoDoLado>;
  for (const lado of ['a', 'b'] as const) {
    const deckConfig = config.decks[lado];
    const cartas: CartaNaZona[] = deckConfig.cartas.map((cartaId, indice) => {
      const carta = cartaPorId(cartaId);
      // uma partida corre num formato só: deck do outro formato é erro de programação,
      // não jogada inválida — o servidor recusa antes de chegar aqui
      if (formatoDaCarta(carta) !== formato) {
        throw new Error(
          `Carta ${cartaId} ("${carta.nome}") é de ${NOME_DO_FORMATO[formatoDaCarta(carta)]},` +
            ` mas a partida é ${NOME_DO_FORMATO[formato]}.`,
        );
      }
      return { uid: `${lado}${indice + 1}`, cartaId };
    });
    const embaralhado = embaralhar(rng, cartas);
    rng = embaralhado.rng;
    const mao = embaralhado.itens.slice(0, MAO_INICIAL);
    const deck = embaralhado.itens.slice(MAO_INICIAL);

    lados[lado] = {
      heroi: deckConfig.heroi,
      deck,
      mao,
      campo: Array.from({ length: SLOTS_POR_LADO }, () => null),
      cenario: null,
      descarte: [],
      exilio: [],
      pontos: 0,
      danoDireto: 0,
      acoes: { invocou: false, anexou: false, cenario: false },
      mulliganDecidido: false,
      cenarioFlags: {},
    };

    for (const carta of mao) {
      eventos.push({ tipo: 'CARTA_COMPRADA', lado, carta });
    }
  }

  const estado: EstadoDoJogo = {
    seed: normalizarSeed(config.seed),
    rng,
    formato,
    turno: 1,
    fase: 'mulligan',
    ladoAtivo: primeiroLado,
    lados,
    vencedor: null,
    pendencia: null,
    fila: [],
    efeitosAdiados: [],
    proximoUid: 1,
  };

  eventos.unshift({ tipo: 'PARTIDA_INICIADA', primeiroLado, turno: 1 });
  return { estado, eventos };
}
