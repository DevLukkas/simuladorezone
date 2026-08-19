/**
 * Schema declarativo das cartas do Ezone TCG.
 *
 * Os campos de identidade da carta são em português (nome, raca, ataque, vida...),
 * como no legado — mas SEM a duplicação PT/EN (`card.race ?? card.raca`): cada
 * campo existe uma única vez. O vocabulário dos blocos de efeito (effects,
 * triggeredAbilities, action.type...) permanece em inglês porque é o contrato
 * herdado das 45 cartas já desenhadas; o motor conhece exatamente estas uniões,
 * e declarar um tipo fora delas é erro de compilação.
 */

export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'neutral' | 'void' | 'arcane';
export type Rarity = 'common' | 'rare' | 'legendary';
export type Edition = 'Abismos & Profundezas' | 'Matilhas & Predadores' | 'Quatro Elementos';

/**
 * Lista em tempo de execução de uma união de strings, sem repetir os membros à mão.
 *
 * O `satisfies Record<T, true>` é o que amarra as duas: membro novo na união e o
 * compilador acusa a lista incompleta, membro apagado e acusa o sobrando. Serve ao
 * estúdio de cartas (decisão nº 22), que monta os selects a partir destas listas.
 */
const listOf = <T extends string>(members: Record<T, true>): readonly T[] =>
  Object.keys(members) as T[];

export const ELEMENTS = listOf({
  fire: true,
  water: true,
  earth: true,
  wind: true,
  neutral: true,
  void: true,
  arcane: true,
} satisfies Record<Element, true>);

export const RARITIES = listOf({
  common: true,
  rare: true,
  legendary: true,
} satisfies Record<Rarity, true>);

export const EDITIONS = listOf({
  'Abismos & Profundezas': true,
  'Matilhas & Predadores': true,
  'Quatro Elementos': true,
} satisfies Record<Edition, true>);

/**
 * Formato de jogo: que cartas são legais e que regras valem numa partida.
 *
 * `classico` é o conjunto que já existia; `quatro-elementos` é o desenho novo, adotado
 * como direção sem derrubar o anterior (decisão nº 11). Os dois convivem para poderem
 * ser jogados em paralelo; quando um for descartado, apagar o membro desta união faz o
 * compilador apontar cada ponto que precisa sair junto.
 *
 * Vive no `EstadoDoJogo`, não em variável de build: servidor e cliente precisam
 * concordar por partida, e o replay determinístico depende disso.
 */
export type Format = 'classic' | 'four-elements';

export const FORMAT_BY_EDITION: Record<Edition, Format> = {
  'Abismos & Profundezas': 'classic',
  'Matilhas & Predadores': 'classic',
  'Quatro Elementos': 'four-elements',
};

export const FORMATS: readonly Format[] = ['classic', 'four-elements'];

export const FORMAT_NAME: Record<Format, string> = {
  classic: 'Clássico',
  'four-elements': 'Quatro Elementos',
};
export type Race =
  | 'Aquarium'
  | 'Amphibian'
  | 'Mutant'
  | 'Zombie'
  | 'Demon'
  | 'Beast'
  | 'Orc'
  | 'Ghost'
  // raças que estreiam no Quatro Elementos
  | 'Plant'
  | 'Human'
  | 'Goblin'
  | 'Dragon';

export const RACES = listOf({
  Aquarium: true,
  Amphibian: true,
  Mutant: true,
  Zombie: true,
  Demon: true,
  Beast: true,
  Orc: true,
  Ghost: true,
  Plant: true,
  Human: true,
  Goblin: true,
  Dragon: true,
} satisfies Record<Race, true>);

export type StatName = 'attack' | 'defense';

export const STAT_NAMES = listOf({ attack: true, defense: true } satisfies Record<StatName, true>);

