import { useEffect, useRef, useState } from 'react';
import type { CreatureToken } from '../../data/types.ts';
import { POINTS_TO_WIN } from '../../engine/state.ts';
import { useAnimationStore, type Anchor, type Animation } from '../stores/animationStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { CardImage } from './Card.tsx';

/**
 * Desenha o passo da vez sobre o tabuleiro (camada fixa, sem captar cliques) e
 * avisa a store quando termina, o que puxa o próximo da linha do tempo. Um passo
 * por vez, avisos de virada inclusive: enquanto este componente existe, o resto
 * do cliente está travado esperando (decisão nº 25).
 *
 * Cada passo remonta do zero (`key={current.id}`), então o tempo de vida do
 * componente É a duração da animação — não há estado de animação para limpar.
 */

const ATTACK_OUT = 240;
const ATTACK_HIT = 150;
const ATTACK_BACK = 210;
const DESTROY_TRAVEL = 430;
const DESTROY_SMOKE = 450;
const SCORE_HOLD = 1600;
const ANNOUNCE_HOLD = 1150;

/**
 * O atacante para quando encosta no alvo, não em cima dele: recua metade da
 * altura das duas cartas (limitado a metade do caminho, para o alvo colado).
 */
function reachTo(from: DOMRect, to: DOMRect, delta: { x: number; y: number }): number {
  const distance = Math.hypot(delta.x, delta.y);
  if (!distance) return 0;
  const stopShort = Math.min(distance / 2, (from.height + to.height) * 0.24);
  return (distance - stopShort) / distance;
}

export function AnimationLayer() {
  const current = useAnimationStore((state) => state.current);
  if (!current) return null;
  return <Step key={current.id} animation={current} />;
}

/** "SEU TURNO", "FASE DE BATALHA": a faixa que atravessa o meio da tela. */
function AnnounceBand({
  announcement,
  onDone,
}: {
  announcement: Extract<Animation, { kind: 'announce' }>;
  onDone: () => void;
}) {
  const { resolve } = useTranslation();
  useSequence([], onDone, ANNOUNCE_HOLD);

  const tone =
    announcement.tone === 'mine'
      ? { band: 'rgba(29,58,18,.82)', edge: 'rgba(143,206,79,.9)', text: 'text-ez-moss-light' }
      : announcement.tone === 'theirs'
        ? { band: 'rgba(16,38,72,.82)', edge: 'rgba(92,182,247,.9)', text: 'text-[#dbeafe]' }
        : { band: 'rgba(16,23,49,.85)', edge: 'rgba(232,193,90,.9)', text: 'text-ez-parchment' };

  return (
    <div className="pointer-events-none fixed inset-0 z-[54] flex items-center justify-center">
      <div
        className="flex w-full flex-col items-center justify-center gap-0.5 py-3 text-center backdrop-blur-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${tone.band} 18%, ${tone.band} 82%, transparent 100%)`,
          borderTop: `2px solid ${tone.edge}`,
          borderBottom: `2px solid ${tone.edge}`,
          animation: `ezone-announce ${ANNOUNCE_HOLD}ms cubic-bezier(.2,.8,.3,1) both`,
        }}
      >
        <span
          className={`font-title text-3xl font-extrabold uppercase tracking-[0.3em] ${tone.text}`}
          style={{ textShadow: '0 3px 18px rgba(0,0,0,.85)' }}
        >
          {resolve(announcement.title)}
        </span>
        {announcement.subtitle && (
          <span className="font-title text-sm font-bold uppercase tracking-[0.4em] text-white/85">
            {resolve(announcement.subtitle)}
          </span>
        )}
      </div>
    </div>
  );
}

function Step({ animation }: { animation: Animation }) {
  const finish = useAnimationStore((state) => state.finish);
  const done = () => finish(animation.id);
  if (animation.kind === 'announce') return <AnnounceBand announcement={animation} onDone={done} />;
  if (animation.kind === 'score') return <ScoreBanner animation={animation} onDone={done} />;
  if (animation.kind === 'attack') return <AttackStep animation={animation} onDone={done} />;
  return <DestroyStep animation={animation} onDone={done} />;
}

