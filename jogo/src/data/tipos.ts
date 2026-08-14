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

export type Elemento = 'fogo' | 'agua' | 'terra' | 'vento' | 'neutro' | 'vazio' | 'arcano';
export type Raridade = 'comum' | 'rara' | 'lendaria';
export type Edicao = 'Abismos & Profundezas' | 'Matilhas & Predadores' | 'Quatro Elementos';

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
export type Formato = 'classico' | 'quatro-elementos';

export const FORMATO_POR_EDICAO: Record<Edicao, Formato> = {
  'Abismos & Profundezas': 'classico',
  'Matilhas & Predadores': 'classico',
  'Quatro Elementos': 'quatro-elementos',
};

export const FORMATOS: readonly Formato[] = ['classico', 'quatro-elementos'];

export const NOME_DO_FORMATO: Record<Formato, string> = {
  classico: 'Clássico',
  'quatro-elementos': 'Quatro Elementos',
};
export type Raca =
  | 'Acquarium'
  | 'Anfibio'
  | 'Mutante'
  | 'Zumbi'
  | 'Demônio'
  | 'Besta'
  | 'Orc'
  | 'Espectro'
  // raças que estreiam no Quatro Elementos
  | 'Planta'
  | 'Humano'
  | 'Goblin'
  | 'Dragão';

export type Atributo = 'attack' | 'defense';

/**
 * Palavras-chave: regra fechada que a carta apenas nomeia, em vez de descrever.
 * Vêm impressas na criatura (`palavrasChave`) ou concedidas por um anexo
 * (`grant_keyword`) — o motor consulta as duas fontes por `temPalavraChave`.
 *
 * - `atropelar`: o excedente do dano de batalha vira dano direto no dono.
 * - `marcial`: ataca primeiro; se o golpe matar a criatura oposta, não revida.
 * - `vorpal`: destruiu a criatura inimiga em batalha → o ATQ IMPRESSO desta
 *   criatura vira dano direto adicional no dono dela.
 * - `regenerar`: recupera 1 de vida no início do turno do dono.
 *
 * Definições de MARCIAL, VORPAL e REGENERAR dadas pelo DevLukkas (decisão nº 13).
 */
export type PalavraChave = 'atropelar' | 'marcial' | 'vorpal' | 'regenerar';

/** Filtro declarativo usado por auras, buscas e gatilhos. */
export interface FiltroCarta {
  race?: Raca;
  element?: Elemento;
  name?: string;
  name_includes?: string;
}

/** Conta cartas numa zona para efeitos de "+X por carta". */
export interface ContagemPorCarta {
  zone: 'your_field' | 'your_discard' | 'target_attachments';
  card_type?: 'criatura';
  race?: Raca;
  name_includes?: string;
  exclude_self?: boolean;
  /** "cada OUTRA": não conta a criatura que carrega o anexo */
  exclude_holder?: boolean;
  value: number;
}

/** Ficha (token) de criatura gerada por efeito. */
export interface FichaDeCriatura {
  id: string;
  nome: string;
  raca: Raca;
  ataque: number;
  vida: number;
  elemento: Elemento;
  raridade: Raridade;
  /** cor de fundo usada pela apresentação (fichas não têm arte própria) */
  color?: number;
}

// ---------------------------------------------------------------------------
// Efeitos contínuos (criaturas, habilidades anexadas, itens, cenário)
// ---------------------------------------------------------------------------

export type EfeitoContinuo =
  | {
      type: 'aura_modify_stat';
      target: 'your_field';
      filter?: FiltroCarta;
      stats: Atributo[];
      value: number;
      /** "OUTRAS criaturas aliadas": a própria fonte fica de fora */
      exclude_source?: boolean;
    }
  | {
      type: 'modify_stat';
      target: 'attached_creature';
      stat: Atributo;
      value?: number;
      value_per_card?: ContagemPorCarta;
      /** valor alternativo quando a criatura anexada casa com o filtro */
      conditionals?: { if: FiltroCarta; value: number }[];
      /** efeito só ativo enquanto a condição de campo vale */
      condition?: { zone: 'your_field'; count_same_element: number };
    }
  | {
      type: 'reduce_combat_damage_taken';
      target: 'your_creatures' | 'attached_creature';
      filter?: FiltroCarta;
      value: number;
      /** "OUTRAS criaturas": a própria fonte da aura não se protege */
      exclude_source?: boolean;
      /** só na primeira vez que a criatura sofre dano a cada turno */
      once_per_turn?: boolean;
    }
  | { type: 'grant_keyword'; target: 'attached_creature'; keyword: PalavraChave }
  | {
      type: 'cannot_be_attacked_by_creatures_with_min_defense';
      target: 'attached_creature';
      min_defense: number;
    };

