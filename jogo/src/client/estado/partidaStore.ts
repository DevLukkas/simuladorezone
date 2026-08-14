import { create } from 'zustand';
import { criarPartida } from '../../engine/criar.ts';
import { aplicarComando } from '../../engine/reduzir.ts';
import { decidirComando } from '../../engine/ia.ts';
import { visaoPara, type VisaoDoJogo } from '../../engine/visao.ts';
import type { Comando } from '../../engine/comandos.ts';
import { SEGUNDOS_DE_REACAO, SEGUNDOS_DO_TURNO } from '../../engine/estado.ts';
import type { EstadoDoJogo, LadoId } from '../../engine/estado.ts';
import type { Evento } from '../../engine/eventos.ts';
import { cartasDoFormato } from '../../data/cartas.ts';
import { MAXIMO_DE_CARTAS_NO_DECK } from '../../data/regras.ts';
import type { Formato } from '../../data/tipos.ts';
import { api, sessaoGuardada } from '../services/api.ts';
import { descreverEvento } from '../descreverEvento.ts';

export interface DeckParaTreino {
  heroi: string;
  cartas: number[];
  /** ausente = clássico */
  formato?: Formato;
}

interface Fotografia {
  partidaId: number;
  seq: number;
  prazoEmMs: number;
  apelidos: { eu: string; oponente: string };
  visao: VisaoDoJogo;
}

interface PartidaState {
  modo: 'treino' | 'online' | null;
  visao: VisaoDoJogo | null;
  apelidoOponente: string;
  prazoEmMs: number | null;
  registro: string[];
  ultimaRecusa: string | null;
  iniciarTreino: (deck?: DeckParaTreino) => void;
  iniciarOnline: (partidaId: number) => Promise<void>;
  enviar: (comando: Comando) => void;
  sair: () => void;
}

const LADO_TREINO: LadoId = 'a';
const LADO_BOT: LadoId = 'b';

// estado interno fora da store: o React nunca precisa ver isto
let estadoLocal: EstadoDoJogo | null = null;
let fonteDeEventos: EventSource | null = null;
let partidaIdAtual: number | null = null;
let ultimoSeq = 0;
let atualizacaoAgendada: ReturnType<typeof setTimeout> | null = null;
// timer do treino: espelha o do servidor (60s por turno, 7s por reação)
let timerDeTreino: ReturnType<typeof setTimeout> | null = null;
let chaveDoPrazoDeTreino = '';
let prazoDeTreino = 0;

function deckDeTreino(formato: Formato): number[] {
  return cartasDoFormato(formato)
    .slice(0, MAXIMO_DE_CARTAS_NO_DECK)
    .map((carta) => carta.id);
}