function rectOf(anchor: Anchor): DOMRect | null {
  const element = document.querySelector(`[data-anchor="${anchor}"]`);
  return element ? element.getBoundingClientRect() : null;
}

/** deslocamento de centro a centro entre duas âncoras */
function shift(from: DOMRect, to: DOMRect): { x: number; y: number } {
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
  };
}

/** roda `steps` em sequência e chama `onDone` no fim; cancela tudo ao desmontar */
function useSequence(steps: { at: number; run: () => void }[], onDone: () => void, total: number) {
  const latest = useRef({ steps, onDone });
  latest.current = { steps, onDone };
  useEffect(() => {
    const timers = latest.current.steps.map((step) => setTimeout(step.run, step.at));
    timers.push(setTimeout(() => latest.current.onDone(), total));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
    // a sequência é fixa por montagem — cada passo da fila remonta o componente
  }, [total]);
}

/**
 * A criatura vai até o alvo, "bate" e volta. Ataque direto vai até o herói.
 */
function AttackStep({
  animation,
  onDone,
}: {
  animation: Extract<Animation, { kind: 'attack' }>;
  onDone: () => void;
}) {
  const [from] = useState(() => rectOf(animation.from));
  const [to] = useState(() => rectOf(animation.to));
  const [phase, setPhase] = useState<'start' | 'out' | 'back'>('start');
  const usable = from !== null && to !== null;

  useSequence(
    usable
      ? [
          { at: 0, run: () => setPhase('out') },
          { at: ATTACK_OUT + ATTACK_HIT, run: () => setPhase('back') },
        ]
      : [],
    onDone,
    usable ? ATTACK_OUT + ATTACK_HIT + ATTACK_BACK : 0,
  );

  if (!usable) return null;
  const delta = shift(from, to);
  const reach = reachTo(from, to, delta);
  const flying = phase === 'out';
  const duration = phase === 'back' ? ATTACK_BACK : ATTACK_OUT;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      <Ghost
        rect={from}
        cardId={animation.cardId}
        token={animation.token}
        className={`ring-2 ${animation.direct ? 'ring-ez-blood-light' : 'ring-ez-gold-light'}`}
        style={{
          transform: flying
            ? `translate(${delta.x * reach}px, ${delta.y * reach}px) scale(1.08)`
            : 'translate(0px, 0px) scale(1)',
          transition: `transform ${duration}ms ${flying ? 'cubic-bezier(.5,0,.9,.4)' : 'cubic-bezier(.2,.7,.4,1)'}`,
        }}
      />
      {phase !== 'start' && (
        <div
          className="fixed rounded-full"
          style={{
            left: to.left + to.width / 2 - 40,
            top: to.top + to.height / 2 - 40,
            width: 80,
            height: 80,
            background:
              'radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,196,60,.7) 35%, rgba(220,38,38,0) 70%)',
            animation: `ezone-impact ${ATTACK_HIT + 120}ms ease-out ${ATTACK_OUT}ms both`,
          }}
        />
      )}
    </div>
  );
}

/**
 * A criatura destruída faz o caminho até o descarte e some numa fumaça vermelha.
 */
function DestroyStep({
  animation,
  onDone,
}: {
  animation: Extract<Animation, { kind: 'destroy' }>;
  onDone: () => void;
}) {
  const [from] = useState(() => rectOf(animation.from));
  const [to] = useState(() => rectOf(animation.to));
  const [moving, setMoving] = useState(false);
  const [smoking, setSmoking] = useState(false);
  const usable = from !== null && to !== null;

  useSequence(
    usable
      ? [
          { at: 0, run: () => setMoving(true) },
          { at: DESTROY_TRAVEL - 120, run: () => setSmoking(true) },
        ]
      : [],
    onDone,
    usable ? DESTROY_TRAVEL + DESTROY_SMOKE : 0,
  );

  if (!usable) return null;
  const delta = shift(from, to);
  const scale = to.width / from.width;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      <Ghost
        rect={from}
        cardId={animation.cardId}
        token={animation.token}
        className="ring-2 ring-ez-ember"
        style={{
          transform: moving
            ? `translate(${delta.x}px, ${delta.y}px) scale(${scale}) rotate(14deg)`
            : 'translate(0px, 0px) scale(1) rotate(0deg)',
          opacity: moving ? 0.35 : 1,
          filter: moving ? 'brightness(.6) saturate(1.6)' : 'none',
          transition: `transform ${DESTROY_TRAVEL}ms cubic-bezier(.4,0,.6,1), opacity ${DESTROY_TRAVEL}ms ease-in, filter ${DESTROY_TRAVEL}ms linear`,
        }}
      />
      {smoking && <RedSmoke at={to} />}
    </div>
  );
}

