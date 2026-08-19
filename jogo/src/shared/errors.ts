import type { TextKey } from '../i18n/keys.ts';
import { text, type TextRef } from './text.ts';

/**
 * Recusas do motor e do servidor. O código é a CHAVE do dicionário sem o prefixo
 * — derivá-lo do i18n dá duas garantias de compilação: nenhum código sem frase, e
 * nenhuma frase de erro órfã sendo inventada em código.
 */
type WithoutPrefix<T, P extends string> = T extends `${P}${infer Rest}` ? Rest : never;

export type ErrorCode = WithoutPrefix<TextKey, 'error.'>;

/** Vira texto adiado, do jeito que o cliente sabe traduzir. */
export function errorText(code: ErrorCode, params?: Record<string, string | number>): TextRef {
  return text(`error.${code}` as TextKey, params);
}
