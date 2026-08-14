import { cartaPorId } from '../data/cartas.ts';
import type { AcaoDeGatilho, Atributo, GatilhoTipo } from '../data/tipos.ts';
import { cartaCasaComFiltro, criaturaCasaComFiltro, temPalavraChave } from './cartasEmJogo.ts';
import type { Evento } from './eventos.ts';
import type {
  AnexoEmCampo,
  CriaturaEmCampo,
  EstadoDoJogo,
  GatilhoPendente,
  LadoId,
} from './estado.ts';
import { statsAtuais } from './stats.ts';
import { comprarCartas } from './zonas.ts';

/**
 * Coleta e disparos imediatos de gatilhos. Ações que exigem escolha viram
 * trabalhos na fila (resolvidos em efeitos.ts); ações automáticas (marcadores,
 * cenário, heróis) aplicam aqui mesmo.
 */

export function aplicarMarcador(
  criatura: CriaturaEmCampo,
  lado: LadoId,
  stats: Atributo[],
  valor: number,
  eventos: Evento[],
): void {
  if (!valor) return;
  const attack = stats.includes('attack') ? valor : 0;
  const defense = stats.includes('defense') ? valor : 0;
  criatura.marcadores.attack += attack;
  criatura.marcadores.defense += defense;
  eventos.push({ tipo: 'MARCADOR_ADICIONADO', lado, criaturaUid: criatura.uid, attack, defense });
}

function habilidadesDeGatilho(criatura: CriaturaEmCampo) {
  if (criatura.cartaId === null) return [];
  const carta = cartaPorId(criatura.cartaId);
  if (carta.tipo !== 'criatura') return [];
  return carta.triggeredAbilities ?? [];
}

/** Lobo do Uivo: outra criatura (que case com o filtro) entrou no seu campo. */
export function aoOutraCriaturaEntrar(
  estado: EstadoDoJogo,
  lado: LadoId,
  entrou: CriaturaEmCampo,
  eventos: Evento[],
): void {
  for (const fonte of estado.lados[lado].campo) {
    if (!fonte || fonte.uid === entrou.uid) continue;
    for (const habilidade of habilidadesDeGatilho(fonte)) {
      if (habilidade.trigger !== 'other_creature_enters') continue;
      if (!criaturaCasaComFiltro(entrou, habilidade.filter)) continue;
      if (habilidade.action.type === 'add_permanent_marker') {
        const alvo = habilidade.action.target === 'self' ? fonte : entrou;
        aplicarMarcador(alvo, lado, habilidade.action.stats, habilidade.action.value, eventos);
      }
    }
  }
}

/**
 * Uma ação de descarte só entra na corrente se o motor conseguir resolvê-la
 * AGORA — sem alvo disponível ela viraria uma pergunta sem resposta possível.
 */
function acaoDeDescarteAplicavel(
  estado: EstadoDoJogo,
  lado: LadoId,
  acao: AcaoDeGatilho,
): boolean {
  const dono = estado.lados[lado];
  switch (acao.type) {
    case 'add_marker_to_your_creature':
      return dono.campo.some((slot) => slot !== null);
    case 'summon_token':
      return dono.campo.some((slot) => slot === null);
    case 'summon_from_deck':
      return (
        dono.campo.some((slot) => slot === null) &&
        dono.deck.some((no) => cartaCasaComFiltro(no.cartaId, acao.filter))
      );
    case 'choose_enemy_creature_prevent_attack_next_turn':
      return estado.lados[lado === 'a' ? 'b' : 'a'].campo.some((slot) => slot !== null);
    default:
      return false;
  }
}

/** Descartes da mesma leva entram no mesmo lote (o buffer do legado agrupava
 * tudo do mesmo tick), e empate de prioridade vira escolha de ordem. */
