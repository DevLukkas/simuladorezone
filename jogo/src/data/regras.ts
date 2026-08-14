import { cartaPorId, existeCarta, formatoDaCarta } from './cartas.ts';
import { heroiPorChave } from './herois.ts';
import { NOME_DO_FORMATO, type Formato } from './tipos.ts';

/**
 * Regras de construção de deck (mesmos limites do backend legado:
 * DeckController MAX_CARDS/MAX_COPIES + herói obrigatório).
 * Validadas pelo cliente E pelo servidor com esta mesma função.
 */
export const MAXIMO_DE_CARTAS_NO_DECK = 40;
export const MAXIMO_DE_COPIAS = 3;
/** o legado só exigia deck não-vazio; um mínimo real é decisão de produto pendente */
export const MINIMO_DE_CARTAS_NO_DECK = 1;

export interface DeckProposto {
  nome: string;
  heroi: string;
  /** id da carta → quantidade */
  cartas: Record<number, number>;
  /** ausente = clássico, para decks gravados antes do segundo formato existir */
  formato?: Formato;
}

/** Retorna a lista de problemas; deck válido = lista vazia. */
export function validarDeck(deck: DeckProposto): string[] {
  const problemas: string[] = [];
  const formato = deck.formato ?? 'classico';

  if (!deck.nome.trim()) problemas.push('O deck precisa de um nome.');
  if (!heroiPorChave(deck.heroi)) problemas.push(`Herói desconhecido: "${deck.heroi}".`);

  let total = 0;
  for (const [idTexto, quantidade] of Object.entries(deck.cartas)) {
    const id = Number(idTexto);
    if (!existeCarta(id)) {
      problemas.push(`Carta inexistente no catálogo: ${id}.`);
      continue;
    }
    // formatos não se misturam num mesmo deck: as regras de um não valem no outro
    const formatoDaCartaNoDeck = formatoDaCarta(cartaPorId(id));
    if (formatoDaCartaNoDeck !== formato) {
      problemas.push(
        `A carta ${id} é do formato ${NOME_DO_FORMATO[formatoDaCartaNoDeck]},` +
          ` mas o deck é ${NOME_DO_FORMATO[formato]}.`,
      );
      continue;
    }
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      problemas.push(`Quantidade inválida para a carta ${id}.`);
      continue;
    }
    if (quantidade > MAXIMO_DE_COPIAS) {
      problemas.push(`Carta ${id} com ${quantidade} cópias (máximo ${MAXIMO_DE_COPIAS}).`);
    }
    total += quantidade;
  }

  if (total > MAXIMO_DE_CARTAS_NO_DECK) {
    problemas.push(`Deck com ${total} cartas (máximo ${MAXIMO_DE_CARTAS_NO_DECK}).`);
  }
  if (total < MINIMO_DE_CARTAS_NO_DECK) {
    problemas.push(`Deck com ${total} cartas (mínimo ${MINIMO_DE_CARTAS_NO_DECK}).`);
  }

  return problemas;
}
