import { useEffect, useRef, useState } from 'react';
import type { CreatureToken } from '../../data/types.ts';
import { POINTS_TO_WIN } from '../../engine/state.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { useAnimationStore, type Anchor, type Animation } from '../stores/animationStore.ts';
import { ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';
import { CardImage } from './Card.tsx';
import { HeroPortrait } from './HeroPortrait.tsx';

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
/** a morte é em dois tempos: o estouro no slot, e só então a queda no descarte */
const DESTROY_BURST = 280;
const DESTROY_TRAVEL = 430;
const DESTROY_SMOKE = 420;
const DISCARD_TRAVEL = 420;
/** o atraso entre uma carta e a seguinte quando o descarte vem em lote */
const DISCARD_STAGGER = 70;
const SCORE_HOLD = 1600;
const ANNOUNCE_HOLD = 1150;
/**
 * A espera de fachada da janela de reação (decisão nº 39). Longa o bastante para
 * ler como "ele está avaliando" e curta o bastante para não cansar quem só quer
 * jogar — e é a MESMA com ou sem carta na mão do outro, que é o ponto dela.
 */
const THINKING_HOLD = 1250;
const HERO_HOLD = 900;

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
      ? { band: 'rgba(20,74,52,.6)', edge: 'rgba(99,199,123,.55)' }
      : announcement.tone === 'theirs'
        ? { band: 'rgba(96,28,20,.6)', edge: 'rgba(232,112,92,.55)' }
        : { band: 'rgba(96,68,16,.55)', edge: 'rgba(224,163,60,.55)' };

  return (
    <div className="pointer-events-none fixed inset-0 z-[54] flex items-center justify-center">
      <div
        className="w-full py-5 text-center"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${tone.band} 24%, ${tone.band} 76%, transparent 100%)`,
          borderTop: `1px solid ${tone.edge}`,
          borderBottom: `1px solid ${tone.edge}`,
          animation: `zn-banner ${ANNOUNCE_HOLD}ms ease both`,
        }}
      >
        <div className="zn-wordmark text-[clamp(20px,3.4vw,32px)] uppercase tracking-[0.3em] indent-[0.3em]">
          {resolve(announcement.title)}
        </div>
        {announcement.subtitle && (
          <div className="zn-num mt-1.25 text-[10px] uppercase tracking-[0.4em] text-zn-soft/80 indent-[0.4em]">
            {resolve(announcement.subtitle)}
          </div>
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
  if (animation.kind === 'discard') return <DiscardStep animation={animation} onDone={done} />;
  if (animation.kind === 'thinking') return <ThinkingPause onDone={done} />;
  if (animation.kind === 'hero') return <HeroFlash animation={animation} onDone={done} />;
  return <DestroyStep animation={animation} onDone={done} />;
}

function rectOf(anchor: Anchor): DOMRect | null {
  const element = document.querySelector(`[data-anchor="${anchor}"]`);
  return element ? element.getBoundingClientRect() : null;
}

/**
 * Um retângulo com a largura pedida, centrado onde a âncora está. Serve a quem
 * precisa do PONTO da âncora sem herdar o tamanho dela.
 */
function centered(at: DOMRect, width: number): DOMRect {
  const height = width * (555 / 415);
  return new DOMRect(
    at.left + at.width / 2 - width / 2,
    at.top + at.height / 2 - height / 2,
    width,
    height,
  );
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
        className={animation.direct ? 'ring-1 ring-zn-red' : 'ring-1 ring-zn-gold'}
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
 * A morte da criatura, em dois tempos (pedido do DevLukkas — antes ela apenas
 * deslizava para o descarte, e a morte em si passava despercebida):
 *
 * 1. ESTOURO no próprio slot: a carta branqueia, treme e a explosão abre em
 *    cima dela — é aí que se lê "esta criatura morreu", ainda no lugar onde
 *    ela estava lutando;
 * 2. QUEDA: só então ela tomba, desbota até sumir e cai no descarte, com a
 *    fumaça vermelha subindo de lá.
 *
 * Ficha (sem carta de catálogo) não tem para onde cair: `from` e `to` são o
 * mesmo slot, e o passo vira só o estouro no lugar.
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
  const [falling, setFalling] = useState(false);
  const [smoking, setSmoking] = useState(false);
  const usable = from !== null && to !== null;

  useSequence(
    usable
      ? [
          { at: DESTROY_BURST, run: () => setFalling(true) },
          { at: DESTROY_BURST + DESTROY_TRAVEL - 120, run: () => setSmoking(true) },
        ]
      : [],
    onDone,
    usable ? DESTROY_BURST + DESTROY_TRAVEL + DESTROY_SMOKE : 0,
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
        className="ring-1 ring-zn-red-deep"
        style={{
          transform: falling
            ? `translate(${delta.x}px, ${delta.y}px) scale(${scale}) rotate(22deg)`
            : 'translate(0px, 0px) scale(1.06) rotate(0deg)',
          opacity: falling ? 0 : 1,
          filter: falling
            ? 'brightness(.5) saturate(1.8)'
            : 'brightness(2.2) saturate(.35) contrast(1.3)',
          transition: falling
            ? `transform ${DESTROY_TRAVEL}ms cubic-bezier(.5,0,.7,1),` +
              ` opacity ${DESTROY_TRAVEL}ms ease-in, filter ${DESTROY_TRAVEL}ms linear`
            : `transform ${DESTROY_BURST}ms ease-out, filter ${DESTROY_BURST}ms ease-out`,
        }}
      />
      {/* o estouro abre no SLOT, não no descarte: é ali que a criatura morreu */}
      {!falling && <Burst at={from} />}
      {smoking && <RedSmoke at={to} />}
    </div>
  );
}

/** o clarão da explosão, no lugar onde a criatura estava */
function Burst({ at }: { at: DOMRect }) {
  const size = Math.max(at.width, at.height) * 1.5;
  const box = {
    left: at.left + at.width / 2 - size / 2,
    top: at.top + at.height / 2 - size / 2,
    width: size,
    height: size,
  };
  return (
    <>
      <div
        className="fixed rounded-full"
        style={{
          ...box,
          background:
            'radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,168,60,.8) 28%,' +
            ' rgba(220,38,38,.55) 52%, rgba(127,29,29,0) 74%)',
          animation: `ezone-impact ${DESTROY_BURST + 160}ms ease-out both`,
        }}
      />
      <div
        className="fixed rounded-full"
        style={{
          ...box,
          border: '2px solid rgba(255,214,140,.85)',
          animation: `zn-shock ${DESTROY_BURST + 220}ms cubic-bezier(.2,.8,.3,1) both`,
        }}
      />
    </>
  );
}

/**
 * Cartas indo para o descarte — da mão, do topo do deck (moagem) ou de cima de
 * uma criatura (anexo).
 *
 * Antes elas simplesmente sumiam da origem e a pilha do descarte crescia: quem
 * estava olhando o campo não via carta nenhuma sair de lugar nenhum (relato do
 * DevLukkas). Em lote ("descarte a mão inteira") as cartas partem em leque, uma
 * logo atrás da outra, em UM passo só — uma por passo faria a mão sumir num
 * comboio de dois segundos.
 */
function DiscardStep({
  animation,
  onDone,
}: {
  animation: Extract<Animation, { kind: 'discard' }>;
  onDone: () => void;
}) {
  const [from] = useState(() => rectOf(animation.from));
  const [to] = useState(() => rectOf(animation.to));
  const [moving, setMoving] = useState(false);
  const usable = from !== null && to !== null;
  const stagger = DISCARD_STAGGER * Math.max(0, animation.cards.length - 1);

  useSequence(
    usable ? [{ at: 20, run: () => setMoving(true) }] : [],
    onDone,
    usable ? DISCARD_TRAVEL + stagger + 60 : 0,
  );

  if (!usable) return null;
  /*
    A carta que voa NÃO herda a largura da âncora de origem: as três origens têm
    tamanhos muito diferentes (o leque da mão é largo, a linha de contagens da
    placa do oponente é uma faixa de texto, a pilha do deck é um selo), e uma
    delas sozinha faria a carta sair gigante ou invisível. O tamanho sai do
    DESTINO, que é sempre a mesma pilha, e a origem entrega só o ponto de
    partida — o centro dela.
  */
  const width = Math.max(to.width, Math.min(from.width, to.width * 2.4));
  const start = centered(from, width);
  const delta = shift(start, to);
  const scale = to.width / width;
  const middle = (animation.cards.length - 1) / 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      {animation.cards.map((card, index) => (
        <Ghost
          key={index}
          rect={start}
          cardId={card.cardId}
          token={card.token}
          className="ring-1 ring-zn-edge"
          style={{
            transform: moving
              ? `translate(${delta.x}px, ${delta.y}px) scale(${scale}) rotate(-12deg)`
              : `translate(${(index - middle) * 16}px, 0px) scale(1) rotate(0deg)`,
            opacity: moving ? 0.12 : 1,
            transition:
              `transform ${DISCARD_TRAVEL}ms cubic-bezier(.4,0,.5,1) ${index * DISCARD_STAGGER}ms,` +
              ` opacity ${DISCARD_TRAVEL}ms ease-in ${index * DISCARD_STAGGER}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * "O OPONENTE ESTÁ AVALIANDO": a espera de fachada da janela de reação.
 *
 * Ela não decide nada — o motor já resolveu o que tinha de resolver. O que ela
 * faz é gastar o MESMO tempo tendo o outro carta na mão ou não, que é o único
 * jeito de o relógio não entregar a mão dele (decisão nº 39).
 */
function ThinkingPause({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  useSequence([], onDone, THINKING_HOLD);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[38%] z-[54] flex justify-center">
      <div
        className="flex items-center gap-2.5 border border-zn-edge bg-zn-bar/95 px-5 py-2.5"
        style={{ animation: 'zn-fade .22s ease both' }}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden
            className="h-1.5 w-1.5"
            style={{
              background: ZN.gold,
              animation: `zn-fx-blink .9s ease-in-out ${dot * 0.18}s infinite`,
            }}
          />
        ))}
        <span className="zn-num text-[10px] uppercase tracking-[0.22em] text-zn-muted">
          {t('board.opponentThinking')}
        </span>
      </div>
    </div>
  );
}

