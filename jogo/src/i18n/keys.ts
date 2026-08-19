import type { Ui } from './locales/pt-BR.ts';

/**
 * Toda chave do dicionário, em notação de ponto ("board.turn", "hero.badur.name").
 *
 * Vive num módulo só de tipos para que o motor possa importá-la sem depender do
 * i18n em tempo de execução: `TextRef.key` é tipada, então uma chave inventada
 * dentro de `src/engine` não compila (invariante 3 — o motor emite dado, não texto).
 */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type TextKey = Paths<Ui>;

/**
 * Nome e texto impressos de uma carta, por id — o dicionário de cartas de um idioma.
 *
 * Fica fora do `Ui` porque a chave é o id do catálogo, não uma chave de texto: o
 * pt-BR não tem nenhuma entrada (o impresso vive em `src/data`) e cada outro idioma
 * traduz o catálogo inteiro (o teste de i18n acusa carta sem tradução).
 */
export type CardTexts = Record<number, { name: string; text: string }>;
