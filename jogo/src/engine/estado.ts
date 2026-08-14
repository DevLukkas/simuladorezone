import type {
  AcaoAoAnexar,
  AcaoAoEntrar,
  AcaoDeGatilho,
  Elemento,
  FichaDeCriatura,
  FiltroCarta,
  Formato,
} from '../data/tipos.ts';

/**
 * Estado serializável da partida. Nenhuma referência a objetos gráficos,
 * funções ou promessas: só dados. `structuredClone`-ável de ponta a ponta.
 */

export type LadoId = 'a' | 'b';
export type Fase = 'mulligan' | 'principal' | 'batalha';

export const SLOTS_POR_LADO = 5;
export const MAO_MAXIMA = 8;
export const PONTOS_PARA_VENCER = 3;
export const DANO_DIRETO_POR_PONTO = 5;
export const MAO_INICIAL = 5;
export const SEGUNDOS_DO_TURNO = 60;
/** janela de reação à jogada do oponente (paridade com os 7s do legado) */
export const SEGUNDOS_DE_REACAO = 7;

export function ladoOposto(lado: LadoId): LadoId {
  return lado === 'a' ? 'b' : 'a';
}

/** Uma cópia física de carta, com identidade própria (`uid`) para alvos e eventos. */
export interface CartaNaZona {
  uid: string;
  cartaId: number;
}

export interface AnexoEmCampo {
  uid: string;
  cartaId: number;
  /** turno em que negou um ataque (Proteção do Escudeiro é 1x por turno) */
  escudoUsadoNoTurno?: number;
  /** habilidades ativadas do anexo (Sapocalibur): id → turno de uso */
  habilidadesUsadas?: Record<string, number>;
  /** turno em que a redução 1x-por-turno já foi gasta (Resistência) */
  reducaoUsadaNoTurno?: number;
  /** criatura inimiga escolhida na entrada (Afogamento): morreu → o anexo cai */
  alvoEscolhidoUid?: string;
}

export interface ModificadorTemporario {
  attack: number;
  defense: number;
  /** removido na varredura de fim do turno indicado */
  expiraAposTurno: number;
}

export interface CriaturaEmCampo {
  uid: string;
  /** null para fichas — a definição fica em `ficha` */
  cartaId: number | null;
  ficha?: FichaDeCriatura;
  /** dano acumulado; vida atual = defesa calculada − dano */
  dano: number;
  /** marcadores permanentes (+1/+1 etc.) agregados */
  marcadores: { attack: number; defense: number };
  modificadoresTemporarios: ModificadorTemporario[];
  anexos: AnexoEmCampo[];
  /** elemento vigente quando alterado por efeito; ausente = o impresso */
  elementoAlterado?: Elemento;
  /** alteração temporária (Sapomerlim): o elemento volta ao impresso após este turno */
  elementoAlteradoAteTurno?: number;
  /** Sapotristan: ATQ e VIDA trocados enquanto o elemento estiver alterado */
  trocaDeStatsComElementoAlterado?: true;
  /** Sapotristan: lado que compra 1 carta se esta morrer com o elemento alterado */
  saqueAoMorrerComElementoAlterado?: LadoId;
  invocadaNoTurno: number;
  /** "summoning sickness": só ataca a partir deste turno (Aptidão zera a espera) */
  podeAtacarAPartirDoTurno: number;
  atacouNoTurno?: number;
  naoPodeAtacarAteTurno?: number;
  naoPodeSerAlvoAteTurno?: number;
  /** id da habilidade ativada → turno em que foi usada (once_per_turn) */
  habilidadesUsadas: Record<string, number>;
  /** Pele de Pedra (herói Badur) é uma vez por criatura */
  peleDePedraAplicada?: boolean;
}

/** Efeito agendado (Manopla do Poder: dano no fim do próximo turno). */
export interface EfeitoAdiado {
  lado: LadoId;
  criaturaUid: string;
  resolveNoTurno: number;
  dano: number;
}

export interface AcoesDoTurno {
  invocou: boolean;
  anexou: boolean;
  cenario: boolean;
}

export interface EstadoDoLado {
  heroi: string;
  /** topo do deck = índice 0 */
  deck: CartaNaZona[];
  mao: CartaNaZona[];
  campo: (CriaturaEmCampo | null)[];
  cenario: CartaNaZona | null;
  descarte: CartaNaZona[];
  exilio: CartaNaZona[];
  pontos: number;
  /** dano direto acumulado rumo ao próximo ponto (0..4) */
  danoDireto: number;
  acoes: AcoesDoTurno;
  mulliganDecidido: boolean;
  /** flags 1x-por-turno de efeitos de cenário */
  cenarioFlags: Record<string, boolean>;
}

/**
 * Um gatilho coletado, aguardando resolução na corrente. Empate de prioridade
 * entre dois ou mais = o dono escolhe a ordem (a peça mais "TCG" do legado).
 */
export interface GatilhoPendente {
  lado: LadoId;
  /** uid da carta/criatura fonte do gatilho */
  origemUid: string;
  origemCartaId: number;
  acao: AcaoDeGatilho;
  prioridade: number;
  /** uid da criatura que disparou o gatilho, quando o alvo padrão é ela */
  disparadorUid?: string;
}

