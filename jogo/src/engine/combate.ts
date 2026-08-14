import { cartaPorId } from '../data/cartas.ts';
import {
  criaturaCasaComFiltro,
  defDaCriatura,
  pontosPorRaridade,
  temPalavraChave,
} from './cartasEmJogo.ts';
import type { Evento } from './eventos.ts';
import {
  DANO_DIRETO_POR_PONTO,
  PONTOS_PARA_VENCER,
  ladoOposto,
  type AnexoEmCampo,
  type CriaturaEmCampo,
  type EstadoDoJogo,
  type LadoId,
} from './estado.ts';
import {
  aoAnexoIrParaDescarte,
  aoCausarDanoAoJogador,
  aoCriaturaAtacar,
  aoCriaturaSairDoCampoParaDescarte,
  aoCriaturaSerAtacada,
  cenarioAoDestruirEmBatalha,
} from './gatilhos.ts';
import { statsAtuais } from './stats.ts';
import { comprarCartas } from './zonas.ts';

/**
 * Redução de dano de combate (Badur, Resistência): fontes no campo do dono do
 * alvo com `reduce_combat_damage_taken` cujo filtro casa com o alvo, mais os
 * anexos do próprio alvo. Porta de `_combatDamageAfterReduction`.
 *
 * `once_per_turn` (Resistência) marca o anexo: só a primeira leva de dano do
 * turno é reduzida. Por isso a função precisa do turno e escreve no anexo —
 * chame-a UMA vez por instância de dano.
 */
export function danoAposReducao(
  alvo: CriaturaEmCampo,
  campoDoDono: readonly (CriaturaEmCampo | null)[],
  danoBase: number,
  turno: number,
): number {
  let dano = Math.max(0, danoBase);
  if (dano <= 0) return dano;

  for (const fonte of campoDoDono) {
    if (!fonte || fonte.cartaId === null) continue;
    const carta = cartaPorId(fonte.cartaId);
    if (carta.tipo !== 'criatura') continue;
    for (const efeito of carta.effects ?? []) {
      if (efeito.type !== 'reduce_combat_damage_taken') continue;
      if (efeito.exclude_source && fonte.uid === alvo.uid) continue;
      if (!criaturaCasaComFiltro(alvo, efeito.filter)) continue;
      dano = Math.max(0, dano - efeito.value);
    }
  }

  for (const anexo of alvo.anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
    for (const efeito of carta.effects ?? []) {
      if (efeito.type !== 'reduce_combat_damage_taken') continue;
      if (efeito.once_per_turn) {
        if (anexo.reducaoUsadaNoTurno === turno) continue;
        anexo.reducaoUsadaNoTurno = turno;
      }
      dano = Math.max(0, dano - efeito.value);
    }
  }

  return dano;
}

/**
 * MARCIAL ("ataca primeiro"): quem tem a palavra bate antes, e se o golpe matar
 * a criatura oposta ela não revida. Com a palavra dos dois lados ninguém
 * antecipa e o dano volta a ser simultâneo (a regra padrão do manual).
 *
 * Vale nos dois papéis — atacando e defendendo: num motor de dano simultâneo é
 * a defesa que dá sentido a "não sofre dano" (decisão nº 13).
 */
function quemGolpeiaPrimeiro(
  atacante: CriaturaEmCampo,
  defensor: CriaturaEmCampo,
): 'atacante' | 'defensor' | null {
  const doAtacante = temPalavraChave(atacante, 'marcial');
  const doDefensor = temPalavraChave(defensor, 'marcial');
  if (doAtacante === doDefensor) return null;
  return doAtacante ? 'atacante' : 'defensor';
}

/**
 * Aplica um golpe de batalha e devolve o dano que passou. Chame UMA vez por
 * golpe: `danoAposReducao` gasta a redução 1x-por-turno do alvo (Resistência),
 * e com MARCIAL o golpe pode nem acontecer.
 */
function golpear(
  alvo: CriaturaEmCampo,
  campoDoAlvo: readonly (CriaturaEmCampo | null)[],
  ataque: number,
  turno: number,
): number {
  const dano = danoAposReducao(alvo, campoDoAlvo, ataque, turno);
  alvo.dano += dano;
  return dano;
}

function segueVivo(
  criatura: CriaturaEmCampo,
  campo: readonly (CriaturaEmCampo | null)[],
): boolean {
  return statsAtuais(criatura, campo).defense > 0;
}

