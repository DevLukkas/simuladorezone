import type { Card, AttachableCard, Element } from '../data/types.ts';
import { currentElement } from './cardsInPlay.ts';
import type { CreatureInPlay, GameState, SideId } from './state.ts';

/**
 * Compatibilidade de elemento para anexar HABILIDADE (itens anexam sempre):
 * mesmo elemento, ou ambos em {neutro, vazio}. Porta de `elementsAreCompatible`.
 */
export function elementsCompatible(attachment: Element, creature: Element): boolean {
  if (attachment === creature) return true;
  const flexible: Element[] = ['neutral', 'void'];
  return flexible.includes(attachment) && flexible.includes(creature);
}

export function canAttachTo(card: AttachableCard, creature: CreatureInPlay): boolean {
  if (card.type === 'item') return true;
  return elementsCompatible(card.element, currentElement(creature));
}

export function canBeSummonedNormally(card: Card): boolean {
  if (card.type !== 'creature') return false;
  return card.summonRule?.normal !== false;
}

/** Porta de `canCreatureAttack`: 1 ataque por turno, espera de invocação, bloqueios. */
export function canAttack(state: GameState, side: SideId, creature: CreatureInPlay): boolean {
  if (state.winner || state.phase !== 'battle' || state.activeSide !== side) return false;
  if (creature.attackedOnTurn === state.turn) return false;
  if (creature.canAttackFromTurn > state.turn) return false;
  if ((creature.cannotAttackUntilTurn ?? 0) >= state.turn) return false;
  return true;
}
