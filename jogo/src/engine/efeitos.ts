import { cartaPorId } from '../data/cartas.ts';
import type {
  AcaoAoAnexar,
  AcaoAoEntrar,
  Carta,
  CustoDeAtivacao,
  Elemento,
  FiltroCarta,
  HabilidadeAtivada,
} from '../data/tipos.ts';
import { podeSerAlvoDeAtaque, danoDeEfeitoEmCriatura, removerCriaturaDoCampo, resolverAtaqueImediato } from './combate.ts';
import { cartaCasaComFiltro, criaturaCasaComFiltro, defDaCriatura } from './cartasEmJogo.ts';
import type { Evento } from './eventos.ts';
import {
  MAO_MAXIMA,
  SLOTS_POR_LADO,
  ladoOposto,
  type ContextoDePendencia,
  type CriaturaEmCampo,
  type EstadoDoJogo,
  type GatilhoPendente,
  type LadoId,
  type OpcaoDePendencia,
  type Pendencia,
  type Trabalho,
} from './estado.ts';
import {
  aoCartaDeCriaturaChegarNoDescarte,
  aoAnexoIrParaDescarte,
  aoOutraCriaturaEntrar,
  aplicarMarcador,
  heroiAoEntrarCriatura,
} from './gatilhos.ts';
import { inteiroAleatorio, embaralhar } from './rng.ts';
import { statsAtuais } from './stats.ts';
import { comprarCartas } from './zonas.ts';

/**
 * Orquestração dos efeitos: processa a fila de trabalhos até esvaziar ou até
 * precisar de decisão humana (vira `pendencia`); o RESPONDER retoma daqui.
 */

// ── infraestrutura de pendências ─────────────────────────────────────────────

function criarPendencia(
  estado: EstadoDoJogo,
  dados: Omit<Pendencia, 'id'>,
): void {
  estado.pendencia = { id: `p${estado.proximoUid++}`, ...dados };
}

const OPCOES_SIM_NAO: OpcaoDePendencia[] = [
  { id: 'sim', rotulo: 'Sim' },
  { id: 'nao', rotulo: 'Não' },
];

function opcaoDeSlot(estado: EstadoDoJogo, lado: LadoId, slot: number): OpcaoDePendencia {
  const criatura = estado.lados[lado].campo[slot];
  const nome = criatura ? defDaCriatura(criatura).nome : '(vazio)';
  return { id: `${lado}:${slot}`, rotulo: nome };
}

function slotsComCriatura(
  estado: EstadoDoJogo,
  lado: LadoId,
  filtro?: FiltroCarta,
): number[] {
  const slots: number[] = [];
  estado.lados[lado].campo.forEach((criatura, slot) => {
    if (criatura && criaturaCasaComFiltro(criatura, filtro)) slots.push(slot);
  });
  return slots;
}

// ── fila ─────────────────────────────────────────────────────────────────────

export function processarFila(estado: EstadoDoJogo, eventos: Evento[]): void {
  while (!estado.pendencia && !estado.vencedor && estado.fila.length) {
    const trabalho = estado.fila.shift()!;
    executarTrabalho(estado, trabalho, eventos);
  }
  // a janela de reação só abre depois que todos os efeitos da jogada resolveram
  if (!estado.pendencia && !estado.vencedor && !estado.fila.length) {
    oferecerReacao(estado);
  }
}

function executarTrabalho(estado: EstadoDoJogo, trabalho: Trabalho, eventos: Evento[]): void {
  switch (trabalho.tipo) {
    case 'atacar':
      executarAtaque(estado, trabalho, eventos);
      return;
    case 'lote_de_gatilhos': {
      const validos = trabalho.gatilhos;
      if (!validos.length) return;
      if (validos.length === 1) {
        executarGatilho(estado, validos[0]!, eventos);
        return;
      }
      criarPendencia(estado, {
        lado: validos[0]!.lado,
        tipo: 'escolher_ordem',
        titulo: 'Escolha o próximo efeito da corrente',
        opcoes: validos.map((gatilho, indice) => ({
          id: String(indice),
          rotulo: cartaPorId(gatilho.origemCartaId).nome,
        })),
        podeRecusar: false,
        contexto: { tipo: 'ordem_da_corrente', gatilhos: validos },
      });
      return;
    }
    case 'gatilho':
      executarGatilho(estado, trabalho.gatilho, eventos);
      return;
    case 'on_enter':
      executarAoEntrar(estado, trabalho.lado, trabalho.efeito, eventos);
      return;
    case 'on_attach':
      executarAoAnexar(estado, trabalho.lado, trabalho.slot, trabalho.anexoUid, trabalho.efeito, eventos);
      return;
  }
}

// ── ataque com janela de escudo ──────────────────────────────────────────────

export function agendarAtaque(estado: EstadoDoJogo, lado: LadoId, slot: number): void {
  estado.fila.push({ tipo: 'atacar', lado, slot });
}

function executarAtaque(
  estado: EstadoDoJogo,
  trabalho: Trabalho & { tipo: 'atacar' },
  eventos: Evento[],
): void {
  const { lado, slot } = trabalho;
  const atacante = estado.lados[lado].campo[slot];
  if (!atacante) return;
  const ladoDefensor = ladoOposto(lado);
  const defensor = estado.lados[ladoDefensor].campo[slot];

  if (defensor) {
    // Proteção do Escudeiro: qualquer anexo do defensor com o gatilho, ainda
    // não usado no turno, cujo filtro case com a criatura atacada. A oferta
    // marca o uso mesmo se recusada (paridade com o legado).
    for (let anexoDonoSlot = 0; anexoDonoSlot < SLOTS_POR_LADO; anexoDonoSlot++) {
      const portadora = estado.lados[ladoDefensor].campo[anexoDonoSlot];
      if (!portadora) continue;
      for (const anexo of portadora.anexos) {
        if (anexo.escudoUsadoNoTurno === estado.turno) continue;
        const carta = cartaPorId(anexo.cartaId);
        if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
        const habilidade = (carta.triggeredAbilities ?? []).find(
          (h) =>
            h.trigger === 'your_creature_matching_is_targeted_by_attack' &&
            h.action.type === 'optional_discard_self_prevent_attack',
        );
        if (!habilidade) continue;
        const filtro =
          habilidade.action.type === 'optional_discard_self_prevent_attack'
            ? habilidade.action.filter
            : undefined;
        if (!criaturaCasaComFiltro(defensor, filtro)) continue;

        anexo.escudoUsadoNoTurno = estado.turno;
        criarPendencia(estado, {
          lado: ladoDefensor,
          tipo: 'sim_nao',
          titulo: `${carta.nome}: enviar ao descarte para negar o ataque contra ${defDaCriatura(defensor).nome}?`,
          opcoes: OPCOES_SIM_NAO,
          podeRecusar: false,
          contexto: { tipo: 'escudo', trabalhoAtaque: trabalho, anexoDonoSlot, anexoUid: anexo.uid },
        });
        return;
      }
    }
  }

  resolverAtaqueImediato(estado, lado, slot, eventos);
}

function negarAtaqueComEscudo(
  estado: EstadoDoJogo,
  contexto: ContextoDePendencia & { tipo: 'escudo' },
  eventos: Evento[],
): void {
  const ladoDefensor = ladoOposto(contexto.trabalhoAtaque.lado);
  const portadora = estado.lados[ladoDefensor].campo[contexto.anexoDonoSlot];
  if (!portadora) return;
  const indice = portadora.anexos.findIndex((anexo) => anexo.uid === contexto.anexoUid);
  if (indice < 0) return;
  const [anexo] = portadora.anexos.splice(indice, 1);
  estado.lados[ladoDefensor].descarte.push({ uid: anexo!.uid, cartaId: anexo!.cartaId });
  eventos.push({
    tipo: 'ANEXO_DESCARTADO',
    lado: ladoDefensor,
    slot: contexto.anexoDonoSlot,
    carta: { uid: anexo!.uid, cartaId: anexo!.cartaId },
  });
  eventos.push({
    tipo: 'ATAQUE_NEGADO',
    lado: contexto.trabalhoAtaque.lado,
    slot: contexto.trabalhoAtaque.slot,
    anexoCartaId: anexo!.cartaId,
  });
}

// ── janela de reação (7s no legado solo) ─────────────────────────────────────

