import type { Heroi } from './tipos.ts';

/**
 * Os 5 heróis (antes semeados numa migration do Laravel legado).
 * Na v1 apenas Ispisher e Badur têm efeito implementado no motor;
 * Tennor, Gimlou e Morgon aguardam design/implementação (ver decisions.md).
 */
export const herois: Heroi[] = [
  {
    chave: 'tennor',
    nome: 'Tennor',
    raca: 'Humano',
    elemento: null,
    nomeDoEfeito: 'Mestre das Habilidades',
    descricaoDoEfeito:
      'Quando anexar uma carta de habilidade, revele a carta do topo do baralho. Se for uma habilidade do mesmo elemento da carta anexada, a criatura alvo recebe +1/+0.',
    img: 'avatar_heroi_tennor.png',
  },
  {
    chave: 'ispisher',
    nome: 'Ispisher',
    raca: 'Tritão',
    elemento: 'agua',
    nomeDoEfeito: 'Maré Restauradora',
    descricaoDoEfeito: 'No início do seu turno, cure 1 de vida de uma criatura aliada com a menor vida.',
    img: 'avatar_heroi_ispisher.png',
  },
  {
    chave: 'gimlou',
    nome: 'Gimlou',
    raca: 'Goblin',
    elemento: 'fogo',
    nomeDoEfeito: 'Marca da Emboscada',
    descricaoDoEfeito:
      'Quando um Goblin aliado atacar e a criatura inimiga sobreviver ao combate, ela recebe um contador de -1/0. Máximo de 5 contadores por criatura.',
    img: 'avatar_heroi_gimlou.png',
  },
  {
    chave: 'badur',
    nome: 'Badur',
    raca: 'Besta',
    elemento: 'terra',
    nomeDoEfeito: 'Pele de Pedra',
    descricaoDoEfeito: 'Criaturas aliadas do elemento Terra recebem +1 de vida máxima ao entrar em campo.',
    img: 'avatar_heroi_badur.png',
  },
  {
    chave: 'morgon',
    nome: 'Morgon',
    raca: 'Espectro',
    elemento: null,
    nomeDoEfeito: 'Legião dos Esquecidos',
    descricaoDoEfeito:
      'Quando uma criatura aliada morrer, gere um token Espectro 1/1 se houver espaço disponível.',
    img: 'avatar_heroi_morgon.png',
  },
];

export function heroiPorChave(chave: string): Heroi | undefined {
  return herois.find((heroi) => heroi.chave === chave);
}