/**
 * VORPAL: destruiu a criatura inimiga em batalha → o ATQ IMPRESSO desta criatura
 * (não o modificado por anexos, auras ou marcadores) vira dano direto adicional
 * no dono dela. Roda mesmo se a portadora tiver caído no mesmo golpe, como o
 * excedente de `atropelar`.
 */
function aplicarDanoVorpal(
  estado: EstadoDoJogo,
  lado: LadoId,
  criatura: CriaturaEmCampo,
  anexosAntesDaBatalha: readonly AnexoEmCampo[],
  eventos: Evento[],
): void {
  if (!temPalavraChave(criatura, 'vorpal')) return;
  const ataqueImpresso = defDaCriatura(criatura).ataque;
  if (ataqueImpresso <= 0) return;
  aplicarDanoDireto(estado, ladoOposto(lado), ataqueImpresso, criatura.uid, eventos);
  aoCausarDanoAoJogador(estado, lado, anexosAntesDaBatalha);
}

/**
 * Corpo Translúcido + "não pode ser alvo": porta de `_canBeAttackTarget`.
 * O bloqueio compara a DEFESA ATUAL do atacante com o mínimo do efeito.
 * Recebe só o turno (não o estado) para servir também à visão do cliente.
 */
export function podeSerAlvoDeAtaque(
  turno: number,
  alvo: CriaturaEmCampo,
  atacante: CriaturaEmCampo,
  campoDoAtacante: readonly (CriaturaEmCampo | null)[],
): boolean {
  if ((alvo.naoPodeSerAlvoAteTurno ?? 0) >= turno) return false;
  const vidaDoAtacante = statsAtuais(atacante, campoDoAtacante).defense;
  return !alvo.anexos.some((anexo) => {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') return false;
    return (carta.effects ?? []).some(
      (efeito) =>
        efeito.type === 'cannot_be_attacked_by_creatures_with_min_defense' &&
        vidaDoAtacante >= efeito.min_defense,
    );
  });
}

/** Soma pontos (teto 3) e encerra a partida ao alcançar o teto. */
export function adicionarPontos(
  estado: EstadoDoJogo,
  lado: LadoId,
  ganhos: number,
  eventos: Evento[],
): void {
  if (ganhos <= 0 || estado.vencedor) return;
  const dono = estado.lados[lado];
  dono.pontos = Math.min(PONTOS_PARA_VENCER, dono.pontos + ganhos);
  eventos.push({ tipo: 'PONTUOU', lado, ganhos, total: dono.pontos });
  if (dono.pontos >= PONTOS_PARA_VENCER) {
    estado.vencedor = lado;
    estado.motivoDoFim = 'pontos';
    estado.pendencia = null;
    estado.fila = [];
    eventos.push({ tipo: 'FIM_DE_JOGO', vencedor: lado, motivo: 'pontos' });
  }
}

/** Dano direto acumula; a cada 5, o agressor pontua e o excedente permanece. */
export function aplicarDanoDireto(
  estado: EstadoDoJogo,
  sofredor: LadoId,
  valor: number,
  origemUid: string,
  eventos: Evento[],
): void {
  if (valor <= 0 || estado.vencedor) return;
  const dono = estado.lados[sofredor];
  dono.danoDireto += valor;
  eventos.push({ tipo: 'DANO_DIRETO', sofredor, valor, origemUid });
  while (dono.danoDireto >= DANO_DIRETO_POR_PONTO && !estado.vencedor) {
    dono.danoDireto -= DANO_DIRETO_POR_PONTO;
    adicionarPontos(estado, ladoOposto(sofredor), 1, eventos);
  }
}

export interface OpcoesDeRemocao {
  /** destruição pontua por raridade; sacrifício/efeito de descarte, não */
  pontuar: boolean;
  emBatalha: boolean;
  /** criatura que causou a destruição (gatilho de vingança do Pirata Afogado) */
  destruidor?: { lado: LadoId; slot: number };
}

/**
 * Remove uma criatura do campo para o descarte do dono (ou dissolve a ficha),
 * com anexos, pontos, gatilhos de morte/descarte e cenário. Núcleo comum de
 * `_destroyCreatureInBattle` e `_sendFieldCreatureToDiscard` do legado.
 */
