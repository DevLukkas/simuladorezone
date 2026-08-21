import { cardById } from '../data/cards.ts';
import type { ActivatedAbility, ActivationCost, Element } from '../data/types.ts';
import type { ErrorCode } from '../shared/errors.ts';
import { cardMatches, creatureDef } from './cardsInPlay.ts';
import { CHOOSABLE_ELEMENTS } from './effects.ts';
import type { CardInZone, CreatureInPlay } from './state.ts';

/**
 * Quais habilidades ativadas estão DISPONÍVEIS agora.
 *
 * Quem resolve continua sendo `activateAbility` (effects.ts) — aqui só se repete a
 * porta de entrada dela (custo pagável, 1x por turno, condição de raça, alvo
 * existente), porque a tela precisa saber ANTES de mandar o comando: é o que decide
 * se a criatura acende o brilho, se a carta da mão ganha o ícone e quais botões o
 * painel de ativação oferece. O cliente não pode "tentar e ver se dá erro".
 *
 * Habilidade nova mexe nos dois lugares; `__tests__/activation.test.ts` cobra o
 * acordo entre o que esta função oferece e o que o motor aceita.
 *
 * Puro como todo o resto do motor: recebe só os dados que a visão do jogador já tem
 * (invariante 1), então serve tanto ao servidor quanto ao cliente.
 */
export interface ActivationOption {
  sourceUid: string;
  abilityId: string;
  /** carta que traz a habilidade — o rótulo do botão sai dela */
  cardId: number;
  /** ativação que exige escolher o elemento antes de mandar o comando (Sapocalibur) */
  elements?: Element[];
}

/**
 * Uma habilidade da criatura E se ela está utilizável agora.
 *
 * A oferta existe mesmo desligada, e é essa a diferença para `creatureActivations`.
 * O motivo é o mesmo da mão (ver `HandAbilityOffer`): o Bebê Urso mostra "Sacrifique
 * esta criatura:" no texto, o painel dizia "esta criatura não tem habilidade
 * ativável" quando faltava o Urso no descarte, e a conclusão do jogador era que a
 * carta estava quebrada (relato do DevLukkas). Com a oferta desligada e o motivo
 * junto, a carta explica a própria regra.
 */
export interface AbilityOffer extends ActivationOption {
  /** o motor aceitaria `ACTIVATE_ABILITY` agora? */
  available: boolean;
  /** falta o quê, quando não — a MESMA recusa que o motor devolveria */
  blocked?: ErrorCode;
  /** o que a ativação cobra: é o que o rótulo do botão promete ao jogador */
  cost?: ActivationCost['type'];
}

/** Recorte do lado do dono que as duas funções consultam. */
export interface ActivationScope {
  turn: number;
  field: readonly (CreatureInPlay | null)[];
  discard: readonly CardInZone[];
  hand: readonly CardInZone[];
  /** campo do adversário: só a contagem de criaturas importa (força de ataque) */
  enemyField?: readonly (CreatureInPlay | null)[];
}

/**
 * Toda habilidade que esta criatura traz — dela mesma ou de um anexo —, com o
 * porquê de cada uma que não dá para usar agora.
 */
export function creatureAbilityOffers(
  creature: CreatureInPlay,
  slot: number,
  scope: ActivationScope,
): AbilityOffer[] {
  const offers: AbilityOffer[] = [];

  if (creature.cardId !== null) {
    const card = cardById(creature.cardId);
    if (card.type === 'creature') {
      for (const ability of card.activatedAbilities ?? []) {
        if (ability.source !== 'field_creature') continue;
        const blocked = fieldAbilityBlockedBy(creature, slot, scope, ability);
        offers.push({
          sourceUid: creature.uid,
          abilityId: ability.id,
          cardId: card.id,
          available: blocked === null,
          ...(blocked ? { blocked } : {}),
          ...(ability.cost ? { cost: ability.cost.type } : {}),
        });
      }
    }
  }

  for (const attachment of creature.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'item') continue;
    for (const ability of card.activatedAbilities ?? []) {
      if (ability.source !== 'attached_card') continue;
      let blocked: ErrorCode | null = null;
      // o motor só resolve troca de elemento vinda de anexo; o resto ainda é design
      if (ability.action.type !== 'change_element') blocked = 'ability_pending_design';
      else {
        const race = ability.condition?.attached_creature_race;
        if (race && creatureDef(creature).race !== race) blocked = 'attached_race_condition';
        else if (
          ability.timing === 'once_per_turn' &&
          attachment.usedAbilities?.[ability.id] === scope.turn
        ) {
          blocked = 'ability_already_used';
        }
      }
      offers.push({
        sourceUid: attachment.uid,
        abilityId: ability.id,
        cardId: card.id,
        available: blocked === null,
        ...(blocked ? { blocked } : {}),
        ...(ability.action.type === 'change_element'
          ? { elements: ability.action.choose ?? CHOOSABLE_ELEMENTS }
          : {}),
      });
    }
  }

  return offers;
}

