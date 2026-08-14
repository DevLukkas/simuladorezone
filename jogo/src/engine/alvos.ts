import type { Carta, CartaAnexavel, Elemento } from '../data/tipos.ts';
import { elementoAtual } from './cartasEmJogo.ts';
import type { CriaturaEmCampo, EstadoDoJogo, LadoId } from './estado.ts';

/**
 * Compatibilidade de elemento para anexar HABILIDADE (itens anexam sempre):
 * mesmo elemento, ou ambos em {neutro, vazio}. Porta de `elementsAreCompatible`.
 */
export function elementosCompativeis(anexo: Elemento, criatura: Elemento): boolean {
  if (anexo === criatura) return true;
  const flexiveis: Elemento[] = ['neutro', 'vazio'];
  return flexiveis.includes(anexo) && flexiveis.includes(criatura);
}

export function podeAnexarEm(carta: CartaAnexavel, criatura: CriaturaEmCampo): boolean {
  if (carta.tipo === 'item') return true;
  return elementosCompativeis(carta.elemento, elementoAtual(criatura));
}

export function podeInvocarNormalmente(carta: Carta): boolean {
  if (carta.tipo !== 'criatura') return false;
  return carta.summonRule?.normal !== false;
}

/** Porta de `canCreatureAttack`: 1 ataque por turno, espera de invocação, bloqueios. */
export function podeAtacar(estado: EstadoDoJogo, lado: LadoId, criatura: CriaturaEmCampo): boolean {
  if (estado.vencedor || estado.fase !== 'batalha' || estado.ladoAtivo !== lado) return false;
  if (criatura.atacouNoTurno === estado.turno) return false;
  if (criatura.podeAtacarAPartirDoTurno > estado.turno) return false;
  if ((criatura.naoPodeAtacarAteTurno ?? 0) >= estado.turno) return false;
  return true;
}
