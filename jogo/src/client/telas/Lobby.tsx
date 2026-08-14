import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.ts';
import { useDecksStore } from '../estado/decksStore.ts';

type Situacao =
  | { tipo: 'parado' }
  | { tipo: 'na_fila' }
  | { tipo: 'sala_criada'; codigo: string }
  | { tipo: 'erro'; mensagem: string };

export function Lobby({
  aoVoltar,
  aoEntrarNaPartida,
}: {
  aoVoltar: () => void;
  aoEntrarNaPartida: (partidaId: number) => void;
}) {
  const { decks, carregado, carregar } = useDecksStore();
  const [deckId, setDeckId] = useState<number | null>(null);
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'parado' });
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const sondagem = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void carregar();
    return () => {
      if (sondagem.current) clearInterval(sondagem.current);
    };
  }, [carregar]);

  useEffect(() => {
    if (carregado && deckId === null && decks[0]) setDeckId(decks[0].id);
  }, [carregado, decks, deckId]);

  function sondarPartida() {
    if (sondagem.current) clearInterval(sondagem.current);
    sondagem.current = setInterval(() => {
      void api<{ partidaId: number | null }>('GET', '/api/partidas/atual').then((resposta) => {
        if (resposta.partidaId) {
          if (sondagem.current) clearInterval(sondagem.current);
          aoEntrarNaPartida(resposta.partidaId);
        }
      });
    }, 2000);
  }

  async function entrarNaFila() {
    if (deckId === null) return;
    try {
      const resposta = await api<{ partidaId?: number; aguardando?: boolean }>(
        'POST',
        '/api/fila',
        { deckId },
      );
      if (resposta.partidaId) {
        aoEntrarNaPartida(resposta.partidaId);
        return;
      }
      setSituacao({ tipo: 'na_fila' });
      sondarPartida();
    } catch (erro) {
      setSituacao({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'falhou' });
    }
  }

  async function sairDaFila() {
    if (sondagem.current) clearInterval(sondagem.current);
    await api('DELETE', '/api/fila').catch(() => undefined);
    setSituacao({ tipo: 'parado' });
  }

  async function criarSala() {
    if (deckId === null) return;
    try {
      const resposta = await api<{ codigo: string }>('POST', '/api/salas', { deckId });
      setSituacao({ tipo: 'sala_criada', codigo: resposta.codigo });
      sondarPartida();
    } catch (erro) {
      setSituacao({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'falhou' });
    }
  }

  async function entrarComCodigo() {
    if (deckId === null || !codigoDigitado.trim()) return;
    try {
      const resposta = await api<{ partidaId: number }>('POST', '/api/salas/entrada', {
        deckId,
        codigo: codigoDigitado.trim(),
      });
      aoEntrarNaPartida(resposta.partidaId);
    } catch (erro) {
      setSituacao({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'falhou' });
    }
  }

  const semDecks = carregado && decks.length === 0;
  const esperando = situacao.tipo === 'na_fila' || situacao.tipo === 'sala_criada';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={aoVoltar}>
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold">Jogar online</h1>
      </div>

      {semDecks && (
        <p className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
          Você precisa de um deck salvo para jogar online — crie um em "Meus decks".
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-400">
        Deck:
        <select
          className="flex-1 rounded bg-slate-800 px-3 py-2 text-slate-100"
          value={deckId ?? ''}
          disabled={esperando}
          onChange={(evento) => setDeckId(Number(evento.target.value))}
        >
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.nome}
            </option>
          ))}
        </select>
      </label>

      {situacao.tipo === 'parado' || situacao.tipo === 'erro' ? (
        <>
          <button
            type="button"
            disabled={deckId === null}
            className="rounded-lg bg-emerald-700 py-3 text-lg font-bold hover:bg-emerald-600 disabled:opacity-40"
            onClick={() => void entrarNaFila()}
          >
            ENTRAR NA FILA
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deckId === null}
              className="flex-1 rounded bg-slate-800 py-2 font-bold hover:bg-slate-700 disabled:opacity-40"
              onClick={() => void criarSala()}
            >
              Criar sala
            </button>
            <input
              className="w-32 rounded bg-slate-800 px-3 py-2 uppercase"
              placeholder="EZ-XXXX"
              value={codigoDigitado}
              onChange={(evento) => setCodigoDigitado(evento.target.value)}
            />
            <button
              type="button"
              disabled={deckId === null || !codigoDigitado.trim()}
              className="rounded bg-slate-800 px-4 py-2 font-bold hover:bg-slate-700 disabled:opacity-40"
              onClick={() => void entrarComCodigo()}
            >
              Entrar
            </button>
          </div>
          {situacao.tipo === 'erro' && <p className="text-sm text-amber-400">{situacao.mensagem}</p>}
        </>
      ) : (
        <div className="rounded border border-slate-700 bg-slate-900/60 p-4 text-center">
          {situacao.tipo === 'sala_criada' ? (
            <>
              <p className="text-slate-300">Sala criada — passe o código para o oponente:</p>
              <p className="my-2 text-3xl font-bold tracking-widest text-emerald-400">
                {situacao.codigo}
              </p>
            </>
          ) : (
            <p className="text-slate-300">Na fila, procurando oponente…</p>
          )}
          <p className="mb-3 animate-pulse text-sm text-slate-500">aguardando…</p>
          <button
            type="button"
            className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            onClick={() => void sairDaFila()}
          >
            Cancelar
          </button>
        </div>
      )}
    </main>
  );
}