export function removerCriaturaDoCampo(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  eventos: Evento[],
  opcoes: OpcoesDeRemocao,
): void {
  const dono = estado.lados[lado];
  const criatura = dono.campo[slot];
  if (!criatura) return;

  const def = defDaCriatura(criatura);
  if (opcoes.pontuar) {
    adicionarPontos(estado, ladoOposto(lado), pontosPorRaridade(def.raridade), eventos);
  }

  // vingança (destroyed_by_creature) antes da remoção, como no legado
  if (opcoes.destruidor && criatura.cartaId !== null) {
    const carta = cartaPorId(criatura.cartaId);
    if (carta.tipo === 'criatura') {
      for (const habilidade of carta.triggeredAbilities ?? []) {
        if (habilidade.trigger !== 'destroyed_by_creature') continue;
        if (habilidade.action.type !== 'deal_damage_to_destroyer') continue;
        danoDeEfeitoEmCriatura(
          estado,
          opcoes.destruidor.lado,
          opcoes.destruidor.slot,
          habilidade.action.damage,
          eventos,
        );
      }
    }
  }

  const ehFicha = criatura.cartaId === null;
  if (!ehFicha) {
    dono.descarte.push({ uid: criatura.uid, cartaId: criatura.cartaId! });
  }
  for (const anexo of criatura.anexos) {
    dono.descarte.push({ uid: anexo.uid, cartaId: anexo.cartaId });
    eventos.push({
      tipo: 'ANEXO_DESCARTADO',
      lado,
      slot,
      carta: { uid: anexo.uid, cartaId: anexo.cartaId },
    });
    aoAnexoIrParaDescarte(estado, lado, anexo.uid, anexo.cartaId, !opcoes.emBatalha);
  }
  dono.campo[slot] = null;
  eventos.push({
    tipo: 'CRIATURA_DESTRUIDA',
    lado,
    slot,
    uid: criatura.uid,
    emBatalha: opcoes.emBatalha,
    paraDescarte: !ehFicha,
  });

  // Sapotristan: quem carregava a troca compra 1 se morrer com elemento alterado
  if (criatura.saqueAoMorrerComElementoAlterado && criatura.elementoAlterado) {
    comprarCartas(estado, criatura.saqueAoMorrerComElementoAlterado, 1, eventos);
  }
  // Afogamento: o anexo que escolheu esta criatura como alvo cai junto
  descartarAnexosQueMiravam(estado, criatura.uid, eventos);

  if (!ehFicha) {
    aoCriaturaSairDoCampoParaDescarte(estado, lado, criatura, eventos);
    if (opcoes.emBatalha && opcoes.pontuar) {
      cenarioAoDestruirEmBatalha(estado, lado, eventos);
    }
  }
}

/** `chosen_enemy_creature_dies` + `destroy_self` (Afogamento), nos dois lados. */
function descartarAnexosQueMiravam(
  estado: EstadoDoJogo,
  alvoUid: string,
  eventos: Evento[],
): void {
  for (const lado of ['a', 'b'] as const) {
    estado.lados[lado].campo.forEach((portadora, slot) => {
      if (!portadora) return;
      for (let i = portadora.anexos.length - 1; i >= 0; i--) {
        const anexo = portadora.anexos[i]!;
        if (anexo.alvoEscolhidoUid !== alvoUid) continue;
        const carta = cartaPorId(anexo.cartaId);
        if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
        const cai = (carta.triggeredAbilities ?? []).some(
          (h) => h.trigger === 'chosen_enemy_creature_dies' && h.action.type === 'destroy_self',
        );
        if (!cai) continue;
        portadora.anexos.splice(i, 1);
        estado.lados[lado].descarte.push({ uid: anexo.uid, cartaId: anexo.cartaId });
        eventos.push({
          tipo: 'ANEXO_DESCARTADO',
          lado,
          slot,
          carta: { uid: anexo.uid, cartaId: anexo.cartaId },
        });
        aoAnexoIrParaDescarte(estado, lado, anexo.uid, anexo.cartaId, estado.fase !== 'batalha');
      }
    });
  }
}

/** Dano de efeito (vingança, Manopla): destrói com pontos se a vida zerar. */
export function danoDeEfeitoEmCriatura(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  valor: number,
  eventos: Evento[],
): void {
  const criatura = estado.lados[lado].campo[slot];
  if (!criatura || valor <= 0) return;
  criatura.dano += valor;
  eventos.push({ tipo: 'DANO_EM_CRIATURA', lado, criaturaUid: criatura.uid, valor });
  if (statsAtuais(criatura, estado.lados[lado].campo).defense <= 0) {
    removerCriaturaDoCampo(estado, lado, slot, eventos, { pontuar: true, emBatalha: true });
  }
}