/**
 * Agenda a oferta de reação para o oponente da jogada. A pendência em si só é
 * criada por `oferecerReacao`, quando a fila de efeitos esvaziar — a reação do
 * legado é pós-jogada (a ação já resolveu), não uma interrupção em pilha.
 */
export function agendarReacao(
  estado: EstadoDoJogo,
  contra: LadoId,
  rotulo: string,
  categoria: 'comando' | 'habilidade',
): void {
  estado.reacaoPendente = { contra, rotulo, categoria };
}

function oferecerReacao(estado: EstadoDoJogo): void {
  const janela = estado.reacaoPendente;
  if (!janela) return;
  estado.reacaoPendente = null;
  const reator = janela.contra;

  if (janela.categoria === 'comando') {
    const candidatas = comandosJogaveis(estado, reator);
    if (!candidatas.length) return;
    criarPendencia(estado, {
      lado: reator,
      tipo: 'escolher_carta',
      titulo: `O oponente ${janela.rotulo}. Responder com um comando?`,
      opcoes: candidatas.map((naMao) => ({
        id: naMao.uid,
        rotulo: cartaPorId(naMao.cartaId).nome,
      })),
      podeRecusar: true,
      reacao: true,
      contexto: { tipo: 'reagir_comando', lado: reator },
    });
    return;
  }

  const slots = slotsComHabilidadeUtilizavel(estado, reator);
  if (!slots.length) return;
  criarPendencia(estado, {
    lado: reator,
    tipo: 'escolher_alvo',
    titulo: `O oponente ${janela.rotulo}. Ativar uma habilidade de criatura?`,
    opcoes: slots.map((slot) => opcaoDeSlot(estado, reator, slot)),
    podeRecusar: true,
    reacao: true,
    contexto: { tipo: 'reagir_habilidade', lado: reator },
  });
}

function alvoDeComando(carta: Carta): 'enemy_creature' | 'your_creature' | null {
  if (carta.tipo !== 'comando') return null;
  for (const efeito of carta.effects ?? []) {
    if ('target' in efeito && (efeito.target === 'enemy_creature' || efeito.target === 'your_creature')) {
      return efeito.target;
    }
  }
  return null;
}

/** Comandos da mão que podem resolver agora (alvo disponível quando exigido). */
function comandosJogaveis(estado: EstadoDoJogo, lado: LadoId) {
  return estado.lados[lado].mao.filter((naMao) => {
    const carta = cartaPorId(naMao.cartaId);
    if (carta.tipo !== 'comando' || !carta.effects?.length) return false;
    const alvo = alvoDeComando(carta);
    if (!alvo) return true;
    const ladoDoAlvo = alvo === 'enemy_creature' ? ladoOposto(lado) : lado;
    return slotsComCriatura(estado, ladoDoAlvo).length > 0;
  });
}

/**
 * Só entram na oferta habilidades que o motor sabe resolver e cujo custo é
 * pagável — oferecer uma opção fadada a erro travaria a janela.
 */
function habilidadeUtilizavelEmReacao(
  estado: EstadoDoJogo,
  lado: LadoId,
  criatura: CriaturaEmCampo,
): HabilidadeAtivada | null {
  if (criatura.cartaId === null) return null;
  const carta = cartaPorId(criatura.cartaId);
  if (carta.tipo !== 'criatura') return null;
  for (const habilidade of carta.activatedAbilities ?? []) {
    if (habilidade.source !== 'field_creature') continue;
    if (
      habilidade.timing === 'once_per_turn' &&
      criatura.habilidadesUsadas[habilidade.id] === estado.turno
    ) {
      continue;
    }
    if (!custoPagavel(criatura, habilidade.cost)) continue;
    const acao = habilidade.action;
    if (acao.type === 'cannot_attack_next_turn') return habilidade;
    if (acao.type === 'summon_from_discard') {
      const dono = estado.lados[lado];
      const temAlvo = dono.descarte.some((no) => cartaCasaComFiltro(no.cartaId, acao.filter));
      const teraVaga =
        dono.campo.some((c) => c === null) || habilidade.cost?.type === 'sacrifice_self';
      if (temAlvo && teraVaga) return habilidade;
    }
  }
  return null;
}

function custoPagavel(criatura: CriaturaEmCampo, custo: CustoDeAtivacao | undefined): boolean {
  if (!custo) return true;
  if (custo.type === 'sacrifice_self') return true;
  if (custo.type === 'destroy_attachment') {
    const inclui = custo.name_includes.toLowerCase();
    return criatura.anexos.some((anexo) =>
      cartaPorId(anexo.cartaId).nome.toLowerCase().includes(inclui),
    );
  }
  return false;
}

function slotsComHabilidadeUtilizavel(estado: EstadoDoJogo, lado: LadoId): number[] {
  const slots: number[] = [];
  estado.lados[lado].campo.forEach((criatura, slot) => {
    if (criatura && habilidadeUtilizavelEmReacao(estado, lado, criatura)) slots.push(slot);
  });
  return slots;
}

// ── gatilhos com escolha ─────────────────────────────────────────────────────

function executarGatilho(estado: EstadoDoJogo, gatilho: GatilhoPendente, eventos: Evento[]): void {
  const acao = gatilho.acao;
  const nomeDaFonte = cartaPorId(gatilho.origemCartaId).nome;

  switch (acao.type) {
    case 'add_marker_to_your_creature': {
      if (!slotsComCriatura(estado, gatilho.lado).length) return;
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'sim_nao',
        titulo: `${nomeDaFonte}: ativar o efeito do descarte?`,
        opcoes: OPCOES_SIM_NAO,
        podeRecusar: false,
        contexto: { tipo: 'gatilho_opcional', gatilho },
      });
      return;
    }
    // Ceifador: a ficha não é opcional ("crie uma ficha"), entra direto
    case 'summon_token': {
      invocarFicha(estado, gatilho.lado, acao.token, eventos);
      return;
    }
    case 'summon_from_deck': {
      if (!temNoDeck(estado, gatilho.lado, acao.filter)) return;
      if (!estado.lados[gatilho.lado].campo.some((slot) => slot === null)) return;
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'sim_nao',
        titulo: `${nomeDaFonte}: invocar outra cópia do seu baralho?`,
        opcoes: OPCOES_SIM_NAO,
        podeRecusar: false,
        contexto: { tipo: 'gatilho_opcional', gatilho },
      });
      return;
    }
    case 'draw_then_discard': {
      if (!estado.lados[gatilho.lado].deck.length) return;
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'sim_nao',
        titulo: `${nomeDaFonte}: comprar ${acao.draw} e descartar ${acao.discard}?`,
        opcoes: OPCOES_SIM_NAO,
        podeRecusar: false,
        contexto: { tipo: 'gatilho_opcional', gatilho },
      });
      return;
    }
    // Sapomerlim / Sapotristan / Caverna do Guardião: escolha entre as suas
    case 'choose_your_creature_change_element_until_end_turn':
    case 'choose_creature_swap_stats_while_element_changed':
    case 'choose_your_creature_temporary_modify': {
      const excluir =
        acao.type === 'choose_your_creature_change_element_until_end_turn'
          ? gatilho.disparadorUid
          : undefined;
      const slots = estado.lados[gatilho.lado].campo.flatMap((criatura, slot) =>
        criatura && criaturaCasaComFiltro(criatura, acao.filter, excluir) ? [slot] : [],
      );
      if (!slots.length) return;
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'escolher_alvo',
        titulo: `${nomeDaFonte}: escolha uma criatura sua.`,
        opcoes: slots.map((slot) => opcaoDeSlot(estado, gatilho.lado, slot)),
        podeRecusar: true,
        contexto: { tipo: 'gatilho_alvo', gatilho },
      });
      return;
    }
    case 'optional_draw_cards': {
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'sim_nao',
        titulo: `${nomeDaFonte}: comprar ${acao.count} carta(s)?`,
        opcoes: OPCOES_SIM_NAO,
        podeRecusar: false,
        contexto: { tipo: 'gatilho_opcional', gatilho },
      });
      return;
    }
    case 'choose_enemy_creature_then_prevent_attack':
    case 'choose_enemy_creature_prevent_attack_next_turn':
    case 'choose_enemy_creature_then_deal_damage': {
      const inimigo = ladoOposto(gatilho.lado);
      const slots = slotsComCriatura(estado, inimigo);
      if (!slots.length) return;
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'escolher_alvo',
        titulo: `${nomeDaFonte}: escolha uma criatura inimiga.`,
        opcoes: slots.map((slot) => opcaoDeSlot(estado, inimigo, slot)),
        podeRecusar: true,
        contexto: { tipo: 'gatilho_alvo', gatilho },
      });
      return;
    }
    case 'optional_swap_allied_creature_stats_until_end_turn': {
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'sim_nao',
        titulo: `${nomeDaFonte}: trocar ATQ e VIDA de uma criatura até o fim do turno?`,
        opcoes: OPCOES_SIM_NAO,
        podeRecusar: false,
        contexto: {
          tipo: 'coracao_swap',
          lado: gatilho.lado,
          slot: slotDaCriatura(estado, gatilho.lado, gatilho.disparadorUid ?? '') ?? 0,
          anexoUid: gatilho.origemUid,
          devolverParaMao: acao.return_attachment_to_hand === true,
        },
      });
      return;
    }
    default:
      // ações sem implementação no legado ficam para o milestone de paridade
      return;
  }
}

