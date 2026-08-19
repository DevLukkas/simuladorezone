import { cardById } from '../data/cards.ts';
import type {
  Card,
  AttachableCard,
  Element,
  CardFilter,
  Keyword,
  Race,
  Rarity,
} from '../data/types.ts';
import type { CreatureInPlay } from './state.ts';

/** Identidade resolvida de uma criatura em campo (carta do catálogo ou ficha). */
export interface CreatureDef {
  name: string;
  race: Race;
  attack: number;
  health: number;
  element: Element;
  rarity: Rarity;
  text: string | null;
}

export function creatureDef(creature: CreatureInPlay): CreatureDef {
  if (creature.token) {
    const token = creature.token;
    return {
      name: token.name,
      race: token.race,
      attack: token.attack,
      health: token.health,
      element: token.element,
      rarity: token.rarity,
      text: null,
    };
  }
  const card = cardById(creature.cardId ?? 0);
  if (card.type !== 'creature') throw new Error(`uid ${creature.uid} não é criatura`);
  return {
    name: card.name,
    race: card.race,
    attack: card.attack,
    health: card.health,
    element: card.element,
    rarity: card.rarity,
    text: card.text,
  };
}

/** Elemento vigente: alterado por efeito ou o impresso. */
export function currentElement(creature: CreatureInPlay): Element {
  return creature.changedElement ?? creatureDef(creature).element;
}

/** Porta de `matchesCreatureRule` do legado, sobre o elemento vigente. */
export function creatureMatches(
  creature: CreatureInPlay,
  filter: CardFilter | undefined,
  excludeUid?: string,
): boolean {
  if (!filter) return true;
  const def = creatureDef(creature);
  if (excludeUid && creature.uid === excludeUid) return false;
  if (filter.race && def.race !== filter.race) return false;
  if (filter.element && currentElement(creature) !== filter.element) return false;
  const name = def.name.toLowerCase();
  if (filter.name && name !== filter.name.toLowerCase()) return false;
  if (filter.name_includes && !name.includes(filter.name_includes.toLowerCase())) return false;
  return true;
}

/** Mesmo filtro, mas sobre uma carta de catálogo (mão, deck, descarte). */
export function cardMatches(cardId: number, filter: CardFilter | undefined): boolean {
  if (!filter) return true;
  const card = cardById(cardId);
  const name = card.name.toLowerCase();
  if (filter.name && name !== filter.name.toLowerCase()) return false;
  if (filter.name_includes && !name.includes(filter.name_includes.toLowerCase())) return false;
  if (filter.race && (card.type !== 'creature' || card.race !== filter.race)) return false;
  if (filter.element && card.element !== filter.element) return false;
  return true;
}

/**
 * Palavra-chave vigente numa criatura: a impressa na carta mais as concedidas
 * por anexos (`grant_keyword`). Fichas não têm palavra impressa — só o que
 * ganharem de anexo. Consulta única para o motor inteiro; carta é dado.
 */
export function hasKeyword(creature: CreatureInPlay, key: Keyword): boolean {
  if (creature.cardId !== null) {
    const card = cardById(creature.cardId);
    if (card.type === 'creature' && (card.keywords ?? []).includes(key)) return true;
  }
  return creature.attachments.some((attachment) => {
    const card = cardById(attachment.cardId);
    if (!isAttachable(card)) return false;
    return (card.effects ?? []).some(
      (effect) => effect.type === 'grant_keyword' && effect.keyword === key,
    );
  });
}

/**
 * Palavra-chave impressa numa carta de catálogo — a consulta possível ANTES de a
 * criatura existir em campo (invocação). Em campo use `hasKeyword`, que soma as
 * concedidas por anexo.
 */
export function cardHasKeyword(card: Card, keyword: Keyword): boolean {
  return card.type === 'creature' && (card.keywords ?? []).includes(keyword);
}

/**
 * Cria a criatura em campo. Único lugar que decide a espera de invocação:
 * AGRESSIVO (a palavra-chave que o legado lia do texto como "Aptidão") ataca no
 * turno em que entra, e efeitos que invocam com ataque liberado passam
 * `canAttackThisTurn`.
 */
export function newCreatureInPlay(
  turn: number,
  uid: string,
  cardId: number,
  options: { canAttackThisTurn?: boolean } = {},
): CreatureInPlay {
  const readyNow = options.canAttackThisTurn === true || cardHasKeyword(cardById(cardId), 'aggressive');
  return {
    uid,
    cardId,
    damage: 0,
    markers: { attack: 0, defense: 0 },
    temporaryModifiers: [],
    attachments: [],
    summonedOnTurn: turn,
    canAttackFromTurn: readyNow ? turn : turn + 1,
    usedAbilities: {},
  };
}

/** lendária = 2, rara = 1, comum = 0 (pontuação por destruição em batalha). */
export function pointsForRarity(rarity: Rarity): number {
  if (rarity === 'legendary') return 2;
  if (rarity === 'rare') return 1;
  return 0;
}

export function isAttachable(card: Card): card is AttachableCard {
  return card.type === 'ability' || card.type === 'item';
}