/**
 * Resolve o ataque já autorizado (escudo do defensor consultado antes, em
 * efeitos.ts). Porta de `_resolveCreatureBattle`/`_resolveDirectAttack`.
 */
export function resolverAtaqueImediato(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  eventos: Evento[],
): void {
  const atacanteLado = estado.lados[lado];
  const defensorLado = estado.lados[ladoOposto(lado)];
  const atacante = atacanteLado.campo[slot];
  if (!atacante) return;

  const defensor = defensorLado.campo[slot];
  const statsAtacante = statsAtuais(atacante, atacanteLado.campo);
  const anexosDoAtacante = [...atacante.anexos];

  if (!defensor) {
    atacante.atacouNoTurno = estado.turno;
    aoCriaturaAtacar(estado, lado, atacante, eventos);
    if (statsAtacante.attack > 0) {
      aplicarDanoDireto(estado, ladoOposto(lado), statsAtacante.attack, atacante.uid, eventos);
      aoCausarDanoAoJogador(estado, lado, anexosDoAtacante);
    }
    return;
  }

  // Reflexos de Morte dispara por ter sido atacada, antes de saber quem morre
  const anexosDoDefensor = [...defensor.anexos];

  const statsDefensor = statsAtuais(defensor, defensorLado.campo);
  const vidaDefensorAntes = statsDefensor.defense;

  atacante.atacouNoTurno = estado.turno;
  const atacanteAtropela = temPalavraChave(atacante, 'atropelar');

  // ordem dos golpes: simultânea, salvo MARCIAL de um dos lados
  const primeiroGolpe = quemGolpeiaPrimeiro(atacante, defensor);
  let danoAoDefensor = 0;
  let danoAoAtacante = 0;
  if (primeiroGolpe === 'defensor') {
    danoAoAtacante = golpear(atacante, atacanteLado.campo, statsDefensor.attack, estado.turno);
    if (segueVivo(atacante, atacanteLado.campo)) {
      danoAoDefensor = golpear(defensor, defensorLado.campo, statsAtacante.attack, estado.turno);
    }
  } else {
    danoAoDefensor = golpear(defensor, defensorLado.campo, statsAtacante.attack, estado.turno);
    if (primeiroGolpe !== 'atacante' || segueVivo(defensor, defensorLado.campo)) {
      danoAoAtacante = golpear(atacante, atacanteLado.campo, statsDefensor.attack, estado.turno);
    }
  }

  eventos.push({
    tipo: 'COMBATE',
    atacante: { lado, slot, uid: atacante.uid },
    defensor: { lado: ladoOposto(lado), slot, uid: defensor.uid },
    danoAoDefensor,
    danoAoAtacante,
  });

  // paridade com o legado: o atacante é verificado (e destruído) primeiro
  const atacanteDestruido = !segueVivo(atacante, atacanteLado.campo);
  if (atacanteDestruido) {
    removerCriaturaDoCampo(estado, lado, slot, eventos, {
      pontuar: true,
      emBatalha: true,
      destruidor: { lado: ladoOposto(lado), slot },
    });
  }
  const defensorDestruido =
    !!defensorLado.campo[slot] && !segueVivo(defensorLado.campo[slot]!, defensorLado.campo);
  if (defensorDestruido) {
    removerCriaturaDoCampo(estado, ladoOposto(lado), slot, eventos, {
      pontuar: true,
      emBatalha: true,
      destruidor: { lado, slot },
    });
  }

  // gatilhos de ataque dos anexos, com a lista pré-batalha (legado)
  const atacanteRestaurado = atacanteLado.campo[slot];
  aoCriaturaAtacar(
    estado,
    lado,
    atacanteRestaurado ?? { ...atacante, anexos: anexosDoAtacante },
    eventos,
  );
  aoCriaturaSerAtacada(estado, ladoOposto(lado), anexosDoDefensor);

  if (atacanteAtropela) {
    const excedente = Math.max(0, danoAoDefensor - vidaDefensorAntes);
    if (excedente > 0) {
      aplicarDanoDireto(estado, ladoOposto(lado), excedente, atacante.uid, eventos);
      aoCausarDanoAoJogador(estado, lado, anexosDoAtacante);
    }
  }

  // VORPAL de cada lado, para quem derrubou a criatura oposta nesta batalha
  if (defensorDestruido) {
    aplicarDanoVorpal(estado, lado, atacante, anexosDoAtacante, eventos);
  }
  if (atacanteDestruido) {
    aplicarDanoVorpal(estado, ladoOposto(lado), defensor, anexosDoDefensor, eventos);
  }
}