export const usePartidaStore = create<PartidaState>((set, get) => {
  function registrar(eventos: Evento[], meuLado: LadoId): void {
    const novas = eventos
      .map((evento) => descreverEvento(evento, meuLado))
      .filter((texto): texto is string => texto !== null);
    if (novas.length) set({ registro: [...get().registro, ...novas].slice(-80) });
  }

  function rodarBot(): void {
    let protecao = 0;
    for (;;) {
      if (!estadoLocal || estadoLocal.vencedor || protecao++ > 300) break;
      const vezDoBot =
        estadoLocal.pendencia?.lado === LADO_BOT ||
        (!estadoLocal.pendencia &&
          estadoLocal.fase === 'mulligan' &&
          !estadoLocal.lados[LADO_BOT].mulliganDecidido) ||
        (!estadoLocal.pendencia &&
          estadoLocal.fase !== 'mulligan' &&
          estadoLocal.ladoAtivo === LADO_BOT);
      if (!vezDoBot) break;
      const comando = decidirComando(estadoLocal, LADO_BOT);
      if (!comando) break;
      const resultado = aplicarComando(estadoLocal, comando);
      if (resultado.erro) break;
      estadoLocal = resultado.estado;
      registrar(resultado.eventos, LADO_TREINO);
    }
    if (estadoLocal) set({ visao: visaoPara(estadoLocal, LADO_TREINO) });
    rearmarTimerDeTreino();
  }

  /** Aplica um comando local e registra os eventos; devolve false se recusado. */
  function aplicarLocal(comando: Comando): boolean {
    if (!estadoLocal) return false;
    const resultado = aplicarComando(estadoLocal, comando);
    if (resultado.erro) return false;
    estadoLocal = resultado.estado;
    registrar(resultado.eventos, LADO_TREINO);
    return true;
  }

  function rearmarTimerDeTreino(): void {
    if (timerDeTreino) {
      clearTimeout(timerDeTreino);
      timerDeTreino = null;
    }
    if (get().modo !== 'treino' || !estadoLocal || estadoLocal.vencedor) {
      chaveDoPrazoDeTreino = '';
      if (estadoLocal?.vencedor) set({ prazoEmMs: null });
      return;
    }
    const pendencia = estadoLocal.pendencia;
    const chave = pendencia?.reacao
      ? `reacao:${pendencia.id}`
      : `turno:${estadoLocal.turno}:${estadoLocal.ladoAtivo}:${estadoLocal.fase === 'mulligan'}`;
    if (chave !== chaveDoPrazoDeTreino) {
      chaveDoPrazoDeTreino = chave;
      const segundos = pendencia?.reacao ? SEGUNDOS_DE_REACAO : SEGUNDOS_DO_TURNO;
      prazoDeTreino = Date.now() + segundos * 1000;
      set({ prazoEmMs: prazoDeTreino });
    }
    timerDeTreino = setTimeout(estourarPrazoDeTreino, Math.max(0, prazoDeTreino - Date.now()) + 20);
  }

  function estourarPrazoDeTreino(): void {
    timerDeTreino = null;
    if (get().modo !== 'treino' || !estadoLocal || estadoLocal.vencedor) return;
    const pendencia = estadoLocal.pendencia;
    if (pendencia?.reacao && pendencia.lado === LADO_TREINO) {
      aplicarLocal({
        tipo: 'RESPONDER',
        lado: LADO_TREINO,
        pendenciaId: pendencia.id,
        opcaoId: 'recusar',
      });
    } else {
      aplicarLocal({ tipo: 'TEMPO_ESGOTADO' });
    }
    set({ visao: visaoPara(estadoLocal, LADO_TREINO) });
    rodarBot();
  }

  async function atualizarDoServidor(): Promise<void> {
    if (partidaIdAtual === null) return;
    try {
      const foto = await api<Fotografia>('GET', `/api/partidas/${partidaIdAtual}`);
      set({ visao: foto.visao, prazoEmMs: foto.prazoEmMs });
    } catch {
      // a partida pode ter acabado entre o evento e a busca; o FIM_DE_JOGO cuida
    }
  }

  function agendarAtualizacao(): void {
    if (atualizacaoAgendada) clearTimeout(atualizacaoAgendada);
    atualizacaoAgendada = setTimeout(() => {
      atualizacaoAgendada = null;
      void atualizarDoServidor();
    }, 150);
  }

  return {
    modo: null,
    visao: null,
    apelidoOponente: 'Oponente',
    prazoEmMs: null,
    registro: [],
    ultimaRecusa: null,

    iniciarTreino: (deck) => {
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      // o bot joga no MESMO formato do jogador — decks de formatos diferentes não
      // formam partida (o motor recusa em criarPartida)
      const formato: Formato = deck?.formato ?? 'classico';
      const meuDeck = deck ?? { heroi: 'badur', cartas: deckDeTreino(formato) };
      const criada = criarPartida({
        seed,
        formato,
        decks: { a: meuDeck, b: { heroi: 'ispisher', cartas: deckDeTreino(formato) } },
      });
      estadoLocal = criada.estado;
      set({
        modo: 'treino',
        apelidoOponente: 'Bot',
        prazoEmMs: null,
        registro: [],
        ultimaRecusa: null,
        visao: visaoPara(estadoLocal, LADO_TREINO),
      });
      registrar(criada.eventos, LADO_TREINO);
      rodarBot();
    },

    iniciarOnline: async (partidaId) => {
      const foto = await api<Fotografia>('GET', `/api/partidas/${partidaId}`);
      partidaIdAtual = partidaId;
      ultimoSeq = 0;
      set({
        modo: 'online',
        visao: foto.visao,
        apelidoOponente: foto.apelidos.oponente,
        prazoEmMs: foto.prazoEmMs,
        registro: [],
        ultimaRecusa: null,
      });

      const token = sessaoGuardada()?.token ?? '';
      fonteDeEventos?.close();
      fonteDeEventos = new EventSource(
        `/api/partidas/${partidaId}/eventos?desde=0&token=${encodeURIComponent(token)}`,
      );
      const meuLado = foto.visao.lado;
      fonteDeEventos.onmessage = (mensagem) => {
        const seq = Number(mensagem.lastEventId) || 0;
        if (seq <= ultimoSeq) return;
        ultimoSeq = seq;
        const evento = JSON.parse(mensagem.data as string) as Evento;
        registrar([evento], meuLado);
        if (evento.tipo === 'FIM_DE_JOGO') {
          const visao = get().visao;
          if (visao) {
            set({ visao: { ...visao, vencedor: evento.vencedor, motivoDoFim: evento.motivo } });
          }
          fonteDeEventos?.close();
          return;
        }
        agendarAtualizacao();
      };
    },

    enviar: (comando) => {
      const { modo } = get();
      if (modo === 'treino') {
        if (!estadoLocal) return;
        const resultado = aplicarComando(estadoLocal, comando);
        if (resultado.erro) {
          set({ ultimaRecusa: resultado.erro });
          return;
        }
        estadoLocal = resultado.estado;
        registrar(resultado.eventos, LADO_TREINO);
        set({ visao: visaoPara(estadoLocal, LADO_TREINO), ultimaRecusa: null });
        rodarBot();
        return;
      }

      if (modo === 'online' && partidaIdAtual !== null) {
        void api<Fotografia | { encerrada: boolean }>(
          'POST',
          `/api/partidas/${partidaIdAtual}/comandos`,
          { comando },
        )
          .then((resposta) => {
            if ('visao' in resposta) {
              set({ visao: resposta.visao, prazoEmMs: resposta.prazoEmMs, ultimaRecusa: null });
            }
          })
          .catch((erro: unknown) => {
            set({ ultimaRecusa: erro instanceof Error ? erro.message : 'falhou' });
          });
      }
    },

    sair: () => {
      fonteDeEventos?.close();
      fonteDeEventos = null;
      partidaIdAtual = null;
      estadoLocal = null;
      if (timerDeTreino) {
        clearTimeout(timerDeTreino);
        timerDeTreino = null;
      }
      chaveDoPrazoDeTreino = '';
      set({ modo: null, visao: null, registro: [], ultimaRecusa: null, prazoEmMs: null });
    },
  };
});