/**
 * Palavras-chave: regra fechada que a carta apenas nomeia, em vez de descrever.
 * Vêm impressas na criatura (`keywords`) ou concedidas por um anexo
 * (`grant_keyword`) — o motor consulta as duas fontes por `hasKeyword`.
 *
 * - `aggressive` (AGRESSIVO): pode atacar no turno em que entra em campo.
 * - `trample` (ATROPELAR): o excedente do dano de batalha vira dano direto no dono.
 * - `martial` (MARCIAL): ataca primeiro; se o golpe matar a criatura oposta, não revida.
 * - `vorpal` (VORPAL): destruiu a criatura inimiga em batalha → o ATQ IMPRESSO desta
 *   criatura vira dano direto adicional no dono dela.
 * - `regenerate` (REGENERAR): recupera 1 de vida no início do turno do dono.
 *
 * O nome exibido de cada uma sai do i18n (`keyword.*`), nunca deste identificador.
 * Definições de MARCIAL, VORPAL e REGENERAR dadas pelo DevLukkas (decisão nº 13);
 * AGRESSIVO vem do mini-manual e substitui o "Aptidão" que o legado lia do texto
 * impresso (decisão nº 16).
 */
export type Keyword = 'aggressive' | 'trample' | 'martial' | 'vorpal' | 'regenerate';

export const KEYWORDS = listOf({
  aggressive: true,
  trample: true,
  martial: true,
  vorpal: true,
  regenerate: true,
} satisfies Record<Keyword, true>);

/** Filtro declarativo usado por auras, buscas e gatilhos. */
export interface CardFilter {
  race?: Race;
  element?: Element;
  name?: string;
  name_includes?: string;
}

/** Conta cartas numa zona para efeitos de "+X por carta". */
export interface PerCardCount {
  zone: 'your_field' | 'your_discard' | 'target_attachments';
  card_type?: 'creature';
  race?: Race;
  name_includes?: string;
  exclude_self?: boolean;
  /** "cada OUTRA": não conta a criatura que carrega o anexo */
  exclude_holder?: boolean;
  value: number;
}

/** Ficha (token) de criatura gerada por efeito. */
export interface CreatureToken {
  id: string;
  name: string;
  race: Race;
  attack: number;
  health: number;
  element: Element;
  rarity: Rarity;
  /** cor de fundo usada pela apresentação (fichas não têm arte própria) */
  color?: number;
}

// ---------------------------------------------------------------------------
// Efeitos contínuos (criaturas, habilidades anexadas, itens, cenário)
// ---------------------------------------------------------------------------

export type ContinuousEffect =
  | {
      type: 'aura_modify_stat';
      target: 'your_field';
      filter?: CardFilter;
      stats: StatName[];
      value: number;
      /** "OUTRAS criaturas aliadas": a própria fonte fica de fora */
      exclude_source?: boolean;
    }
  | {
      type: 'modify_stat';
      target: 'host';
      stat: StatName;
      value?: number;
      value_per_card?: PerCardCount;
      /** valor alternativo quando a criatura anexada casa com o filtro */
      conditionals?: { if: CardFilter; value: number }[];
      /** efeito só ativo enquanto a condição de campo vale */
      condition?: { zone: 'your_field'; count_same_element: number };
    }
  | {
      type: 'reduce_combat_damage_taken';
      target: 'allies' | 'host';
      filter?: CardFilter;
      value: number;
      /** "OUTRAS criaturas": a própria fonte da aura não se protege */
      exclude_source?: boolean;
      /** só na primeira vez que a criatura sofre dano a cada turno */
      once_per_turn?: boolean;
    }
  | { type: 'grant_keyword'; target: 'host'; keyword: Keyword }
  | {
      type: 'cannot_be_attacked_by_creatures_with_min_defense';
      target: 'host';
      min_defense: number;
    };

export type ScenarioEffect =
  | {
      type: 'on_enemy_destroyed_in_battle_draw';
      oncePerTurn: true;
      requiresYourCreature?: CardFilter;
      targetOwner: 'enemy';
      value: number;
    }
  | {
      /** criatura sua que case com `when` foi ao descarte → buff opcional em `target` */
      type: 'on_ally_sent_to_discard_buff_ally';
      when: CardFilter;
      target: CardFilter;
      stats: StatName[];
      value: number;
      duration: 'until_end_of_turn';
    };

// ---------------------------------------------------------------------------
// Vocabulário de efeitos: QUANDO (trigger) → EM QUEM (target) → O QUE (action)
//
// As três listas abaixo são fechadas e o motor implementa TODAS: uma carta nova
// se escreve combinando o que já existe, sem tocar no motor. Cada nome segue a
// mesma gramática — o alvo nunca está embutido no nome da ação, é um campo.
// ---------------------------------------------------------------------------