/**
 * O efeito passivo do herói disparou. Ele já funcionava — o que faltava era
 * ALGUÉM VER: sem passo na linha do tempo, a cura da Maré Restauradora
 * acontecia na virada do turno e a leitura era "o herói não faz nada" (relato
 * do DevLukkas).
 */
function HeroFlash({
  animation,
  onDone,
}: {
  animation: Extract<Animation, { kind: 'hero' }>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  useSequence([], onDone, HERO_HOLD);
  const accent = animation.mine ? ZN.green : ZN.red;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[38%] z-[54] flex justify-center">
      <div
        className="flex items-center gap-3 border border-zn-edge bg-zn-bar/96 px-4 py-2.5"
        style={{
          borderLeft: `3px solid ${accent}`,
          animation: `zn-rise ${HERO_HOLD}ms cubic-bezier(.2,.8,.3,1) both`,
        }}
      >
        <HeroPortrait hero={animation.hero} size={34} />
        <span className="flex flex-col gap-0.5">
          <span
            className="zn-num text-[8.5px] uppercase tracking-[0.2em]"
            style={{ color: accent }}
          >
            {t(`hero.${animation.hero}.name` as TextKey)}
          </span>
          <span className="zn-head text-[15px] tracking-[0.06em]">
            {t(`hero.${animation.hero}.effectName` as TextKey)}
          </span>
        </span>
      </div>
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
  const accent = mine ? ZN.green : ZN.red;

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center">
      <div
        className="flex flex-col items-center gap-1.5 border border-zn-edge bg-zn-bar/95 px-11 py-7 text-center"
        style={{
          borderTop: `3px solid ${accent}`,
          animation: `ezone-score ${SCORE_HOLD}ms cubic-bezier(.2,.8,.3,1) both`,
        }}
      >
        <span className="zn-label uppercase">
          {t(mine ? 'board.you' : 'board.opponentShort')}
        </span>
        <span className="zn-wordmark text-[64px] leading-none" style={{ color: accent }}>
          +{animation.gained}
        </span>
        <span className="zn-head text-[22px] tracking-[0.1em]">
          {t(animation.gained === 1 ? 'board.scorePoint' : 'board.scorePoints')}
        </span>
        <span className="zn-num text-[13px] font-bold text-zn-muted">
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
        <CardImage cardId={cardId} className={`w-full ${className ?? ''}`} />
      ) : (
        <div
          className={`aspect-[415/555] w-full ${className ?? ''}`}
          style={{
            backgroundColor: `#${(token?.color ?? 0x4b2a68).toString(16).padStart(6, '0')}`,
          }}
        />
      )}
    </div>
  );
}