function continuarGatilhoAceito(
  estado: EstadoDoJogo,
  gatilho: GatilhoPendente,
  eventos: Evento[],
): void {
  const acao = gatilho.acao;
  if (acao.type === 'optional_draw_cards') {
    comprarCartas(estado, gatilho.lado, acao.count, eventos);
    return;
  }
  if (acao.type === 'summon_from_deck') {
    invocarDoDeck(estado, gatilho.lado, acao.filter, acao.count, eventos);
    return;
  }
  if (acao.type === 'draw_then_discard') {
    comprarCartas(estado, gatilho.lado, acao.draw, eventos);
    const mao = estado.lados[gatilho.lado].mao;
    if (!mao.length || acao.discard <= 0) return;
    criarPendencia(estado, {
      lado: gatilho.lado,
      tipo: 'escolher_carta',
      titulo: `${cartaPorId(gatilho.origemCartaId).nome}: escolha a carta para descartar.`,
      opcoes: mao.map((naMao) => ({ id: naMao.uid, rotulo: cartaPorId(naMao.cartaId).nome })),
      podeRecusar: false,
      contexto: { tipo: 'mapa_descartar', lado: gatilho.lado },
    });
    return;
  }
  if (acao.type === 'add_marker_to_your_creature') {
    const slots = slotsComCriatura(estado, gatilho.lado);
    if (!slots.length) return;
    criarPendencia(estado, {
      lado: gatilho.lado,
      tipo: 'escolher_alvo',
      titulo: `${cartaPorId(gatilho.origemCartaId).nome}: escolha uma criatura aliada.`,
      opcoes: slots.map((slot) => opcaoDeSlot(estado, gatilho.lado, slot)),
      podeRecusar: true,
      contexto: { tipo: 'gatilho_alvo', gatilho },
    });
  }
}

function temNoDeck(estado: EstadoDoJogo, lado: LadoId, filtro: FiltroCarta): boolean {
  return estado.lados[lado].deck.some((no) => cartaCasaComFiltro(no.cartaId, filtro));
}

/** Lobo das Presas Prateadas: invoca do baralho e re-embaralha o que sobrou. */
function invocarDoDeck(
  estado: EstadoDoJogo,
  lado: LadoId,
  filtro: FiltroCarta,
  quantas: number,
  eventos: Evento[],
): void {
  const dono = estado.lados[lado];
  for (let feitas = 0; feitas < quantas; feitas++) {
    const slotVazio = dono.campo.findIndex((c) => c === null);
    if (slotVazio < 0) return;
    const indice = dono.deck.findIndex((no) => cartaCasaComFiltro(no.cartaId, filtro));
    if (indice < 0) return;
    const [doDeck] = dono.deck.splice(indice, 1);
    const invocada = novaCriaturaEmCampo(estado, doDeck!.uid, doDeck!.cartaId, {});
    dono.campo[slotVazio] = invocada;
    eventos.push({ tipo: 'INVOCADA_DO_DECK', lado, slot: slotVazio, carta: doDeck! });
    heroiAoEntrarCriatura(estado, lado, invocada, eventos);
    aoEntrarEmCampo(estado, lado, slotVazio);
    aoOutraCriaturaEntrar(estado, lado, invocada, eventos);
  }
}

function executarGatilhoComAlvo(
  estado: EstadoDoJogo,
  gatilho: GatilhoPendente,
  alvoLado: LadoId,
  alvoSlot: number,
  eventos: Evento[],
): void {
  const alvo = estado.lados[alvoLado].campo[alvoSlot];
  if (!alvo) return;
  const acao = gatilho.acao;

  switch (acao.type) {
    case 'add_marker_to_your_creature':
      aplicarMarcador(alvo, alvoLado, acao.stats, acao.value, eventos);
      return;
    case 'choose_enemy_creature_then_prevent_attack':
    case 'choose_enemy_creature_prevent_attack_next_turn': {
      alvo.naoPodeAtacarAteTurno = Math.max(alvo.naoPodeAtacarAteTurno ?? 0, estado.turno + 1);
      eventos.push({
        tipo: 'IMPEDIDA_DE_ATACAR',
        lado: alvoLado,
        criaturaUid: alvo.uid,
        ateTurno: estado.turno + 1,
      });
      return;
    }
    case 'choose_enemy_creature_then_deal_damage':
      danoDeEfeitoEmCriatura(estado, alvoLado, alvoSlot, acao.damage, eventos);
      return;
    // Sapomerlim: escolhida a criatura, falta o elemento
    case 'choose_your_creature_change_element_until_end_turn':
      criarPendencia(estado, {
        lado: gatilho.lado,
        tipo: 'escolher_elemento',
        titulo: 'Escolha o elemento até o fim do turno.',
        opcoes: ELEMENTOS_ESCOLHIVEIS.map((elemento) => ({ id: elemento, rotulo: elemento })),
        podeRecusar: false,
        contexto: { tipo: 'sapomerlim_elemento', lado: alvoLado, slot: alvoSlot },
      });
      return;
    // Sapotristan: a troca dura enquanto o elemento da escolhida estiver alterado
    case 'choose_creature_swap_stats_while_element_changed':
      alvo.trocaDeStatsComElementoAlterado = true;
      alvo.saqueAoMorrerComElementoAlterado = gatilho.lado;
      eventos.push({
        tipo: 'STATS_TROCADOS',
        lado: alvoLado,
        criaturaUid: alvo.uid,
        enquantoElementoAlterado: true,
      });
      return;
    // Caverna do Guardião Badur: +1 ATQ até o fim do turno no Urso escolhido
    case 'choose_your_creature_temporary_modify': {
      const attack = acao.stats.includes('attack') ? acao.value : 0;
      const defense = acao.stats.includes('defense') ? acao.value : 0;
      alvo.modificadoresTemporarios.push({ attack, defense, expiraAposTurno: estado.turno });
      eventos.push({
        tipo: 'MODIFICADOR_TEMPORARIO',
        lado: alvoLado,
        criaturaUid: alvo.uid,
        attack,
        defense,
      });
      return;
    }
    default:
      return;
  }
}

const ELEMENTOS_ESCOLHIVEIS: Elemento[] = [
  'fogo',
  'agua',
  'terra',
  'vento',
  'neutro',
  'vazio',
  'arcano',
];

// ── onEnter ──────────────────────────────────────────────────────────────────

export function aoEntrarEmCampo(estado: EstadoDoJogo, lado: LadoId, slot: number): void {
  const criatura = estado.lados[lado].campo[slot];
  if (!criatura || criatura.cartaId === null) return;
  const carta = cartaPorId(criatura.cartaId);
  if (carta.tipo !== 'criatura') return;
  for (const efeito of carta.onEnter ?? []) {
    estado.fila.push({ tipo: 'on_enter', lado, slot, efeito });
  }
}