/**
 * QUANDO a habilidade dispara. O sujeito é sempre a primeira palavra:
 *
 * - `self_*`  — a própria carta que declara a habilidade (criatura ou anexo)
 * - `host_*`  — a criatura que carrega este anexo
 * - `ally_*`  — OUTRA criatura sua (filtrada por `filter`)
 * - `chosen_*`— a criatura que esta carta escolheu antes (Afogamento)
 */
export type TriggerType =
  | 'self_element_changed'
  | 'self_destroyed_by_creature'
  | 'self_sent_to_discard'
  | 'self_sent_to_discard_from_field'
  | 'self_sent_to_discard_outside_battle'
  | 'self_exiled'
  | 'ally_enters'
  | 'ally_element_changed'
  | 'ally_sent_to_discard'
  | 'ally_is_attacked'
  | 'host_attacks'
  | 'host_is_attacked'
  | 'host_deals_player_damage'
  | 'host_element_changed'
  | 'host_did_not_attack_this_turn'
  | 'host_attachment_count_reaches'
  | 'chosen_creature_dies';

export const TRIGGER_TYPES = listOf({
  self_element_changed: true,
  self_destroyed_by_creature: true,
  self_sent_to_discard: true,
  self_sent_to_discard_from_field: true,
  self_sent_to_discard_outside_battle: true,
  self_exiled: true,
  ally_enters: true,
  ally_element_changed: true,
  ally_sent_to_discard: true,
  ally_is_attacked: true,
  host_attacks: true,
  host_is_attacked: true,
  host_deals_player_damage: true,
  host_element_changed: true,
  host_did_not_attack_this_turn: true,
  host_attachment_count_reaches: true,
  chosen_creature_dies: true,
} satisfies Record<TriggerType, true>);

/**
 * EM QUEM a ação cai. `chosen_*` é o que abre uma escolha para o jogador;
 * o resto o motor resolve sozinho a partir do contexto do disparo.
 */
export type ActionTarget =
  /** a própria carta/criatura que declara a ação */
  | 'self'
  /** a criatura que carrega este anexo */
  | 'host'
  /** a criatura que disparou o gatilho (entrou em campo, mudou de elemento…) */
  | 'trigger_source'
  /** quem destruiu esta criatura em batalha */
  | 'destroyer'
  /** uma criatura sua, escolhida agora (no tabuleiro, se for comando) */
  | 'chosen_ally'
  /** uma criatura inimiga, escolhida agora (no tabuleiro, se for comando) */
  | 'chosen_enemy'
  /** todas as suas criaturas que casarem com o filtro */
  | 'all_allies';

export const ACTION_TARGETS = listOf({
  self: true,
  host: true,
  trigger_source: true,
  destroyer: true,
  chosen_ally: true,
  chosen_enemy: true,
  all_allies: true,
} satisfies Record<ActionTarget, true>);

/**
 * O QUE acontece. União única: a mesma ação serve a gatilho, habilidade
 * ativada, entrada em campo, anexo e comando — um handler por tipo, no motor.
 *
 * `optional: true` faz o motor perguntar antes ("você pode…"); sem ela a ação
 * resolve sozinha. Alvo `chosen_*` sempre abre a escolha, e recusar é permitido.
 */
export type Action = ActionKind & {
  /** o motor pergunta antes de resolver ("você pode…") */
  optional?: boolean;
};

/**
 * A união crua, sem o `optional` que `Action` acrescenta. Exportada para o estúdio
 * de cartas poder descrever campo a campo cada tipo de ação (ver `vocabulary.ts`).
 */
