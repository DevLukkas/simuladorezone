import type { GameEvent } from '../engine/events.ts';
import type { SideId } from '../engine/state.ts';
import type { TextKey } from '../i18n/keys.ts';
import { cardRef, text, tokenRef, type TextRef } from '../shared/text.ts';

/**
 * Um evento do motor vira uma LINHA DE REGISTRO traduzível — chave + parâmetros,
 * nunca a frase pronta. Null = evento silencioso (a animação já conta a história).
 */
export function describeEvent(event: GameEvent, mySide: SideId): TextRef | null {
  const mine = (side: SideId) => side === mySide;
  const who = (side: SideId) => text(mine(side) ? 'board.you' : 'board.opponent');

  switch (event.type) {
    case 'MATCH_STARTED':
      return text(mine(event.firstSide) ? 'log.matchStartedYou' : 'log.matchStartedOpponent');
    case 'MULLIGAN_DECIDED':
      return text(event.swapped ? 'log.mulliganSwapped' : 'log.mulliganKept', { who: who(event.side) });
    case 'CARD_DRAWN':
      return mine(event.side) && event.card
        ? text('log.youDrew', { card: cardRef(event.card.cardId) })
        : text('log.someoneDrew', { who: who(event.side) });
    case 'HAND_LIMIT_DISCARD':
      return text('log.handLimitDiscard', {
        who: who(event.side),
        card: cardRef(event.card.cardId),
      });
    case 'TURN_STARTED':
      return text(mine(event.side) ? 'log.turnStartedYou' : 'log.turnStartedOpponent', {
        turn: event.turn,
      });
    case 'PHASE_CHANGED':
      return event.phase === 'battle' ? text('log.battlePhase') : null;
    case 'CREATURE_SUMMONED':
      return text('log.summoned', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'TOKEN_CREATED':
      return text('log.tokenCreated', { who: who(event.side), token: tokenRef(event.token.id) });
    case 'CARD_ATTACHED':
      return text('log.attached', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'SCENARIO_PLAYED':
      return text('log.scenarioPlayed', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'ATTACK_DECLARED':
      return null;
    case 'BATTLE':
      return text('log.battle', {
        column: event.attacker.slot + 1,
        toDefender: event.damageToDefender,
        toAttacker: event.damageToAttacker,
      });
    case 'DIRECT_DAMAGE':
      return text('log.directDamage', { who: who(event.sufferer), value: event.value });
    case 'SCORED':
      return text('log.scored', { who: who(event.side), gained: event.gained, total: event.total });
    case 'CREATURE_DESTROYED':
      return text(event.toDiscard ? 'log.creatureDestroyed' : 'log.tokenGone');
    case 'ATTACHMENT_DISCARDED':
      return text('log.attachmentDiscarded', { card: cardRef(event.card.cardId) });
    case 'ATTACHMENT_RETURNED_TO_HAND':
      return text('log.attachmentReturned', { card: cardRef(event.card.cardId) });
    case 'TURN_ENDED':
      return null;
    case 'GAME_OVER': {
      const reason =
        event.reason === 'points'
          ? ''
          : text(event.reason === 'concede' ? 'log.reasonConcede' : 'log.reasonTimeout');
      return text(mine(event.winner) ? 'log.victory' : 'log.defeat', { reason });
    }
    case 'CARD_DISCARDED':
      return text('log.discarded', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'CARD_SEARCHED':
      return mine(event.side) && event.card
        ? text('log.youSearched', { card: cardRef(event.card.cardId) })
        : text('log.someoneSearched', { who: who(event.side) });
    case 'CARD_REVEALED':
      return text('log.revealed', { card: cardRef(event.card.cardId) });
    case 'CARD_SHUFFLED_INTO_DECK':
      return text('log.shuffledIntoDeck', { card: cardRef(event.card.cardId) });
    case 'CARD_MILLED':
      return text('log.milled', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'MARKER_ADDED':
      return text('log.markerAdded', { attack: signed(event.attack), defense: signed(event.defense) });
    case 'TEMPORARY_MODIFIER':
      return text('log.temporaryModifier', {
        attack: signed(event.attack),
        defense: signed(event.defense),
      });
    case 'CREATURE_DAMAGED':
      return text('log.creatureDamaged', { value: event.value });
    case 'CREATURE_HEALED':
      return text('log.creatureHealed', { value: event.value });
    case 'ELEMENT_CHANGED':
      return text('log.elementChanged', {
        from: text(`element.${event.from}`),
        to: text(`element.${event.to}`),
      });
    case 'STATS_SWAPPED':
      return text(event.whileElementChanged ? 'log.statsSwappedWhileChanged' : 'log.statsSwapped');
    case 'ATTACK_DENIED':
      return text('log.attackDenied', { card: cardRef(event.attachmentCardId) });
    case 'ATTACK_BLOCKED':
      // agora ele acontece de verdade (decisão nº 38): o ataque foi declarado e
      // a reação do oponente o impediu antes de resolver
      return text('log.attackBlocked');
    case 'PREVENTED_FROM_ATTACKING':
      return text('log.preventedFromAttacking', { turn: event.untilTurn });
    case 'PROTECTED_FROM_ATTACKS':
      return text('log.protectedFromAttacks', { turn: event.untilTurn });
    case 'FORCED_TO_ATTACK':
      return text('log.forcedToAttack', { turn: event.untilTurn });
    case 'COMMAND_PLAYED':
      return text('log.commandPlayed', { who: who(event.side), card: cardRef(event.card.cardId) });
    case 'REACTION_WINDOW':
      // a pausa na tela já conta que houve uma janela; escrever aqui só encheria
      // o registro com uma linha por jogada
      return null;
    case 'REACTION_DECLINED':
      return mine(event.side) ? null : text('log.reactionDeclined');
    case 'ABILITY_ACTIVATED':
      return text('log.abilityActivated', { who: who(event.side) });
    case 'CREATURE_SACRIFICED':
      return text('log.creatureSacrificed', { who: who(event.side) });
    case 'SUMMONED_FROM_DECK':
      return text('log.summonedFromDeck', { card: cardRef(event.card.cardId) });
    case 'SUMMONED_FROM_DISCARD':
      return text('log.summonedFromDiscard', { card: cardRef(event.card.cardId) });
    case 'HERO_ACTIVATED':
      return text('log.heroActivated', { hero: heroName(event.hero) });
    case 'SCENARIO_TRIGGERED':
      return text('log.scenarioTriggered', { card: cardRef(event.cardId) });
    default:
      // a união é fechada, então este ramo não existe em partida ao vivo. Existe
      // para a FITA (decisão nº 44): uma partida arquivada carrega os eventos da
      // versão que a gravou, e um evento que este código ainda não conhece — ou
      // já não conhece mais — vira linha em branco em vez de derrubar o replay
      return null;
  }
}

/** o herói viaja como chave ("badur"); o nome vem do dicionário */
function heroName(key: string): TextRef {
  return text(`hero.${key}.name` as TextKey);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
