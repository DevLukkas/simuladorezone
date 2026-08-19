import { useEffect, useRef, useState } from 'react';
import { cardById } from '../../data/cards.ts';
import type { Card as CatalogCard, Element } from '../../data/types.ts';
import {
  creatureActivations,
  handActivations,
  type ActivationScope,
} from '../../engine/activation.ts';
import { canBeAttackTarget } from '../../engine/combat.ts';
import {
  DIRECT_DAMAGE_PER_POINT,
  POINTS_TO_WIN,
  REACTION_SECONDS,
  SLOTS_PER_SIDE,
  TURN_SECONDS,
  oppositeSide,
  type AttachmentInPlay,
  type CardInZone,
  type CreatureInPlay,
  type SideId,
} from '../../engine/state.ts';
import type { GameView } from '../../engine/view.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { useMatchStore } from '../stores/matchStore.ts';
import { useAnimationBusy, useMovingUid, useShatter } from '../stores/animationStore.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { AnimationLayer } from './AnimationLayer.tsx';
import { CardImage, CreatureOnField } from './Card.tsx';
import { HeroPortrait } from './HeroPortrait.tsx';

type TargetMode =
  | { type: 'summon'; cardUid: string }
  | { type: 'attach'; cardUid: string }
  | { type: 'command'; cardUid: string; targetSide: SideId }
  | null;

/** proporção do molde (415x555): o tabuleiro dimensiona pela ALTURA disponível */
const CARD_RATIO = 415 / 555;

/**
 * Largura da coluna de zonas: a da pilha, mas nunca menos que o rótulo embaixo dela.
 *
 * Em janela baixa (720p) a pilha encolhe para uns 22px e "DESCARTE" tem uns 40 —
 * sem este piso a legenda vazava para fora da tela. O mesmo número é usado pelo
 * ESPAÇADOR do outro lado da fileira, senão as colunas de ataque desalinham.
 */
const ZONE_MIN_WIDTH = 58;

function zoneColumnWidth(cardHeight: number): number {
  return Math.max(cardHeight * CARD_RATIO + 4, ZONE_MIN_WIDTH);
}

/**
 * Piso de tempo para responder uma janela de reação. A pergunta espera a animação
 * (decisão nº 25), mas o relógio manda: no online o prazo é do servidor e corre
 * desde o lance, então um lote grande de eventos poderia queimar os 7 segundos
 * atrás de um modal que nunca abriu. Com menos que isto sobrando, a pergunta entra
 * por cima — perder o direito de responder é pior que ver a pergunta sobre o vídeo.
 */
const MIN_ANSWER_MS = 5_000;

function canAttackInView(view: GameView, creature: CreatureInPlay): boolean {
  if (view.winner || view.phase !== 'battle' || view.activeSide !== view.side) return false;
  if (creature.attackedOnTurn === view.turn) return false;
  if (creature.canAttackFromTurn > view.turn) return false;
  if ((creature.cannotAttackUntilTurn ?? 0) >= view.turn) return false;
  return true;
}

/**
 * Tamanho da caixa, medido em vez de calculado: o tabuleiro inteiro cabe na janela
 * (`h-[100dvh]`, sem rolagem) e cada fileira reparte a altura que sobrou. Como a
 * carta tem proporção fixa, a ALTURA da fileira decide a largura da carta — e o
 * mesmo cálculo limita pela largura, para o tabuleiro caber também em monitor baixo
 * e largo ou em janela estreita.
 */
function useBoxSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

