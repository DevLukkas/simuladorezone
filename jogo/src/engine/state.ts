import type { TextRef } from '../shared/text.ts';
import type {
  Action,
  Element,
  CreatureToken,
  CardFilter,
  Format,
} from '../data/types.ts';

/**
 * Estado serializável da partida. Nenhuma referência a objetos gráficos,
 * funções ou promessas: só dados. `structuredClone`-ável de ponta a ponta.
 */

export type SideId = 'a' | 'b';
export type Phase = 'mulligan' | 'main' | 'battle';

export const SLOTS_PER_SIDE = 5;
export const MAX_HAND = 8;
export const POINTS_TO_WIN = 3;
export const DIRECT_DAMAGE_PER_POINT = 5;
export const STARTING_HAND = 5;
export const TURN_SECONDS = 60;
/** janela de reação à jogada do oponente (paridade com os 7s do legado) */
export const REACTION_SECONDS = 7;

export function oppositeSide(side: SideId): SideId {
  return side === 'a' ? 'b' : 'a';
}

/** Uma cópia física de carta, com identidade própria (`uid`) para alvos e eventos. */
export interface CardInZone {
  uid: string;
  cardId: number;
}

export interface AttachmentInPlay {
  uid: string;
  cardId: number;
  /** turno em que negou um ataque (Proteção do Escudeiro é 1x por turno) */
  shieldUsedOnTurn?: number;
  /** habilidades ativadas do anexo (Sapocalibur): id → turno de uso */
  usedAbilities?: Record<string, number>;
  /** turno em que a redução 1x-por-turno já foi gasta (Resistência) */
  reductionUsedOnTurn?: number;
  /** criatura inimiga escolhida na entrada (Afogamento): morreu → o anexo cai */
  chosenTargetUid?: string;
}

export interface TemporaryModifier {
  attack: number;
  defense: number;
  /** removido na varredura de fim do turno indicado */
  expiresAfterTurn: number;
}

export interface CreatureInPlay {
  uid: string;
  /** null para fichas — a definição fica em `ficha` */
  cardId: number | null;
  token?: CreatureToken;
  /** dano acumulado; vida atual = defesa calculada − dano */
  damage: number;
  /** marcadores permanentes (+1/+1 etc.) agregados */
  markers: { attack: number; defense: number };
  temporaryModifiers: TemporaryModifier[];
  attachments: AttachmentInPlay[];
  /** elemento vigente quando alterado por efeito; ausente = o impresso */
  changedElement?: Element;
  /** alteração temporária (Sapomerlim): o elemento volta ao impresso após este turno */
  changedElementUntilTurn?: number;
  /** Sapotristan: ATQ e VIDA trocados enquanto o elemento estiver alterado */
  swapStatsWhileElementChanged?: true;
  /** Sapotristan: lado que compra 1 carta se esta morrer com o elemento alterado */
  drawOnDeathWithElementChanged?: SideId;
  summonedOnTurn: number;
  /** "summoning sickness": só ataca a partir deste turno (AGRESSIVO zera a espera) */
  canAttackFromTurn: number;
  attackedOnTurn?: number;
  cannotAttackUntilTurn?: number;
  cannotBeTargetedUntilTurn?: number;
  /** id da habilidade ativada → turno em que foi usada (once_per_turn) */
  usedAbilities: Record<string, number>;
  /** Pele de Pedra (herói Badur) é uma vez por criatura */
  stoneSkinApplied?: boolean;
}

/** Efeito agendado (Manopla do Poder: dano no fim do próximo turno). */
export interface DelayedEffect {
  side: SideId;
  creatureUid: string;
  resolvesOnTurn: number;
  damage: number;
}

export interface TurnActions {
  summoned: boolean;
  attached: boolean;
  scenario: boolean;
}

export interface SideState {
  hero: string;
  /** topo do deck = índice 0 */
  deck: CardInZone[];
  hand: CardInZone[];
  field: (CreatureInPlay | null)[];
  scenario: CardInZone | null;
  discard: CardInZone[];
  exile: CardInZone[];
  points: number;
  /** dano direto acumulado rumo ao próximo ponto (0..4) */
  directDamage: number;
  actions: TurnActions;
  mulliganDone: boolean;
  /** flags 1x-por-turno de efeitos de cenário */
  scenarioFlags: Record<string, boolean>;
}

/**
 * Um gatilho coletado, aguardando resolução na corrente. Empate de prioridade
 * entre dois ou mais = o dono escolhe a ordem (a peça mais "TCG" do legado).
 */
export interface PendingTrigger {
  side: SideId;
  /** uid da carta/criatura fonte do gatilho */
  sourceUid: string;
  sourceCardId: number;
  action: Action;
  priority: number;
  /** uid da criatura que disparou o gatilho, quando o alvo padrão é ela */
  triggeredByUid?: string;
}

