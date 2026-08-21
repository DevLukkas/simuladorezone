import type { TextKey } from '../i18n/keys.ts';
import { ELEMENT_COLOR, ZN } from './theme.ts';

/**
 * A cor de cada linha do registro da partida (decisão nº 42).
 *
 * O registro era uma parede de linhas iguais, em cinza — "não dá para entender
 * muita coisa" (relato do DevLukkas sobre o print). O que separa uma linha da
 * outra agora é o ASSUNTO: quem varre a gaveta procurando "onde começou o turno
 * 4" ou "quanto dano eu tomei" acha pela cor, antes de ler.
 *
 * Vive fora do componente porque é DADO, e porque é ele que o teste confere: uma
 * chave de registro nova sem assunto cairia no cinza sem ninguém notar.
 */
export type LogTone = 'turn' | 'play' | 'combat' | 'score' | 'flow' | 'effect' | 'denial' | 'system';

/**
 * Uma cor por assunto, todas já do tema (elemento, ouro, verde, vermelho): o
 * filete é a cor cheia e o texto é a versão clara, que se lê a 10px no escuro.
 */
export const LOG_TONE: Record<LogTone, { line: string; text: string }> = {
  turn: { line: ZN.gold, text: ZN.goldLight },
  play: { line: ELEMENT_COLOR.wind, text: '#a7e8de' },
  combat: { line: ZN.red, text: '#f0a196' },
  score: { line: ZN.green, text: '#9fe0b0' },
  flow: { line: ELEMENT_COLOR.water, text: '#9ecdf5' },
  effect: { line: ZN.spell, text: '#c9a6f5' },
  denial: { line: ELEMENT_COLOR.fire, text: '#ffab86' },
  system: { line: ZN.slot, text: '#949aa8' },
};

/**
 * O assunto de cada linha, pelo nome curto da chave (`log.summoned` → `summoned`).
 * As chaves são as que `describeEvent` emite; o que não estiver aqui é `system`,
 * que é o certo para o que não é lance nem consequência (início, mulligan, recusa
 * de reagir).
 */
export const LOG_TONE_OF: Partial<Record<string, LogTone>> = {
  // a virada: é por ela que se procura "onde começou o turno 4"
  turnStartedYou: 'turn',
  turnStartedOpponent: 'turn',
  battlePhase: 'turn',

  // pôr carta em jogo
  summoned: 'play',
  tokenCreated: 'play',
  attached: 'play',
  scenarioPlayed: 'play',
  commandPlayed: 'play',
  summonedFromDeck: 'play',
  summonedFromDiscard: 'play',
  scenarioTriggered: 'play',
  abilityActivated: 'play',
  heroActivated: 'play',

  // pancada
  battle: 'combat',
  directDamage: 'combat',
  creatureDestroyed: 'combat',
  creatureDamaged: 'combat',
  defeat: 'combat',

  // o que aproxima do fim
  scored: 'score',
  creatureHealed: 'score',
  victory: 'score',

  // carta trocando de zona sem ninguém jogar nada
  youDrew: 'flow',
  someoneDrew: 'flow',
  handLimitDiscard: 'flow',
  discarded: 'flow',
  youSearched: 'flow',
  someoneSearched: 'flow',
  revealed: 'flow',
  shuffledIntoDeck: 'flow',
  milled: 'flow',
  creatureSacrificed: 'flow',
  tokenGone: 'flow',
  attachmentDiscarded: 'flow',
  attachmentReturned: 'flow',

  // a criatura mudou de números ou de elemento
  markerAdded: 'effect',
  temporaryModifier: 'effect',
  elementChanged: 'effect',
  statsSwapped: 'effect',
  statsSwappedWhileChanged: 'effect',
  protectedFromAttacks: 'effect',

  // o lance foi declarado e não aconteceu
  attackBlocked: 'denial',
  attackDenied: 'denial',
  preventedFromAttacking: 'denial',
  forcedToAttack: 'denial',

  // moldura da partida, não lance: fica no cinza de propósito
  matchStartedYou: 'system',
  matchStartedOpponent: 'system',
  mulliganKept: 'system',
  mulliganSwapped: 'system',
  reactionDeclined: 'system',
  reasonConcede: 'system',
  reasonTimeout: 'system',
};

export function logTone(key: TextKey): LogTone {
  return LOG_TONE_OF[key.startsWith('log.') ? key.slice('log.'.length) : key] ?? 'system';
}