/**
 * Trabalho na fila de efeitos. A fila é processada até esvaziar ou até um
 * trabalho precisar de decisão humana — aí vira `pendencia` e o motor retorna.
 * Tudo serializável: o replay atravessa pendências sem perder nada.
 */
export type Trabalho =
  | { tipo: 'lote_de_gatilhos'; gatilhos: GatilhoPendente[] }
  | { tipo: 'gatilho'; gatilho: GatilhoPendente }
  | { tipo: 'atacar'; lado: LadoId; slot: number }
  | { tipo: 'on_enter'; lado: LadoId; slot: number; efeito: AcaoAoEntrar }
  | { tipo: 'on_attach'; lado: LadoId; slot: number; anexoUid: string; efeito: AcaoAoAnexar };

/**
 * Continuação tipada de uma pendência: registra exatamente onde a resolução
 * parou e com quais dados retomar quando o jogador responder.
 */
export type ContextoDePendencia =
  | { tipo: 'escudo'; trabalhoAtaque: Trabalho & { tipo: 'atacar' }; anexoDonoSlot: number; anexoUid: string }
  | { tipo: 'ordem_da_corrente'; gatilhos: GatilhoPendente[] }
  | { tipo: 'gatilho_opcional'; gatilho: GatilhoPendente }
  | { tipo: 'gatilho_alvo'; gatilho: GatilhoPendente }
  | { tipo: 'atlas_descartar'; lado: LadoId; buscar: { name_includes?: string } }
  | { tipo: 'atlas_buscar'; lado: LadoId }
  | { tipo: 'reagir_comando'; lado: LadoId }
  | { tipo: 'reagir_comando_alvo'; lado: LadoId; uidCarta: string; ladoDoAlvo: LadoId }
  | { tipo: 'reagir_habilidade'; lado: LadoId }
  | { tipo: 'afogamento_alvo'; lado: LadoId; anexoUid: string; porAnexo: number }
  | { tipo: 'pote_elemento'; lado: LadoId; slot: number }
  | { tipo: 'oraculo_escolher'; lado: LadoId; reveladas: string[] }
  | { tipo: 'coracao_swap'; lado: LadoId; slot: number; anexoUid: string; devolverParaMao: boolean }
  | { tipo: 'coracao_swap_alvo'; lado: LadoId; slot: number; anexoUid: string; devolverParaMao: boolean }
  /** Sapomerlim: alvo escolhido, agora o elemento */
  | { tipo: 'sapomerlim_elemento'; lado: LadoId; slot: number }
  /** Mapa do Tesouro: comprou, agora descarta */
  | { tipo: 'mapa_descartar'; lado: LadoId }
  /** Leviathan: criatura a ser coberta, depois a carta da mão */
  | { tipo: 'leviathan_alvo'; lado: LadoId; filtro: FiltroCarta }
  | { tipo: 'leviathan_invocar'; lado: LadoId; slot: number };

export interface OpcaoDePendencia {
  id: string;
  rotulo: string;
}

export interface Pendencia {
  id: string;
  /** quem deve responder */
  lado: LadoId;
  tipo: 'sim_nao' | 'escolher_alvo' | 'escolher_carta' | 'escolher_elemento' | 'escolher_ordem';
  titulo: string;
  opcoes: OpcaoDePendencia[];
  podeRecusar: boolean;
  /** janela de reação: prazo curto (SEGUNDOS_DE_REACAO) e recusa automática */
  reacao?: true;
  /** dados internos para retomar a resolução — sempre serializáveis */
  contexto: ContextoDePendencia;
}

/**
 * Oferta de reação agendada por uma jogada do lado ativo. Vira pendência do
 * oponente quando a fila de efeitos esvazia — nunca no meio de uma corrente.
 */
export interface JanelaDeReacao {
  /** quem pode reagir (sempre o lado não-ativo) */
  contra: LadoId;
  /** o que o oponente fez, para o título da pendência */
  rotulo: string;
  categoria: 'comando' | 'habilidade';
}

export interface EstadoDoJogo {
  seed: number;
  rng: number;
  /**
   * Formato em que a partida corre. Fica no estado (e não numa variável de build)
   * porque servidor e cliente têm de concordar sobre quais regras valem, e porque o
   * replay determinístico precisa dele gravado junto com a seed.
   * Ausente nas partidas gravadas antes do segundo formato: trate como `classico`.
   */
  formato: Formato;
  turno: number;
  fase: Fase;
  ladoAtivo: LadoId;
  lados: Record<LadoId, EstadoDoLado>;
  vencedor: LadoId | null;
  motivoDoFim?: 'pontos' | 'desistencia' | 'tempo';
  pendencia: Pendencia | null;
  /** oferta de reação aguardando a fila esvaziar para virar pendência */
  reacaoPendente?: JanelaDeReacao | null;
  /** trabalhos de efeito aguardando resolução (FIFO) */
  fila: Trabalho[];
  efeitosAdiados: EfeitoAdiado[];
  /** contador para uids de fichas e outras entidades criadas em jogo */
  proximoUid: number;
}
