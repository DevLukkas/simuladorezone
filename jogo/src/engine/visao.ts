import type {
  AcoesDoTurno,
  CartaNaZona,
  CriaturaEmCampo,
  EstadoDoJogo,
  Fase,
  LadoId,
  Pendencia,
} from './estado.ts';
import { ladoOposto } from './estado.ts';
import type { Evento } from './eventos.ts';

/**
 * O que um jogador enxerga. Mão e deck do oponente viram contagens; o resto
 * (campo, anexos, descarte, exílio, cenário) é público. Só o servidor tem o
 * estado completo — esta visão é o máximo que cruza a rede.
 */
export interface VisaoDoJogo {
  lado: LadoId;
  turno: number;
  fase: Fase;
  ladoAtivo: LadoId;
  vencedor: LadoId | null;
  motivoDoFim?: 'pontos' | 'desistencia' | 'tempo';
  /** presente quando é VOCÊ quem deve escolher (sem o contexto interno) */
  pendencia: Omit<Pendencia, 'contexto'> | null;
  /** o oponente está decidindo algo */
  aguardandoOponente: boolean;
  eu: LadoVisivel & { mao: CartaNaZona[]; acoes: AcoesDoTurno; mulliganDecidido: boolean };
  oponente: LadoVisivel & { maoQuantidade: number };
}

export interface LadoVisivel {
  heroi: string;
  pontos: number;
  danoDireto: number;
  deckQuantidade: number;
  campo: (CriaturaEmCampo | null)[];
  cenario: CartaNaZona | null;
  descarte: CartaNaZona[];
  exilio: CartaNaZona[];
}

export function visaoPara(estado: EstadoDoJogo, lado: LadoId): VisaoDoJogo {
  const eu = estado.lados[lado];
  const oponente = estado.lados[ladoOposto(lado)];
  const pendencia = estado.pendencia;

  const visao: VisaoDoJogo = {
    lado,
    turno: estado.turno,
    fase: estado.fase,
    ladoAtivo: estado.ladoAtivo,
    vencedor: estado.vencedor,
    pendencia:
      pendencia && pendencia.lado === lado
        ? {
            id: pendencia.id,
            lado: pendencia.lado,
            tipo: pendencia.tipo,
            titulo: pendencia.titulo,
            opcoes: pendencia.opcoes,
            podeRecusar: pendencia.podeRecusar,
            ...(pendencia.reacao ? { reacao: true as const } : {}),
          }
        : null,
    aguardandoOponente: pendencia !== null && pendencia.lado !== lado,
    eu: {
      heroi: eu.heroi,
      pontos: eu.pontos,
      danoDireto: eu.danoDireto,
      deckQuantidade: eu.deck.length,
      campo: eu.campo,
      cenario: eu.cenario,
      descarte: eu.descarte,
      exilio: eu.exilio,
      mao: eu.mao,
      acoes: eu.acoes,
      mulliganDecidido: eu.mulliganDecidido,
    },
    oponente: {
      heroi: oponente.heroi,
      pontos: oponente.pontos,
      danoDireto: oponente.danoDireto,
      deckQuantidade: oponente.deck.length,
      campo: oponente.campo,
      cenario: oponente.cenario,
      descarte: oponente.descarte,
      exilio: oponente.exilio,
      maoQuantidade: oponente.mao.length,
    },
  };
  if (estado.motivoDoFim) visao.motivoDoFim = estado.motivoDoFim;
  return visao;
}

/**
 * Redação de eventos por destinatário: compras e buscas do oponente perdem a
 * carta (só a contagem anima). Tudo o mais já é informação pública — descartes,
 * revelações e o campo são visíveis aos dois lados.
 */
export function redigirEvento(evento: Evento, para: LadoId): Evento {
  if (evento.tipo === 'CARTA_COMPRADA' && evento.lado !== para) {
    return { tipo: 'CARTA_COMPRADA', lado: evento.lado };
  }
  if (evento.tipo === 'CARTA_BUSCADA' && evento.lado !== para) {
    return { tipo: 'CARTA_BUSCADA', lado: evento.lado };
  }
  return evento;
}