function executarAoEntrar(
  estado: EstadoDoJogo,
  lado: LadoId,
  efeito: AcaoAoEntrar,
  eventos: Evento[],
): void {
  const dono = estado.lados[lado];

  switch (efeito.type) {
    case 'discard_hand_card_then_search_deck': {
      const candidatas = dono.mao.filter((naMao) =>
        cartaCasaComFiltro(naMao.cartaId, efeito.discard),
      );
      if (!candidatas.length) return;
      criarPendencia(estado, {
        lado,
        tipo: 'escolher_carta',
        titulo: 'Escolha a carta para descartar (busca no baralho em seguida).',
        opcoes: candidatas.map((naMao) => ({
          id: naMao.uid,
          rotulo: cartaPorId(naMao.cartaId).nome,
        })),
        podeRecusar: efeito.optional === true,
        contexto: { tipo: 'atlas_descartar', lado, buscar: efeito.search },
      });
      return;
    }
    case 'shuffle_discard_creature_then_debuff_enemy': {
      const indiceDescarte = dono.descarte.findIndex((no) => {
        const carta = cartaPorId(no.cartaId);
        return carta.tipo === 'criatura' && cartaCasaComFiltro(no.cartaId, efeito.discardFilter);
      });
      const inimigo = ladoOposto(lado);
      const alvoSlot = estado.lados[inimigo].campo.findIndex((c) => c !== null);
      if (indiceDescarte < 0 || alvoSlot < 0) return;

      const [embaralhada] = dono.descarte.splice(indiceDescarte, 1);
      dono.deck.push(embaralhada!);
      const resultado = embaralhar(estado.rng, dono.deck);
      estado.rng = resultado.rng;
      dono.deck = resultado.itens;
      eventos.push({ tipo: 'CARTA_EMBARALHADA_NO_DECK', lado, carta: embaralhada! });

      const cartaEmbaralhada = cartaPorId(embaralhada!.cartaId);
      const ataque = cartaEmbaralhada.tipo === 'criatura' ? cartaEmbaralhada.ataque : 0;
      const alvo = estado.lados[inimigo].campo[alvoSlot]!;
      alvo.modificadoresTemporarios.push({
        attack: -ataque,
        defense: 0,
        expiraAposTurno: estado.turno,
      });
      eventos.push({
        tipo: 'MODIFICADOR_TEMPORARIO',
        lado: inimigo,
        criaturaUid: alvo.uid,
        attack: -ataque,
        defense: 0,
      });
      return;
    }
  }
}

// ── onAttach ─────────────────────────────────────────────────────────────────

export function aoAnexar(estado: EstadoDoJogo, lado: LadoId, slot: number, anexoUid: string): void {
  const criatura = estado.lados[lado].campo[slot];
  if (!criatura) return;
  const anexo = criatura.anexos.find((a) => a.uid === anexoUid);
  if (!anexo) return;
  const carta = cartaPorId(anexo.cartaId);
  if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') return;
  for (const efeito of carta.onAttach ?? []) {
    estado.fila.push({ tipo: 'on_attach', lado, slot, anexoUid, efeito });
  }
}

function executarAoAnexar(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  anexoUid: string,
  efeito: AcaoAoAnexar,
  eventos: Evento[],
): void {
  const criatura = estado.lados[lado].campo[slot];

  switch (efeito.type) {
    case 'choose_creature_then_modify_stat': {
      const inimigo = ladoOposto(lado);
      const slots = slotsComCriatura(estado, inimigo);
      if (!slots.length) return;
      criarPendencia(estado, {
        lado,
        tipo: 'escolher_alvo',
        titulo: 'Afogamento: escolha a criatura inimiga.',
        opcoes: slots.map((s) => opcaoDeSlot(estado, inimigo, s)),
        podeRecusar: true,
        contexto: {
          tipo: 'afogamento_alvo',
          lado,
          anexoUid,
          porAnexo: efeito.value_per_card.value,
        },
      });
      return;
    }
    case 'summon_token': {
      invocarFicha(estado, lado, efeito.token, eventos);
      return;
    }
    case 'delayed_effect': {
      if (!criatura) return;
      estado.efeitosAdiados.push({
        lado,
        criaturaUid: criatura.uid,
        resolveNoTurno: estado.turno + 1,
        dano: efeito.effect.value,
      });
      return;
    }
    case 'change_element': {
      if (!criatura) return;
      criarPendencia(estado, {
        lado,
        tipo: 'escolher_elemento',
        titulo: 'Escolha o elemento da criatura.',
        opcoes: efeito.choose.map((elemento) => ({ id: elemento, rotulo: elemento })),
        podeRecusar: false,
        contexto: { tipo: 'pote_elemento', lado, slot },
      });
      return;
    }
  }
}

export function invocarFicha(
  estado: EstadoDoJogo,
  lado: LadoId,
  ficha: NonNullable<CriaturaEmCampo['ficha']>,
  eventos: Evento[],
): boolean {
  const slot = estado.lados[lado].campo.findIndex((c) => c === null);
  if (slot < 0) return false;
  const uid = `f${estado.proximoUid++}`;
  estado.lados[lado].campo[slot] = {
    uid,
    cartaId: null,
    ficha,
    dano: 0,
    marcadores: { attack: 0, defense: 0 },
    modificadoresTemporarios: [],
    anexos: [],
    invocadaNoTurno: estado.turno,
    podeAtacarAPartirDoTurno: estado.turno + 1,
    habilidadesUsadas: {},
  };
  eventos.push({ tipo: 'FICHA_CRIADA', lado, slot, uid, ficha });
  return true;
}

// ── alteração de elemento e seus gatilhos ────────────────────────────────────

export function alterarElemento(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  novo: Elemento,
  eventos: Evento[],
  opcoes: { ateOFimDoTurno?: boolean } = {},
): void {
  const criatura = estado.lados[lado].campo[slot];
  if (!criatura) return;
  const anterior = criatura.elementoAlterado ?? defDaCriatura(criatura).elemento;
  if (anterior === novo) return;
  criatura.elementoAlterado = novo;
  if (opcoes.ateOFimDoTurno) criatura.elementoAlteradoAteTurno = estado.turno;
  else delete criatura.elementoAlteradoAteTurno;
  eventos.push({ tipo: 'ELEMENTO_ALTERADO', lado, criaturaUid: criatura.uid, de: anterior, para: novo });

  // Sapomerlim / Sapotristan: a própria criatura mudou de elemento
  if (criatura.cartaId !== null) {
    const cartaPropria = cartaPorId(criatura.cartaId);
    if (cartaPropria.tipo === 'criatura') {
      for (const habilidade of cartaPropria.triggeredAbilities ?? []) {
        if (habilidade.trigger !== 'self_element_changed') continue;
        estado.fila.push({
          tipo: 'gatilho',
          gatilho: {
            lado,
            origemUid: criatura.uid,
            origemCartaId: criatura.cartaId,
            acao: habilidade.action,
            prioridade: 40,
            disparadorUid: criatura.uid,
          },
        });
      }
    }
  }

  // Dheron: sua criatura (que case com o filtro) mudou de elemento
  for (const fonte of estado.lados[lado].campo) {
    if (!fonte || fonte.cartaId === null) continue;
    const carta = cartaPorId(fonte.cartaId);
    if (carta.tipo !== 'criatura') continue;
    for (const habilidade of carta.triggeredAbilities ?? []) {
      if (habilidade.trigger !== 'your_creature_element_changed') continue;
      if (!criaturaCasaComFiltro(criatura, habilidade.filter)) continue;
      if (habilidade.action.type === 'add_permanent_marker') {
        const alvo = habilidade.action.target === 'self' ? fonte : criatura;
        aplicarMarcador(alvo, lado, habilidade.action.stats, habilidade.action.value, eventos);
      }
    }
  }

  // Coração do Sapoescudeiro: anexos da criatura alterada
  for (const anexo of criatura.anexos) {
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') continue;
    for (const habilidade of carta.triggeredAbilities ?? []) {
      if (habilidade.trigger !== 'attached_creature_element_changed') continue;
      estado.fila.push({
        tipo: 'gatilho',
        gatilho: {
          lado,
          origemUid: anexo.uid,
          origemCartaId: anexo.cartaId,
          acao: habilidade.action,
          prioridade: 50,
          disparadorUid: criatura.uid,
        },
      });
    }
  }
}

// ── RESPONDER ────────────────────────────────────────────────────────────────

