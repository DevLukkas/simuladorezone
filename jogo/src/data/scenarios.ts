import type { ScenarioCard } from './types.ts';

/**
 * Cartas do tipo CENÁRIO — alteram as regras do campo enquanto em jogo.
 */
export const scenarios: ScenarioCard[] = [
  {
    id: 45,
    type: 'scenario',
    name: 'Caverna do Guardião Badur',
    text: 'Quando uma criatura do tipo Besta que você controla for enviada do campo para o seu descarte, você pode escolher uma criatura chamada "Badur, o Urso Guardião". Se fizer isso, ela recebe +1 ATK até o final do turno. A primeira vez a cada turno que uma criatura inimiga for destruída em combate, você pode comprar 1 carta.',
    element: 'neutral',
    rarity: 'rare',
    img: '45.png',
    edition: 'Matilhas & Predadores',
    effects: [
      {
        type: 'on_ally_sent_to_discard_buff_ally',
        when: { race: 'Beast' },
        target: { name: 'Badur, o Urso Guardião' },
        stats: ['attack'],
        value: 1,
        duration: 'until_end_of_turn',
      },
      {
        type: 'on_enemy_destroyed_in_battle_draw',
        oncePerTurn: true,
        targetOwner: 'enemy',
        value: 1,
      },
    ],
  },
];
