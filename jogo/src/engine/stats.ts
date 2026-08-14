import { cartaPorId } from '../data/cartas.ts';
import type { ContagemPorCarta, EfeitoContinuo, FiltroCarta } from '../data/tipos.ts';
import { criaturaCasaComFiltro, defDaCriatura, elementoAtual } from './cartasEmJogo.ts';
import type { CriaturaEmCampo } from './estado.ts';

export interface StatsAtuais {
  attack: number;
  defense: number;
}

/**
 * Porta de `recalculateCreatureStats` do legado, como função pura:
 * base + modify_stat dos anexos + auras do próprio campo + marcadores
 * + modificadores temporários − dano sofrido. `defense` é a vida atual.
 */
export function statsAtuais(
  criatura: CriaturaEmCampo,
  campoDoLado: readonly (CriaturaEmCampo | null)[],
): StatsAtuais {
  const def = defDaCriatura(criatura);
  const stats: StatsAtuais = { attack: def.ataque, defense: def.vida };

  for (const anexo of criatura.anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
    for (const efeito of carta.effects ?? []) {
      aplicarModifyStat(efeito, stats, criatura, campoDoLado, carta.id);
    }
  }

  for (const fonte of campoDoLado) {
    if (!fonte || fonte.cartaId === null) continue;
    const cartaFonte = cartaPorId(fonte.cartaId);
    if (cartaFonte.tipo !== 'criatura') continue;
    for (const efeito of cartaFonte.effects ?? []) {
      if (efeito.type !== 'aura_modify_stat') continue;
      if (efeito.exclude_source && fonte.uid === criatura.uid) continue;
      if (!criaturaCasaComFiltro(criatura, efeito.filter)) continue;
      for (const stat of efeito.stats) {
        stats[stat] += efeito.value;
      }
    }
  }

  stats.attack += criatura.marcadores.attack;
  stats.defense += criatura.marcadores.defense;
  for (const mod of criatura.modificadoresTemporarios) {
    stats.attack += mod.attack;
    stats.defense += mod.defense;
  }

  // Sapotristan: a troca vale enquanto o elemento da criatura estiver alterado
  if (criatura.trocaDeStatsComElementoAlterado && criatura.elementoAlterado) {
    const attack = stats.attack;
    stats.attack = stats.defense;
    stats.defense = attack;
  }

  stats.defense -= criatura.dano;
  return stats;
}

function aplicarModifyStat(
  efeito: EfeitoContinuo,
  stats: StatsAtuais,
  criatura: CriaturaEmCampo,
  campoDoLado: readonly (CriaturaEmCampo | null)[],
  cartaFonteId: number,
): void {
  if (efeito.type !== 'modify_stat') return;
  if (efeito.condition && !condicaoDeCampoVale(efeito.condition, criatura, campoDoLado)) return;

  let valor = efeito.value ?? 0;
  for (const condicional of efeito.conditionals ?? []) {
    if (criaturaCasaComFiltro(criatura, condicional.if)) valor = condicional.value;
  }
  valor += valorPorContagem(efeito.value_per_card, campoDoLado, cartaFonteId, criatura);

  stats[efeito.stat] += valor;
}

function condicaoDeCampoVale(
  condicao: { zone: 'your_field'; count_same_element: number },
  criatura: CriaturaEmCampo,
  campoDoLado: readonly (CriaturaEmCampo | null)[],
): boolean {
  const elemento = elementoAtual(criatura);
  const quantas = campoDoLado.filter(
    (outra) => outra !== null && elementoAtual(outra) === elemento,
  ).length;
  return quantas >= condicao.count_same_element;
}

/**
 * "+X por carta": conta cartas na zona indicada. Em `your_field` valem tanto
 * as criaturas quanto os anexos delas (paridade com `cardsFromZone` do legado,
 * inclusive o `exclude_self` por id de catálogo — todas as cópias da carta
 * fonte ficam de fora, não só a própria); `exclude_holder` tira da conta a
 * criatura que carrega o anexo ("cada OUTRO Espectro", Esfera da Aura).
 * Em `target_attachments` conta os anexos da própria criatura (Afogamento).
 */
function valorPorContagem(
  regra: ContagemPorCarta | undefined,
  campoDoLado: readonly (CriaturaEmCampo | null)[],
  cartaFonteId: number,
  portadora: CriaturaEmCampo,
): number {
  if (!regra || !regra.value) return 0;
  if (regra.zone === 'target_attachments') return portadora.anexos.length * regra.value;
  if (regra.zone !== 'your_field') return 0;

  let quantas = 0;
  for (const outra of campoDoLado) {
    if (!outra) continue;
    if (regra.exclude_holder && outra.uid === portadora.uid) continue;
    if (cartaDeCampoCasa(outra, regra, cartaFonteId)) quantas++;
    for (const anexo of outra.anexos) {
      if (anexoCasa(anexo.cartaId, regra, cartaFonteId)) quantas++;
    }
  }
  return quantas * regra.value;
}

function cartaDeCampoCasa(
  criatura: CriaturaEmCampo,
  regra: ContagemPorCarta,
  cartaFonteId: number,
): boolean {
  if (regra.exclude_self && criatura.cartaId === cartaFonteId) return false;
  const filtro: FiltroCarta = {};
  if (regra.race) filtro.race = regra.race;
  if (regra.name_includes) filtro.name_includes = regra.name_includes;
  return criaturaCasaComFiltro(criatura, filtro);
}

function anexoCasa(cartaId: number, regra: ContagemPorCarta, cartaFonteId: number): boolean {
  if (regra.card_type === 'criatura') return false;
  if (regra.exclude_self && cartaId === cartaFonteId) return false;
  const carta = cartaPorId(cartaId);
  if (regra.race) return false;
  if (
    regra.name_includes &&
    !carta.nome.toLowerCase().includes(regra.name_includes.toLowerCase())
  ) {
    return false;
  }
  return true;
}