function enfileirarLote(estado: EstadoDoJogo, lote: GatilhoPendente[]): void {
  if (!lote.length) return;
  const cauda = estado.fila[estado.fila.length - 1];
  if (cauda?.tipo === 'lote_de_gatilhos') {
    cauda.gatilhos.push(...lote);
    return;
  }
  estado.fila.push({ tipo: 'lote_de_gatilhos', gatilhos: lote });
}

/**
 * Uma carta de criatura chegou ao descarte do dono: corrente opcional do
 * `sent_to_your_discard` (Mímico, vale vindo de qualquer zona) e, quando ela
 * veio do CAMPO, também do `sent_from_field_to_your_discard` (Lobo das Presas
 * Prateadas, Poltergeist, Ceifador).
 */
export function aoCartaDeCriaturaChegarNoDescarte(
  estado: EstadoDoJogo,
  lado: LadoId,
  cartaId: number,
  uid: string,
  doCampo = false,
): void {
  const carta = cartaPorId(cartaId);
  if (carta.tipo !== 'criatura') return;

  const lote: GatilhoPendente[] = [];
  for (const habilidade of carta.triggeredAbilities ?? []) {
    const vale =
      habilidade.trigger === 'sent_to_your_discard' ||
      (doCampo && habilidade.trigger === 'sent_from_field_to_your_discard');
    if (!vale) continue;
    if (!acaoDeDescarteAplicavel(estado, lado, habilidade.action)) continue;
    lote.push({
      lado,
      origemUid: uid,
      origemCartaId: cartaId,
      acao: habilidade.action,
      prioridade: 20,
    });
  }
  enfileirarLote(estado, lote);
}

/**
 * Uma criatura real saiu do CAMPO para o descarte: marcadores imediatos de
 * quem ficou (Badur, o Urso Guardião) + a corrente da própria carta.
 */
export function aoCriaturaSairDoCampoParaDescarte(
  estado: EstadoDoJogo,
  lado: LadoId,
  descartada: CriaturaEmCampo,
  eventos: Evento[],
): void {
  for (const fonte of estado.lados[lado].campo) {
    if (!fonte || fonte.uid === descartada.uid) continue;
    for (const habilidade of habilidadesDeGatilho(fonte)) {
      if (habilidade.trigger !== 'other_creature_sent_to_your_discard') continue;
      if (!criaturaCasaComFiltro(descartada, habilidade.filter)) continue;
      if (habilidade.action.type === 'add_permanent_marker' && habilidade.action.target === 'self') {
        aplicarMarcador(fonte, lado, habilidade.action.stats, habilidade.action.value, eventos);
      }
    }
  }
  cenarioAoCriaturaIrParaDescarte(estado, lado, descartada);
  if (descartada.cartaId !== null) {
    aoCartaDeCriaturaChegarNoDescarte(estado, lado, descartada.cartaId, descartada.uid, true);
  }
}

/** Caverna do Guardião Badur: Besta sua foi ao descarte → buff opcional no Urso. */
function cenarioAoCriaturaIrParaDescarte(
  estado: EstadoDoJogo,
  lado: LadoId,
  descartada: CriaturaEmCampo,
): void {
  const dono = estado.lados[lado];
  if (!dono.cenario) return;
  const carta = cartaPorId(dono.cenario.cartaId);
  if (carta.tipo !== 'cenario') return;

  const lote: GatilhoPendente[] = [];
  for (const efeito of carta.effects) {
    if (efeito.type !== 'buff_named_on_your_creature_to_discard') continue;
    if (!criaturaCasaComFiltro(descartada, efeito.when)) continue;
    const temAlvo = dono.campo.some(
      (criatura) =>
        criatura !== null &&
        criatura.uid !== descartada.uid &&
        criaturaCasaComFiltro(criatura, efeito.target),
    );
    if (!temAlvo) continue;
    lote.push({
      lado,
      origemUid: dono.cenario.uid,
      origemCartaId: carta.id,
      acao: {
        type: 'choose_your_creature_temporary_modify',
        filter: efeito.target,
        stats: efeito.stats,
        value: efeito.value,
      },
      prioridade: 20,
    });
  }
  enfileirarLote(estado, lote);
}