export function Board() {
  const { view, mode, log, lastRefusal, opponentNickname, deadlineMs, send, leave, startTraining } =
    useMatchStore();
  const { t, resolve, cardRulesText } = useTranslation();
  const [handSelection, setHandSelection] = useState<string | null>(null);
  const [viewingDiscard, setViewingDiscard] = useState<'me' | 'opponent' | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>(null);
  const [replacing, setReplacing] = useState<{ cardUid: string; slot: number } | null>(null);
  const [activating, setActivating] = useState<{ creature: CreatureInPlay; slot: number } | null>(
    null,
  );
  /* fechado por padrão: virou gaveta por cima do campo, e o campo vem primeiro */
  const [showLog, setShowLog] = useState(false);
  /* desistir é irreversível e o botão mora na barra do turno: pergunta antes */
  const [confirmingConcede, setConfirmingConcede] = useState(false);
  /** a linha do tempo da animação ainda está contando o lance anterior */
  const animating = useAnimationBusy();
  const timeLeft = useTimeLeft(deadlineMs);
  const [choosingElement, setChoosingElement] = useState<{
    sourceUid: string;
    abilityId: string;
    options: Element[];
  } | null>(null);

  if (!view) return null;
  const mySide = view.side;
  const enemySide = oppositeSide(mySide);
  const me = view.me;
  const opponent = view.opponent;
  const myTurn =
    view.activeSide === mySide &&
    !view.pending &&
    !view.waitingForOpponent &&
    view.phase !== 'mulligan' &&
    !view.winner;
  /**
   * É a vez E a animação já acabou de contar o que aconteceu (decisão nº 25).
   * O botão do turno continua desenhado enquanto a animação corre — só desligado —,
   * porque sumir e voltar sozinho é o "atropelo" que esta trava veio resolver.
   */
  const canAct = myTurn && !animating;
  const pending = view.pending;
  const askNow =
    pending !== null && (!animating || (pending.reaction === true && timeLeft <= MIN_ANSWER_MS));
  /** o que o motor aceitaria ativar agora — brilho na criatura e ícone na mão */
  const scope: ActivationScope = {
    turn: view.turn,
    field: me.field,
    discard: me.discard,
    hand: me.hand,
  };
  const canActivateNow = canAct && view.phase === 'main';

  function clearSelection() {
    setHandSelection(null);
    setTargetMode(null);
    setReplacing(null);
    setActivating(null);
    setChoosingElement(null);
  }

  function dispatch(command: Parameters<typeof send>[0]) {
    send(command);
    clearSelection();
  }

  function playFromHand(inHand: CardInZone, card: CatalogCard) {
    if (card.type === 'creature') {
      // Leviathan de Esdras: não é invocável normalmente, ativa-se da mão. Mesmo
      // sem o alvo pronto o comando vai — a recusa do motor diz o que falta, o que
      // é mais útil do que oferecer uma invocação que ele nunca aceitaria
      const fromHand = (card.activatedAbilities ?? []).find(
        (ability) => ability.source === 'hand',
      );
      if (fromHand && card.summonRule?.normal === false) {
        dispatch({
          type: 'ACTIVATE_ABILITY',
          side: mySide,
          sourceUid: inHand.uid,
          abilityId: fromHand.id,
        });
        return;
      }
      setTargetMode({ type: 'summon', cardUid: inHand.uid });
    } else if (card.type === 'ability' || card.type === 'item') {
      setTargetMode({ type: 'attach', cardUid: inHand.uid });
    } else if (card.type === 'scenario') {
      dispatch({ type: 'PLAY_SCENARIO', side: mySide, cardUid: inHand.uid });
    } else if (card.type === 'command') {
      const needsTarget = (card.effects ?? []).find(
        (effect) =>
          'target' in effect && (effect.target === 'chosen_enemy' || effect.target === 'chosen_ally'),
      );
      if (!needsTarget) {
        dispatch({ type: 'PLAY_COMMAND', side: mySide, cardUid: inHand.uid });
        return;
      }
      const targetSide =
        'target' in needsTarget && needsTarget.target === 'chosen_enemy' ? enemySide : mySide;
      setTargetMode({ type: 'command', cardUid: inHand.uid, targetSide });
    }
  }

  function onMySlotClick(slot: number) {
    if (!targetMode) {
      const creature = me.field[slot];
      if (!creature) return;
      if (view!.phase === 'battle' && canAct) {
        send({ type: 'ATTACK', side: mySide, slot });
        return;
      }
      if (view!.phase === 'main' && canAct) setActivating({ creature, slot });
      return;
    }
    if (targetMode.type === 'summon') {
      dispatch({ type: 'SUMMON', side: mySide, cardUid: targetMode.cardUid, slot });
      return;
    }
    if (targetMode.type === 'attach') {
      const creature = me.field[slot];
      if (!creature) return;
      if (creature.attachments.length >= 2) {
        setReplacing({ cardUid: targetMode.cardUid, slot });
        setTargetMode(null);
        return;
      }
      dispatch({ type: 'ATTACH', side: mySide, cardUid: targetMode.cardUid, slot });
      return;
    }
    if (targetMode.type === 'command' && targetMode.targetSide === mySide) {
      dispatch({
        type: 'PLAY_COMMAND',
        side: mySide,
        cardUid: targetMode.cardUid,
        target: { side: mySide, slot },
      });
    }
  }

  function onEnemySlotClick(slot: number) {
    if (targetMode?.type === 'command' && targetMode.targetSide === enemySide) {
      dispatch({
        type: 'PLAY_COMMAND',
        side: mySide,
        cardUid: targetMode.cardUid,
        target: { side: enemySide, slot },
      });
    }
  }

  const selectedCard = handSelection
    ? me.hand.find((inHand) => inHand.uid === handSelection)
    : undefined;
  const phaseLabel =
    view.phase === 'main'
      ? t('board.mainPhase')
      : view.phase === 'battle'
        ? t('board.battlePhase')
        : t('board.mulliganTitle');
  const hint = lastRefusal
    ? { text: resolve(lastRefusal), tone: 'text-ez-gold-light' }
    : targetMode
      ? { text: t('board.targetHint'), tone: 'text-ez-blue-light' }
      : selectedCard
        ? { text: cardRulesText(selectedCard.cardId) ?? t('card.noText'), tone: 'text-ez-muted' }
        : { text: t('board.zoomHint'), tone: 'text-ez-dim' };

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-ez-ink">
      {/* o campo do legado rebaixado a fundo: quem tem de ser lido são as cartas */}
      <img
        src="/assets/img/bg_gameBattle.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 600px at 50% 50%, rgba(6,8,15,.25), rgba(6,8,15,.88) 78%),' +
            ' linear-gradient(180deg, rgba(6,8,15,.75), rgba(6,8,15,.15) 30%,' +
            ' rgba(6,8,15,.15) 70%, rgba(6,8,15,.85))',
        }}
      />
      <AnimationLayer />

      <div className="relative z-2 flex h-full min-w-0 flex-col p-2">
        <HeroPlate
          side={enemySide}
          hero={opponent.hero}
          name={opponentNickname}
          points={opponent.points}
          directDamage={opponent.directDamage}
          deck={opponent.deckCount}
          hand={opponent.handCount}
          discard={opponent.discard.length}
          active={view.activeSide === enemySide}
        />
        <FieldLine
          side={enemySide}
          field={opponent.field}
          deckCount={opponent.deckCount}
          discard={opponent.discard}
          scenario={opponent.scenario}
          onViewDiscard={() => setViewingDiscard('opponent')}
          onClickSlot={onEnemySlotClick}
          highlight={targetMode?.type === 'command' && targetMode.targetSide === enemySide}
        />

        <div className="relative shrink-0 border-y border-ez-line-soft py-1.5">
          {!view.winner && (
            <FuseBar
              deadlineMs={deadlineMs}
              totalSeconds={view.pending?.reaction ? REACTION_SECONDS : TURN_SECONDS}
            />
          )}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <span className="font-title text-[15px] font-bold uppercase tracking-[0.18em] text-ez-parchment">
              {t('board.turn', { turn: view.turn })} — {phaseLabel}
            </span>
            {view.waitingForOpponent && (
              <span className="text-sm text-ez-gold-light">{t('board.opponentDeciding')}</span>
            )}
            {myTurn && view.phase === 'main' && (
              <button
                type="button"
                disabled={!canAct}
                className="ez-btn ez-btn-ember ez-btn-sm"
                onClick={() => send({ type: 'ADVANCE_PHASE', side: mySide })}
              >
                {t('board.goToBattle')}
              </button>
            )}
            {myTurn && (
              <button
                type="button"
                disabled={!canAct}
                className="ez-btn ez-btn-blue ez-btn-sm"
                onClick={() => dispatch({ type: 'END_TURN', side: mySide })}
              >
                {t('board.endTurn')}
              </button>
            )}
            <button
              type="button"
              className="ez-btn ez-btn-ghost ez-btn-ghost-danger ez-btn-sm"
              onClick={() => setConfirmingConcede(true)}
            >
              {t('board.concede')}
            </button>
            <button
              type="button"
              title={t(showLog ? 'board.hideLog' : 'board.showLog')}
              className="ez-btn ez-btn-ghost ez-btn-sm"
              onClick={() => setShowLog((open) => !open)}
            >
              {showLog ? '›' : '‹'} {t('board.log')}
            </button>
            <span className={`max-w-90 truncate text-[13px] ${hint.tone}`}>
              {hint.text}
              {targetMode && (
                <>
                  {' '}
                  <button type="button" className="underline" onClick={clearSelection}>
                    {t('board.cancelLink')}
                  </button>
                </>
              )}
            </span>
          </div>
        </div>

        <FieldLine
          side={mySide}
          mirrored
          field={me.field}
          deckCount={me.deckCount}
          discard={me.discard}
          scenario={me.scenario}
          onViewDiscard={() => setViewingDiscard('me')}
          onClickSlot={onMySlotClick}
          highlight={
            targetMode?.type === 'summon' ||
            targetMode?.type === 'attach' ||
            (targetMode?.type === 'command' && targetMode.targetSide === mySide)
          }
          canAttackNow={(creature, slot) => {
            if (!canAct || !canAttackInView(view, creature)) return false;
            const defender = opponent.field[slot];
            return !defender || canBeAttackTarget(view.turn, defender, creature, me.field);
          }}
          hasActivation={(creature, slot) =>
            canActivateNow && creatureActivations(creature, slot, scope).length > 0
          }
        />
        <HeroPlate
          side={mySide}
          mine
          hero={me.hero}
          name={t('board.you')}
          points={me.points}
          directDamage={me.directDamage}
          deck={me.deckCount}
          hand={me.hand.length}
          discard={me.discard.length}
          active={view.activeSide === mySide}
        />

        <HandRow
          hand={me.hand}
          selectedUid={handSelection}
          playable={canAct && view.phase === 'main'}
          hasActivation={(inHand) => canActivateNow && handActivations(inHand, scope).length > 0}
          onSelect={(uid) => {
            if (!canAct || view.phase !== 'main') return;
            setHandSelection(uid === handSelection ? null : uid);
            setTargetMode(null);
          }}
          onPlay={playFromHand}
        />
      </div>

      {/*
        O registro virou gaveta POR CIMA do tabuleiro, e não coluna ao lado (revoga a
        parte da decisão nº 24 que reservava largura para ele): fechado, o campo fica
        com a janela inteira — que é o que faltava em 1366 e em 1280 de largura.
      */}
      {showLog && (
        <aside
          className="absolute inset-y-0 right-0 z-8 flex w-[min(320px,84vw)] flex-col border-l border-ez-line bg-ez-abyss/96 backdrop-blur-sm"
          style={{
            boxShadow: '-20px 0 50px rgba(0,0,0,.5)',
            animation: 'ez-fade-in .25s ease both',
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-ez-line-soft px-4 py-3.5">
            <h2 className="ez-heading text-[13px] uppercase tracking-[0.18em]">{t('board.log')}</h2>
            <button
              type="button"
              title={t('board.hideLog')}
              className="cursor-pointer text-lg text-ez-muted transition-colors hover:text-ez-gold-light"
              onClick={() => setShowLog(false)}
            >
              ✕
            </button>
          </div>
          <ol className="flex min-h-0 flex-1 flex-col-reverse gap-1.5 overflow-y-auto px-4 py-3">
            {[...log].reverse().map((line, i) => (
              <li
                key={log.length - i}
                className="border-l-2 border-ez-line pl-2.5 text-[13px] leading-5 text-[#aab8d0]"
              >
                {resolve(line)}
              </li>
            ))}
          </ol>
        </aside>
      )}

      {view.phase === 'mulligan' && !me.mulliganDone && !view.winner && !animating && (
        <Modal title={t('board.mulliganTitle')}>
          <p className="mb-4 text-center text-[15px] text-[#aab8d0]">{t('board.mulliganQuestion')}</p>
          <div className="mb-3 flex gap-2">
            {me.hand.map((inHand) => (
              <CardImage key={inHand.uid} cardId={inHand.cardId} className="w-24 rounded" />
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <ModalButton
              onClick={() => send({ type: 'DECIDE_MULLIGAN', side: mySide, swap: false })}
            >
              {t('board.mulliganKeep')}
            </ModalButton>
            <ModalButton
              tone="amber"
              onClick={() => send({ type: 'DECIDE_MULLIGAN', side: mySide, swap: true })}
            >
              {t('board.mulliganSwap')}
            </ModalButton>
          </div>
        </Modal>
      )}

      {/*
        A pergunta só entra com a linha do tempo vazia: o jogador precisa ter VISTO
        a ação do oponente antes de decidir se reage a ela, e o relógio da reação
        (que o treino só arma nesta hora) não pode queimar atrás do modal fechado.
        O oponente fica travado enquanto isto está aberto — não por gentileza da
        tela, mas porque o motor recusa qualquer comando com escolha pendente.
      */}
      {pending && askNow && (
        <Modal title={resolve(pending.title)}>
          {pending.reaction && deadlineMs !== null && <ReactionCountdown deadlineMs={deadlineMs} />}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {pending.options.map((option) => {
              const inHand = me.hand.find((card) => card.uid === option.id);
              const answerWith = () =>
                send({ type: 'ANSWER', side: mySide, pendingId: pending.id, optionId: option.id });
              if (inHand) {
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="w-24 cursor-pointer rounded transition-transform hover:-translate-y-1 hover:ring-2 hover:ring-ez-gold-light"
                    onClick={answerWith}
                  >
                    <CardImage cardId={inHand.cardId} />
                  </button>
                );
              }
              return (
                <ModalButton key={option.id} onClick={answerWith}>
                  {resolve(option.label)}
                </ModalButton>
              );
            })}
            {pending.canDecline && (
              <ModalButton
                tone="gray"
                onClick={() =>
                  send({
                    type: 'ANSWER',
                    side: mySide,
                    pendingId: pending.id,
                    optionId: 'decline',
                  })
                }
              >
                {t('common.decline')}
              </ModalButton>
            )}
          </div>
        </Modal>
      )}

      {viewingDiscard && (
        <Modal title={t(viewingDiscard === 'me' ? 'board.yourDiscard' : 'board.opponentDiscard')}>
          {(viewingDiscard === 'me' ? me.discard : opponent.discard).length ? (
            <div className="flex max-h-[60vh] max-w-xl flex-wrap justify-center gap-2 overflow-y-auto">
              {[...(viewingDiscard === 'me' ? me.discard : opponent.discard)]
                .reverse()
                .map((card) => (
                  <CardImage key={card.uid} cardId={card.cardId} className="w-20 rounded" />
                ))}
            </div>
          ) : (
            <p className="text-center text-sm text-ez-muted">{t('board.discardEmpty')}</p>
          )}
          <p className="mt-2 text-center text-xs text-ez-dim">{t('board.discardOrder')}</p>
          <div className="mt-3 flex justify-center">
            <ModalButton tone="gray" onClick={() => setViewingDiscard(null)}>
              {t('common.close')}
            </ModalButton>
          </div>
        </Modal>
      )}

      {replacing && (
        <Modal title={t('board.replaceAttachment')}>
          <div className="flex justify-center gap-3">
            {me.field[replacing.slot]?.attachments.map((attachment) => (
              <button
                key={attachment.uid}
                type="button"
                className="w-24"
                onClick={() =>
                  dispatch({
                    type: 'ATTACH',
                    side: mySide,
                    cardUid: replacing.cardUid,
                    slot: replacing.slot,
                    replaceAttachmentUid: attachment.uid,
                  })
                }
              >
                <CardImage cardId={attachment.cardId} />
              </button>
            ))}
            <ModalButton tone="gray" onClick={clearSelection}>
              {t('common.cancel')}
            </ModalButton>
          </div>
        </Modal>
      )}

      {activating && (
        <Modal title={t('board.creature')}>
          <ActivationPanel
            creature={activating.creature}
            slot={activating.slot}
            scope={scope}
            onActivate={(sourceUid, abilityId, elements) => {
              if (elements) {
                setChoosingElement({ sourceUid, abilityId, options: elements });
                setActivating(null);
                return;
              }
              dispatch({ type: 'ACTIVATE_ABILITY', side: mySide, sourceUid, abilityId });
            }}
            onClose={clearSelection}
          />
        </Modal>
      )}

      {choosingElement && (
        <Modal title={t('board.chooseElement')}>
          <div className="flex flex-wrap justify-center gap-2">
            {choosingElement.options.map((element) => (
              <ModalButton
                key={element}
                onClick={() =>
                  dispatch({
                    type: 'ACTIVATE_ABILITY',
                    side: mySide,
                    sourceUid: choosingElement.sourceUid,
                    abilityId: choosingElement.abilityId,
                    element,
                  })
                }
              >
                {t(`element.${element}`)}
              </ModalButton>
            ))}
            <ModalButton tone="gray" onClick={clearSelection}>
              {t('common.cancel')}
            </ModalButton>
          </div>
        </Modal>
      )}

      {/*
        Desistir entrega a partida e não tem volta, e o botão vive na mesma barra do
        "fim de turno" — clicar sem querer custava o jogo inteiro (pedido do
        DevLukkas). Some sozinho quando a partida acaba de outro jeito, senão o modal
        do desfecho apareceria por baixo desta pergunta.
      */}
      {confirmingConcede && !view.winner && (
        <Modal title={t('board.concedeTitle')}>
          <p className="mb-5 text-center text-[15px] text-[#aab8d0]">
            {t('board.concedeQuestion')}
          </p>
          <div className="flex justify-center gap-3">
            <ModalButton tone="gray" onClick={() => setConfirmingConcede(false)}>
              {t('common.cancel')}
            </ModalButton>
            <ModalButton
              tone="danger"
              onClick={() => {
                setConfirmingConcede(false);
                send({ type: 'CONCEDE', side: mySide });
              }}
            >
              {t('board.concedeConfirm')}
            </ModalButton>
          </div>
        </Modal>
      )}

      {/* o fim só é anunciado depois do último passo — o ponto que venceu se vê antes */}
      {view.winner && !animating && (
        <Modal title={t(view.winner === mySide ? 'board.victory' : 'board.defeat')} grand>
          <p className="mb-5 text-center text-[15px] text-[#aab8d0]">
            {view.endReason === 'points'
              ? t('board.byPoints')
              : view.endReason === 'concede'
                ? t('board.byConcede')
                : t('board.byTimeout')}
          </p>
          <div className="flex justify-center gap-3">
            {mode === 'training' && (
              <ModalButton onClick={() => startTraining()}>{t('board.playAgain')}</ModalButton>
            )}
            <ModalButton tone="gray" onClick={leave}>
              {t('board.menu')}
            </ModalButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** ms que faltam do prazo — Infinito quando não há prazo correndo. */
function useTimeLeft(deadlineMs: number | null): number {
  const [left, setLeft] = useState(() =>
    deadlineMs === null ? Infinity : Math.max(0, deadlineMs - Date.now()),
  );
  useEffect(() => {
    if (deadlineMs === null) {
      setLeft(Infinity);
      return;
    }
    const tick = () => setLeft(Math.max(0, deadlineMs - Date.now()));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [deadlineMs]);
  return left;
}

function useRemaining(deadlineMs: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadlineMs - Date.now()));
  useEffect(() => {
    setRemaining(Math.max(0, deadlineMs - Date.now()));
    const interval = setInterval(() => setRemaining(Math.max(0, deadlineMs - Date.now())), 250);
    return () => clearInterval(interval);
  }, [deadlineMs]);
  return remaining;
}

/**
 * O "fusível" do legado: barra que queima da esquerda para a direita.
 *
 * `deadlineMs` nulo é prazo que ainda NÃO começou a correr — a animação está
 * contando o lance (decisão nº 25). A barra fica cheia e apagada em vez de sumir:
 * ela reserva a própria altura, e barra que aparece e desaparece a cada virada é o
 * mesmo pulo de tela que esta trava veio tirar.
 */
function FuseBar({ deadlineMs, totalSeconds }: { deadlineMs: number | null; totalSeconds: number }) {
  const left = useTimeLeft(deadlineMs);
  const held = deadlineMs === null;
  const remaining = held ? totalSeconds * 1000 : left;
  const seconds = Math.ceil(remaining / 1000);
  const fraction = Math.max(0, Math.min(1, remaining / (totalSeconds * 1000)));
  const color =
    fraction > 0.4
      ? 'linear-gradient(90deg,#8fce4f,#d9a940)'
      : fraction > 0.2
        ? 'linear-gradient(90deg,#d9a940,#f7a44a)'
        : 'linear-gradient(90deg,#cf6420,#c0392b)';
  return (
    <div className={`mb-1.5 flex items-center gap-2 text-xs ${held ? 'opacity-40' : ''}`}>
      <span
        className={`w-14 text-right font-bold tabular-nums ${
          fraction > 0.2 ? 'text-ez-muted' : 'text-ez-blood-light'
        }`}
      >
        ⏱ {seconds}s
      </span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-sm bg-[#141b31]">
        <div
          className="h-full rounded-sm transition-[width] duration-200 ease-linear"
          style={{ width: `${fraction * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ReactionCountdown({ deadlineMs }: { deadlineMs: number }) {
  const remaining = useRemaining(deadlineMs);
  return (
    <p className="ez-heading mb-3 text-center text-2xl tabular-nums text-ez-ember-light">
      {Math.max(0, Math.ceil(remaining / 1000))}s
    </p>
  );
}

function ZoneColumn({
  side,
  deckCount,
  discard,
  scenario,
  cardHeight,
  onViewDiscard,
}: {
  side: SideId;
  deckCount: number;
  discard: readonly CardInZone[];
  scenario: CardInZone | null;
  /** medida pela fileira, para as duas colunas de zona terem a mesma largura */
  cardHeight: number;
  onViewDiscard: () => void;
}) {
  const { t } = useTranslation();
  const discardTop = discard[discard.length - 1];
  const width = cardHeight * CARD_RATIO;
  /* a pilha manda na largura do grupo, o rótulo se corta nela e nunca a estica */
  const group = 'flex w-full min-w-0 flex-col items-center';
  const label = 'w-full truncate';

  return (
    <div
      className="font-title flex h-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden text-center text-[9px] font-bold uppercase tracking-[0.1em] text-ez-muted"
      style={{ width: zoneColumnWidth(cardHeight) }}
    >
      <div className={group}>
        <div className="relative" style={{ height: cardHeight, width }}>
          <img
            src="/assets/img/cover.png"
            alt={t('board.deck')}
            draggable={false}
            className={`h-full w-full rounded object-cover ${deckCount ? '' : 'opacity-25 grayscale'}`}
            style={{ boxShadow: '2px 2px 0 #0a0f22, 4px 4px 0 #0d1430, 0 10px 20px rgba(0,0,0,.6)' }}
          />
          <CountBadge value={deckCount} />
        </div>
        <div className={label}>{t('board.deck')}</div>
      </div>
      <div className={group}>
        <button
          type="button"
          onClick={onViewDiscard}
          title={t('board.seeDiscard')}
          data-anchor={`discard:${side}`}
          className="relative block cursor-pointer rounded hover:ring-2 hover:ring-ez-blue-light"
          style={{ height: cardHeight, width }}
        >
          {discardTop ? (
            <CardImage cardId={discardTop.cardId} className="h-full w-auto rounded" />
          ) : (
            <div className="h-full w-full rounded border border-dashed border-ez-line" />
          )}
          <CountBadge value={discard.length} />
        </button>
        <div className={label}>{t('board.discard')}</div>
      </div>
      <div className={group}>
        <div style={{ height: cardHeight, width }}>
          {scenario ? (
            <CardImage
              cardId={scenario.cardId}
              className="h-full w-auto rounded ring-1 ring-ez-moss/60"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-ez-moss/30 text-ez-moss/50">
              ∅
            </div>
          )}
        </div>
        <div className={label}>{t('board.scenario')}</div>
      </div>
    </div>
  );
}

function CountBadge({ value }: { value: number }) {
  return (
    <span className="absolute -bottom-1 -right-1 rounded-full bg-ez-ink px-1.5 text-[10px] font-bold text-ez-text ring-1 ring-ez-line">
      {value}
    </span>
  );
}

function FieldRow({
  side,
  field,
  cardHeight,
  stripHeight,
  gap,
  onClickSlot,
  highlight,
  canAttackNow,
  hasActivation,
}: {
  side: SideId;
  field: readonly (CreatureInPlay | null)[];
  cardHeight: number;
  stripHeight: number;
  gap: number;
  onClickSlot: (slot: number) => void;
  highlight?: boolean;
  canAttackNow?: (creature: CreatureInPlay, slot: number) => boolean;
  hasActivation?: (creature: CreatureInPlay, slot: number) => boolean;
}) {
  const { t } = useTranslation();
  /** o atacante sai do slot enquanto o fantasma vai bater e voltar */
  const movingUid = useMovingUid();
  const cardWidth = cardHeight * CARD_RATIO;

  return (
    <div className="flex min-w-0 flex-1 items-start justify-center overflow-hidden" style={{ gap }}>
      {field.map((creature, slot) => {
        const ready = creature ? (hasActivation?.(creature, slot) ?? false) : false;
        return (
          <div key={slot} className="flex h-full flex-col items-center" style={{ width: cardWidth }}>
            <div
              data-anchor={`slot:${side}:${slot}`}
              className="relative rounded border border-transparent"
              style={{
                height: cardHeight,
                width: cardWidth,
                ...(highlight && !creature
                  ? { animation: 'ez-slot-pulse 1.4s ease-in-out infinite' }
                  : highlight
                    ? { borderColor: 'rgba(232,193,90,.7)' }
                    : {}),
              }}
            >
              {creature ? (
                <div
                  className={`relative h-full ${creature.uid === movingUid ? 'invisible' : ''}`}
                  title={ready ? t('board.canActivate') : undefined}
                  style={
                    ready
                      ? { animation: 'ezone-ready 1.6s ease-in-out infinite', borderRadius: 6 }
                      : undefined
                  }
                >
                  <CreatureOnField
                    creature={creature}
                    field={field}
                    className="h-full"
                    onClick={() => onClickSlot(slot)}
                  />
                  {canAttackNow?.(creature, slot) && (
                    <span className="font-title pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gradient-to-b from-[#f7a44a] to-[#934011] px-1.5 text-[10px] font-bold tracking-wider text-[#fff3e4] shadow-md">
                      {t('board.attack')}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="font-title h-full w-full cursor-pointer rounded border border-dashed border-ez-line/70 text-lg text-ez-faint transition-colors hover:bg-white/5 hover:text-ez-muted"
                  onClick={() => onClickSlot(slot)}
                >
                  {slot + 1}
                </button>
              )}
            </div>
            {stripHeight > 0 && creature && (
              <AttachmentStrip attachments={creature.attachments} height={stripHeight} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Uma fileira inteira do tabuleiro: coluna de zonas (deck/descarte/cenário) de um
 * lado, campo no meio e um ESPAÇADOR da mesma largura do outro.
 *
 * O espaçador não é enfeite: sem ele o campo do jogador começaria colado na borda
 * enquanto o do oponente começaria depois da coluna de zonas, e as colunas de
 * ataque — que são a regra do jogo, "só ataca quem está em frente" — deixariam de
 * ficar uma sobre a outra na tela. Medir aqui, uma vez por fileira, é o que garante
 * que as duas usem exatamente a mesma geometria.
 */
function FieldLine({
  side,
  mirrored,
  field,
  deckCount,
  discard,
  scenario,
  onViewDiscard,
  onClickSlot,
  highlight,
  canAttackNow,
  hasActivation,
}: {
  side: SideId;
  /** lado do jogador: as zonas ficam à direita */
  mirrored?: boolean;
  field: readonly (CreatureInPlay | null)[];
  deckCount: number;
  discard: readonly CardInZone[];
  scenario: CardInZone | null;
  onViewDiscard: () => void;
  onClickSlot: (slot: number) => void;
  highlight?: boolean;
  canAttackNow?: (creature: CreatureInPlay, slot: number) => boolean;
  hasActivation?: (creature: CreatureInPlay, slot: number) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const gap = 8;

  /** três pilhas empilhadas: cada uma fica com um terço da fileira, menos o rótulo */
  const zoneCardHeight = Math.max(24, Math.min(box.height / 3 - 14, 132));
  const zoneWidth = zoneColumnWidth(zoneCardHeight);
  const fieldWidth = Math.max(0, box.width - 2 * (zoneWidth + gap));
  const slotWidth = Math.max(0, (fieldWidth - gap * (SLOTS_PER_SIDE - 1)) / SLOTS_PER_SIDE);
  // a faixa de anexos só rouba altura quando há anexo na fileira
  const anyAttachment = field.some((creature) => (creature?.attachments.length ?? 0) > 0);
  const stripHeight = anyAttachment ? Math.max(22, box.height * 0.24) : 0;
  const cardHeight = Math.max(0, Math.min(box.height - stripHeight - 2, slotWidth / CARD_RATIO));

  const zone = (
    <ZoneColumn
      side={side}
      deckCount={deckCount}
      discard={discard}
      scenario={scenario}
      cardHeight={zoneCardHeight}
      onViewDiscard={onViewDiscard}
    />
  );
  const spacer = <div className="shrink-0" style={{ width: zoneWidth }} />;

  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-stretch" style={{ gap }}>
      {mirrored ? spacer : zone}
      <FieldRow
        side={side}
        field={field}
        cardHeight={cardHeight}
        stripHeight={stripHeight}
        gap={gap}
        onClickSlot={onClickSlot}
        {...(highlight === undefined ? {} : { highlight })}
        {...(canAttackNow ? { canAttackNow } : {})}
        {...(hasActivation ? { hasActivation } : {})}
      />
      {mirrored ? zone : spacer}
    </div>
  );
}

/**
 * Os anexos da criatura, meus e do oponente, desenhados debaixo dela — antes só
 * existia o contador "+2" no canto, e o jogador não tinha como saber o que estava
 * anexado sem abrir a carta. Clique amplia.
 */
function AttachmentStrip({
  attachments,
  height,
}: {
  attachments: readonly AttachmentInPlay[];
  height: number;
}) {
  const zoom = useCardZoomStore((state) => state.zoom);
  const { t, cardName } = useTranslation();
  if (!attachments.length) return null;
  return (
    <div
      className="flex w-full items-start justify-center gap-1 pt-0.5"
      style={{ height }}
      title={t('board.attachments')}
    >
      {attachments.map((attachment) => (
        <button
          key={attachment.uid}
          type="button"
          onClick={() => zoom(attachment.cardId)}
          title={cardName(attachment.cardId)}
          className="cursor-pointer rounded ring-1 ring-ez-blue/70 transition-transform hover:-translate-y-0.5 hover:ring-2 hover:ring-ez-blue-light"
          style={{ height: height - 4, width: (height - 4) * CARD_RATIO }}
        >
          <CardImage cardId={attachment.cardId} className="h-full w-auto rounded" />
        </button>
      ))}
    </div>
  );
}

/** graus de inclinação e pixels de altura que o leque tira por passo do centro */
const FAN_TILT_PER_CARD = 4;
const FAN_LIFT_PER_CARD = 7;

/** o quanto a carta escolhida fica ACIMA do alto do arco, para se destacar dele */
const PICKED_LIFT = 6;

/**
 * A mão em leque, como na mesa: as cartas se sobrepõem, inclinam a partir do
 * centro e a de baixo do ponteiro se levanta reta e grande.
 *
 * A medida continua sendo a de antes — a ALTURA que sobrou manda no tamanho da
 * carta —, mas o passo horizontal agora pode ser MENOR que a carta: é a
 * sobreposição que deixa oito cartas caberem sem encolher todas. Sem
 * `overflow-hidden`: o que sobe no hover precisa passar por cima do tabuleiro.
 */
function HandRow({
  hand,
  selectedUid,
  playable,
  hasActivation,
  onSelect,
  onPlay,
}: {
  hand: readonly CardInZone[];
  selectedUid: string | null;
  playable: boolean;
  hasActivation: (inHand: CardInZone) => boolean;
  onSelect: (uid: string) => void;
  onPlay: (inHand: CardInZone, card: CatalogCard) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const count = Math.max(1, hand.length);
  const middle = (count - 1) / 2;
  /*
    O leque é um ARCO com a carta do meio no alto, e ele sobe a partir da borda de
    baixo: as pontas ficam apoiadas no chão da faixa e o meio se levanta. Fazer o
    contrário (pontas descendo) empurrava duas cartas para fora da janela.
    A altura da carta desconta essa subida, senão o meio estoura por cima.
  */
  const fanLift = middle * FAN_LIFT_PER_CARD;
  const cardHeight = Math.max(0, box.height - 10 - fanLift - PICKED_LIFT);
  const cardWidth = cardHeight * CARD_RATIO;
  /* passo: a carta inteira mais um respiro, ou o que couber — o resto sobrepõe */
  const step = Math.min(
    cardWidth + 6,
    Math.max(28, (box.width - cardWidth) / Math.max(1, count - 1)),
  );

  return (
    <div
      ref={ref}
      className="relative flex min-h-0 flex-[1.15] shrink-0 items-end justify-center pt-1"
    >
      {hand.map((inHand, index) => {
        const card = cardById(inHand.cardId);
        const selected = selectedUid === inHand.uid;
        const offset = index - middle;
        return (
          <div
            key={inHand.uid}
            className="ez-hand-card absolute bottom-0"
            style={{
              height: cardHeight,
              width: cardWidth,
              left: `calc(50% + ${offset * step}px - ${cardWidth / 2}px)`,
              /* a escolhida sai do leque e fica de pé: é nela que o botão de jogar mora */
              transform: selected
                ? `translateY(${-(fanLift + PICKED_LIFT)}px)`
                : `rotate(${offset * FAN_TILT_PER_CARD}deg) translateY(${
                    (Math.abs(offset) - middle) * FAN_LIFT_PER_CARD
                  }px)`,
              zIndex: selected ? 30 : 1,
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(inHand.uid)}
              className={`block h-full w-full cursor-pointer rounded ${
                selected ? 'ring-2 ring-ez-gold-light' : ''
              }`}
              style={
                selected ? { boxShadow: '0 0 24px rgba(242,211,129,.65)' } : undefined
              }
            >
              <CardImage cardId={inHand.cardId} className="h-full w-auto rounded" />
            </button>
            {hasActivation(inHand) && (
              <span
                title={t('board.canActivate')}
                /* canto de cima à ESQUERDA: à direita fica o hexágono de elemento da carta, e
                   um ícone ciano em cima de outro ícone ciano não se lê */
                className="pointer-events-none absolute left-1 top-1 rounded-full bg-sky-300 px-2 py-1 text-base font-black leading-none text-slate-950 ring-2 ring-white"
                style={{ animation: 'ezone-blink 1s ease-in-out infinite' }}
              >
                ✦
              </span>
            )}
            {selected && playable && (
              <button
                type="button"
                className="ez-btn ez-btn-gold absolute inset-x-1 bottom-1 px-1 py-1 text-[11px] tracking-[0.08em]"
                onClick={() => onPlay(inHand, card)}
              >
                {card.type === 'creature'
                  ? card.summonRule?.normal === false
                    ? t('board.activate')
                    : t('board.summon')
                  : card.type === 'command'
                    ? t('board.play')
                    : card.type === 'scenario'
                      ? t('board.activate')
                      : t('board.attach')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A placa do herói: retrato, nome, o efeito que ele carrega e os pontos em losango.
 *
 * Compacta de propósito — o tabuleiro cabe na janela (decisão nº 24) e cada pixel
 * que a placa toma sai da altura da carta em campo. O NOME segue sendo a âncora do
 * ataque direto (`data-anchor`), não a placa inteira.
 */
function HeroPlate({
  side,
  mine,
  hero,
  name,
  points,
  directDamage,
  deck,
  hand,
  discard,
  active,
}: {
  side: SideId;
  /** o meu lado: verde de sereno em vez do azul do oponente */
  mine?: boolean;
  hero: string;
  name: string;
  points: number;
  directDamage: number;
  deck: number;
  hand: number;
  discard: number;
  active: boolean;
}) {
  const { t } = useTranslation();
  const heroName = t(`hero.${hero}.name` as TextKey);
  const effectName = t(`hero.${hero}.effectName` as TextKey);

  return (
    <div
      className="ez-panel flex shrink-0 flex-wrap items-center gap-3 px-2.5 py-1"
      style={
        active
          ? {
              borderColor: mine ? 'rgba(143,206,79,.55)' : 'rgba(92,182,247,.5)',
              boxShadow: `0 0 0 1px ${mine ? 'rgba(143,206,79,.25)' : 'rgba(92,182,247,.22)'}`,
            }
          : undefined
      }
    >
      <HeroPortrait hero={hero} size={38} />
      <div className="flex min-w-0 flex-col leading-tight">
        {/* o ataque direto mira o NOME do herói, não a placa inteira */}
        <span
          data-anchor={`hero:${side}`}
          className={`ez-heading truncate text-sm ${mine ? 'text-ez-moss-light' : 'text-ez-parchment'}`}
        >
          {name} — {heroName}
        </span>
        <span className={`truncate text-[11px] ${mine ? 'text-[#a4c98a]' : 'text-[#7fb7e8]'}`}>
          {effectName}
        </span>
      </div>

      <div
        className="flex items-center gap-1.5"
        title={t('board.pointsTitle', { max: POINTS_TO_WIN })}
      >
        {Array.from({ length: POINTS_TO_WIN }, (_, index) => (
          <span
            key={index}
            className="h-3 w-3 rotate-45 border"
            style={
              index < points
                ? {
                    background: 'radial-gradient(circle at 35% 30%, #f8e3a4, #cb9c31 60%, #7a5514)',
                    borderColor: '#f6dd9a',
                    boxShadow: '0 0 10px rgba(232,193,90,.6)',
                  }
                : { background: '#0b1020', borderColor: '#33405f' }
            }
          />
        ))}
      </div>

      <DamageCrystals side={side} damage={directDamage} />
      <span className="hidden text-xs text-ez-dim tabular-nums sm:inline">
        {t('board.hand', { count: hand })} · {t('board.deckCount', { count: deck })} ·{' '}
        {t('board.discardCount', { count: discard })}
      </span>
    </div>
  );
}

/**
 * O dano direto desenhado: um cristal por ponto que falta para o oponente marcar,
 * quebrando conforme o dano entra (pedido do DevLukkas — antes era o texto
 * "Dano 0/5", que ninguém lia no meio da partida). O número continua ali, no
 * `title`, para quem quiser conferir.
 *
 * Quem diz que um cristal quebrou AGORA é o evento (invariante 3), não a diferença
 * entre dois valores de `directDamage`: `useShatter` entrega o lote que acabou de
 * chegar, e o `key` com o id do lote é o que faz o CSS tocar o estilhaço de novo
 * quando o mesmo cristal quebra numa partida seguinte.
 */
function DamageCrystals({ side, damage }: { side: SideId; damage: number }) {
  const { t } = useTranslation();
  const shatter = useShatter(side);
  /** o primeiro cristal deste lote: os anteriores já estavam quebrados, não estouram de novo */
  const firstFresh = Math.max(0, damage - (shatter?.count ?? 0));

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      title={t('board.damage', { value: damage, max: DIRECT_DAMAGE_PER_POINT })}
    >
      {Array.from({ length: DIRECT_DAMAGE_PER_POINT }, (_, index) => {
        const broken = index < damage;
        return (
          <span key={index} className="relative block" style={{ width: 11, height: 17 }}>
            <span className={`absolute inset-0 ${broken ? 'ez-crystal-out' : 'ez-crystal'}`} />
            {broken && shatter && index >= firstFresh && (
              <span key={shatter.id} className="ez-crystal-shard absolute inset-0" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function ActivationPanel({
  creature,
  slot,
  scope,
  onActivate,
  onClose,
}: {
  creature: CreatureInPlay;
  slot: number;
  scope: ActivationScope;
  onActivate: (sourceUid: string, abilityId: string, elements?: Element[]) => void;
  onClose: () => void;
}) {
  const { t, cardName } = useTranslation();
  /** a oferta sai do motor (activation.ts), não de uma segunda leitura do catálogo */
  const options = creatureActivations(creature, slot, scope);

  if (!options.length) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-[#aab8d0]">{t('board.noActivatable')}</p>
        <ModalButton tone="gray" onClick={onClose}>
          {t('common.close')}
        </ModalButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {options.map((option) => (
        <ModalButton
          key={`${option.sourceUid}:${option.abilityId}`}
          onClick={() => onActivate(option.sourceUid, option.abilityId, option.elements)}
        >
          {t('board.activateAbility', { card: cardName(option.cardId) })}
        </ModalButton>
      ))}
      <ModalButton tone="gray" onClick={onClose}>
        {t('common.cancel')}
      </ModalButton>
    </div>
  );
}

function Modal({
  title,
  grand,
  children,
}: {
  title: string;
  /** o desfecho da partida: título grande e entrada de carta virando */
  grand?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="ez-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`ez-panel max-w-2xl ${grand ? 'px-14 py-9' : 'p-6'}`}
        style={{
          boxShadow: '0 0 0 1px rgba(201,153,46,.35), 0 30px 80px rgba(0,0,0,.7)',
          animation: grand
            ? 'ez-card-in .5s cubic-bezier(.2,.9,.3,1.2) both'
            : 'ez-fade-in .3s ease both',
        }}
      >
        <h2 className={`ez-title mb-4 text-center ${grand ? 'text-5xl tracking-[0.1em]' : 'text-2xl'}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function ModalButton({
  children,
  onClick,
  tone = 'green',
}: {
  children: React.ReactNode;
  onClick: () => void;
  /**
   * `green` é a resposta que segue o jogo; `amber` a que troca/queima; `gray` a
   * saída; `danger` a que desfaz a partida (o sangue do tema, ver decisão nº 26).
   */
  tone?: 'green' | 'amber' | 'gray' | 'danger';
}) {
  const skin =
    tone === 'green'
      ? 'ez-btn-gold'
      : tone === 'amber'
        ? 'ez-btn-ember'
        : tone === 'danger'
          ? 'ez-btn-danger'
          : 'ez-btn-ghost';
  return (
    <button type="button" onClick={onClick} className={`ez-btn ez-btn-sm ${skin}`}>
      {children}
    </button>
  );
}
