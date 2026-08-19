import type { ItemCard } from './types.ts';

/**
 * Cartas do tipo ITEM — sempre de elemento neutro, anexam-se a criaturas.
 * (No legado o elemento era preenchido implicitamente; aqui é explícito.)
 */
export const items: ItemCard[] = [
  {
    id: 15,
    type: 'item',
    name: 'Verdadeiro Tridente de Atlantis',
    text: 'A criatura equipada ganha +1/+1. Ela recebe +1 de ATQ adicional para cada outro card de nome Tridente que você controlar.',
    element: 'neutral',
    rarity: 'rare',
    img: '15.png',
    edition: 'Abismos & Profundezas',
    effects: [
      { type: 'modify_stat', target: 'host', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'host', stat: 'defense', value: 1 },
      {
        type: 'modify_stat',
        target: 'host',
        stat: 'attack',
        value_per_card: {
          zone: 'your_field',
          name_includes: 'Tridente',
          exclude_self: true,
          value: 1,
        },
      },
    ],
  },
  {
    id: 16,
    type: 'item',
    name: 'Sapocalibur, A Espada Lendária',
    text: 'Receba +2 ATQ. Uma vez por turno, se estiver anexado em um Anfibio você pode mudar o elemento desta criatura.',
    element: 'neutral',
    rarity: 'legendary',
    img: '16.png',
    edition: 'Matilhas & Predadores',
    effects: [{ type: 'modify_stat', target: 'host', stat: 'attack', value: 2 }],
    activatedAbilities: [
      {
        id: 'sapocalibur_change_element',
        timing: 'once_per_turn',
        source: 'attached_card',
        condition: {
          attached_creature_race: 'Amphibian',
        },
        action: {
          type: 'change_element',
          target: 'host',
          choose: ['fire', 'water', 'earth', 'wind', 'neutral', 'void', 'arcane'],
          duration: 'permanent',
        },
      },
    ],
  },
  {
    id: 17,
    type: 'item',
    name: 'Esfera da Aura Espectral',
    text: 'A criatura equipada recebe +1 ATK para cada outro Espectro que você controla. Quando esta carta for anexada, crie uma ficha de criatura Espectro 1/1 do Elemento Vazio.',
    element: 'neutral',
    rarity: 'common',
    img: '17.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'host',
        stat: 'attack',
        value_per_card: {
          zone: 'your_field',
          card_type: 'creature',
          race: 'Ghost',
          exclude_holder: true,
          value: 1,
        },
      },
    ],
    onAttach: [
      {
        type: 'summon_token',
        token: {
          id: 'token_ghost_void_1_1',
          name: 'Ficha Espectro',
          race: 'Ghost',
          attack: 1,
          health: 1,
          element: 'void',
          rarity: 'common',
          color: 0x4b2a68,
        },
      },
    ],
  },
  {
    id: 18,
    type: 'item',
    name: 'Mapa do Tesouro',
    text: 'Quando a criatura anexada causar dano ao jogador oponente, você pode comprar uma carta e depois descartar uma carta.',
    element: 'neutral',
    rarity: 'common',
    img: '18.png',
    edition: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'mapa_tesouro_draw_discard',
        trigger: 'host_deals_player_damage',
        action: {
          type: 'draw_then_discard',
          optional: true,
          draw: 1,
          discard: 1,
        },
      },
    ],
  },
  {
    id: 19,
    type: 'item',
    name: 'Manopla do Poder',
    text: 'A criatura anexada recebe +3 ATQ. No final do próximo turno, ela recebe 1 de dano direto.',
    element: 'neutral',
    rarity: 'common',
    img: '19.png',
    edition: 'Matilhas & Predadores',
    effects: [{ type: 'modify_stat', target: 'host', stat: 'attack', value: 3 }],
    onAttach: [
      {
        type: 'delayed_damage',
        target: 'host',
        when: 'end_of_next_turn',
        damage: 1,
      },
    ],
  },
  {
    id: 20,
    type: 'item',
    name: 'Pote da Sereia',
    text: 'Ao ser anexado , escolha um elemento. A criatura anexada se torna do elemento escolhido, enquanto anexada. Se houver tres ou mais criajturas do mesmo elemento do seu lado do campo, a criatura anexada recebe +2 de Vida.',
    element: 'neutral',
    rarity: 'common',
    img: '20.png',
    edition: 'Abismos & Profundezas',
    onAttach: [
      {
        type: 'change_element',
        target: 'host',
        choose: ['fire', 'water', 'earth', 'wind', 'neutral', 'void', 'arcane'],
        duration: 'while_attached',
      },
    ],
    effects: [
      {
        type: 'modify_stat',
        target: 'host',
        stat: 'defense',
        value: 2,
        condition: {
          zone: 'your_field',
          count_same_element: 3,
        },
      },
    ],
  },

  // --- Quatro Elementos ---
  {
    id: 52,
    type: 'item',
    name: 'Espada Ancestral Yanturai',
    text:
      'A criatura anexada recebe +1/0. \nSempre que uma carta de habilidade é retornada para a mão de seu dono, a criatura anexada recebe +2/+1 até o fim do turno.',
    element: 'neutral',
    rarity: 'common',
    art: '52.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 53,
    type: 'item',
    name: 'Moeda da Floresta',
    text:
      'A criatura anexada recebe +1/+1. \nQuando esta carta é enviada para o descarte, ambos os jogadores descartam uma carta da mão, quem não tiver cartas na mão exilam a carta do topo do seu baralho.',
    element: 'neutral',
    rarity: 'common',
    art: '53.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 54,
    type: 'item',
    name: 'Semente de Bulbo da Vida',
    text:
      'A criatura anexada recebe 0/+1. Se for do tipo Planta, cure 1 de vida no inicio do seu turno automaticamente.',
    element: 'neutral',
    rarity: 'common',
    art: '54.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 69,
    type: 'item',
    name: 'Catapulta de Nortenho',
    text:
      'A criatura aliada recebe +1/0 para cada criatura aliada do tipo Goblin.\n\nNo inicio do seu turno, você pode enviar uma criatura de nome “Nortenho” do seu baralho para o descarte, a criatura inimiga nesta rota recebe -X/0, sendo X a vida da criatura enviada para o descarte por este efeito.',
    element: 'neutral',
    rarity: 'common',
    art: '69.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 70,
    type: 'item',
    name: 'Engenhoca de Guerra Nortenho',
    text:
      'A criatura anexada recebe +1/0 e a criatura inimiga da mesma coluna recebe -1/0.\n\nSe anexado em uma criatura do tipo goblin, ele recebe 0/+2. \nSe anexado em uma criatura do tipo Besta, ela recebe -1/-1.',
    element: 'neutral',
    rarity: 'common',
    art: '70.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
];
