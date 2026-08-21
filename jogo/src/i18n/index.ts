import { cardById, cardExists } from '../data/cards.ts';
import type { TextParam, TextRef } from '../shared/text.ts';
import type { CardTexts, TextKey } from './keys.ts';
import ptBR, { type Ui } from './locales/pt-BR.ts';
import enUS from './locales/en-US.ts';
import esES from './locales/es-ES.ts';

/**
 * i18n do jogo, sem dependência: dicionários tipados contra o pt-BR, escolha do
 * idioma vinda do sistema e texto de carta resolvido pelo catálogo quando o
 * idioma não traduz.
 *
 * O motor NUNCA importa este módulo em tempo de execução: ele devolve `TextRef`
 * (chave + parâmetros) e quem traduz é o cliente.
 */

export const LOCALES = ['pt-BR', 'en-US', 'es-ES'] as const;
export type Locale = (typeof LOCALES)[number];

/** Idioma-fonte: também o fallback de qualquer texto que falte. */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  'es-ES': 'Español',
};

interface Bundle {
  ui: Ui;
  cards: CardTexts;
}

const BUNDLES: Record<Locale, Bundle> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  'es-ES': esES,
};

const STORAGE_KEY = 'ezone:locale';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Idioma do sistema: primeiro a etiqueta exata (pt-BR), depois só a língua
 * (pt → pt-BR). Sem navegador, ou sem nenhuma correspondência, cai no pt-BR.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of wanted) {
    if (!tag) continue;
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const language = tag.split('-')[0]?.toLowerCase();
    const byLanguage = LOCALES.find((locale) => locale.split('-')[0] === language);
    if (byLanguage) return byLanguage;
  }
  return DEFAULT_LOCALE;
}

function storedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

let current: Locale = storedLocale() ?? detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** Troca o idioma e avisa quem estiver desenhando (o cliente re-renderiza). */
export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // sem localStorage (SSR, teste): a escolha vale só para esta sessão
  }
  for (const listener of listeners) listener();
}

export function subscribeToLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(ui: Ui, key: string): string | undefined {
  let node: unknown = ui;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function fill(template: string, params: Record<string, TextParam> | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : resolveParam(value);
  });
}

function resolveParam(value: TextParam): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if ('card' in value) return cardName(value.card);
  if ('token' in value) return tokenName(value.token);
  return resolve(value);
}

/** Traduz uma chave, com fallback para o pt-BR e, no limite, a própria chave. */
export function t(key: TextKey, params?: Record<string, TextParam>): string {
  const template = lookup(BUNDLES[current].ui, key) ?? lookup(BUNDLES[DEFAULT_LOCALE].ui, key);
  return fill(template ?? key, params);
}

/**
 * Existe texto para esta chave em algum dos dois dicionários?
 *
 * `t` devolve a própria chave quando falta, o que é o certo para chave escrita à
 * mão (aparece o erro). Mas a dica de campo do estúdio monta a chave a partir do
 * NOME do campo, que é string livre: lá o certo é não mostrar dica nenhuma.
 */
export function hasText(key: string): boolean {
  return (
    lookup(BUNDLES[current].ui, key) !== undefined ||
    lookup(BUNDLES[DEFAULT_LOCALE].ui, key) !== undefined
  );
}

/** Traduz o texto adiado que o motor/servidor devolveu. */
export function resolve(ref: TextRef): string {
  return t(ref.key, ref.params);
}

/**
 * O PAPEL de cada pedaço de uma frase traduzida. O texto é o mesmo do `resolve`;
 * o que muda é que o parâmetro chega separado da moldura, e com o que ele é.
 */
export type TextRole = 'plain' | 'card' | 'token' | 'you' | 'opponent' | 'number';

export interface TextPart {
  text: string;
  role: TextRole;
}

/**
 * A mesma frase do `resolve`, mas em pedaços etiquetados — é o que o registro da
 * partida usa para pintar o nome da carta de ouro, o número em destaque e o autor
 * do lance na cor de quem é (decisão nº 42).
 *
 * Vive aqui, e não no cliente, porque quem sabe onde acaba a moldura e começa o
 * parâmetro é quem preenche o `{...}` — reconstituir isso depois, a partir da
 * frase pronta, seria adivinhar por casamento de texto.
 */
export function resolveParts(ref: TextRef): TextPart[] {
  const template =
    lookup(BUNDLES[current].ui, ref.key) ?? lookup(BUNDLES[DEFAULT_LOCALE].ui, ref.key) ?? ref.key;
  const parts: TextPart[] = [];

  function push(text: string, role: TextRole): void {
    if (!text) return;
    const last = parts[parts.length - 1];
    // moldura seguida de moldura é uma só: o placeholder desconhecido volta como texto
    if (role === 'plain' && last?.role === 'plain') last.text += text;
    else parts.push({ text, role });
  }

  let cut = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const at = match.index ?? 0;
    push(template.slice(cut, at), 'plain');
    cut = at + match[0].length;
    const value = ref.params?.[match[1]!];
    if (value === undefined) push(match[0], 'plain');
    else for (const part of paramParts(value)) push(part.text, part.role);
  }
  push(template.slice(cut), 'plain');
  return parts;
}

function paramParts(value: TextParam): TextPart[] {
  if (typeof value === 'number') return [{ text: String(value), role: 'number' }];
  if (typeof value === 'string') return [{ text: value, role: 'plain' }];
  if ('card' in value) return [{ text: cardName(value.card), role: 'card' }];
  if ('token' in value) return [{ text: tokenName(value.token), role: 'token' }];
  // quem é o autor do lance vem como referência a board.you / board.opponent
  if (value.key === 'board.you') return [{ text: resolve(value), role: 'you' }];
  if (value.key === 'board.opponent') return [{ text: resolve(value), role: 'opponent' }];
  return resolveParts(value);
}

/**
 * Nome da carta no idioma corrente. O catálogo guarda o nome impresso (pt-BR);
 * um idioma só o substitui se tiver a tradução daquela carta.
 */
export function cardName(cardId: number): string {
  const override = BUNDLES[current].cards[cardId]?.name;
  if (override) return override;
  return cardExists(cardId) ? cardById(cardId).name : `#${cardId}`;
}

/** Texto de regras da carta, mesma regra de fallback do nome. */
export function cardRulesText(cardId: number): string | null {
  const override = BUNDLES[current].cards[cardId]?.text;
  if (override) return override;
  return cardExists(cardId) ? cardById(cardId).text : null;
}

/**
 * O que está escrito no dicionário de UM idioma, sem idioma corrente e sem
 * fallback. `cardName` responde "o que o jogador lê"; esta responde "o que está
 * gravado", que é o que o estúdio de cartas precisa editar — inclusive o vazio.
 */
export function cardTextsIn(locale: Locale, cardId: number): { name: string; text: string } | null {
  return BUNDLES[locale].cards[cardId] ?? null;
}

/** Nome de ficha (token), que existe só como efeito e não tem carta. */
export function tokenName(tokenId: string): string {
  return t(`token.${tokenId}` as TextKey);
}
