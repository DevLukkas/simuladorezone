import { useEffect, useRef, useState } from 'react';
import { MAX_DECK_CARDS } from '../../data/deckRules.ts';
import { DIRECT_DAMAGE_PER_POINT, STARTING_HAND } from '../../engine/state.ts';
import { ApiError, api } from '../services/api.ts';
import { HeroBadge } from '../components/HeroPortrait.tsx';
import { useDecksStore, activeDeckOf } from '../stores/decksStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { ELEMENT_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';
import { text, type TextRef } from '../../shared/text.ts';

type Status =
  | { type: 'idle' }
  | { type: 'in_queue' }
  | { type: 'room_created'; code: string }
  | { type: 'error'; message: TextRef };

/**
 * Jogar online: dois modos lado a lado (fila e sala) e o resumo da mesa.
 *
 * O deck deixou de ser um `select` aqui: o que entra é o BARALHO ATIVO da trilha
 * (decisão nº 29). Sem ele não há partida, e a tela diz isso em vez de oferecer
 * uma fila que o servidor recusaria — a fila é por formato, e o formato vem do
 * baralho.
 */
export function Lobby({
  onEnterMatch,
  onOpenBuilder,
}: {
  onEnterMatch: (matchId: number) => void;
  onOpenBuilder: () => void;
}) {
  const { t, resolve } = useTranslation();
  const deck = useDecksStore(activeDeckOf);
  const toast = useToastStore((state) => state.show);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [typedCode, setTypedCode] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current);
    },
    [],
  );

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

  async function toggleQueue() {
    if (status.type === 'in_queue') {
      if (poll.current) clearInterval(poll.current);
      await api('DELETE', '/api/queue').catch(() => undefined);
      setStatus({ type: 'idle' });
      return;
    }
    if (!deck) return;
    try {
      const reply = await api<{ matchId?: number; waiting?: boolean }>('POST', '/api/queue', {
        deckId: deck.id,
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

  async function createRoom() {
    if (!deck) return;
    try {
      const reply = await api<{ code: string }>('POST', '/api/rooms', { deckId: deck.id });
      setStatus({ type: 'room_created', code: reply.code });
      toast(t('lobby.roomCreated', { code: reply.code }));
      pollForMatch();
    } catch (error) {
      setStatus(failed(error));
    }
  }

  async function joinWithCode() {
    const code = typedCode.trim();
    if (!deck) return;
    if (!code) {
      toast(t('lobby.typeCode'));
      return;
    }
    try {
      toast(t('lobby.joining', { code }));
      const reply = await api<{ matchId: number }>('POST', '/api/rooms/join', {
        deckId: deck.id,
        code,
      });
      onEnterMatch(reply.matchId);
    } catch (error) {
      setStatus(failed(error));
    }
  }

  const queued = status.type === 'in_queue';
  const total = deck ? Object.values(deck.cards).reduce((sum, amount) => sum + amount, 0) : 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-7">
      {!deck && (
        <div className="zn-panel mb-5 flex max-w-270 flex-wrap items-center gap-3.5 px-5 py-4">
          <span className="text-sm text-zn-gold-light">{t('lobby.needDeck')}</span>
          <button
            type="button"
            onClick={onOpenBuilder}
            className="zn-btn zn-btn-wire ml-auto uppercase"
          >
            {t('hub.openBuilder')}
          </button>
        </div>
      )}

      <div className="grid max-w-270 items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <section className="zn-panel p-5.5" style={{ borderTop: `3px solid ${ZN.green}` }}>
          <span className="zn-label uppercase">{t('lobby.modeTag', { n: '01' })}</span>
          <h2 className="zn-head mt-2.5 text-[32px] tracking-[0.08em]">{t('lobby.quickTitle')}</h2>
          <p className="mt-2.5 text-sm leading-normal text-zn-muted">{t('lobby.quickDesc')}</p>

          <p className="zn-num mt-4.5 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.16em] text-zn-dim">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-zn-green" />
            {deck ? `${deck.name} · ${total}/${MAX_DECK_CARDS}` : t('shell.noDeck')}
          </p>

          <button
            type="button"
            disabled={!deck}
            onClick={() => void toggleQueue()}
            className={`zn-btn mt-5 h-11.5 w-full uppercase ${queued ? 'zn-btn-wire' : 'zn-btn-green'}`}
          >
            {queued ? t('lobby.leaveQueue') : t('lobby.joinQueue')}
          </button>

          {queued && (
            <div
              className="zn-inset mt-4 flex items-center gap-3 p-3.5"
              style={{ animation: 'zn-fade .2s ease both' }}
            >
              <span aria-hidden className="zn-beacon h-2 w-2 shrink-0 bg-zn-gold" />
              <span className="zn-num text-[10px] uppercase tracking-[0.16em] text-zn-muted">
                {t('lobby.searching')}
              </span>
            </div>
          )}
        </section>

        <section
          className="zn-panel p-5.5"
          style={{ borderTop: `3px solid ${ELEMENT_COLOR.water}` }}
        >
          <span className="zn-label uppercase">{t('lobby.modeTag', { n: '02' })}</span>
          <h2 className="zn-head mt-2.5 text-[32px] tracking-[0.08em]">{t('lobby.roomTitle')}</h2>
          <p className="mt-2.5 text-sm leading-normal text-zn-muted">{t('lobby.roomDesc')}</p>

          <button
            type="button"
            disabled={!deck}
            onClick={() => void createRoom()}
            className="zn-btn zn-btn-wire mt-4.5 h-10.5 w-full uppercase"
          >
            {t('lobby.createRoom')}
          </button>

          {status.type === 'room_created' && (
            <div
              className="zn-inset mt-3.5 p-4 text-center"
              style={{ animation: 'zn-fade .2s ease both' }}
            >
              <div className="zn-label tracking-[0.26em] uppercase">{t('lobby.roomCodeLabel')}</div>
              {/* o código é para ser LIDO EM VOZ ALTA: grande, espaçado e no verde do pareamento */}
              <div className="zn-num mt-2 text-[30px] font-bold tracking-[0.16em] text-zn-green">
                {status.code}
              </div>
              <div className="zn-num zn-beacon mt-2 text-[10px] uppercase tracking-[0.16em] text-zn-muted">
                {t('lobby.waitingOpponent')}
              </div>
            </div>
          )}

          <div className="mt-3.5 grid gap-2 [grid-template-columns:1fr_auto]">
            <input
              className="zn-input h-10 text-center font-mono text-sm tracking-[0.14em]"
              placeholder={t('lobby.codePlaceholder')}
              maxLength={8}
              value={typedCode}
              onChange={(event) => setTypedCode(event.target.value.toUpperCase())}
            />
            <button
              type="button"
              disabled={!deck}
              onClick={() => void joinWithCode()}
              className="zn-btn zn-btn-wire h-10 px-5 uppercase"
            >
              {t('lobby.join')}
            </button>
          </div>
        </section>

        <section className="zn-panel p-5.5">
          <span className="zn-label uppercase">{t('lobby.tableTitle')}</span>
          <div className="mt-4 flex items-center gap-3.5">
            {deck ? <HeroBadge hero={deck.hero} size={52} /> : <UnknownHero />}
            <span className="zn-num text-[11px] uppercase tracking-[0.2em] text-zn-fainter">vs</span>
            {/* o adversário só existe depois do pareamento: até lá, a moldura vazia */}
            <UnknownHero />
          </div>

          <ul className="mt-4 flex flex-col gap-2">
            {[
              t('lobby.rule.hand', { count: STARTING_HAND }),
              t('lobby.rule.turn'),
              t('lobby.rule.combat'),
              t('lobby.rule.direct', { damage: DIRECT_DAMAGE_PER_POINT }),
            ].map((rule) => (
              <li
                key={rule}
                className="zn-num flex gap-2.5 text-[10px] uppercase tracking-[0.08em] text-zn-dim"
              >
                <span aria-hidden className="text-zn-gold">
                  ·
                </span>
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {status.type === 'error' && (
        <p className="zn-num mt-5 text-[11px] uppercase tracking-[0.12em] text-zn-red-light">
          {resolve(status.message)}
        </p>
      )}
    </div>
  );
}

/** a moldura do herói que ainda não se conhece: mesma caixa, sem retrato */
function UnknownHero() {
  return (
    <span
      aria-hidden
      className="zn-notch zn-num grid h-13 w-13 shrink-0 place-items-center bg-zn-ink text-[16px] text-zn-fainter"
      style={{ border: `1px solid ${ZN.edge}` }}
    >
      ?
    </span>
  );
}