export type EfeitoCenario =
  | {
      type: 'draw_on_first_enemy_battle_destroyed';
      oncePerTurn: true;
      requiresYourCreature?: FiltroCarta;
      targetOwner: 'enemy';
      value: number;
    }
  | {
      /** criatura sua que case com `when` foi ao descarte → buff opcional em `target` */
      type: 'buff_named_on_your_creature_to_discard';
      when: FiltroCarta;
      target: FiltroCarta;
      stats: Atributo[];
      value: number;
      duration: 'until_end_of_turn';
    };

// ---------------------------------------------------------------------------
// Efeitos imediatos de comandos
// ---------------------------------------------------------------------------

export type EfeitoComando =
  | { type: 'prevent_attack'; target: 'enemy_creature'; duration: 'until_end_of_turn' }
  | { type: 'discard_hand_then_draw'; target: 'self' }
  | {
      type: 'force_attack';
      target: 'enemy_creature';
      secondaryTarget: 'your_creature';
      duration: 'until_next_owner_turn';
    }
  | { type: 'reveal_random_hand_then_shuffle_one'; target: 'opponent'; reveal: number; choose: number }
  | {
      type: 'sacrifice_then_summon_from_deck';
      target: 'your_creature';
      summon: {
        count: number;
        card_type: 'criatura';
        race?: Raca;
        max_attack?: number;
        can_attack_this_turn?: boolean;
      };
    }
  | {
      type: 'temporary_modify_stat';
      target: 'your_creature';
      stats: Atributo[];
      duration: 'until_end_of_turn';
      value_per_card?: ContagemPorCarta;
    }
  | { type: 'prevent_attack_target'; target: 'your_creature'; duration: 'until_end_of_turn' };

// ---------------------------------------------------------------------------
// Habilidades de gatilho
// ---------------------------------------------------------------------------

export type GatilhoTipo =
  // gatilhos de criatura
  | 'your_creature_element_changed'
  | 'self_element_changed'
  | 'destroyed_by_creature'
  | 'sent_to_your_discard'
  | 'sent_from_field_to_your_discard'
  | 'other_creature_enters'
  | 'other_creature_sent_to_your_discard'
  | 'chosen_enemy_creature_dies'
  // gatilhos de carta anexada (habilidade/item)
  | 'self_exiled'
  | 'attached_count_reaches'
  | 'attached_creature_attacks'
  | 'attached_creature_is_attacked'
  | 'attached_creature_deals_player_damage'
  | 'attached_creature_element_changed'
  | 'attached_creature_end_turn_if_not_attacked'
  | 'attachment_sent_from_field_to_your_discard_outside_battle'
  | 'your_creature_matching_is_targeted_by_attack';

export type AcaoDeGatilho =
  | { type: 'add_permanent_marker'; target?: 'self'; stats: Atributo[]; value: number }
  | { type: 'add_marker_to_your_creature'; stats: Atributo[]; value: number }
  | { type: 'deal_damage_to_destroyer'; damage: number }
  | { type: 'choose_your_creature_change_element_until_end_turn'; filter?: FiltroCarta }
  | { type: 'choose_creature_swap_stats_while_element_changed'; filter?: FiltroCarta }
  | { type: 'summon_from_deck'; filter: FiltroCarta; count: number }
  | { type: 'summon_token'; token: FichaDeCriatura }
  | { type: 'choose_enemy_creature_prevent_attack_next_turn' }
  | { type: 'return_to_hand'; target: 'self' }
  | { type: 'choose_enemy_creature_then_prevent_attack'; duration: 'next_turn' }
  | { type: 'choose_enemy_creature_then_deal_damage'; damage: number }
  | { type: 'destroy_self' }
  | { type: 'opponent_discard_random'; discard: number }
  | {
      type: 'temporary_modify_allied_creatures';
      filter?: FiltroCarta;
      stats: Atributo[];
      value: number;
      /** "OUTRAS criaturas aliadas": a criatura que disparou fica de fora */
      exclude_source?: boolean;
    }
  | {
      type: 'choose_your_creature_temporary_modify';
      filter?: FiltroCarta;
      stats: Atributo[];
      value: number;
    }
  | { type: 'destroy_attached_creature' }
  | {
      type: 'optional_swap_allied_creature_stats_until_end_turn';
      filter?: FiltroCarta;
      return_attachment_to_hand?: boolean;
    }
  | { type: 'optional_draw_cards'; count: number }
  | { type: 'optional_discard_self_prevent_attack'; filter?: FiltroCarta }
  | { type: 'draw_then_discard'; draw: number; discard: number };

export interface HabilidadeDeGatilho {
  id: string;
  trigger: GatilhoTipo;
  filter?: FiltroCarta;
  optional?: boolean;
  /** ordem na corrente de efeitos; empate = o jogador escolhe */
  priority?: number;
  /** exclusivos do gatilho attached_count_reaches */
  attachedName?: string;
  count?: number;
  action: AcaoDeGatilho;
}

// ---------------------------------------------------------------------------
// Habilidades ativadas
// ---------------------------------------------------------------------------

export type CustoDeAtivacao =
  | { type: 'destroy_attachment'; name_includes: string }
  | { type: 'discard_self' }
  | { type: 'sacrifice_self' };