/**
 * Trabalho na fila de efeitos. A fila é processada até esvaziar ou até um
 * trabalho precisar de decisão humana — aí vira `pendencia` e o motor retorna.
 * Tudo serializável: o replay atravessa pendências sem perder nada.
 */
export type Job =
  | { type: 'trigger_batch'; triggers: PendingTrigger[] }
  | { type: 'trigger'; trigger: PendingTrigger }
  | { type: 'attack'; side: SideId; slot: number }
  | { type: 'on_enter'; side: SideId; slot: number; effect: Action }
  | { type: 'on_attach'; side: SideId; slot: number; attachmentUid: string; effect: Action };

/**
 * Continuação tipada de uma pendência: registra exatamente onde a resolução
 * parou e com quais dados retomar quando o jogador responder.
 */
export type PendingContext =
  | { type: 'shield'; attackJob: Job & { type: 'attack' }; attachmentHolderSlot: number; attachmentUid: string }
  | { type: 'chain_order'; triggers: PendingTrigger[] }
  | { type: 'optional_trigger'; trigger: PendingTrigger }
  | { type: 'trigger_target'; trigger: PendingTrigger }
  | { type: 'atlas_discard'; side: SideId; search: { name_includes?: string } }
  | { type: 'atlas_search'; side: SideId }
  | { type: 'react_command'; side: SideId }
  | { type: 'react_command_target'; side: SideId; cardUid: string; targetSide: SideId }
  | { type: 'react_ability'; side: SideId }
  | { type: 'drowning_target'; side: SideId; attachmentUid: string; perAttachment: number }
  | { type: 'jar_element'; side: SideId; slot: number }
  | { type: 'oracle_choose'; side: SideId; revealedUids: string[] }
  | { type: 'heart_swap'; side: SideId; slot: number; attachmentUid: string; returnToHand: boolean }
  | { type: 'heart_swap_target'; side: SideId; slot: number; attachmentUid: string; returnToHand: boolean }
  /** Sapomerlim: alvo escolhido, agora o elemento */
  | { type: 'sapomerlim_element'; side: SideId; slot: number }
  /** Mapa do Tesouro: comprou, agora descarta */
  | { type: 'map_discard'; side: SideId }
  /** Leviathan: criatura a ser coberta, depois a carta da mão */
  | { type: 'leviathan_target'; side: SideId; filter: CardFilter }
  | { type: 'leviathan_summon'; side: SideId; slot: number };

export interface PendingOption {
  id: string;
  /** rótulo traduzível: nome de carta, elemento, "Sim"/"Não"… */
  label: TextRef;
}

export interface Pending {
  id: string;
  /** quem deve responder */
  side: SideId;
  type: 'yes_no' | 'choose_target' | 'choose_card' | 'choose_element' | 'choose_order';
  /** pergunta traduzível: o motor emite chave + parâmetros, nunca a frase */
  title: TextRef;
  options: PendingOption[];
  canDecline: boolean;
  /** janela de reação: prazo curto (SEGUNDOS_DE_REACAO) e recusa automática */
  reaction?: true;
  /** dados internos para retomar a resolução — sempre serializáveis */
  context: PendingContext;
}

/**
 * Oferta de reação agendada por uma jogada do lado ativo. Vira pendência do
 * oponente quando a fila de efeitos esvazia — nunca no meio de uma corrente.
 */
/** O que o lado ativo acabou de fazer, para o título da janela de reação. */
export type ReactionTrigger = 'summon' | 'attach' | 'attackCreature' | 'attackDirect' | 'battlePhase';

export interface ReactionWindow {
  /** quem pode reagir (sempre o lado não-ativo) */
  against: SideId;
  /** o que o oponente fez, para o título da pendência */
  action: ReactionTrigger;
  category: 'command' | 'ability';
}

export interface GameState {
  seed: number;
  rng: number;
  /**
   * Formato em que a partida corre. Fica no estado (e não numa variável de build)
   * porque servidor e cliente têm de concordar sobre quais regras valem, e porque o
   * replay determinístico precisa dele gravado junto com a seed.
   * Ausente nas partidas gravadas antes do segundo formato: trate como `classico`.
   */
  format: Format;
  turn: number;
  phase: Phase;
  activeSide: SideId;
  sides: Record<SideId, SideState>;
  winner: SideId | null;
  endReason?: 'points' | 'concede' | 'timeout';
  pending: Pending | null;
  /** oferta de reação aguardando a fila esvaziar para virar pendência */
  pendingReaction?: ReactionWindow | null;
  /** trabalhos de efeito aguardando resolução (FIFO) */
  queue: Job[];
  delayedEffects: DelayedEffect[];
  /** contador para uids de fichas e outras entidades criadas em jogo */
  nextUid: number;
}
