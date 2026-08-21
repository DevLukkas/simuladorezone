import type { Card, AttachableCard, CardFilter, Element } from '../data/types.ts';
import { creatureMatches, currentElement } from './cardsInPlay.ts';
import { canBeAttackTarget } from './combat.ts';
import { oppositeSide, type CreatureInPlay, type GameState, type SideId } from './state.ts';

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

/**
 * Esta criatura ainda TEM um ataque neste turno? Igual a `canAttack`, menos a
 * exigência de já estar na fase de batalha, mais o alvo da coluna: serve para
 * responder "ela ainda pode atacar?" na fase principal.
 *
 * É o que decide se a obrigação da Marionete de Guerra ainda pesa (o motor
 * recusa encerrar o turno) e se a tela acende a etiqueta na criatura.
 */
export function attackStillPossible(
  state: GameState,
  side: SideId,
  creature: CreatureInPlay,
  slot: number,
): boolean {
  if (state.winner || state.phase === 'mulligan') return false;
  if (creature.attackedOnTurn === state.turn) return false;
  if (creature.canAttackFromTurn > state.turn) return false;
  if ((creature.cannotAttackUntilTurn ?? 0) >= state.turn) return false;
  const defender = state.sides[oppositeSide(side)].field[slot];
  return !defender || canBeAttackTarget(state.turn, defender, creature, state.sides[side].field);
}

/**
 * Criatura deste lado que está OBRIGADA a atacar e ainda pode (Marionete de
 * Guerra, Feiticeiro Tribal Badur). Enquanto houver uma, o turno não encerra —
 * "deve atacar, se possível" só é regra se o motor cobrar (decisão nº 34).
 */
export function forcedAttackerSlot(state: GameState, side: SideId): number | null {
  const field = state.sides[side].field;
  for (let slot = 0; slot < field.length; slot++) {
    const creature = field[slot];
    if (!creature) continue;
    if ((creature.mustAttackUntilTurn ?? 0) < state.turn) continue;
    if (!attackStillPossible(state, side, creature, slot)) continue;
    return slot;
  }
  return null;
}

/**
 * Alvo que uma carta de COMANDO exige, quando exige: de que lado e com que
 * filtro. A tela usa isto para acender só as colunas que o motor aceitaria —
 * oferecer uma coluna vazia e devolver recusa era o caminho mais curto para o
 * jogador achar que a carta não funciona (relato do DevLukkas).
 */
export interface CommandTargetSpec {
  target: 'chosen_ally' | 'chosen_enemy';
  filter?: CardFilter;
}

export function commandTargetSpec(card: Card): CommandTargetSpec | null {
  if (card.type !== 'command') return null;
  for (const effect of card.effects ?? []) {
    if (!('target' in effect)) continue;
    if (effect.target !== 'chosen_ally' && effect.target !== 'chosen_enemy') continue;
    const filter = 'filter' in effect ? effect.filter : undefined;
    return { target: effect.target, ...(filter ? { filter } : {}) };
  }
  return null;
}

/** A criatura serve de alvo para este comando? (mesma conta no motor e na tela) */
export function canBeCommandTarget(
  spec: CommandTargetSpec,
  creature: CreatureInPlay | null | undefined,
): boolean {
  if (!creature) return false;
  return creatureMatches(creature, spec.filter);
}