export type ActionKind =
  // ── marcadores, stats e elemento ──────────────────────────────────────────
  | {
      type: 'add_marker';
      target: ActionTarget;
      stats: StatName[];
      value?: number;
      value_per_card?: PerCardCount;
    }
  | {
      type: 'modify_stats';
      target: ActionTarget;
      filter?: CardFilter;
      stats: StatName[];
      value?: number;
      value_per_card?: PerCardCount;
      /** "OUTRAS criaturas aliadas": a fonte fica de fora */
      exclude_source?: boolean;
      duration: 'until_end_of_turn';
    }
  | {
      type: 'swap_stats';
      target: ActionTarget;
      filter?: CardFilter;
      duration: 'until_end_of_turn' | 'while_element_changed';
      return_attachment_to_hand?: boolean;
    }
  | {
      type: 'change_element';
      target: ActionTarget;
      /** filtro do alvo, quando o alvo é escolhido */
      filter?: CardFilter;
      /** ausente = o jogador escolhe entre todos os elementos */
      choose?: Element[];
      duration: 'until_end_of_turn' | 'while_attached' | 'permanent';
    }
  // ── dano, destruição e devolução ──────────────────────────────────────────
  | { type: 'deal_damage'; target: ActionTarget; damage: number }
  | { type: 'delayed_damage'; target: ActionTarget; damage: number; when: 'end_of_next_turn' }
  | { type: 'destroy'; target: ActionTarget }
  | { type: 'return_to_hand'; target: ActionTarget }
  // ── restrições de ataque ──────────────────────────────────────────────────
  | { type: 'prevent_attack'; target: ActionTarget; duration: 'this_turn' | 'next_turn' }
  | { type: 'prevent_being_targeted'; target: ActionTarget; duration: 'this_turn' }
  /** Proteção do Escudeiro: o anexo se descarta para negar o ataque */
  | { type: 'discard_self_to_prevent_attack'; filter?: CardFilter }
  /** sem efeito sob a regra de ataque por coluna — pendente de design */
  | { type: 'force_attack'; target: ActionTarget; filter?: CardFilter }
  // ── invocação ─────────────────────────────────────────────────────────────
  | { type: 'summon_token'; token: CreatureToken }
  | { type: 'summon_from_deck'; filter: CardFilter; count: number; can_attack_this_turn?: boolean }
  | { type: 'summon_from_discard'; filter: CardFilter; count: number }
  | { type: 'special_summon_over_ally'; filter: CardFilter }
  | {
      type: 'sacrifice_then_summon_from_deck';
      target: ActionTarget;
      summon: {
        count: number;
        card_type: 'creature';
        race?: Race;
        max_attack?: number;
        can_attack_this_turn?: boolean;
      };
    }
  // ── cartas ────────────────────────────────────────────────────────────────
  | { type: 'draw'; count: number }
  | { type: 'draw_then_discard'; draw: number; discard: number }
  | { type: 'discard_hand_then_draw' }
  | { type: 'opponent_discards_at_random'; count: number }
  | { type: 'discard_from_hand_then_search_deck'; discard: CardFilter; search: CardFilter }
  | {
      type: 'shuffle_discarded_creature_then_debuff';
      discardFilter: CardFilter;
      debuff: { stat: StatName; value_from: 'shuffled_card_attack'; duration: 'until_end_of_turn' };
    }
  | { type: 'reveal_opponent_hand_then_shuffle_one'; reveal: number; choose: number }
  | { type: 'mill_then_gain_health_per_element'; mill: number; value: number };

// ---------------------------------------------------------------------------
// Habilidades de gatilho
// ---------------------------------------------------------------------------

export interface TriggeredAbility {
  id: string;
  trigger: TriggerType;
  filter?: CardFilter;
  /** ordem na corrente de efeitos; empate = o jogador escolhe */
  priority?: number;
  /** exclusivos do gatilho host_attachment_count_reaches */
  attachedName?: string;
  count?: number;
  action: Action;
}

// ---------------------------------------------------------------------------
// Habilidades ativadas
// ---------------------------------------------------------------------------

export type ActivationCost =
  | { type: 'destroy_attachment'; name_includes: string }
  | { type: 'discard_self' }
  | { type: 'sacrifice_self' };

export interface ActivationCondition {
  active_player?: 'opponent';
  attached_creature_race?: Race;
}

export interface ActivatedAbility {
  id: string;
  timing?: 'once_per_turn';
  source: 'field_creature' | 'hand' | 'attached_card';
  cost?: ActivationCost;
  condition?: ActivationCondition;
  action: Action;
}

// ---------------------------------------------------------------------------
// As cartas
// ---------------------------------------------------------------------------

