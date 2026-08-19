import type { Hero } from './types.ts';

/**
 * Os 5 heróis (antes semeados numa migration do Laravel legado).
 * Na v1 apenas Ispisher e Badur têm efeito implementado no motor;
 * Tennor, Gimlou e Morgon aguardam design/implementação (ver decisions.md).
 */
export const heroes: Hero[] = [
  {
    key: 'tennor',
    name: 'Tennor',
    race: 'Human',
    element: null,
    effectName: 'Mestre das Habilidades',
    effectText:
      'Quando anexar uma carta de habilidade, revele a carta do topo do baralho. Se for uma habilidade do mesmo elemento da carta anexada, a criatura alvo recebe +1/+0.',
    img: 'avatar_heroi_tennor.png',
  },
  {
    key: 'ispisher',
    name: 'Ispisher',
    race: 'Tritão',
    element: 'water',
    effectName: 'Maré Restauradora',
    effectText: 'No início do seu turno, cure 1 de vida de uma criatura aliada com a menor vida.',
    img: 'avatar_heroi_ispisher.png',
  },
  {
    key: 'gimlou',
    name: 'Gimlou',
    race: 'Goblin',
    element: 'fire',
    effectName: 'Marca da Emboscada',
    effectText:
      'Quando um Goblin aliado atacar e a criatura inimiga sobreviver ao combate, ela recebe um contador de -1/0. Máximo de 5 contadores por criatura.',
    img: 'avatar_heroi_gimlou.png',
  },
  {
    key: 'badur',
    name: 'Badur',
    race: 'Beast',
    element: 'earth',
    effectName: 'Pele de Pedra',
    effectText: 'Criaturas aliadas do elemento Terra recebem +1 de vida máxima ao entrar em campo.',
    img: 'avatar_heroi_badur.png',
  },
  {
    key: 'morgon',
    name: 'Morgon',
    race: 'Ghost',
    element: null,
    effectName: 'Legião dos Esquecidos',
    effectText:
      'Quando uma criatura aliada morrer, gere um token Espectro 1/1 se houver espaço disponível.',
    img: 'avatar_heroi_morgon.png',
  },
];

export function heroByKey(key: string): Hero | undefined {
  return heroes.find((hero) => hero.key === key);
}