export interface CondicaoDeAtivacao {
  active_player?: 'opponent';
  attached_creature_race?: Raca;
}

export type AcaoAtivada =
  | { type: 'cannot_attack_next_turn'; target: 'self' }
  | { type: 'special_summon_over_your_creature'; filter: FiltroCarta }
  | { type: 'mill_then_gain_defense_per_discard_element'; mill: number; value: number }
  | { type: 'summon_from_discard'; filter: FiltroCarta; count: number }
  | { type: 'force_enemy_attack_your_creature'; yourFilter: FiltroCarta }
  | {
      type: 'change_element';
      target: 'attached_creature';
      choose: Elemento[];
      duration: 'permanent';
    };

export interface HabilidadeAtivada {
  id: string;
  timing?: 'once_per_turn';
  source: 'field_creature' | 'hand' | 'attached_card';
  cost?: CustoDeAtivacao;
  condition?: CondicaoDeAtivacao;
  action: AcaoAtivada;
}

// ---------------------------------------------------------------------------
// Ações de entrada em campo / de anexo
// ---------------------------------------------------------------------------

export type AcaoAoEntrar =
  | {
      type: 'discard_hand_card_then_search_deck';
      optional?: boolean;
      discard: FiltroCarta;
      search: FiltroCarta;
    }
  | {
      type: 'shuffle_discard_creature_then_debuff_enemy';
      discardFilter: FiltroCarta;
      debuff: { stat: Atributo; value_from: 'shuffled_card_attack'; duration: 'until_end_of_turn' };
    };

export type AcaoAoAnexar =
  | {
      type: 'choose_creature_then_modify_stat';
      target: 'enemy_creature';
      stat: Atributo;
      value_per_card: { zone: 'target_attachments'; value: number };
    }
  | { type: 'summon_token'; target?: 'your_field'; token: FichaDeCriatura }
  | {
      type: 'delayed_effect';
      trigger: 'end_of_next_turn';
      target: 'attached_creature';
      effect: { type: 'deal_damage'; value: number };
    }
  | {
      type: 'change_element';
      target: 'attached_creature';
      choose: Elemento[];
      duration: 'while_attached';
    };

// ---------------------------------------------------------------------------
// As cartas
// ---------------------------------------------------------------------------

interface CartaBase {
  /** corresponde ao arquivo de arte: 01.png ... 45.png */
  id: number;
  nome: string;
  /** texto de regras impresso na carta */
  efeito: string | null;
  elemento: Elemento;
  raridade: Raridade;
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
  arte?: string;
  edicao: Edicao;
  /**
   * Código de coleção impresso no rodapé. Ausente no clássico, onde é derivado do id
   * (`RDI - 080/NNN`). Preenchido no Quatro Elementos com o valor do Figma como está —
   * lá os códigos ainda se repetem entre cartas e serão acertados depois.
   */
  ref?: string;
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
  efeitoPendente?: true;
}

export interface CartaCriatura extends CartaBase {
  tipo: 'criatura';
  raca: Raca;
  ataque: number;
  vida: number;
  /** palavras impressas em caixa alta na primeira linha do texto de regras */
  palavrasChave?: PalavraChave[];
  effects?: EfeitoContinuo[];
  triggeredAbilities?: HabilidadeDeGatilho[];
  activatedAbilities?: HabilidadeAtivada[];
  onEnter?: AcaoAoEntrar[];
  summonRule?: { normal: boolean };
}

export interface CartaHabilidade extends CartaBase {
  tipo: 'habilidade';
  effects?: EfeitoContinuo[];
  triggeredAbilities?: HabilidadeDeGatilho[];
  onAttach?: AcaoAoAnexar[];
}

export interface CartaItem extends CartaBase {
  tipo: 'item';
  effects?: EfeitoContinuo[];
  triggeredAbilities?: HabilidadeDeGatilho[];
  activatedAbilities?: HabilidadeAtivada[];
  onAttach?: AcaoAoAnexar[];
}

export interface CartaComando extends CartaBase {
  tipo: 'comando';
  /** ausente enquanto `efeitoPendente` — comando sem efeito não é oferecido pelo motor */
  effects?: EfeitoComando[];
}

export interface CartaCenario extends CartaBase {
  tipo: 'cenario';
  effects: EfeitoCenario[];
}

export type Carta = CartaCriatura | CartaHabilidade | CartaItem | CartaComando | CartaCenario;

/** Cartas que podem ser anexadas a uma criatura em campo. */
export type CartaAnexavel = CartaHabilidade | CartaItem;

// ---------------------------------------------------------------------------
// Heróis
// ---------------------------------------------------------------------------

export interface Heroi {
  chave: 'tennor' | 'ispisher' | 'gimlou' | 'badur' | 'morgon';
  nome: string;
  /** raça de sabor (não participa dos filtros de criatura) */
  raca: string;
  elemento: Elemento | null;
  nomeDoEfeito: string;
  descricaoDoEfeito: string;
  /** retrato em /assets/heroes/ */
  img: string;
}
