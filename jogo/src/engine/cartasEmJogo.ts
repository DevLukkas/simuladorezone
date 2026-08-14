import { cartaPorId } from '../data/cartas.ts';
import type {
  Carta,
  CartaAnexavel,
  Elemento,
  FiltroCarta,
  PalavraChave,
  Raca,
  Raridade,
} from '../data/tipos.ts';
import type { CriaturaEmCampo } from './estado.ts';

/** Identidade resolvida de uma criatura em campo (carta do catálogo ou ficha). */
export interface DefDeCriatura {
  nome: string;
  raca: Raca;
  ataque: number;
  vida: number;
  elemento: Elemento;
  raridade: Raridade;
  efeito: string | null;
}

export function defDaCriatura(criatura: CriaturaEmCampo): DefDeCriatura {
  if (criatura.ficha) {
    const ficha = criatura.ficha;
    return {
      nome: ficha.nome,
      raca: ficha.raca,
      ataque: ficha.ataque,
      vida: ficha.vida,
      elemento: ficha.elemento,
      raridade: ficha.raridade,
      efeito: null,
    };
  }
  const carta = cartaPorId(criatura.cartaId ?? 0);
  if (carta.tipo !== 'criatura') throw new Error(`uid ${criatura.uid} não é criatura`);
  return {
    nome: carta.nome,
    raca: carta.raca,
    ataque: carta.ataque,
    vida: carta.vida,
    elemento: carta.elemento,
    raridade: carta.raridade,
    efeito: carta.efeito,
  };
}

/** Elemento vigente: alterado por efeito ou o impresso. */
export function elementoAtual(criatura: CriaturaEmCampo): Elemento {
  return criatura.elementoAlterado ?? defDaCriatura(criatura).elemento;
}

/** Porta de `matchesCreatureRule` do legado, sobre o elemento vigente. */
export function criaturaCasaComFiltro(
  criatura: CriaturaEmCampo,
  filtro: FiltroCarta | undefined,
  excluirUid?: string,
): boolean {
  if (!filtro) return true;
  const def = defDaCriatura(criatura);
  if (excluirUid && criatura.uid === excluirUid) return false;
  if (filtro.race && def.raca !== filtro.race) return false;
  if (filtro.element && elementoAtual(criatura) !== filtro.element) return false;
  const nome = def.nome.toLowerCase();
  if (filtro.name && nome !== filtro.name.toLowerCase()) return false;
  if (filtro.name_includes && !nome.includes(filtro.name_includes.toLowerCase())) return false;
  return true;
}

/** Mesmo filtro, mas sobre uma carta de catálogo (mão, deck, descarte). */
export function cartaCasaComFiltro(cartaId: number, filtro: FiltroCarta | undefined): boolean {
  if (!filtro) return true;
  const carta = cartaPorId(cartaId);
  const nome = carta.nome.toLowerCase();
  if (filtro.name && nome !== filtro.name.toLowerCase()) return false;
  if (filtro.name_includes && !nome.includes(filtro.name_includes.toLowerCase())) return false;
  if (filtro.race && (carta.tipo !== 'criatura' || carta.raca !== filtro.race)) return false;
  if (filtro.element && carta.elemento !== filtro.element) return false;
  return true;
}

/**
 * "Aptidão": pelo legado, a criatura que tem a palavra no texto ataca no turno
 * em que entra. Nenhuma das 45 cartas atuais a possui; quando uma possuir,
 * promover a campo declarado (ver decisions.md).
 */
export function temAptidao(efeito: string | null): boolean {
  if (!efeito) return false;
  const texto = efeito.toLowerCase();
  return texto.includes('aptidão') || texto.includes('aptidao');
}

/**
 * Palavra-chave vigente numa criatura: a impressa na carta mais as concedidas
 * por anexos (`grant_keyword`). Fichas não têm palavra impressa — só o que
 * ganharem de anexo. Consulta única para o motor inteiro; carta é dado.
 */
export function temPalavraChave(criatura: CriaturaEmCampo, chave: PalavraChave): boolean {
  if (criatura.cartaId !== null) {
    const carta = cartaPorId(criatura.cartaId);
    if (carta.tipo === 'criatura' && (carta.palavrasChave ?? []).includes(chave)) return true;
  }
  return criatura.anexos.some((anexo) => {
    const carta = cartaPorId(anexo.cartaId);
    if (!cartaAnexavel(carta)) return false;
    return (carta.effects ?? []).some(
      (efeito) => efeito.type === 'grant_keyword' && efeito.keyword === chave,
    );
  });
}

/** lendária = 2, rara = 1, comum = 0 (pontuação por destruição em batalha). */
export function pontosPorRaridade(raridade: Raridade): number {
  if (raridade === 'lendaria') return 2;
  if (raridade === 'rara') return 1;
  return 0;
}

export function cartaAnexavel(carta: Carta): carta is CartaAnexavel {
  return carta.tipo === 'habilidade' || carta.tipo === 'item';
}