/** Reflexos de Morte: gatilhos `attached_creature_is_attacked` do defensor. */
export function aoCriaturaSerAtacada(
  estado: EstadoDoJogo,
  lado: LadoId,
  anexos: readonly AnexoEmCampo[],
): void {
  enfileirarGatilhosDeAnexos(estado, lado, anexos, 'attached_creature_is_attacked');
}

/** Mapa do Tesouro: gatilhos `attached_creature_deals_player_damage`. */
export function aoCausarDanoAoJogador(
  estado: EstadoDoJogo,
  lado: LadoId,
  anexos: readonly AnexoEmCampo[],
): void {
  enfileirarGatilhosDeAnexos(estado, lado, anexos, 'attached_creature_deals_player_damage');
}

function enfileirarGatilhosDeAnexos(
  estado: EstadoDoJogo,
  lado: LadoId,
  anexos: readonly AnexoEmCampo[],
  gatilho: GatilhoTipo,
): void {
  for (const anexo of anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
    for (const habilidade of carta.triggeredAbilities ?? []) {
      if (habilidade.trigger !== gatilho) continue;
      estado.fila.push({
        tipo: 'gatilho',
        gatilho: {
          lado,
          origemUid: anexo.uid,
          origemCartaId: anexo.cartaId,
          acao: habilidade.action,
          prioridade: 50,
        },
      });
    }
  }
}

/** Posse de Objetos Inanimados: anexo saiu do campo para o descarte fora da batalha. */
export function aoAnexoIrParaDescarte(
  estado: EstadoDoJogo,
  lado: LadoId,
  anexoUid: string,
  anexoCartaId: number,
  foraDeBatalha: boolean,
): void {
  if (!foraDeBatalha) return;
  const carta = cartaPorId(anexoCartaId);
  if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') return;
  for (const habilidade of carta.triggeredAbilities ?? []) {
    if (habilidade.trigger !== 'attachment_sent_from_field_to_your_discard_outside_battle') continue;
    estado.fila.push({
      tipo: 'gatilho',
      gatilho: {
        lado,
        origemUid: anexoUid,
        origemCartaId: anexoCartaId,
        acao: habilidade.action,
        prioridade: 50,
      },
    });
  }
}

/** Gatilhos `attached_creature_attacks` dos anexos do atacante. */
export function aoCriaturaAtacar(
  estado: EstadoDoJogo,
  lado: LadoId,
  atacante: CriaturaEmCampo,
  eventos: Evento[],
): void {
  for (const anexo of atacante.anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
    for (const habilidade of carta.triggeredAbilities ?? []) {
      if (habilidade.trigger !== 'attached_creature_attacks') continue;
      const acao = habilidade.action;
      if (acao.type === 'temporary_modify_allied_creatures') {
        // Guardião Enlouquecido: buff automático nas OUTRAS aliadas que casam
        for (const aliada of estado.lados[lado].campo) {
          if (!aliada || !criaturaCasaComFiltro(aliada, acao.filter)) continue;
          if (acao.exclude_source && aliada.uid === atacante.uid) continue;
          const attack = acao.stats.includes('attack') ? acao.value : 0;
          const defense = acao.stats.includes('defense') ? acao.value : 0;
          aliada.modificadoresTemporarios.push({ attack, defense, expiraAposTurno: estado.turno });
          eventos.push({
            tipo: 'MODIFICADOR_TEMPORARIO',
            lado,
            criaturaUid: aliada.uid,
            attack,
            defense,
          });
        }
      } else {
        estado.fila.push({
          tipo: 'gatilho',
          gatilho: {
            lado,
            origemUid: anexo.uid,
            origemCartaId: anexo.cartaId,
            acao,
            prioridade: 50,
          },
        });
      }
    }
  }
}

