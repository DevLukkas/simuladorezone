import type { CartaCenario } from './tipos.ts';

/**
 * Cartas do tipo CENÁRIO — alteram as regras do campo enquanto em jogo.
 */
export const cenarios: CartaCenario[] = [
  {
    id: 45,
    tipo: 'cenario',
    nome: 'Caverna do Guardião Badur',
    efeito: 'Quando uma criatura do tipo Besta que você controla for enviada do campo para o seu descarte, você pode escolher uma criatura chamada "Badur, o Urso Guardião". Se fizer isso, ela recebe +1 ATK até o final do turno. A primeira vez a cada turno que uma criatura inimiga for destruída em combate, você pode comprar 1 carta.',
    elemento: 'neutro',
    raridade: 'rara',
    img: '45.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'buff_named_on_your_creature_to_discard',
        when: { race: 'Besta' },
        target: { name: 'Badur, o Urso Guardião' },
        stats: ['attack'],
        value: 1,
        duration: 'until_end_of_turn',
      },
      {
        type: 'draw_on_first_enemy_battle_destroyed',
        oncePerTurn: true,
        targetOwner: 'enemy',
        value: 1,
      },
    ],
  },
];