export function responder(
  estado: EstadoDoJogo,
  _lado: LadoId,
  opcaoId: string,
  eventos: Evento[],
): string | null {
  const pendencia = estado.pendencia;
  if (!pendencia) return 'Nada pendente.';

  const recusou = opcaoId === 'recusar';
  if (recusou && !pendencia.podeRecusar) return 'Esta escolha não pode ser recusada.';
  if (!recusou && !pendencia.opcoes.some((opcao) => opcao.id === opcaoId)) {
    return 'Opção inválida.';
  }

  const contexto = pendencia.contexto;
  estado.pendencia = null;

  switch (contexto.tipo) {
    case 'escudo': {
      if (opcaoId === 'sim') {
        negarAtaqueComEscudo(estado, contexto, eventos);
      } else {
        // pode haver outro escudo disponível; o trabalho re-verifica tudo
        estado.fila.unshift(contexto.trabalhoAtaque);
      }
      return null;
    }
    case 'ordem_da_corrente': {
      const indice = Number(opcaoId);
      const escolhido = contexto.gatilhos[indice];
      if (!escolhido) return 'Opção inválida.';
      const restantes = contexto.gatilhos.filter((_, i) => i !== indice);
      if (restantes.length) {
        estado.fila.unshift({ tipo: 'lote_de_gatilhos', gatilhos: restantes });
      }
      executarGatilho(estado, escolhido, eventos);
      return null;
    }
    case 'gatilho_opcional': {
      if (opcaoId === 'sim') continuarGatilhoAceito(estado, contexto.gatilho, eventos);
      return null;
    }
    case 'gatilho_alvo': {
      if (recusou) return null;
      const alvo = interpretarAlvo(opcaoId);
      if (!alvo) return 'Opção inválida.';
      executarGatilhoComAlvo(estado, contexto.gatilho, alvo.lado, alvo.slot, eventos);
      return null;
    }
    case 'atlas_descartar': {
      if (recusou) return null;
      const dono = estado.lados[contexto.lado];
      const indice = dono.mao.findIndex((naMao) => naMao.uid === opcaoId);
      if (indice < 0) return 'Opção inválida.';
      const [descartada] = dono.mao.splice(indice, 1);
      dono.descarte.push(descartada!);
      eventos.push({ tipo: 'CARTA_DESCARTADA', lado: contexto.lado, carta: descartada!, motivo: 'custo' });
      aoCartaDeCriaturaChegarNoDescarte(estado, contexto.lado, descartada!.cartaId, descartada!.uid);

      const buscaveis = dono.deck.filter((no) => cartaCasaComFiltro(no.cartaId, contexto.buscar));
      if (buscaveis.length) {
        criarPendencia(estado, {
          lado: contexto.lado,
          tipo: 'escolher_carta',
          titulo: 'Escolha a carta para adicionar à mão.',
          opcoes: buscaveis.map((no) => ({ id: no.uid, rotulo: cartaPorId(no.cartaId).nome })),
          podeRecusar: true,
          contexto: { tipo: 'atlas_buscar', lado: contexto.lado },
        });
      }
      return null;
    }
    case 'atlas_buscar': {
      if (recusou) return null;
      const dono = estado.lados[contexto.lado];
      const indice = dono.deck.findIndex((no) => no.uid === opcaoId);
      if (indice < 0) return 'Opção inválida.';
      const [achada] = dono.deck.splice(indice, 1);
      dono.mao.push(achada!);
      eventos.push({ tipo: 'CARTA_BUSCADA', lado: contexto.lado, carta: achada! });
      return null;
    }
    case 'afogamento_alvo': {
      if (recusou) return null;
      const alvo = interpretarAlvo(opcaoId);
      if (!alvo) return 'Opção inválida.';
      const criatura = estado.lados[alvo.lado].campo[alvo.slot];
      if (!criatura) return null;
      marcarAlvoDoAnexo(estado, contexto.lado, contexto.anexoUid, criatura.uid);
      const total = criatura.anexos.length * contexto.porAnexo;
      if (total) {
        aplicarMarcador(criatura, alvo.lado, ['defense'], total, eventos);
        if (statsAtuais(criatura, estado.lados[alvo.lado].campo).defense <= 0) {
          removerCriaturaDoCampo(estado, alvo.lado, alvo.slot, eventos, {
            pontuar: true,
            emBatalha: false,
          });
        }
      }
      return null;
    }
    case 'pote_elemento': {
      alterarElemento(estado, contexto.lado, contexto.slot, opcaoId as Elemento, eventos);
      return null;
    }
    case 'sapomerlim_elemento': {
      alterarElemento(estado, contexto.lado, contexto.slot, opcaoId as Elemento, eventos, {
        ateOFimDoTurno: true,
      });
      return null;
    }
    case 'mapa_descartar': {
      const dono = estado.lados[contexto.lado];
      const indice = dono.mao.findIndex((naMao) => naMao.uid === opcaoId);
      if (indice < 0) return 'Opção inválida.';
      const [descartada] = dono.mao.splice(indice, 1);
      dono.descarte.push(descartada!);
      eventos.push({
        tipo: 'CARTA_DESCARTADA',
        lado: contexto.lado,
        carta: descartada!,
        motivo: 'efeito',
      });
      aoCartaDeCriaturaChegarNoDescarte(estado, contexto.lado, descartada!.cartaId, descartada!.uid);
      return null;
    }
    case 'leviathan_alvo': {
      if (recusou) return null;
      const alvo = interpretarAlvo(opcaoId);
      if (!alvo || alvo.lado !== contexto.lado) return 'Opção inválida.';
      const dono = estado.lados[contexto.lado];
      const candidatas = dono.mao.filter((naMao) => cartaCasaComFiltro(naMao.cartaId, contexto.filtro));
      if (!candidatas.length) return null;
      criarPendencia(estado, {
        lado: contexto.lado,
        tipo: 'escolher_carta',
        titulo: 'Escolha a criatura da mão que será invocada sobre a escolhida.',
        opcoes: candidatas.map((naMao) => ({
          id: naMao.uid,
          rotulo: cartaPorId(naMao.cartaId).nome,
        })),
        podeRecusar: false,
        contexto: { tipo: 'leviathan_invocar', lado: contexto.lado, slot: alvo.slot },
      });
      return null;
    }
    case 'leviathan_invocar': {
      const dono = estado.lados[contexto.lado];
      const indice = dono.mao.findIndex((naMao) => naMao.uid === opcaoId);
      if (indice < 0) return 'Opção inválida.';
      // a criatura coberta vai ao descarte sem pontuar (não foi destruída em batalha)
      if (dono.campo[contexto.slot]) {
        removerCriaturaDoCampo(estado, contexto.lado, contexto.slot, eventos, {
          pontuar: false,
          emBatalha: false,
        });
      }
      const [daMao] = dono.mao.splice(indice, 1);
      const invocada = novaCriaturaEmCampo(estado, daMao!.uid, daMao!.cartaId, {});
      dono.campo[contexto.slot] = invocada;
      eventos.push({
        tipo: 'CRIATURA_INVOCADA',
        lado: contexto.lado,
        slot: contexto.slot,
        carta: daMao!,
      });
      heroiAoEntrarCriatura(estado, contexto.lado, invocada, eventos);
      aoEntrarEmCampo(estado, contexto.lado, contexto.slot);
      aoOutraCriaturaEntrar(estado, contexto.lado, invocada, eventos);
      return null;
    }
    case 'oraculo_escolher': {
      const inimigo = ladoOposto(contexto.lado);
      const dono = estado.lados[inimigo];
      const indice = dono.mao.findIndex((naMao) => naMao.uid === opcaoId);
      if (indice < 0) return 'Opção inválida.';
      const [devolvida] = dono.mao.splice(indice, 1);
      dono.deck.push(devolvida!);
      const resultado = embaralhar(estado.rng, dono.deck);
      estado.rng = resultado.rng;
      dono.deck = resultado.itens;
      eventos.push({ tipo: 'CARTA_EMBARALHADA_NO_DECK', lado: inimigo, carta: devolvida! });
      return null;
    }
    case 'coracao_swap': {
      if (opcaoId === 'sim') {
        const alvos = slotsComCriatura(estado, contexto.lado, { name_includes: 'Contos' });
        if (alvos.length) {
          criarPendencia(estado, {
            lado: contexto.lado,
            tipo: 'escolher_alvo',
            titulo: 'Escolha a criatura com Contos no nome.',
            opcoes: alvos.map((slot) => opcaoDeSlot(estado, contexto.lado, slot)),
            podeRecusar: true,
            contexto: { ...contexto, tipo: 'coracao_swap_alvo' },
          });
          return null;
        }
      }
      devolverAnexoParaMao(estado, contexto, eventos);
      return null;
    }
    case 'reagir_comando': {
      if (recusou) {
        eventos.push({ tipo: 'REACAO_RECUSADA', lado: contexto.lado });
        return null;
      }
      const dono = estado.lados[contexto.lado];
      const naMao = dono.mao.find((carta) => carta.uid === opcaoId);
      if (!naMao) return 'Opção inválida.';
      const carta = cartaPorId(naMao.cartaId);
      const alvo = alvoDeComando(carta);
      if (!alvo) return jogarComando(estado, contexto.lado, naMao.uid, undefined, eventos);
      const ladoDoAlvo = alvo === 'enemy_creature' ? ladoOposto(contexto.lado) : contexto.lado;
      const slots = slotsComCriatura(estado, ladoDoAlvo);
      if (!slots.length) return null; // o alvo sumiu; a carta fica na mão
      criarPendencia(estado, {
        lado: contexto.lado,
        tipo: 'escolher_alvo',
        titulo: `${carta.nome}: escolha o alvo.`,
        opcoes: slots.map((slot) => opcaoDeSlot(estado, ladoDoAlvo, slot)),
        podeRecusar: true,
        reacao: true,
        contexto: {
          tipo: 'reagir_comando_alvo',
          lado: contexto.lado,
          uidCarta: naMao.uid,
          ladoDoAlvo,
        },
      });
      return null;
    }
    case 'reagir_comando_alvo': {
      if (recusou) {
        eventos.push({ tipo: 'REACAO_RECUSADA', lado: contexto.lado });
        return null;
      }
      const alvo = interpretarAlvo(opcaoId);
      if (!alvo || alvo.lado !== contexto.ladoDoAlvo) return 'Opção inválida.';
      return jogarComando(estado, contexto.lado, contexto.uidCarta, alvo, eventos);
    }
    case 'reagir_habilidade': {
      if (recusou) {
        eventos.push({ tipo: 'REACAO_RECUSADA', lado: contexto.lado });
        return null;
      }
      const alvo = interpretarAlvo(opcaoId);
      if (!alvo || alvo.lado !== contexto.lado) return 'Opção inválida.';
      const criatura = estado.lados[contexto.lado].campo[alvo.slot];
      if (!criatura) return null;
      const habilidade = habilidadeUtilizavelEmReacao(estado, contexto.lado, criatura);
      if (!habilidade) return null;
      return ativarHabilidade(
        estado,
        contexto.lado,
        criatura.uid,
        habilidade.id,
        undefined,
        eventos,
        { emReacao: true },
      );
    }
    case 'coracao_swap_alvo': {
      if (!recusou) {
        const alvo = interpretarAlvo(opcaoId);
        if (!alvo) return 'Opção inválida.';
        const criatura = estado.lados[alvo.lado].campo[alvo.slot];
        if (criatura) {
          const stats = statsAtuais(criatura, estado.lados[alvo.lado].campo);
          criatura.modificadoresTemporarios.push({
            attack: stats.defense - stats.attack,
            defense: stats.attack - stats.defense,
            expiraAposTurno: estado.turno,
          });
          eventos.push({
            tipo: 'MODIFICADOR_TEMPORARIO',
            lado: alvo.lado,
            criaturaUid: criatura.uid,
            attack: stats.defense - stats.attack,
            defense: stats.attack - stats.defense,
          });
        }
      }
      devolverAnexoParaMao(estado, contexto, eventos);
      return null;
    }
  }
}

