import type { CartaItem } from './tipos.ts';

/**
 * Cartas do tipo ITEM — sempre de elemento neutro, anexam-se a criaturas.
 * (No legado o elemento era preenchido implicitamente; aqui é explícito.)
 */
export const itens: CartaItem[] = [
  {
    id: 15,
    tipo: 'item',
    nome: 'Verdadeiro Tridente de Atlantis',
    efeito: 'A criatura equipada ganha +1/+1. Ela recebe +1 de ATQ adicional para cada outro card de nome Tridente que você controlar.',
    elemento: 'neutro',
    raridade: 'rara',
    img: '15.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
      {
        type: 'modify_stat',
        target: 'attached_creature',
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
    tipo: 'item',
    nome: 'Sapocalibur, A Espada Lendária',
    efeito: 'Receba +2 ATQ. Uma vez por turno, se estiver anexado em um Anfibio você pode mudar o elemento desta criatura.',
    elemento: 'neutro',
    raridade: 'lendaria',
    img: '16.png',
    edicao: 'Matilhas & Predadores',
    effects: [{ type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 2 }],
    activatedAbilities: [
      {
        id: 'sapocalibur_change_element',
        timing: 'once_per_turn',
        source: 'attached_card',
        condition: {
          attached_creature_race: 'Anfibio',
        },
        action: {
          type: 'change_element',
          target: 'attached_creature',
          choose: ['fogo', 'agua', 'terra', 'vento', 'neutro', 'vazio', 'arcano'],
          duration: 'permanent',
        },
      },
    ],
  },
  {
    id: 17,
    tipo: 'item',
    nome: 'Esfera da Aura Espectral',
    efeito: 'A criatura equipada recebe +1 ATK para cada outro Espectro que você controla. Quando esta carta for anexada, crie uma ficha de criatura Espectro 1/1 do Elemento Vazio.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '17.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value_per_card: {
          zone: 'your_field',
          card_type: 'criatura',
          race: 'Espectro',
          exclude_holder: true,
          value: 1,
        },
      },
    ],
    onAttach: [
      {
        type: 'summon_token',
        target: 'your_field',
        token: {
          id: 'token_espectro_vazio_1_1',
          nome: 'Ficha Espectro',
          raca: 'Espectro',
          ataque: 1,
          vida: 1,
          elemento: 'vazio',
          raridade: 'comum',
          color: 0x4b2a68,
        },
      },
    ],
  },
  {
    id: 18,
    tipo: 'item',
    nome: 'Mapa do Tesouro',
    efeito: 'Quando a criatura anexada causar dano ao jogador oponente, você pode comprar uma carta e depois descartar uma carta.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '18.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'mapa_tesouro_draw_discard',
        trigger: 'attached_creature_deals_player_damage',
        optional: true,
        action: {
          type: 'draw_then_discard',
          draw: 1,
          discard: 1,
        },
      },
    ],
  },
  {
    id: 19,
    tipo: 'item',
    nome: 'Manopla do Poder',
    efeito: 'A criatura anexada recebe +3 ATQ. No final do próximo turno, ela recebe 1 de dano direto.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '19.png',
    edicao: 'Matilhas & Predadores',
    effects: [{ type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 3 }],
    onAttach: [
      {
        type: 'delayed_effect',
        trigger: 'end_of_next_turn',
        target: 'attached_creature',
        effect: {
          type: 'deal_damage',
          value: 1,
        },
      },
    ],
  },
  {
    id: 20,
    tipo: 'item',
    nome: 'Pote da Sereia',
    efeito: 'Ao ser anexado , escolha um elemento. A criatura anexada se torna do elemento escolhido, enquanto anexada. Se houver tres ou mais criajturas do mesmo elemento do seu lado do campo, a criatura anexada recebe +2 de Vida.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '20.png',
    edicao: 'Abismos & Profundezas',
    onAttach: [
      {
        type: 'change_element',
        target: 'attached_creature',
        choose: ['fogo', 'agua', 'terra', 'vento', 'neutro', 'vazio', 'arcano'],
        duration: 'while_attached',
      },
    ],
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
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
    tipo: 'item',
    nome: 'Espada Ancestral Yanturai',
    efeito:
      'A criatura anexada recebe +1/0. \nSempre que uma carta de habilidade é retornada para a mão de seu dono, a criatura anexada recebe +2/+1 até o fim do turno.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '52.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 53,
    tipo: 'item',
    nome: 'Moeda da Floresta',
    efeito:
      'A criatura anexada recebe +1/+1. \nQuando esta carta é enviada para o descarte, ambos os jogadores descartam uma carta da mão, quem não tiver cartas na mão exilam a carta do topo do seu baralho.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '53.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 54,
    tipo: 'item',
    nome: 'Semente de Bulbo da Vida',
    efeito:
      'A criatura anexada recebe 0/+1. Se for do tipo Planta, cure 1 de vida no inicio do seu turno automaticamente.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '54.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 69,
    tipo: 'item',
    nome: 'Catapulta de Nortenho',
    efeito:
      'A criatura aliada recebe +1/0 para cada criatura aliada do tipo Goblin.\n\nNo inicio do seu turno, você pode enviar uma criatura de nome “Nortenho” do seu baralho para o descarte, a criatura inimiga nesta rota recebe -X/0, sendo X a vida da criatura enviada para o descarte por este efeito.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '69.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 70,
    tipo: 'item',
    nome: 'Engenhoca de Guerra Nortenho',
    efeito:
      'A criatura anexada recebe +1/0 e a criatura inimiga da mesma coluna recebe -1/0.\n\nSe anexado em uma criatura do tipo goblin, ele recebe 0/+2. \nSe anexado em uma criatura do tipo Besta, ela recebe -1/-1.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '70.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
];