/**
 * O que impede esta habilidade de criatura de ser ativada AGORA — `null` quando
 * nada impede. É o espelho da porta de entrada de `activateAbility`: cada recusa
 * daqui é uma recusa que o motor devolveria.
 */
function fieldAbilityBlockedBy(
  creature: CreatureInPlay,
  slot: number,
  scope: ActivationScope,
  ability: ActivatedAbility,
): ErrorCode | null {
  // habilidade de reação: quem oferece é o motor, na janela do oponente
  if (ability.condition?.active_player === 'opponent') return 'reaction_only_ability';
  if (ability.timing === 'once_per_turn' && creature.usedAbilities[ability.id] === scope.turn) {
    return 'ability_already_used';
  }
  if (!costPayable(creature, ability.cost)) return 'cost_not_paid';

  const action = ability.action;
  switch (action.type) {
    case 'summon_from_discard': {
      const filter = action.filter;
      const hasTarget = scope.discard.some((node) => cardMatches(node.cardId, filter));
      const emptySlot = scope.field.some((other, index) => other === null && index !== slot);
      const willHaveRoom = emptySlot || ability.cost?.type === 'sacrifice_self';
      return hasTarget && willHaveRoom ? null : 'no_discard_target';
    }
    case 'force_attack': {
      const enemies = scope.enemyField ?? [];
      return enemies.some((enemy) => enemy !== null) ? null : 'effect_has_no_target';
    }
    case 'prevent_attack':
    case 'mill_then_gain_health_per_element':
      return null;
    // ação que o motor ainda não resolve: a oferta aparece desligada, dizendo isso
    default:
      return 'ability_pending_design';
  }
}

/** Habilidades que esta criatura pode ativar agora — dela mesma ou de um anexo. */
export function creatureActivations(
  creature: CreatureInPlay,
  slot: number,
  scope: ActivationScope,
): ActivationOption[] {
  return creatureAbilityOffers(creature, slot, scope)
    .filter((offer) => offer.available)
    .map(({ sourceUid, abilityId, cardId, elements }) => ({
      sourceUid,
      abilityId,
      cardId,
      ...(elements ? { elements } : {}),
    }));
}

/**
 * Uma habilidade que a carta usa DA MÃO, e se ela está utilizável agora.
 *
 * Mesma ideia da oferta em campo: Leviathan de Esdras é a única carta do catálogo
 * que não se invoca — ela se DESCARTA da mão — e, enquanto a tela só desenhava o
 * que já estava utilizável, o jogador sem a segunda cópia não via botão nenhum e
 * concluía que a carta estava quebrada (relato do DevLukkas).
 */
export type HandAbilityOffer = AbilityOffer;

/**
 * Toda habilidade de mão desta carta, utilizável ou não.
 *
 * Fora do escopo: habilidade cuja AÇÃO o motor ainda não resolve — oferecer um
 * botão que sempre recusa é pior que não ter botão. O filtro é o mesmo de
 * `activateAbility` (`ability_pending_design`).
 */
export function handAbilityOffers(
  inHand: CardInZone,
  scope: ActivationScope,
): HandAbilityOffer[] {
  const card = cardById(inHand.cardId);
  if (card.type !== 'creature') return [];
  const offers: HandAbilityOffer[] = [];
  for (const ability of card.activatedAbilities ?? []) {
    if (ability.source !== 'hand') continue;
    // idem: fora do special summon, habilidade da mão ainda é design pendente
    if (ability.action.type !== 'special_summon_over_ally') continue;
    const filter = ability.action.filter;
    const hasHost = scope.field.some((creature) => creature !== null);
    const hasSummonable = scope.hand.some(
      (other) => other.uid !== inHand.uid && cardMatches(other.cardId, filter),
    );
    const available = hasHost && hasSummonable;
    offers.push({
      sourceUid: inHand.uid,
      abilityId: ability.id,
      cardId: card.id,
      available,
      ...(available ? {} : { blocked: 'needs_creature_and_card' as const }),
      ...(ability.cost ? { cost: ability.cost.type } : {}),
    });
  }
  return offers;
}

/** Habilidades que esta carta da mão pode ativar agora (Leviathan de Esdras). */
export function handActivations(inHand: CardInZone, scope: ActivationScope): ActivationOption[] {
  return handAbilityOffers(inHand, scope)
    .filter((offer) => offer.available)
    .map(({ sourceUid, abilityId, cardId }) => ({ sourceUid, abilityId, cardId }));
}

/** Espelha `payCost`: custo que não dá para pagar não vira oferta. */
function costPayable(creature: CreatureInPlay, cost: ActivationCost | undefined): boolean {
  if (!cost) return true;
  if (cost.type === 'sacrifice_self') return true;
  if (cost.type === 'destroy_attachment') {
    const wanted = cost.name_includes.toLowerCase();
    return creature.attachments.some((attachment) =>
      cardById(attachment.cardId).name.toLowerCase().includes(wanted),
    );
  }
  // discard_self é custo de carta na mão, nunca de criatura em campo
  return false;
}