function devolverAnexoParaMao(
  estado: EstadoDoJogo,
  contexto: { lado: LadoId; slot: number; anexoUid: string; devolverParaMao: boolean },
  eventos: Evento[],
): void {
  if (!contexto.devolverParaMao) return;
  const criatura = estado.lados[contexto.lado].campo[contexto.slot];
  if (!criatura) return;
  const indice = criatura.anexos.findIndex((anexo) => anexo.uid === contexto.anexoUid);
  if (indice < 0) return;
  const [anexo] = criatura.anexos.splice(indice, 1);
  estado.lados[contexto.lado].mao.push({ uid: anexo!.uid, cartaId: anexo!.cartaId });
  eventos.push({
    tipo: 'ANEXO_DEVOLVIDO_A_MAO',
    lado: contexto.lado,
    slot: contexto.slot,
    carta: { uid: anexo!.uid, cartaId: anexo!.cartaId },
  });
  // estouro da mão segue a regra normal
  while (estado.lados[contexto.lado].mao.length > MAO_MAXIMA) {
    const sorteio = inteiroAleatorio(estado.rng, 0, estado.lados[contexto.lado].mao.length - 1);
    estado.rng = sorteio.rng;
    const [descartada] = estado.lados[contexto.lado].mao.splice(sorteio.valor, 1);
    if (!descartada) break;
    estado.lados[contexto.lado].descarte.push(descartada);
    eventos.push({ tipo: 'MAO_CHEIA_DESCARTOU', lado: contexto.lado, carta: descartada });
  }
}

/** Afogamento: guarda no anexo qual criatura inimiga ele mirou. */
function marcarAlvoDoAnexo(
  estado: EstadoDoJogo,
  lado: LadoId,
  anexoUid: string,
  alvoUid: string,
): void {
  for (const portadora of estado.lados[lado].campo) {
    const anexo = portadora?.anexos.find((a) => a.uid === anexoUid);
    if (anexo) {
      anexo.alvoEscolhidoUid = alvoUid;
      return;
    }
  }
}

function interpretarAlvo(opcaoId: string): { lado: LadoId; slot: number } | null {
  const [lado, slotTexto] = opcaoId.split(':');
  const slot = Number(slotTexto);
  if ((lado !== 'a' && lado !== 'b') || !Number.isInteger(slot)) return null;
  return { lado, slot };
}

function slotDaCriatura(estado: EstadoDoJogo, lado: LadoId, uid: string): number | null {
  const slot = estado.lados[lado].campo.findIndex((c) => c?.uid === uid);
  return slot >= 0 ? slot : null;
}

// ── comandos (cartas de comando) ─────────────────────────────────────────────

