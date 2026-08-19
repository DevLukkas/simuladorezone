import type { Element, CreatureToken } from '../data/types.ts';
import type { CardInZone, Phase, SideId } from './state.ts';

/**
 * Vocabulário fechado de eventos — o contrato com o cliente (animação) e o
 * event log do servidor. Campos marcados como "ocultável" são removidos pela
 * redação (`redigirEvento`) quando o destinatário não pode vê-los.
 */
export type GameEvent =
  | { type: 'MATCH_STARTED'; firstSide: SideId; turn: number }
  | { type: 'MULLIGAN_DECIDED'; side: SideId; swapped: boolean }
  /** carta ausente = compra oculta (visão do oponente) */
  | { type: 'CARD_DRAWN'; side: SideId; card?: CardInZone }
  | { type: 'HAND_LIMIT_DISCARD'; side: SideId; card: CardInZone }
  | { type: 'TURN_STARTED'; side: SideId; turn: number }
  | { type: 'PHASE_CHANGED'; phase: Phase }
  | { type: 'CREATURE_SUMMONED'; side: SideId; slot: number; card: CardInZone }
  | { type: 'TOKEN_CREATED'; side: SideId; slot: number; uid: string; token: CreatureToken }
  | { type: 'CARD_ATTACHED'; side: SideId; slot: number; card: CardInZone }
  | { type: 'SCENARIO_PLAYED'; side: SideId; card: CardInZone }
  | { type: 'ATTACK_DECLARED'; side: SideId; slot: number }
  | {
      type: 'BATTLE';
      attacker: { side: SideId; slot: number; uid: string };
      defender: { side: SideId; slot: number; uid: string };
      damageToDefender: number;
      damageToAttacker: number;
    }
  | { type: 'DIRECT_DAMAGE'; sufferer: SideId; value: number; sourceUid: string }
  | { type: 'SCORED'; side: SideId; gained: number; total: number }
  | {
      type: 'CREATURE_DESTROYED';
      side: SideId;
      slot: number;
      uid: string;
      inBattle: boolean;
      /** fichas somem; cartas reais vão ao descarte */
      toDiscard: boolean;
    }
  | { type: 'ATTACHMENT_DISCARDED'; side: SideId; slot: number; card: CardInZone }
  | { type: 'ATTACHMENT_RETURNED_TO_HAND'; side: SideId; slot: number; card: CardInZone }
  | { type: 'TURN_ENDED'; side: SideId; turn: number }
  | { type: 'GAME_OVER'; winner: SideId; reason: 'points' | 'concede' | 'timeout' }
  // ── habilidades e efeitos ──────────────────────────────────────────────
  | { type: 'CARD_DISCARDED'; side: SideId; card: CardInZone; reason: 'effect' | 'cost' }
  /** busca no deck: carta pública ao dono, oculta ao oponente */
  | { type: 'CARD_SEARCHED'; side: SideId; card?: CardInZone }
  | { type: 'CARD_REVEALED'; side: SideId; card: CardInZone }
  | { type: 'CARD_SHUFFLED_INTO_DECK'; side: SideId; card: CardInZone }
  | { type: 'CARD_MILLED'; side: SideId; card: CardInZone }
  | { type: 'MARKER_ADDED'; side: SideId; creatureUid: string; attack: number; defense: number }
  | { type: 'TEMPORARY_MODIFIER'; side: SideId; creatureUid: string; attack: number; defense: number }
  | { type: 'CREATURE_DAMAGED'; side: SideId; creatureUid: string; value: number }
  | { type: 'CREATURE_HEALED'; side: SideId; creatureUid: string; value: number }
  | { type: 'ELEMENT_CHANGED'; side: SideId; creatureUid: string; from: Element; to: Element }
  | {
      type: 'STATS_SWAPPED';
      side: SideId;
      creatureUid: string;
      /** Sapotristan: a troca dura enquanto o elemento estiver alterado */
      whileElementChanged: boolean;
    }
  | { type: 'ATTACK_DENIED'; side: SideId; slot: number; attachmentCardId: number }
  | { type: 'ATTACK_BLOCKED'; side: SideId; slot: number }
  | { type: 'PREVENTED_FROM_ATTACKING'; side: SideId; creatureUid: string; untilTurn: number }
  | { type: 'PROTECTED_FROM_ATTACKS'; side: SideId; creatureUid: string; untilTurn: number }
  | { type: 'COMMAND_PLAYED'; side: SideId; card: CardInZone }
  /** o lado recusou (ou deixou expirar) uma janela de reação */
  | { type: 'REACTION_DECLINED'; side: SideId }
  | { type: 'ABILITY_ACTIVATED'; side: SideId; sourceUid: string; abilityId: string }
  | { type: 'CREATURE_SACRIFICED'; side: SideId; slot: number; uid: string }
  | { type: 'SUMMONED_FROM_DECK'; side: SideId; slot: number; card: CardInZone }
  | { type: 'SUMMONED_FROM_DISCARD'; side: SideId; slot: number; card: CardInZone }
  | { type: 'HERO_ACTIVATED'; side: SideId; hero: string }
  | { type: 'SCENARIO_TRIGGERED'; side: SideId; cardId: number };
