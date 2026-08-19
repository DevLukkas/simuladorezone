import type { Element } from '../data/types.ts';
import type { SideId } from './state.ts';

/** Alvo de comando/habilidade: uma criatura em campo, por lado e slot. */
export interface SlotTarget {
  side: SideId;
  slot: number;
}

/**
 * Vocabulário fechado de comandos: tudo que um jogador (ou o servidor, no
 * caso de TEMPO_ESGOTADO) pode pedir ao motor. Validar e recusar é papel do
 * `aplicarComando`; comando aceito nunca depende de quem o transportou.
 *
 * Escolhas conhecidas de antemão viajam como parâmetros (alvo, elemento,
 * substituição de anexo); escolhas que dependem de informação do servidor
 * (busca no deck, cartas reveladas, correntes) viram pendências + RESPONDER.
 */
export type Command =
  | { type: 'DECIDE_MULLIGAN'; side: SideId; swap: boolean }
  | { type: 'SUMMON'; side: SideId; cardUid: string; slot: number }
  | {
      type: 'ATTACH';
      side: SideId;
      cardUid: string;
      slot: number;
      /** obrigatório quando a criatura já tem 2 anexos: qual descartar */
      replaceAttachmentUid?: string;
    }
  | { type: 'PLAY_SCENARIO'; side: SideId; cardUid: string }
  | {
      type: 'PLAY_COMMAND';
      side: SideId;
      cardUid: string;
      target?: SlotTarget;
      secondaryTarget?: SlotTarget;
    }
  | {
      type: 'ACTIVATE_ABILITY';
      side: SideId;
      /** uid da criatura em campo, do anexo, ou da carta na mão */
      sourceUid: string;
      abilityId: string;
      element?: Element;
      target?: SlotTarget;
    }
  | { type: 'ATTACK'; side: SideId; slot: number }
  | { type: 'ADVANCE_PHASE'; side: SideId }
  | { type: 'END_TURN'; side: SideId }
  | { type: 'ANSWER'; side: SideId; pendingId: string; optionId: string }
  | { type: 'CONCEDE'; side: SideId }
  /** emitido apenas pelo servidor quando o timer do turno estoura */
  | { type: 'TIME_OUT' };