/** a fumaça vermelha que sobe do descarte */
function RedSmoke({ at }: { at: DOMRect }) {
  const puffs = [
    { size: 96, dx: 0, dy: 0, delay: 0 },
    { size: 70, dx: -20, dy: -14, delay: 70 },
    { size: 78, dx: 22, dy: -8, delay: 130 },
    { size: 56, dx: -4, dy: -30, delay: 200 },
  ];
  return (
    <>
      {puffs.map((puff, index) => (
        <div
          key={index}
          className="fixed rounded-full"
          style={{
            left: at.left + at.width / 2 + puff.dx - puff.size / 2,
            top: at.top + at.height / 2 + puff.dy - puff.size / 2,
            width: puff.size,
            height: puff.size,
            background:
              'radial-gradient(circle, rgba(248,113,113,.95) 0%, rgba(185,28,28,.75) 45%, rgba(127,29,29,0) 72%)',
            filter: 'blur(3px)',
            animation: `ezone-puff ${DESTROY_SMOKE}ms ease-out ${puff.delay}ms both`,
          }}
        />
      ))}
    </>
  );
}

/** O ponto conquistado, escrito grande no meio da tela. */
function ScoreBanner({
  animation,
  onDone,
}: {
  animation: Extract<Animation, { kind: 'score' }>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  useSequence([], onDone, SCORE_HOLD);
  const mine = animation.mine;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center">
      <div
        className="flex flex-col items-center gap-1 rounded-2xl px-10 py-6 text-center backdrop-blur-sm"
        style={{
          background: mine ? 'rgba(29,58,18,.75)' : 'rgba(69,20,12,.75)',
          boxShadow: `0 0 60px ${mine ? 'rgba(143,206,79,.5)' : 'rgba(207,100,32,.5)'}`,
          animation: `ezone-score ${SCORE_HOLD}ms cubic-bezier(.2,.8,.3,1) both`,
        }}
      >
        <span
          className={`font-title text-sm font-bold uppercase tracking-[0.3em] ${
            mine ? 'text-ez-moss' : 'text-ez-ember-light'
          }`}
        >
          {t(mine ? 'board.you' : 'board.opponentShort')}
        </span>
        <span
          className={`font-title text-7xl font-extrabold leading-none tabular-nums ${
            mine ? 'text-ez-moss-light' : 'text-[#f0a496]'
          }`}
          style={{ textShadow: '0 4px 24px rgba(0,0,0,.8)' }}
        >
          +{animation.gained}
        </span>
        <span className="font-title text-2xl font-bold uppercase tracking-wide text-ez-parchment">
          {t(animation.gained === 1 ? 'board.scorePoint' : 'board.scorePoints')}
        </span>
        <span className="text-lg font-bold tabular-nums text-ez-muted">
          {t('board.scoreTotal', { total: animation.total, max: POINTS_TO_WIN })}
        </span>
      </div>
    </div>
  );
}

function Ghost({
  rect,
  cardId,
  token,
  className,
  style,
}: {
  rect: DOMRect;
  cardId: number | null;
  token?: CreatureToken | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="fixed"
      style={{ left: rect.left, top: rect.top, width: rect.width, willChange: 'transform', ...style }}
    >
      {cardId !== null ? (
        <CardImage cardId={cardId} className={`w-full rounded shadow-2xl ${className ?? ''}`} />
      ) : (
        <div
          className={`aspect-[63/88] w-full rounded shadow-2xl ${className ?? ''}`}
          style={{
            backgroundColor: `#${(token?.color ?? 0x4b2a68).toString(16).padStart(6, '0')}`,
          }}
        />
      )}
    </div>
  );
}
