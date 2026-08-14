import type { CartaHabilidade } from './tipos.ts';

/**
 * Cartas do tipo HABILIDADE — anexam-se a uma criatura em campo.
 */
export const habilidades: CartaHabilidade[] = [
  {
    id: 9,
    tipo: 'habilidade',
    nome: 'Tridente Poderoso de Atlas',
    efeito: 'A criatura anexada recebe +1/+1. Se houver dois "Tridente Poderosos de Atlas" anexados a uma criatura, seu oponente descarta uma carta aleatoria.',
    elemento: 'agua',
    raridade: 'comum',
    img: '09.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
    ],
    triggeredAbilities: [
      {
        id: 'tridente_atlas_double_discard',
        trigger: 'attached_count_reaches',
        attachedName: 'Tridente Poderoso de Atlas',
        count: 2,
        action: {
          type: 'opponent_discard_random',
          discard: 1,
        },
      },
    ],
  },
  {
    id: 10,
    tipo: 'habilidade',
    nome: 'Tridente do Assassino',
    efeito: 'A criatura anexada recebe +2 de ATQ.',
    elemento: 'agua',
    raridade: 'comum',
    img: '10.png',
    edicao: 'Abismos & Profundezas',
    effects: [{ type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 2 }],
  },
  {
    id: 11,
    tipo: 'habilidade',
    nome: 'defesa Absoluta do Tridente',
    efeito: 'A criatura anexada recebe +2 de Vida. Se esta carta for exilada, retorne-a para a mão do seu dono.',
    elemento: 'agua',
    raridade: 'comum',
    img: '11.png',
    edicao: 'Abismos & Profundezas',
    effects: [{ type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 }],
    triggeredAbilities: [
      {
        id: 'defesa_absoluta_return_on_exile',
        trigger: 'self_exiled',
        action: {
          type: 'return_to_hand',
          target: 'self',
        },
      },
    ],
  },
  {
    id: 12,
    tipo: 'habilidade',
    nome: 'Tridente Mágico de Corais',
    efeito: 'A criatura anexada recebe +1/+1. Sempre que esta criatura anexada atacar, escolha uma criatura inimiga. No proxio turno, a criatura especificada não pode atacar.',
    elemento: 'agua',
    raridade: 'comum',
    img: '12.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
    ],
    triggeredAbilities: [
      {
        id: 'corais_prevent_attack_on_attached_attack',
        trigger: 'attached_creature_attacks',
        action: {
          type: 'choose_enemy_creature_then_prevent_attack',
          duration: 'next_turn',
        },
      },
    ],
  },
  {
    id: 13,
    tipo: 'habilidade',
    nome: 'Reflexos de Morte',
    efeito: 'A criatura anexada recebe +1 de Vida. Sempre que esta criatura for atacada , voce causa 1 de dano na direto em uma criatura inimiga.',
    elemento: 'agua',
    raridade: 'comum',
    img: '13.png',
    edicao: 'Abismos & Profundezas',
    effects: [{ type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 }],
    triggeredAbilities: [
      {
        id: 'reflexos_damage_on_attacked',
        trigger: 'attached_creature_is_attacked',
        action: {
          type: 'choose_enemy_creature_then_deal_damage',
          damage: 1,
        },
      },
    ],
  },
  {
    id: 14,
    tipo: 'habilidade',
    nome: 'Afogamento',
    efeito: 'A criatura anexada escolha uma criatura inimiga. A criatura escolhida recebe -1 de Vida para cada carta anexada a ela. Se a criatura escolhida morrer destrua esta carta.',
    elemento: 'agua',
    raridade: 'comum',
    img: '14.png',
    edicao: 'Abismos & Profundezas',
    onAttach: [
      {
        type: 'choose_creature_then_modify_stat',
        target: 'enemy_creature',
        stat: 'defense',
        value_per_card: {
          zone: 'target_attachments',
          value: -1,
        },
      },
    ],
    triggeredAbilities: [
      {
        id: 'afogamento_destroy_self_on_target_death',
        trigger: 'chosen_enemy_creature_dies',
        action: {
          type: 'destroy_self',
        },
      },
    ],
  },
  {
    id: 37,
    tipo: 'habilidade',
    nome: 'Totem do guardião Ancestral',
    efeito: 'A criatura anexada recebe +0/+2. Se ela for do tipo besta, recebe +3 de Vida ao invés de +0/+2.',
    elemento: 'terra',
    raridade: 'comum',
    img: '37.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'defense',
        value: 2,
        conditionals: [{ if: { race: 'Besta' }, value: 3 }],
      },
    ],
  },
  {
    id: 38,
    tipo: 'habilidade',
    nome: 'Estouro da Manada',
    efeito: 'A criatura anexada recebe +1/+1. A criatura anexada recebe a palavra-chave ATROPELAR.',
    elemento: 'terra',
    raridade: 'comum',
    img: '38.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
      { type: 'grant_keyword', target: 'attached_creature', keyword: 'atropelar' },
    ],
  },
  {
    id: 39,
    tipo: 'habilidade',
    nome: 'Guardião Enlouquecido',
    efeito: 'A criatura anexada recebe +2 ATK e +2 VIDA. Quando ela atacar, outras criaturas do tipo Besta que você controla recebem +1 ATK até o final do turno. Se ela não atacar neste turno, destrua.',
    elemento: 'terra',
    raridade: 'comum',
    img: '39.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 2 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
    ],
    triggeredAbilities: [
      {
        id: 'guardiao_enlouquecido_besta_ataca',
        trigger: 'attached_creature_attacks',
        action: {
          type: 'temporary_modify_allied_creatures',
          filter: { race: 'Besta' },
          stats: ['attack'],
          value: 1,
          exclude_source: true,
        },
      },
      {
        id: 'guardiao_enlouquecido_sem_ataque',
        trigger: 'attached_creature_end_turn_if_not_attacked',
        action: { type: 'destroy_attached_creature' },
      },
    ],
  },
  {
    id: 40,
    tipo: 'habilidade',
    nome: 'Coração do Sapoescudeiro',
    efeito: 'Quando o elemento da criatura anexada for alterado, você pode escolher uma criatura com Contos no nome, troque o ATQ e VIDA dela até o final do turno. Se o elemento da criatura for alterado, retorne esta carta para sua mão imediatamente ao invés de enviá-la para o descarte.',
    elemento: 'terra',
    raridade: 'comum',
    img: '40.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'coracao_sapoescudeiro_elemento_alterado',
        trigger: 'attached_creature_element_changed',
        action: {
          type: 'optional_swap_allied_creature_stats_until_end_turn',
          filter: { name_includes: 'Contos' },
          return_attachment_to_hand: true,
        },
      },
    ],
  },
  {
    id: 41,
    tipo: 'habilidade',
    nome: 'Posse de Objetos Inanimados',
    efeito: 'A criatura anexada recebe +1/+1. Quando esta carta sai do campo para o descarte, exceto durante a fase de batalha, você pode comprar uma carta.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '41.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
    ],
    triggeredAbilities: [
      {
        id: 'posse_objetos_descartada',
        trigger: 'attachment_sent_from_field_to_your_discard_outside_battle',
        action: { type: 'optional_draw_cards', count: 1 },
      },
    ],
  },
  {
    id: 42,
    tipo: 'habilidade',
    nome: 'Corpo Translúcido',
    efeito: 'A criatura anexada nao pode ser atacada por criaturas com 3+ de VIDA.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '42.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'cannot_be_attacked_by_creatures_with_min_defense',
        target: 'attached_creature',
        min_defense: 3,
      },
    ],
  },
  {
    id: 43,
    tipo: 'habilidade',
    nome: 'Proteção do Escudeiro',
    efeito: 'A criatura anexada recebe +1/+2. Uma vez por turno, quando uma criatura que você controla que tenha Contos no nome for alvo de um ataque, você pode enviar esta carta para o descarte e negar o ataque.',
    elemento: 'terra',
    raridade: 'comum',
    img: '43.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
    ],
    triggeredAbilities: [
      {
        id: 'protecao_escudeiro_nega_ataque',
        trigger: 'your_creature_matching_is_targeted_by_attack',
        action: {
          type: 'optional_discard_self_prevent_attack',
          filter: { name_includes: 'Contos' },
        },
      },
    ],
  },
  {
    id: 44,
    tipo: 'habilidade',
    nome: 'Resistência',
    efeito: 'A criatura anexada recebe +2 VIDA. Na primeira vez que ela receber dano a cada turno, reduza esse dano em 1.',
    elemento: 'terra',
    raridade: 'comum',
    img: '44.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
      { type: 'reduce_combat_damage_taken', target: 'attached_creature', value: 1, once_per_turn: true },
    ],
  },

  // --- Quatro Elementos ---
  {
    id: 55,
    tipo: 'habilidade',
    nome: 'Abraço da Floresta',
    efeito:
      'Esta carta é considerada “Moeda da Floresta” em campo ou no baralho. \nA criatura anexada recebe +1/0, e a criatura inimiga da mesma coluna recebe -1/0.',
    elemento: 'vento',
    raridade: 'comum',
    arte: '55.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 56,
    tipo: 'habilidade',
    nome: 'Ataque Aéreo da Harpia',
    efeito:
      'A criatura anexada recebe +2/+1. Ao atacar uma criatura que não seja do elemento “Vento” recebe +1 para cada carta Habilidade de Vento com nomes diferentes em seu descarte.',
    elemento: 'vento',
    raridade: 'comum',
    arte: '56.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 57,
    tipo: 'habilidade',
    nome: 'Broto Devorador de Virgens',
    efeito:
      'Durante o turno inimigo, a criatura anexada recebe +0/+3 até o fim do turno. Quando anexado em “Devoradora de virgens” e ela for destruída, adiciona uma criatura do tipo planta do seu baralho pra mão.',
    elemento: 'vento',
    raridade: 'comum',
    arte: '57.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 58,
    tipo: 'habilidade',
    nome: 'Brotos de Arborium',
    efeito:
      'Esta carta é considerada “Moeda da Floresta” em campo ou no baralho. \nA criatura anexada recebe +1/+1 para cada criatura Arborium aliada em campo.',
    elemento: 'vento',
    raridade: 'comum',
    arte: '58.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 59,
    tipo: 'habilidade',
    nome: 'Espírito da Tempestade',
    efeito:
      'Quando anexar esta carta em sua criatura, a criatura inimiga da mesma coluna recebe -1/0 permanentemente. Se houver duas cartas com o mesmo nome anexado a esta criatura, ela recebe um contador \n+2/+1.',
    elemento: 'vento',
    raridade: 'comum',
    arte: '59.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 71,
    tipo: 'habilidade',
    nome: 'Baforada do Ifreet',
    efeito: 'A criatura anexada recebe +2/+1.',
    elemento: 'fogo',
    raridade: 'comum',
    arte: '71.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 72,
    tipo: 'habilidade',
    nome: 'Caçada do Nortenho',
    efeito: 'Quando anexada, a criatura inimiga da mesma coluna recebe -2/0.',
    elemento: 'fogo',
    raridade: 'comum',
    arte: '72.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 73,
    tipo: 'habilidade',
    nome: 'Engenhoca Kabum Nortenho',
    efeito:
      'A criatura inimiga da mesma coluna recebe -1/0 permanentemente.\n\nExile esta carta, junto com outras duas cartas “Nortenho” do seu descarte. Escolha uma criatura inimiga, ele recebe -1/0.',
    elemento: 'fogo',
    raridade: 'comum',
    arte: '73.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 74,
    tipo: 'habilidade',
    nome: 'Runas de Hefestus',
    efeito:
      'A criatura anexada recebe +3/+0. Se uma criatura inimiga for destruída em batalha enquanto esta carta estiver anexada, a criatura anexada recebe um ponto de dano à VIDA.',
    elemento: 'fogo',
    raridade: 'comum',
    arte: '74.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 75,
    tipo: 'habilidade',
    nome: 'Sopro Flamejante',
    efeito:
      'A criatura anexada recebe +4/0, após atacar destrua esta carta. A criatura anexada, não ataca o seu próximo turno quando esta carta é destruída.',
    elemento: 'fogo',
    raridade: 'comum',
    arte: '75.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
];
