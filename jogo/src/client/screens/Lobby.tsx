import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../services/api.ts';
import { ScreenHeader } from '../components/ScreenHeader.tsx';
import { useDecksStore } from '../stores/decksStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { text, type TextRef } from '../../shared/text.ts';

type Status =
  | { type: 'idle' }
  | { type: 'in_queue' }
  | { type: 'room_created'; code: string }
  | { type: 'error'; message: TextRef };

export function Lobby({
  onBack,
  onEnterMatch,
}: {
  onBack: () => void;
  onEnterMatch: (matchId: number) => void;
}) {
  const { decks, loaded, load } = useDecksStore();
  const { t, resolve } = useTranslation();
  const [deckId, setDeckId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [typedCode, setTypedCode] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [load]);

  useEffect(() => {
    if (loaded && deckId === null && decks[0]) setDeckId(decks[0].id);
  }, [loaded, decks, deckId]);

  function failed(error: unknown): Status {
    return {
      type: 'error',
      message: error instanceof ApiError ? error.ref : text('common.failed'),
    };
  }

  function pollForMatch() {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(() => {
      void api<{ matchId: number | null }>('GET', '/api/matches/current').then((reply) => {
        if (reply.matchId) {
          if (poll.current) clearInterval(poll.current);
          onEnterMatch(reply.matchId);
        }
      });
    }, 2000);
  }

  async function joinQueue() {
    if (deckId === null) return;
    try {
      const reply = await api<{ matchId?: number; waiting?: boolean }>('POST', '/api/queue', {
        deckId,
      });
      if (reply.matchId) {
        onEnterMatch(reply.matchId);
        return;
      }
      setStatus({ type: 'in_queue' });
      pollForMatch();
    } catch (error) {
      setStatus(failed(error));
    }
  }

  async function leaveQueue() {
    if (poll.current) clearInterval(poll.current);
    await api('DELETE', '/api/queue').catch(() => undefined);
    setStatus({ type: 'idle' });
  }

  async function createRoom() {
    if (deckId === null) return;
    try {
      const reply = await api<{ code: string }>('POST', '/api/rooms', { deckId });
      setStatus({ type: 'room_created', code: reply.code });
      pollForMatch();
    } catch (error) {
      setStatus(failed(error));
    }
  }

  async function joinWithCode() {
    if (deckId === null || !typedCode.trim()) return;
    try {
      const reply = await api<{ matchId: number }>('POST', '/api/rooms/join', {
        deckId,
        code: typedCode.trim(),
      });
      onEnterMatch(reply.matchId);
    } catch (error) {
      setStatus(failed(error));
    }
  }

  const noDecks = loaded && decks.length === 0;
  const waiting = status.type === 'in_queue' || status.type === 'room_created';

  return (
    <main className="ez-page px-[clamp(18px,4vw,56px)] pb-16 pt-9">
      <div className="mx-auto flex w-[min(640px,100%)] flex-col gap-4 pt-[8vh]">
        <ScreenHeader title={t('lobby.title')} onBack={onBack} />

        {noDecks && (
          <p className="ez-panel border-[#6b4d12] p-3.5 text-sm text-ez-gold-light">
            {t('lobby.needDeck')}
          </p>
        )}

        <label className="flex items-center gap-3 text-sm text-ez-muted">
          <span className="whitespace-nowrap">{t('lobby.deck')}</span>
          <select
            className="ez-select flex-1 text-[15px]"
            value={deckId ?? ''}
            disabled={waiting}
            onChange={(event) => setDeckId(Number(event.target.value))}
          >
            {/*
              o formato vem junto do nome: a fila é POR formato (server/rooms.ts) e a
              sala recusa o convidado de outro — sem isto o jogador espera para sempre
              ou leva "os dois decks precisam ser do mesmo formato" sem saber por quê
            */}
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} — {t(`format.${deck.format ?? 'classic'}`)}
              </option>
            ))}
          </select>
        </label>

        {status.type === 'idle' || status.type === 'error' ? (
          <>
            <button
              type="button"
              disabled={deckId === null}
              className="ez-btn ez-btn-emerald mt-2 w-full rounded-xl py-[17px] text-base tracking-[0.14em]"
              onClick={() => void joinQueue()}
            >
              {t('lobby.joinQueue')}
            </button>

            {/* a sala é a via de convite: criar de um lado, digitar o código do outro */}
            <div className="grid items-stretch gap-2.5 sm:grid-cols-[1fr_150px_auto]">
              <button
                type="button"
                disabled={deckId === null}
                className="ez-btn ez-btn-panel text-[15px]"
                onClick={() => void createRoom()}
              >
                {t('lobby.createRoom')}
              </button>
              <input
                className="ez-input text-center text-[15px] tracking-[0.08em]"
                placeholder={t('lobby.codePlaceholder')}
                maxLength={8}
                value={typedCode}
                onChange={(event) => setTypedCode(event.target.value.toUpperCase())}
              />
              {/* o ouro só acende quando há código digitado: até lá o botão não promete nada */}
              <button
                type="button"
                disabled={deckId === null || !typedCode.trim()}
                className={`ez-btn ez-btn-panel text-[15px] ${
                  typedCode.trim() ? 'border-ez-gold text-ez-gold-light hover:brightness-110' : ''
                }`}
                onClick={() => void joinWithCode()}
              >
                {t('lobby.join')}
              </button>
            </div>

            <p className="text-center text-[13px] text-ez-dim">{t('lobby.hint')}</p>
            {status.type === 'error' && (
              <p className="text-center text-sm text-ez-gold-light">{resolve(status.message)}</p>
            )}
          </>
        ) : (
          <div
            className="ez-panel mt-2 flex flex-col items-center gap-2.5 px-6 py-7"
            style={{ animation: 'ez-fade-in .3s ease both' }}
          >
            {status.type === 'room_created' ? (
              <>
                <p className="text-base text-ez-soft">{t('lobby.roomCreated')}</p>
                {/*
                  o código é para ser LIDO EM VOZ ALTA para o oponente: grande, espaçado
                  e na esmeralda do pareamento, não no ouro dos títulos
                */}
                <p
                  className="font-title text-[40px] font-extrabold tracking-[0.1em] text-ez-emerald-light"
                  style={{ textShadow: '0 0 26px rgba(63,214,143,.45)' }}
                >
                  {status.code}
                </p>
              </>
            ) : (
              <p className="text-[17px] text-ez-text">{t('lobby.searching')}</p>
            )}
            <p
              className="text-[13px] tracking-[0.08em] text-ez-dim"
              style={{ animation: 'ez-glow-pulse 1.6s ease-in-out infinite' }}
            >
              {t('lobby.waiting')}
            </p>
            <button
              type="button"
              className="ez-btn ez-btn-ghost ez-btn-ghost-danger ez-btn-sm mt-1.5 px-6"
              onClick={() => void leaveQueue()}
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