export function jogarComando(
  estado: EstadoDoJogo,
  lado: LadoId,
  uidCarta: string,
  alvo: { lado: LadoId; slot: number } | undefined,
  eventos: Evento[],
): string | null {
  const dono = estado.lados[lado];
  const indice = dono.mao.findIndex((naMao) => naMao.uid === uidCarta);
  if (indice < 0) return 'Carta fora da mão.';
  const naZona = dono.mao[indice]!;
  const carta = cartaPorId(naZona.cartaId);
  if (carta.tipo !== 'comando') return 'A carta não é um comando.';
  /* importada do Figma e ainda sem comportamento modelado: não sai da mão */
  if (!carta.effects?.length) return 'O efeito desta carta ainda não foi implementado.';

  // valida alvo antes de mover a carta
  for (const efeito of carta.effects) {
    const precisaDeAlvo =
      'target' in efeito && (efeito.target === 'enemy_creature' || efeito.target === 'your_creature');
    if (!precisaDeAlvo) continue;
    const ladoEsperado = efeito.target === 'enemy_creature' ? ladoOposto(lado) : lado;
    if (!alvo || alvo.lado !== ladoEsperado) return 'Este comando precisa de um alvo válido.';
    if (!estado.lados[alvo.lado].campo[alvo.slot]) return 'O alvo escolhido está vazio.';
  }

  dono.mao.splice(indice, 1);
  eventos.push({ tipo: 'COMANDO_JOGADO', lado, carta: naZona });

  for (const efeito of carta.effects) {
    switch (efeito.type) {
      case 'prevent_attack': {
        const criatura = estado.lados[alvo!.lado].campo[alvo!.slot];
        if (!criatura) break;
        criatura.naoPodeAtacarAteTurno = Math.max(criatura.naoPodeAtacarAteTurno ?? 0, estado.turno);
        eventos.push({
          tipo: 'IMPEDIDA_DE_ATACAR',
          lado: alvo!.lado,
          criaturaUid: criatura.uid,
          ateTurno: estado.turno,
        });
        break;
      }
      case 'prevent_attack_target': {
        const criatura = estado.lados[alvo!.lado].campo[alvo!.slot];
        if (!criatura) break;
        criatura.naoPodeSerAlvoAteTurno = Math.max(criatura.naoPodeSerAlvoAteTurno ?? 0, estado.turno);
        eventos.push({
          tipo: 'PROTEGIDA_DE_ATAQUES',
          lado: alvo!.lado,
          criaturaUid: criatura.uid,
          ateTurno: estado.turno,
        });
        break;
      }
      case 'discard_hand_then_draw': {
        const descartadas = dono.mao.splice(0, dono.mao.length);
        for (const descartada of descartadas) {
          dono.descarte.push(descartada);
          eventos.push({ tipo: 'CARTA_DESCARTADA', lado, carta: descartada, motivo: 'efeito' });
          aoCartaDeCriaturaChegarNoDescarte(estado, lado, descartada.cartaId, descartada.uid);
        }
        const podeComprar = Math.min(
          descartadas.length,
          dono.deck.length,
          MAO_MAXIMA - dono.mao.length,
        );
        comprarCartas(estado, lado, podeComprar, eventos);
        break;
      }
      case 'temporary_modify_stat': {
        const criatura = estado.lados[alvo!.lado].campo[alvo!.slot];
        if (!criatura) break;
        let valor = 0;
        if (efeito.value_per_card?.zone === 'your_discard') {
          const inclui = efeito.value_per_card.name_includes;
          const quantas = dono.descarte.filter(
            (no) => !inclui || cartaPorId(no.cartaId).nome.includes(inclui),
          ).length;
          valor = quantas * efeito.value_per_card.value;
        }
        if (!valor) break;
        const attack = efeito.stats.includes('attack') ? valor : 0;
        const defense = efeito.stats.includes('defense') ? valor : 0;
        criatura.modificadoresTemporarios.push({ attack, defense, expiraAposTurno: estado.turno });
        eventos.push({
          tipo: 'MODIFICADOR_TEMPORARIO',
          lado: alvo!.lado,
          criaturaUid: criatura.uid,
          attack,
          defense,
        });
        break;
      }
      case 'sacrifice_then_summon_from_deck': {
        const criatura = estado.lados[alvo!.lado].campo[alvo!.slot];
        if (!criatura) break;
        eventos.push({ tipo: 'CRIATURA_SACRIFICADA', lado, slot: alvo!.slot, uid: criatura.uid });
        removerCriaturaDoCampo(estado, lado, alvo!.slot, eventos, {
          pontuar: false,
          emBatalha: false,
        });
        let invocadas = 0;
        for (let i = dono.deck.length - 1; i >= 0 && invocadas < efeito.summon.count; i--) {
          const no = dono.deck[i]!;
          const candidata = cartaPorId(no.cartaId);
          if (candidata.tipo !== 'criatura') continue;
          if (efeito.summon.race && candidata.raca !== efeito.summon.race) continue;
          if (efeito.summon.max_attack != null && candidata.ataque > efeito.summon.max_attack) continue;
          const slotVazio = dono.campo.findIndex((c) => c === null);
          if (slotVazio < 0) break;
          dono.deck.splice(i, 1);
          const invocada = novaCriaturaEmCampo(estado, no.uid, no.cartaId, {
            podeAtacarNesteTurno: efeito.summon.can_attack_this_turn !== false,
          });
          dono.campo[slotVazio] = invocada;
          eventos.push({ tipo: 'INVOCADA_DO_DECK', lado, slot: slotVazio, carta: no });
          heroiAoEntrarCriatura(estado, lado, invocada, eventos);
          aoEntrarEmCampo(estado, lado, slotVazio);
          aoOutraCriaturaEntrar(estado, lado, invocada, eventos);
          invocadas++;
        }
        break;
      }
      case 'reveal_random_hand_then_shuffle_one': {
        const inimigo = estado.lados[ladoOposto(lado)];
        if (!inimigo.mao.length) break;
        const reveladas: string[] = [];
        const indices = new Set<number>();
        while (reveladas.length < Math.min(efeito.reveal, inimigo.mao.length)) {
          const sorteio = inteiroAleatorio(estado.rng, 0, inimigo.mao.length - 1);
          estado.rng = sorteio.rng;
          if (indices.has(sorteio.valor)) continue;
          indices.add(sorteio.valor);
          const revelada = inimigo.mao[sorteio.valor]!;
          reveladas.push(revelada.uid);
          eventos.push({ tipo: 'CARTA_REVELADA', lado: ladoOposto(lado), carta: revelada });
        }
        criarPendencia(estado, {
          lado,
          tipo: 'escolher_carta',
          titulo: 'Escolha a carta revelada que volta ao baralho do oponente.',
          opcoes: reveladas.map((uid) => {
            const naMao = inimigo.mao.find((c) => c.uid === uid)!;
            return { id: uid, rotulo: cartaPorId(naMao.cartaId).nome };
          }),
          podeRecusar: false,
          contexto: { tipo: 'oraculo_escolher', lado, reveladas },
        });
        break;
      }
      case 'force_attack':
        // Sob a regra de ataque por coluna o alvo é sempre a coluna em frente;
        // forçar alvo não tem efeito (paridade com o legado). Ver decisions.md.
        break;
    }
  }

  dono.descarte.push(naZona);
  return null;
}

// ── habilidades ativadas ─────────────────────────────────────────────────────