/** Caverna do Guardião Badur: 1ª criatura inimiga destruída em batalha no turno. */
export function cenarioAoDestruirEmBatalha(
  estado: EstadoDoJogo,
  ladoDestruido: LadoId,
  eventos: Evento[],
): void {
  const ladoDono: LadoId = ladoDestruido === 'a' ? 'b' : 'a';
  const dono = estado.lados[ladoDono];
  if (!dono.cenario) return;
  const carta = cartaPorId(dono.cenario.cartaId);
  if (carta.tipo !== 'cenario') return;

  for (const efeito of carta.effects) {
    if (efeito.type !== 'draw_on_first_enemy_battle_destroyed') continue;
    if (
      efeito.requiresYourCreature &&
      !dono.campo.some(
        (criatura) => criatura !== null && criaturaCasaComFiltro(criatura, efeito.requiresYourCreature),
      )
    ) {
      continue;
    }
    const chave = `${carta.id}:${efeito.type}`;
    if (efeito.oncePerTurn && dono.cenarioFlags[chave]) continue;
    dono.cenarioFlags[chave] = true;
    eventos.push({ tipo: 'CENARIO_ATIVOU', lado: ladoDono, cartaId: carta.id });
    comprarCartas(estado, ladoDono, Math.max(1, efeito.value), eventos);
  }
}

/** Herói Badur (Pele de Pedra): +1 de vida máxima a criatura Terra ao entrar. */
export function heroiAoEntrarCriatura(
  estado: EstadoDoJogo,
  lado: LadoId,
  criatura: CriaturaEmCampo,
  eventos: Evento[],
): void {
  const dono = estado.lados[lado];
  if (dono.heroi !== 'badur') return;
  if (criatura.peleDePedraAplicada) return;
  const carta = criatura.cartaId === null ? null : cartaPorId(criatura.cartaId);
  const elemento = criatura.elementoAlterado ?? (carta?.tipo === 'criatura' ? carta.elemento : criatura.ficha?.elemento);
  if (elemento !== 'terra') return;
  criatura.peleDePedraAplicada = true;
  eventos.push({ tipo: 'HEROI_ATIVADO', lado, heroi: 'badur' });
  aplicarMarcador(criatura, lado, ['defense'], 1, eventos);
}

/**
 * REGENERAR: no início do turno do dono, cada criatura dele com a palavra
 * recupera 1 de vida. Só cura o que está ferido — a palavra não passa da vida
 * impressa. Resolve antes do herói (decisão nº 13).
 */
export function regenerarNoInicioDoTurno(
  estado: EstadoDoJogo,
  lado: LadoId,
  eventos: Evento[],
): void {
  for (const criatura of estado.lados[lado].campo) {
    if (!criatura || criatura.dano <= 0) continue;
    if (!temPalavraChave(criatura, 'regenerar')) continue;
    criatura.dano -= 1;
    eventos.push({ tipo: 'CURA_EM_CRIATURA', lado, criaturaUid: criatura.uid, valor: 1 });
  }
}

/** Herói Ispisher (Maré Restauradora): cura 1 da aliada ferida com menos vida. */
export function heroiNoInicioDoTurno(estado: EstadoDoJogo, lado: LadoId, eventos: Evento[]): void {
  const dono = estado.lados[lado];
  if (dono.heroi !== 'ispisher') return;

  let alvo: CriaturaEmCampo | null = null;
  let menorVida = Infinity;
  for (const criatura of dono.campo) {
    if (!criatura || criatura.dano <= 0) continue;
    const vida = statsAtuais(criatura, dono.campo).defense;
    if (vida > 0 && vida < menorVida) {
      menorVida = vida;
      alvo = criatura;
    }
  }
  if (!alvo) return;
  alvo.dano = Math.max(0, alvo.dano - 1);
  eventos.push({ tipo: 'HEROI_ATIVADO', lado, heroi: 'ispisher' });
  eventos.push({ tipo: 'CURA_EM_CRIATURA', lado, criaturaUid: alvo.uid, valor: 1 });
}