interface BaseCard {
  /** corresponde ao arquivo de arte: 01.png ... 45.png */
  id: number;
  name: string;
  /** texto de regras impresso na carta */
  text: string | null;
  element: Element;
  rarity: Rarity;
  /**
   * Carta impressa inteira (moldura, textos e números achatados) em
   * `public/assets/cards`. Só o clássico tem: as cartas do Quatro Elementos nunca foram
   * impressas, então lá não existe o modo "arte impressa" — só a carta composta.
   */
  img?: string;
  /**
   * Ilustração limpa em `public/assets/arte`, usada pela carta composta.
   *
   * No clássico é derivada de `img` (recortada da carta impressa por `scripts/arte.ts`) e
   * fica ausente aqui; no Quatro Elementos vem direto do nó do Figma (`scripts/arte4e.ts`)
   * e é o único jeito de a carta ter arte. Ver `caminhoDaArte` no cliente.
   */
  art?: string;
  edition: Edition;
  /**
   * Código de coleção impresso no rodapé. Ausente no clássico, onde é derivado do id
   * (`RDI - 080/NNN`). Preenchido no Quatro Elementos com o valor do Figma como está —
   * lá os códigos ainda se repetem entre cartas e serão acertados depois.
   */
  ref?: string;
  /**
   * Quem assina a ilustração. Crédito de autoria, não regra: fica fora de tudo que o
   * motor lê e o estúdio de cartas o preenche (decisão nº 22). As 45 clássicas e as 33
   * do Quatro Elementos entraram sem crédito e seguem sem — preencher é retroativo.
   */
  author?: string;
  /**
   * Carta já catalogada (nome, elemento, raridade, stats e texto conferem com a arte)
   * cujo COMPORTAMENTO ainda não foi modelado — o texto do Figma depende de mecânicas
   * que o motor não tem, ou de palavra-chave que o DevLukkas ainda vai definir.
   *
   * Sem bloco declarativo a carta é uma baunilha: aparece na coleção e entra em deck,
   * mas o motor não oferece nem resolve efeito nenhum dela. Apagar esta marca ao
   * implementar é o que mantém a conta de pendências honesta (ver o teste de integridade).
   *
   * A marca cobre só o texto em prosa: `palavrasChave` é regra fechada e VALE em jogo
   * mesmo com a carta pendente (as 6 do Quatro Elementos com MARCIAL/VORPAL/REGENERAR
   * já batem com a palavra e seguem devendo o parágrafo).
   */
  behaviorPending?: true;
}

export interface CreatureCard extends BaseCard {
  type: 'creature';
  race: Race;
  attack: number;
  health: number;
  /** palavras impressas em caixa alta na primeira linha do texto de regras */
  keywords?: Keyword[];
  effects?: ContinuousEffect[];
  triggeredAbilities?: TriggeredAbility[];
  activatedAbilities?: ActivatedAbility[];
  onEnter?: Action[];
  summonRule?: { normal: boolean };
}

export interface AbilityCard extends BaseCard {
  type: 'ability';
  effects?: ContinuousEffect[];
  triggeredAbilities?: TriggeredAbility[];
  onAttach?: Action[];
}

export interface ItemCard extends BaseCard {
  type: 'item';
  effects?: ContinuousEffect[];
  triggeredAbilities?: TriggeredAbility[];
  activatedAbilities?: ActivatedAbility[];
  onAttach?: Action[];
}

export interface CommandCard extends BaseCard {
  type: 'command';
  /** ausente enquanto `efeitoPendente` — comando sem efeito não é oferecido pelo motor */
  effects?: Action[];
}

export interface ScenarioCard extends BaseCard {
  type: 'scenario';
  effects: ScenarioEffect[];
}

export type Card = CreatureCard | AbilityCard | ItemCard | CommandCard | ScenarioCard;

export type CardType = Card['type'];

export const CARD_TYPES = listOf({
  creature: true,
  ability: true,
  item: true,
  command: true,
  scenario: true,
} satisfies Record<CardType, true>);

/** Cartas que podem ser anexadas a uma criatura em campo. */
export type AttachableCard = AbilityCard | ItemCard;

// ---------------------------------------------------------------------------
// Heróis
// ---------------------------------------------------------------------------

export interface Hero {
  key: 'tennor' | 'ispisher' | 'gimlou' | 'badur' | 'morgon';
  name: string;
  /** raça de sabor (não participa dos filtros de criatura) */
  race: string;
  element: Element | null;
  effectName: string;
  effectText: string;
  /** retrato em /assets/heroes/ */
  img: string;
}
