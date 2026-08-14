import type { CartaComando } from './tipos.ts';

/**
 * Cartas do tipo COMANDO — efeito imediato ao serem jogadas, depois vão
 * para o descarte. Sem elemento próprio (neutro).
 */
export const comandos: CartaComando[] = [
  {
    id: 21,
    tipo: 'comando',
    nome: 'Riso Histérico de Tashaa O',
    efeito: 'Uma criatura inimiga alvo , nao pode atacar neste turno.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '21.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'prevent_attack',
        target: 'enemy_creature',
        duration: 'until_end_of_turn',
      },
    ],
  },
  {
    id: 22,
    tipo: 'comando',
    nome: 'Escolha as Cegas',
    efeito: 'Descarte todas as cartas da sua mão, em seguida compre a mesma quantidade descartada por este efeito.',
    elemento: 'neutro',
    raridade: 'lendaria',
    img: '22.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'discard_hand_then_draw',
        target: 'self',
      },
    ],
  },
  {
    id: 23,
    tipo: 'comando',
    nome: 'Marionete de Guerra',
    efeito: 'Escolha uma criatura inimiga alvo , até o proximo turno dela deve atacar uma criatura a sua escolha.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '23.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'force_attack',
        target: 'enemy_creature',
        secondaryTarget: 'your_creature',
        duration: 'until_next_owner_turn',
      },
    ],
  },
  {
    id: 24,
    tipo: 'comando',
    nome: 'Olho do Antigo Oráculo',
    efeito: 'Seu oponente revela duas cartas aleatoras da sua mão, você escolhe uma para ser embaralha de volta em seu baralho.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '24.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'reveal_random_hand_then_shuffle_one',
        target: 'opponent',
        reveal: 2,
        choose: 1,
      },
    ],
  },
  {
    id: 25,
    tipo: 'comando',
    nome: 'Ritual da Esfera Espectral',
    efeito: 'Sacrifique uma criatura que você controle: invoque até duas criaturas do tipo Espectro do seu baralho com ATQ 2 ou menor. Criaturas invocadas por este efeito não podem atacar no turno que são invocadas.',
    elemento: 'neutro',
    raridade: 'rara',
    img: '25.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'sacrifice_then_summon_from_deck',
        target: 'your_creature',
        summon: {
          count: 2,
          card_type: 'criatura',
          race: 'Espectro',
          max_attack: 2,
          can_attack_this_turn: false,
        },
      },
    ],
  },
  {
    id: 26,
    tipo: 'comando',
    nome: 'Lua Sangrenta de Esdras',
    efeito: 'Esolha uma criatura que você controle: Ela recebe +1/+1 até o fim do seu turno, para cada criatura de nome Esdras em seu descarte..',
    elemento: 'neutro',
    raridade: 'comum',
    img: '26.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'temporary_modify_stat',
        target: 'your_creature',
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
    tipo: 'comando',
    nome: 'Alterando as Rotas',
    efeito: 'Escolha uma criatura que você controle: ela não pode ser alvo de ataques neste turno.',
    elemento: 'neutro',
    raridade: 'comum',
    img: '27.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'prevent_attack_target',
        target: 'your_creature',
        duration: 'until_end_of_turn',
      },
    ],
  },

  // --- Quatro Elementos ---
  {
    id: 60,
    tipo: 'comando',
    nome: 'Certamente não é um Nortenho',
    efeito:
      'Esta carta recebe o nome de “Engenhoca Kabum Nortenho” no campo ou  em seu baralho.\n\nRetorne três cartas exiladas para o seu baralho, embaralhe e depois compre uma carta.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '60.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 61,
    tipo: 'comando',
    nome: 'Pedido de Emergência',
    efeito:
      'Escolha uma criatura aliada, recrute do seu baralho em uma zona livre, uma criatura com ataque igual ou menor e que seja da mesma raça da criatura escolhida.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '61.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 62,
    tipo: 'comando',
    nome: 'Troncos Retorcidos',
    efeito:
      'Esta carta é considerada “Moeda da Floresta” no baralho. \nInverta os efeitos de cartas anexadas em uma rota escolhida até o final do turno. (buffs se tornam debuffs , e debuffs se tornam buffs)',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '62.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 76,
    tipo: 'comando',
    nome: 'Saraivada de Meteoros',
    efeito: 'Todas as criaturas em campo recebem 1 de dano direto em sua vida.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '76.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
  {
    id: 78,
    tipo: 'comando',
    nome: 'Chamado do Mortos',
    efeito:
      'Recrute do descarte inimigo, uma criatura que tenha sido abatida neste turno.\nAquele criatura se torna do tipo Zumbi enquanto estiver em campo.',
    elemento: 'neutro',
    raridade: 'comum',
    arte: '78.webp',
    edicao: 'Quatro Elementos',
    ref: 'GES-0004',
    efeitoPendente: true,
  },
];
