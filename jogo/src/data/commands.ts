import type { CommandCard } from './types.ts';

/**
 * Cartas do tipo COMANDO — efeito imediato ao serem jogadas, depois vão
 * para o descarte. Sem elemento próprio (neutro).
 */
export const commands: CommandCard[] = [
  {
    id: 21,
    type: 'command',
    name: 'Riso Histérico de Tashaa O',
    text: 'Uma criatura inimiga alvo , nao pode atacar neste turno.',
    element: 'neutral',
    rarity: 'common',
    img: '21.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'prevent_attack',
        target: 'chosen_enemy',
        duration: 'this_turn',
      },
    ],
  },
  {
    id: 22,
    type: 'command',
    name: 'Escolha as Cegas',
    text: 'Descarte todas as cartas da sua mão, em seguida compre a mesma quantidade descartada por este efeito.',
    element: 'neutral',
    rarity: 'legendary',
    img: '22.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'discard_hand_then_draw',
      },
    ],
  },
  {
    id: 23,
    type: 'command',
    name: 'Marionete de Guerra',
    text: 'Escolha uma criatura inimiga alvo , até o proximo turno dela deve atacar uma criatura a sua escolha.',
    element: 'neutral',
    rarity: 'common',
    img: '23.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'force_attack',
        target: 'chosen_enemy',
      },
    ],
  },
  {
    id: 24,
    type: 'command',
    name: 'Olho do Antigo Oráculo',
    text: 'Seu oponente revela duas cartas aleatoras da sua mão, você escolhe uma para ser embaralha de volta em seu baralho.',
    element: 'neutral',
    rarity: 'common',
    img: '24.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'reveal_opponent_hand_then_shuffle_one',
        reveal: 2,
        choose: 1,
      },
    ],
  },
  {
    id: 25,
    type: 'command',
    name: 'Ritual da Esfera Espectral',
    text: 'Sacrifique uma criatura que você controle: invoque até duas criaturas do tipo Espectro do seu baralho com ATQ 2 ou menor. Criaturas invocadas por este efeito não podem atacar no turno que são invocadas.',
    element: 'neutral',
    rarity: 'rare',
    img: '25.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'sacrifice_then_summon_from_deck',
        target: 'chosen_ally',
        summon: {
          count: 2,
          card_type: 'creature',
          race: 'Ghost',
          max_attack: 2,
          can_attack_this_turn: false,
        },
      },
    ],
  },
  {
    id: 26,
    type: 'command',
    name: 'Lua Sangrenta de Esdras',
    text: 'Esolha uma criatura que você controle: Ela recebe +1/+1 até o fim do seu turno, para cada criatura de nome Esdras em seu descarte..',
    element: 'neutral',
    rarity: 'common',
    img: '26.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stats',
        target: 'chosen_ally',
        stats: ['attack', 'defense'],
        duration: 'until_end_of_turn',
        value_per_card: {
          zone: 'your_discard',
          name_includes: 'Esdras',
          value: 1,
        },
      },
    ],
  },
  {
    id: 27,
    type: 'command',
    name: 'Alterando as Rotas',
    text: 'Escolha uma criatura que você controle: ela não pode ser alvo de ataques neste turno.',
    element: 'neutral',
    rarity: 'common',
    img: '27.png',
    edition: 'Abismos & Profundezas',
    effects: [
      {
        type: 'prevent_being_targeted',
        target: 'chosen_ally',
        duration: 'this_turn',
      },
    ],
  },

  // --- Quatro Elementos ---
  {
    id: 60,
    type: 'command',
    name: 'Certamente não é um Nortenho',
    text:
      'Esta carta recebe o nome de “Engenhoca Kabum Nortenho” no campo ou  em seu baralho.\n\nRetorne três cartas exiladas para o seu baralho, embaralhe e depois compre uma carta.',
    element: 'neutral',
    rarity: 'common',
    art: '60.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 61,
    type: 'command',
    name: 'Pedido de Emergência',
    text:
      'Escolha uma criatura aliada, recrute do seu baralho em uma zona livre, uma criatura com ataque igual ou menor e que seja da mesma raça da criatura escolhida.',
    element: 'neutral',
    rarity: 'common',
    art: '61.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 62,
    type: 'command',
    name: 'Troncos Retorcidos',
    text:
      'Esta carta é considerada “Moeda da Floresta” no baralho. \nInverta os efeitos de cartas anexadas em uma rota escolhida até o final do turno. (buffs se tornam debuffs , e debuffs se tornam buffs)',
    element: 'neutral',
    rarity: 'common',
    art: '62.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 76,
    type: 'command',
    name: 'Saraivada de Meteoros',
    text: 'Todas as criaturas em campo recebem 1 de dano direto em sua vida.',
    element: 'neutral',
    rarity: 'common',
    art: '76.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
  {
    id: 78,
    type: 'command',
    name: 'Chamado do Mortos',
    text:
      'Recrute do descarte inimigo, uma criatura que tenha sido abatida neste turno.\nAquele criatura se torna do tipo Zumbi enquanto estiver em campo.',
    element: 'neutral',
    rarity: 'common',
    art: '78.webp',
    edition: 'Quatro Elementos',
    ref: 'GES-0004',
    behaviorPending: true,
  },
];
