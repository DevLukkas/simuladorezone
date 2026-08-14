import type { Carta, Formato } from './tipos.ts';
import { FORMATO_POR_EDICAO } from './tipos.ts';
import { criaturas } from './criaturas.ts';
import { habilidades } from './habilidades.ts';
import { itens } from './itens.ts';
import { comandos } from './comandos.ts';
import { cenarios } from './cenarios.ts';

/**
 * Catálogo completo dos dois formatos, ordenado por id.
 * Clássico ocupa 1..45; Quatro Elementos começa em 46.
 */
export const TODAS_AS_CARTAS: readonly Carta[] = [
  ...criaturas,
  ...habilidades,
  ...itens,
  ...comandos,
  ...cenarios,
].sort((a, b) => a.id - b.id);

const porId = new Map<number, Carta>(TODAS_AS_CARTAS.map((carta) => [carta.id, carta]));

export function cartaPorId(id: number): Carta {
  const carta = porId.get(id);
  if (!carta) throw new Error(`Carta inexistente: ${id}`);
  return carta;
}

export function existeCarta(id: number): boolean {
  return porId.has(id);
}

/** O formato de uma carta é o da sua edição — não há campo redundante na carta. */
export function formatoDaCarta(carta: Carta): Formato {
  return FORMATO_POR_EDICAO[carta.edicao];
}

export function cartasDoFormato(formato: Formato): readonly Carta[] {
  return TODAS_AS_CARTAS.filter((carta) => formatoDaCarta(carta) === formato);
}
