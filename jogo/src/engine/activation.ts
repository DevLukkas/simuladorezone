import { cardById } from '../data/cards.ts';
import type { ActivationCost, Element } from '../data/types.ts';
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

/** Recorte do lado do dono que as duas funções consultam. */
export interface ActivationScope {
  turn: number;
  field: readonly (CreatureInPlay | null)[];
  discard: readonly CardInZone[];
  hand: readonly CardInZone[];
}

/** Habilidades que esta criatura pode ativar agora — dela mesma ou de um anexo. */
export function creatureActivations(
  creature: CreatureInPlay,
  slot: number,
  scope: ActivationScope,
): ActivationOption[] {
  const options: ActivationOption[] = [];

  if (creature.cardId !== null) {
    const card = cardById(creature.cardId);
    if (card.type === 'creature') {
      for (const ability of card.activatedAbilities ?? []) {
        if (ability.source !== 'field_creature') continue;
        // habilidade de reação: quem oferece é o motor, na janela do oponente
        if (ability.condition?.active_player === 'opponent') continue;
        if (ability.timing === 'once_per_turn' && creature.usedAbilities[ability.id] === scope.turn) {
          continue;
        }
        if (!costPayable(creature, ability.cost)) continue;
        if (ability.action.type === 'summon_from_discard') {
          const filter = ability.action.filter;
          const hasTarget = scope.discard.some((node) => cardMatches(node.cardId, filter));
          const emptySlot = scope.field.some((other, index) => other === null && index !== slot);
          const willHaveRoom = emptySlot || ability.cost?.type === 'sacrifice_self';
          if (!hasTarget || !willHaveRoom) continue;
        }
        options.push({ sourceUid: creature.uid, abilityId: ability.id, cardId: card.id });
      }
    }
  }

  for (const attachment of creature.attachments) {
    const card = cardById(attachment.cardId);
    if (card.type !== 'item') continue;
    for (const ability of card.activatedAbilities ?? []) {
      if (ability.source !== 'attached_card') continue;
      // o motor só resolve troca de elemento vinda de anexo; o resto ainda é design
      if (ability.action.type !== 'change_element') continue;
      const race = ability.condition?.attached_creature_race;
      if (race && creatureDef(creature).race !== race) continue;
      if (
        ability.timing === 'once_per_turn' &&
        attachment.usedAbilities?.[ability.id] === scope.turn
      ) {
        continue;
      }
      options.push({
        sourceUid: attachment.uid,
        abilityId: ability.id,
        cardId: card.id,
        elements: ability.action.choose ?? CHOOSABLE_ELEMENTS,
      });
    }
  }

  return options;
}

/** Habilidades que esta carta da mão pode ativar agora (Leviathan de Esdras). */
export function handActivations(inHand: CardInZone, scope: ActivationScope): ActivationOption[] {
  const card = cardById(inHand.cardId);
  if (card.type !== 'creature') return [];
  const options: ActivationOption[] = [];
  for (const ability of card.activatedAbilities ?? []) {
    if (ability.source !== 'hand') continue;
    // idem: fora do special summon, habilidade da mão ainda é design pendente
    if (ability.action.type !== 'special_summon_over_ally') continue;
    const filter = ability.action.filter;
    const hasHost = scope.field.some((creature) => creature !== null);
    const hasSummonable = scope.hand.some(
      (other) => other.uid !== inHand.uid && cardMatches(other.cardId, filter),
    );
    if (!hasHost || !hasSummonable) continue;
    options.push({ sourceUid: inHand.uid, abilityId: ability.id, cardId: card.id });
  }
  return options;
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