export function ativarHabilidade(
  estado: EstadoDoJogo,
  lado: LadoId,
  origemUid: string,
  habilidadeId: string,
  elemento: Elemento | undefined,
  eventos: Evento[],
  opcoes: { emReacao?: boolean } = {},
): string | null {
  const dono = estado.lados[lado];

  // origem: criatura em campo
  for (let slot = 0; slot < dono.campo.length; slot++) {
    const criatura = dono.campo[slot];
    if (!criatura || criatura.uid !== origemUid || criatura.cartaId === null) continue;
    const carta = cartaPorId(criatura.cartaId);
    if (carta.tipo !== 'criatura') continue;
    const habilidade = (carta.activatedAbilities ?? []).find((h) => h.id === habilidadeId);
    if (!habilidade) return 'Habilidade desconhecida.';
    if (habilidade.condition?.active_player === 'opponent' && !opcoes.emReacao) {
      return 'Esta habilidade só pode ser ativada em reação, no turno do oponente.';
    }
    if (habilidade.timing === 'once_per_turn' && criatura.habilidadesUsadas[habilidadeId] === estado.turno) {
      return 'Habilidade já usada neste turno.';
    }

    if (habilidade.action.type === 'summon_from_discard') {
      const filtro = habilidade.action.filter;
      const indice = dono.descarte.findIndex((no) => cartaCasaComFiltro(no.cartaId, filtro));
      const slotVazio = dono.campo.findIndex((c, i) => c === null && i !== slot);
      const teraVaga = slotVazio >= 0 || habilidade.cost?.type === 'sacrifice_self';
      if (indice < 0 || !teraVaga) return 'Não há alvo válido no descarte (ou espaço no campo).';
    }

    if (!pagarCusto(estado, lado, slot, habilidade.cost, eventos)) {
      return 'Não foi possível pagar o custo.';
    }
    eventos.push({ tipo: 'HABILIDADE_ATIVADA', lado, origemUid, habilidadeId });

    switch (habilidade.action.type) {
      case 'cannot_attack_next_turn': {
        const aindaEmCampo = dono.campo[slot];
        if (aindaEmCampo) {
          aindaEmCampo.naoPodeAtacarAteTurno = estado.turno + 1;
          aindaEmCampo.habilidadesUsadas[habilidadeId] = estado.turno;
        }
        return null;
      }
      // Mamuthe Ancestral: mói 2 e cresce com a variedade de elementos do descarte
      case 'mill_then_gain_defense_per_discard_element': {
        const aindaEmCampo = dono.campo[slot];
        if (!aindaEmCampo) return null;
        aindaEmCampo.habilidadesUsadas[habilidadeId] = estado.turno;
        moerEGanharVida(
          estado,
          lado,
          aindaEmCampo,
          habilidade.action.mill,
          habilidade.action.value,
          eventos,
        );
        return null;
      }
      case 'summon_from_discard': {
        const filtro = habilidade.action.filter;
        const indice = dono.descarte.findIndex((no) => cartaCasaComFiltro(no.cartaId, filtro));
        if (indice < 0) return null;
        const slotVazio = dono.campo.findIndex((c) => c === null);
        if (slotVazio < 0) return null;
        const [doDescarte] = dono.descarte.splice(indice, 1);
        const invocada = novaCriaturaEmCampo(estado, doDescarte!.uid, doDescarte!.cartaId, {});
        dono.campo[slotVazio] = invocada;
        eventos.push({ tipo: 'INVOCADA_DO_DESCARTE', lado, slot: slotVazio, carta: doDescarte! });
        heroiAoEntrarCriatura(estado, lado, invocada, eventos);
        aoEntrarEmCampo(estado, lado, slotVazio);
        aoOutraCriaturaEntrar(estado, lado, invocada, eventos);
        return null;
      }
      default:
        return 'Ação de habilidade pendente de design (ver decisions.md).';
    }
  }

  // origem: anexo (Sapocalibur — só itens têm habilidades ativadas)
  for (let slot = 0; slot < dono.campo.length; slot++) {
    const criatura = dono.campo[slot];
    if (!criatura) continue;
    const anexo = criatura.anexos.find((a) => a.uid === origemUid);
    if (!anexo) continue;
    const carta = cartaPorId(anexo.cartaId);
    if (carta.tipo !== 'item') continue;
    const habilidade = (carta.activatedAbilities ?? []).find((h) => h.id === habilidadeId);
    if (!habilidade) return 'Habilidade desconhecida.';
    if (
      habilidade.condition?.attached_creature_race &&
      defDaCriatura(criatura).raca !== habilidade.condition.attached_creature_race
    ) {
      return 'A criatura anexada não atende à condição.';
    }
    const usadas = (anexo.habilidadesUsadas ??= {});
    if (habilidade.timing === 'once_per_turn' && usadas[habilidadeId] === estado.turno) {
      return 'Habilidade já usada neste turno.';
    }
    if (habilidade.action.type !== 'change_element') {
      return 'Ação de habilidade pendente de design (ver decisions.md).';
    }
    if (!elemento || !habilidade.action.choose.includes(elemento)) {
      return 'Escolha um elemento válido.';
    }
    usadas[habilidadeId] = estado.turno;
    eventos.push({ tipo: 'HABILIDADE_ATIVADA', lado, origemUid, habilidadeId });
    alterarElemento(estado, lado, slot, elemento, eventos);
    return null;
  }

  // origem: carta na mão (Leviathan de Esdras — invocação especial)
  const indiceNaMao = dono.mao.findIndex((naMao) => naMao.uid === origemUid);
  if (indiceNaMao >= 0) {
    const naMao = dono.mao[indiceNaMao]!;
    const carta = cartaPorId(naMao.cartaId);
    if (carta.tipo !== 'criatura') return 'Esta carta não tem habilidade de mão.';
    const habilidade = (carta.activatedAbilities ?? []).find(
      (h) => h.id === habilidadeId && h.source === 'hand',
    );
    if (!habilidade) return 'Habilidade desconhecida.';
    if (habilidade.action.type !== 'special_summon_over_your_creature') {
      return 'Ação de habilidade pendente de design (ver decisions.md).';
    }
    const filtro = habilidade.action.filter;
    const alvos = slotsComCriatura(estado, lado);
    const temInvocavel = dono.mao.some(
      (outra, i) => i !== indiceNaMao && cartaCasaComFiltro(outra.cartaId, filtro),
    );
    if (!alvos.length || !temInvocavel) {
      return 'É preciso uma criatura sua em campo e outra carta compatível na mão.';
    }

    // custo: descartar esta carta da mão
    dono.mao.splice(indiceNaMao, 1);
    dono.descarte.push(naMao);
    eventos.push({ tipo: 'CARTA_DESCARTADA', lado, carta: naMao, motivo: 'custo' });
    aoCartaDeCriaturaChegarNoDescarte(estado, lado, naMao.cartaId, naMao.uid);
    eventos.push({ tipo: 'HABILIDADE_ATIVADA', lado, origemUid, habilidadeId });

    criarPendencia(estado, {
      lado,
      tipo: 'escolher_alvo',
      titulo: 'Escolha a criatura que será coberta pela invocação.',
      opcoes: alvos.map((slot) => opcaoDeSlot(estado, lado, slot)),
      podeRecusar: false,
      contexto: { tipo: 'leviathan_alvo', lado, filtro },
    });
    return null;
  }

  return 'Origem da habilidade não encontrada.';
}

/** Mamuthe Ancestral: mói do topo e ganha +VIDA por elemento distinto no descarte. */
function moerEGanharVida(
  estado: EstadoDoJogo,
  lado: LadoId,
  criatura: CriaturaEmCampo,
  moer: number,
  porElemento: number,
  eventos: Evento[],
): void {
  const dono = estado.lados[lado];
  const quantas = Math.min(moer, dono.deck.length);
  for (let i = 0; i < quantas; i++) {
    const moida = dono.deck.shift()!;
    dono.descarte.push(moida);
    eventos.push({ tipo: 'MOIDA_DO_DECK', lado, carta: moida });
    aoCartaDeCriaturaChegarNoDescarte(estado, lado, moida.cartaId, moida.uid);
  }
  const elementos = new Set(dono.descarte.map((carta) => cartaPorId(carta.cartaId).elemento));
  aplicarMarcador(criatura, lado, ['defense'], elementos.size * porElemento, eventos);
}

function pagarCusto(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  custo: { type: string; name_includes?: string } | undefined,
  eventos: Evento[],
): boolean {
  if (!custo) return true;
  const dono = estado.lados[lado];
  const criatura = dono.campo[slot];
  if (!criatura) return false;

  if (custo.type === 'destroy_attachment') {
    const inclui = (custo.name_includes ?? '').toLowerCase();
    const indice = criatura.anexos.findIndex((anexo) =>
      cartaPorId(anexo.cartaId).nome.toLowerCase().includes(inclui),
    );
    if (indice < 0) return false;
    const [anexo] = criatura.anexos.splice(indice, 1);
    dono.descarte.push({ uid: anexo!.uid, cartaId: anexo!.cartaId });
    eventos.push({
      tipo: 'ANEXO_DESCARTADO',
      lado,
      slot,
      carta: { uid: anexo!.uid, cartaId: anexo!.cartaId },
    });
    aoAnexoIrParaDescarte(estado, lado, anexo!.uid, anexo!.cartaId, estado.fase !== 'batalha');
    return true;
  }

  if (custo.type === 'sacrifice_self') {
    eventos.push({ tipo: 'CRIATURA_SACRIFICADA', lado, slot, uid: criatura.uid });
    removerCriaturaDoCampo(estado, lado, slot, eventos, { pontuar: false, emBatalha: false });
    return true;
  }

  return false;
}

// ── fim de turno ─────────────────────────────────────────────────────────────

export function resolverFimDeTurno(estado: EstadoDoJogo, eventos: Evento[]): void {
  const lado = estado.ladoAtivo;
  const dono = estado.lados[lado];

  // Guardião Enlouquecido: destrói a anexada que não atacou
  for (let slot = 0; slot < dono.campo.length; slot++) {
    const criatura = dono.campo[slot];
    if (!criatura || criatura.atacouNoTurno === estado.turno) continue;
    const condenada = criatura.anexos.some((anexo) => {
      const carta = cartaPorId(anexo.cartaId);
      if (carta.tipo !== 'habilidade' && carta.tipo !== 'item') return false;
      return (carta.triggeredAbilities ?? []).some(
        (h) =>
          h.trigger === 'attached_creature_end_turn_if_not_attacked' &&
          h.action.type === 'destroy_attached_creature',
      );
    });
    if (condenada) {
      removerCriaturaDoCampo(estado, lado, slot, eventos, { pontuar: false, emBatalha: false });
    }
  }

  // Manopla do Poder: dano adiado
  const pendentes = estado.efeitosAdiados.filter((e) => e.resolveNoTurno <= estado.turno);
  estado.efeitosAdiados = estado.efeitosAdiados.filter((e) => e.resolveNoTurno > estado.turno);
  for (const adiado of pendentes) {
    const slot = estado.lados[adiado.lado].campo.findIndex((c) => c?.uid === adiado.criaturaUid);
    if (slot < 0) continue;
    danoDeEfeitoEmCriatura(estado, adiado.lado, slot, adiado.dano, eventos);
  }
}

function novaCriaturaEmCampo(
  estado: EstadoDoJogo,
  uid: string,
  cartaId: number,
  opcoes: { podeAtacarNesteTurno?: boolean },
): CriaturaEmCampo {
  return {
    uid,
    cartaId,
    dano: 0,
    marcadores: { attack: 0, defense: 0 },
    modificadoresTemporarios: [],
    anexos: [],
    invocadaNoTurno: estado.turno,
    podeAtacarAPartirDoTurno: opcoes.podeAtacarNesteTurno ? estado.turno : estado.turno + 1,
    habilidadesUsadas: {},
  };
}

export { podeSerAlvoDeAtaque };
