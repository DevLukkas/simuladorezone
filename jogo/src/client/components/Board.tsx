import { useEffect, useState } from 'react';
import { cardById } from '../../data/cards.ts';
import type { Element } from '../../data/types.ts';
import {
  creatureAbilityOffers,
  creatureActivations,
  handAbilityOffers,
  handActivations,
  type ActivationScope,
} from '../../engine/activation.ts';
import { isAttachable } from '../../engine/cardsInPlay.ts';
import { canBeAttackTarget } from '../../engine/combat.ts';
import {
  canAttachTo,
  canBeCommandTarget,
  commandTargetSpec,
} from '../../engine/targeting.ts';
import { currentStats } from '../../engine/stats.ts';
import {
  DIRECT_DAMAGE_PER_POINT,
  POINTS_TO_WIN,
  oppositeSide,
  type AttachmentInPlay,
  type CardInZone,
  type CreatureInPlay,
  type SideId,
} from '../../engine/state.ts';
import type { GameView } from '../../engine/view.ts';
import { REACTION_SECONDS, TURN_SECONDS } from '../../shared/clock.ts';
import { errorText } from '../../shared/errors.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { REPLAY_SPEEDS, useMatchStore, type ReplayControl } from '../stores/matchStore.ts';
import { useAnimationBusy, useMovingUid, useShatter } from '../stores/animationStore.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { ELEMENT_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';
import { AnimationLayer } from './AnimationLayer.tsx';
import { CardImage, CreatureOnField } from './Card.tsx';
import { HeroPortrait } from './HeroPortrait.tsx';
import { MatchLog } from './MatchLog.tsx';

type TargetMode =
  | { type: 'summon'; cardUid: string }
  | { type: 'attach'; cardUid: string }
  | { type: 'command'; cardUid: string; targetSide: SideId }
  | null;

/** proporção do molde (415x555) — vale para a carta em campo, na mão e nas zonas */
const CARD_RATIO = 415 / 555;

/**
 * A geometria do tabuleiro, toda em `clamp`, como no desenho importado.
 *
 * Isto REVOGA a medição por `ResizeObserver` que as fileiras faziam: a carta era
 * dimensionada pela altura que sobrava, o que dava tamanhos diferentes conforme
 * a placa do herói crescia. Agora as duas fileiras dividem `1fr` cada e a carta
 * tem tamanho declarado — o que sobra é respiro, não uma terceira variável.
 */
/*
  A largura entra por `min(cqw, vh)` e não só por `cqw`: a fileira ganha `1fr` da
  altura, e num monitor largo e alto o teto por largura deixava a carta pequena no
  meio de uma faixa vazia. O piso segue sendo o de 720p.

  E é `cqw` — 1% da COLUNA DO CAMPO — e não `vw`, que é 1% da janela: desde a
  decisão nº 46 o registro é coluna ao lado e ESPREME o campo, então a janela
  deixou de ser a régua. Medida em `vw`, a carta continuaria do tamanho de antes e
  transbordaria a coluna que encolheu. Quem declara o contêiner é a própria coluna
  do campo (`container-type: inline-size`, no `Board`); fechado o registro, a
  coluna é a janela e a conta dá exatamente o que dava.
*/
const SLOT_WIDTH = 'clamp(70px, min(8.6cqw, 16.5vh), 142px)';
const HAND_WIDTH = 'clamp(84px, min(7.4cqw, 14vh), 118px)';
const ZONE_WIDTH = 'clamp(44px, min(3.8cqw, 7vh), 62px)';

/** o quanto uma carta da mão avança sobre a anterior no leque */
const HAND_OVERLAP = 40;
/**
 * Graus de inclinação e pixels de altura que o leque tira por passo do centro.
 * O teto existe porque a mão vai a 8 cartas: sem ele as pontas deitavam 17° e
 * saíam pela borda de baixo da doca.
 */
const FAN_TILT = 5;
const FAN_TILT_MAX = 12;
const FAN_LIFT = 7;

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
 * Uma ação que a carta escolhida na mão oferece.
 *
 * São DUAS listas na prática, e o desenho as põe lado a lado sob a carta: a de
 * JOGAR (invocar, anexar, ativar comando, pôr cenário) e a da própria carta
 * (descartar-se para ativar o efeito). A segunda aparece mesmo desligada — ver
 * `handAbilityOffers`.
 */
interface HandAction {
  key: string;
  label: string;
  /** o porquê de estar desligada, quando está */
  why?: string;
  disabled: boolean;
  tone: 'gold' | 'wire';
  run: () => void;
}

export function Board() {
  const {
    view,
    mode,
    log,
    lastRefusal,
    opponentNickname,
    deadlineMs,
    deadlineIsReaction,
    send,
    leave,
    startTraining,
    replay,
  } = useMatchStore();
  const { t, resolve, cardRulesText } = useTranslation();
  const [handSelection, setHandSelection] = useState<string | null>(null);
  const [viewingDiscard, setViewingDiscard] = useState<'me' | 'opponent' | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>(null);
  const [replacing, setReplacing] = useState<{ cardUid: string; slot: number } | null>(null);
  const [activating, setActivating] = useState<{ creature: CreatureInPlay; slot: number } | null>(
    null,
  );
  /* fechado por padrão: aberto, o registro toma largura do campo (decisão nº 46) */
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
  /**
   * Revendo (decisão nº 43): o tabuleiro é o MESMO, e é de propósito — rever tem
   * de parecer com jogar. O que muda é que nada aqui é ação: a partida já
   * aconteceu, e é uma trava só (`myTurn`) que apaga ataque, invocação, botão de
   * turno e mulligan de uma vez.
   */
  const replaying = mode === 'replay';
  const mySide = view.side;
  const enemySide = oppositeSide(mySide);
  const me = view.me;
  const opponent = view.opponent;
  const myTurn =
    !replaying &&
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
    enemyField: opponent.field,
  };
  const canActivateNow = canAct && view.phase === 'main';
  const playable = canAct && view.phase === 'main';

  /**
   * A coluna aceita a carta que está sendo mirada?
   *
   * A regra é a MESMA do motor (`commandTargetSpec`/`canBeCommandTarget`,
   * `canAttachTo`): o tabuleiro acende só o que o motor aceitaria, e clicar no
   * resto não faz nada. Antes qualquer coluna acendia — inclusive as vazias —,
   * o comando ia e voltava recusado, e a leitura do jogador era "a carta não
   * funciona" (relato do DevLukkas).
   */
  function canTarget(side: SideId, slot: number): boolean {
    if (!targetMode) return false;
    const inHand = me.hand.find((held) => held.uid === targetMode.cardUid);
    if (!inHand) return false;
    const creature = (side === mySide ? me : opponent).field[slot] ?? null;
    const card = cardById(inHand.cardId);
    if (targetMode.type === 'summon') return side === mySide && creature === null;
    if (targetMode.type === 'attach') {
      return (
        side === mySide && creature !== null && isAttachable(card) && canAttachTo(card, creature)
      );
    }
    if (side !== targetMode.targetSide) return false;
    const spec = commandTargetSpec(card);
    return spec !== null && canBeCommandTarget(spec, creature);
  }

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
    if (!canTarget(mySide, slot)) return;
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
    if (!canTarget(enemySide, slot)) return;
    if (targetMode?.type === 'command' && targetMode.targetSide === enemySide) {
      dispatch({
        type: 'PLAY_COMMAND',
        side: mySide,
        cardUid: targetMode.cardUid,
        target: { side: enemySide, slot },
      });
    }
  }

  const selected = handSelection
    ? (me.hand.find((inHand) => inHand.uid === handSelection) ?? null)
    : null;

  /**
   * Os botões da carta escolhida. A ordem é a do desenho: primeiro o que JOGA a
   * carta, depois o que a própria carta faz — e a segunda leva o ouro quando a
   * primeira não existe, porque aí ela É a ação principal daquela carta.
   */
  function handActions(inHand: CardInZone): HandAction[] {
    const card = cardById(inHand.cardId);
    const actions: HandAction[] = [];

    if (card.type === 'creature' && card.summonRule?.normal !== false) {
      actions.push({
        key: 'summon',
        label: t('board.summon'),
        disabled: !playable || me.actions.summoned || me.field.every((slot) => slot !== null),
        ...(me.actions.summoned ? { why: resolve(errorText('already_summoned')) } : {}),
        tone: 'gold',
        run: () => setTargetMode({ type: 'summon', cardUid: inHand.uid }),
      });
    }
    if (card.type === 'ability' || card.type === 'item') {
      const fits = me.field.some((creature) => creature !== null && canAttachTo(card, creature));
      actions.push({
        key: 'attach',
        label: t('board.attach'),
        disabled: !playable || !fits,
        ...(fits ? {} : { why: resolve(errorText('incompatible_element')) }),
        tone: 'gold',
        run: () => setTargetMode({ type: 'attach', cardUid: inHand.uid }),
      });
    }
    if (card.type === 'command') {
      /* carta do Figma sem comportamento modelado: o motor recusa jogá-la */
      const withoutEffect = !card.effects?.length;
      const spec = commandTargetSpec(card);
      const targetSide = spec?.target === 'chosen_enemy' ? enemySide : mySide;
      const hasTarget =
        !spec ||
        (targetSide === mySide ? me.field : opponent.field).some((creature) =>
          canBeCommandTarget(spec, creature),
        );
      actions.push({
        key: 'command',
        label: t('board.play'),
        disabled: !playable || withoutEffect || !hasTarget,
        ...(withoutEffect
          ? { why: resolve(errorText('effect_not_implemented')) }
          : hasTarget
            ? {}
            : { why: resolve(errorText('effect_has_no_target')) }),
        tone: 'gold',
        run: () => {
          if (!spec) {
            dispatch({ type: 'PLAY_COMMAND', side: mySide, cardUid: inHand.uid });
            return;
          }
          setTargetMode({ type: 'command', cardUid: inHand.uid, targetSide });
        },
      });
    }
    if (card.type === 'scenario') {
      actions.push({
        key: 'scenario',
        label: t('board.playScenario'),
        disabled: !playable || me.actions.scenario,
        ...(me.actions.scenario ? { why: resolve(errorText('scenario_already_played')) } : {}),
        tone: 'gold',
        run: () => dispatch({ type: 'PLAY_SCENARIO', side: mySide, cardUid: inHand.uid }),
      });
    }

    /* a ação que a CARTA traz: descartar-se para ativar (Leviathan de Esdras) */
    for (const offer of handAbilityOffers(inHand, scope)) {
      actions.push({
        key: `fx:${offer.abilityId}`,
        label: t(offer.cost === 'discard_self' ? 'board.discardToActivate' : 'board.activate'),
        disabled: !playable || !offer.available,
        ...(offer.blocked ? { why: resolve(errorText(offer.blocked)) } : {}),
        tone: actions.length ? 'wire' : 'gold',
        run: () =>
          dispatch({
            type: 'ACTIVATE_ABILITY',
            side: mySide,
            sourceUid: offer.sourceUid,
            abilityId: offer.abilityId,
          }),
      });
    }

    /* criatura que não se invoca e não tem efeito utilizável: diz por que não há botão */
    if (!actions.length) {
      actions.push({
        key: 'none',
        label: t('board.summon'),
        why: resolve(
          errorText(card.type === 'creature' ? 'cannot_summon_normally' : 'effect_not_implemented'),
        ),
        disabled: true,
        tone: 'wire',
        run: () => undefined,
      });
    }
    return actions;
  }

  const phaseLabel =
    view.phase === 'main'
      ? t('board.mainPhase')
      : view.phase === 'battle'
        ? t('board.battlePhase')
        : t('board.mulliganTitle');

  /*
    Revendo, a dica não pode falar em decidir nem em esperar: não há vez de
    ninguém. Sobra o que ainda serve — o texto da carta que se clicou para ler.
  */
  const replayHint = selected
    ? { text: cardRulesText(selected.cardId) ?? t('card.noText'), tone: '#8a90a0' }
    : { text: t('replay.hint'), tone: ZN.gold };

  const hint = replaying
    ? replayHint
    : lastRefusal
      ? { text: resolve(lastRefusal), tone: ZN.red }
      : view.phase === 'mulligan'
        ? { text: t('board.hint.mulligan'), tone: ZN.gold }
        : view.winner
          ? { text: t('board.hint.over'), tone: '#8a90a0' }
          : !myTurn
            ? { text: t('board.hint.opponent'), tone: '#8a90a0' }
            : targetMode
              ? {
                  text: t(
                    targetMode.type === 'summon'
                      ? 'board.hint.summon'
                      : targetMode.type === 'attach'
                        ? 'board.hint.attach'
                        : 'board.hint.command',
                  ),
                  tone: ZN.green,
                }
              : view.phase === 'battle'
                ? { text: t('board.hint.battle'), tone: ZN.gold }
                : selected
                  ? {
                      text: cardRulesText(selected.cardId) ?? t('card.noText'),
                      tone: '#8a90a0',
                    }
                  : { text: t('board.hint.pick'), tone: '#6a7080' };

  return (
    <div className="relative flex h-[100dvh] w-full select-none overflow-hidden bg-zn-ink">
      {/* o campo do legado rebaixado a fundo: quem tem de ser lido são as cartas */}
      <img
        src="/assets/img/bg_gameBattle.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 640px at 50% 50%, rgba(8,9,11,.2), rgba(8,9,11,.9) 78%),' +
            ' linear-gradient(180deg, rgba(8,9,11,.82), rgba(8,9,11,.1) 32%,' +
            ' rgba(8,9,11,.12) 66%, rgba(8,9,11,.9))',
        }}
      />
      <AnimationLayer />

      {/*
        A COLUNA DO CAMPO: o que sobra da fileira depois do registro. O `1fr` com
        `min-w-0` é o que faz o campo encolher em vez de empurrar a coluna do
        registro para fora da tela, e o `container-type` a declara como régua das
        cartas (ver a geometria, no alto do arquivo).
      */}
      <div
        className="relative z-2 grid h-full min-w-0 flex-1 px-3.5 pt-3"
        style={{
          gridTemplateRows: 'minmax(0,1fr) 50px minmax(0,1fr) 178px',
          containerType: 'inline-size',
        }}
      >
        <BattleRow
          side={enemySide}
          plate={
            <HeroPlate
              side={enemySide}
              hero={opponent.hero}
              name={opponentNickname}
              points={opponent.points}
              damageTaken={me.points * DIRECT_DAMAGE_PER_POINT + opponent.directDamage}
              deck={opponent.deckCount}
              hand={opponent.handCount}
              discard={opponent.discard.length}
              active={view.activeSide === enemySide}
            />
          }
          field={opponent.field}
          onClickSlot={onEnemySlotClick}
          targetable={(slot) => canTarget(enemySide, slot)}
          forced={(creature) => (creature.mustAttackUntilTurn ?? 0) >= view.turn}
          zones={
            <ZoneColumn
              side={enemySide}
              deckCount={opponent.deckCount}
              discard={opponent.discard}
              scenario={opponent.scenario}
              onViewDiscard={() => setViewingDiscard('opponent')}
            />
          }
        />

        <TurnBar
          view={view}
          canAct={canAct}
          deadlineMs={deadlineMs}
          deadlineIsReaction={deadlineIsReaction}
          targeting={targetMode !== null}
          logOpen={showLog}
          onCancelTarget={clearSelection}
          onAdvance={() => send({ type: 'ADVANCE_PHASE', side: mySide })}
          onEndTurn={() => dispatch({ type: 'END_TURN', side: mySide })}
          onToggleLog={() => setShowLog((open) => !open)}
          onConcede={() => setConfirmingConcede(true)}
          onLeaveReplay={leave}
          phaseLabel={phaseLabel}
          replay={replay}
        />

        <BattleRow
          side={mySide}
          mine
          plate={
            <HeroPlate
              side={mySide}
              mine
              hero={me.hero}
              name={t('board.you')}
              points={me.points}
              damageTaken={opponent.points * DIRECT_DAMAGE_PER_POINT + me.directDamage}
              deck={me.deckCount}
              hand={me.hand.length}
              discard={me.discard.length}
              active={view.activeSide === mySide}
            />
          }
          field={me.field}
          onClickSlot={onMySlotClick}
          targetable={(slot) => canTarget(mySide, slot)}
          forced={(creature) => (creature.mustAttackUntilTurn ?? 0) >= view.turn}
          canAttackNow={(creature, slot) => {
            if (!canAct || !canAttackInView(view, creature)) return false;
            const defender = opponent.field[slot];
            return !defender || canBeAttackTarget(view.turn, defender, creature, me.field);
          }}
          attackDone={(creature) => view.phase === 'battle' && creature.attackedOnTurn === view.turn}
          hasActivation={(creature, slot) =>
            canActivateNow && creatureActivations(creature, slot, scope).length > 0
          }
          zones={
            <ZoneColumn
              side={mySide}
              mine
              deckCount={me.deckCount}
              discard={me.discard}
              scenario={me.scenario}
              onViewDiscard={() => setViewingDiscard('me')}
            />
          }
        />

        <HandDock
          side={mySide}
          hand={me.hand}
          selectedUid={handSelection}
          hintText={hint.text}
          hintTone={hint.tone}
          scenario={me.scenario}
          actionsOf={handActions}
          showActions={!replaying && view.phase !== 'mulligan' && !view.winner}
          hasActivation={(inHand) => canActivateNow && handActivations(inHand, scope).length > 0}
          onSelect={(uid) => {
            if (view.phase === 'mulligan' || view.winner) return;
            setHandSelection(uid === handSelection ? null : uid);
            setTargetMode(null);
          }}
        />

        {/* o carimbo é do CAMPO: fora da coluna, o registro aberto o cobriria */}
        {replaying && replay && <ReplayStamp replay={replay} />}
      </div>

      {/*
        O registro é COLUNA ao lado do tabuleiro (decisão nº 46, que revoga a gaveta
        da nº 31 e restabelece a coluna da nº 24): aberto, ele espreme o campo em vez
        de tapá-lo — nada do que importa fica escondido atrás dele, e as cartas
        reencolhem sozinhas porque medem a coluna do campo, não a janela.
      */}
      {showLog && <MatchLog log={log} onClose={() => setShowLog(false)} />}

      {!replaying && view.phase === 'mulligan' && !me.mulliganDone && !view.winner && !animating && (
        <BattleModal title={t('board.mulliganTitle')} note={t('board.mulliganNote')} width={780}>
          <div className="grid grid-cols-5 gap-2.75">
            {me.hand.map((inHand) => (
              <div
                key={inHand.uid}
                className="border border-zn-edge bg-zn-ink"
                style={{ animation: 'zn-card-in .5s cubic-bezier(.2,.9,.3,1.2) both' }}
              >
                <CardImage cardId={inHand.cardId} className="w-full" />
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="zn-btn zn-btn-green h-11.5 uppercase"
              onClick={() => send({ type: 'DECIDE_MULLIGAN', side: mySide, swap: false })}
            >
              {t('board.mulliganKeep')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire h-11.5 uppercase"
              onClick={() => send({ type: 'DECIDE_MULLIGAN', side: mySide, swap: true })}
            >
              {t('board.mulliganSwap')}
            </button>
          </div>
        </BattleModal>
      )}

      {/*
        A pergunta só entra com a linha do tempo vazia: o jogador precisa ter VISTO
        a ação do oponente antes de decidir se reage a ela, e o relógio da reação
        (que o treino só arma nesta hora) não pode queimar atrás do modal fechado.
        O oponente fica travado enquanto isto está aberto — não por gentileza da
        tela, mas porque o motor recusa qualquer comando com escolha pendente.
      */}
      {pending && askNow && (
        <BattleModal
          title={resolve(pending.title)}
          {...(pending.reaction && deadlineMs !== null
            ? { countdown: <ReactionCountdown deadlineMs={deadlineMs} /> }
            : {})}
          width={620}
          {...(pending.sourceCardId === undefined ? {} : { sourceCardId: pending.sourceCardId })}
        >
          {/*
            Escolher entre CARTAS se faz olhando as cartas. Antes só as da própria
            mão viravam ilustração (a tela ia procurar o uid na mão) e todo o
            resto — carta revelada do oponente, criatura em campo, carta do deck,
            anexo — caía num botão com o nome escrito, o que é decidir às cegas
            (pedido do DevLukkas). Agora quem diz que a opção É uma carta é o
            próprio motor, em `option.cardId`, e a regra vale para TODA pergunta.
            Sobra o botão de texto para o que carta não é: "Sim"/"Não", elemento,
            ficha sem carta de catálogo.
          */}
          <div className="flex flex-wrap items-start justify-center gap-2.5">
            {pending.options.map((option) => {
              const answerWith = () =>
                send({ type: 'ANSWER', side: mySide, pendingId: pending.id, optionId: option.id });
              if (option.cardId !== undefined) {
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={resolve(option.label)}
                    className="zn-tile flex w-27 cursor-pointer flex-col gap-1.5 p-1.5"
                    style={{ ['--tile-line' as string]: ZN.edge }}
                    onClick={answerWith}
                  >
                    <CardImage cardId={option.cardId} className="w-full" />
                    <span className="zn-name line-clamp-2 text-center text-[11.5px] leading-tight tracking-[0.03em]">
                      {resolve(option.label)}
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={option.id}
                  type="button"
                  className="zn-btn zn-btn-wire uppercase"
                  onClick={answerWith}
                >
                  {resolve(option.label)}
                </button>
              );
            })}
            {pending.canDecline && (
              <button
                type="button"
                className="zn-btn zn-btn-quiet self-center px-4 uppercase tracking-[0.18em]"
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
              </button>
            )}
          </div>
        </BattleModal>
      )}

      {viewingDiscard && (
        <BattleModal
          title={t(viewingDiscard === 'me' ? 'board.yourDiscard' : 'board.opponentDiscard')}
          note={t('board.discardOrder')}
          width={780}
          onClose={() => setViewingDiscard(null)}
        >
          {(viewingDiscard === 'me' ? me.discard : opponent.discard).length ? (
            <div className="grid max-h-[56vh] gap-2.5 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]">
              {[...(viewingDiscard === 'me' ? me.discard : opponent.discard)]
                .reverse()
                .map((card) => (
                  <div key={card.uid} className="border border-zn-edge bg-zn-ink">
                    <CardImage cardId={card.cardId} className="w-full" />
                  </div>
                ))}
            </div>
          ) : (
            <p className="zn-num text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
              {t('board.discardEmpty')}
            </p>
          )}
        </BattleModal>
      )}

      {replacing && (
        <BattleModal title={t('board.replaceAttachment')} width={520} onClose={clearSelection}>
          <div className="flex flex-wrap justify-center gap-3">
            {me.field[replacing.slot]?.attachments.map((attachment) => (
              <button
                key={attachment.uid}
                type="button"
                className="zn-tile w-24 cursor-pointer p-0"
                style={{ ['--tile-line' as string]: ZN.edge }}
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
                <CardImage cardId={attachment.cardId} className="w-full" />
              </button>
            ))}
          </div>
        </BattleModal>
      )}

      {activating && (
        <BattleModal
          title={t('board.creature')}
          width={520}
          onClose={clearSelection}
          /* de qual criatura é este painel: a lista de habilidades sozinha não dizia */
          {...(activating.creature.cardId === null
            ? {}
            : { sourceCardId: activating.creature.cardId })}
        >
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
          />
        </BattleModal>
      )}

      {choosingElement && (
        <BattleModal title={t('board.chooseElement')} width={520} onClose={clearSelection}>
          <div className="flex flex-wrap justify-center gap-2.5">
            {choosingElement.options.map((element) => (
              <button
                key={element}
                type="button"
                className="zn-btn zn-btn-wire uppercase"
                style={{ borderColor: ELEMENT_COLOR[element], color: ELEMENT_COLOR[element] }}
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
              </button>
            ))}
          </div>
        </BattleModal>
      )}

      {/*
        Desistir entrega a partida e não tem volta, e o botão vive na mesma barra do
        "fim de turno" — clicar sem querer custava o jogo inteiro (pedido do
        DevLukkas). Some sozinho quando a partida acaba de outro jeito, senão o modal
        do desfecho apareceria por baixo desta pergunta.
      */}
      {confirmingConcede && !view.winner && (
        <BattleModal title={t('board.concedeTitle')} width={460}>
          <p className="text-[14px] leading-snug text-zn-dim">{t('board.concedeQuestion')}</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="zn-btn zn-btn-wire h-11 uppercase"
              onClick={() => setConfirmingConcede(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-quiet zn-btn-undo h-11 uppercase tracking-[0.18em]"
              style={{ borderColor: ZN.red, color: ZN.redLight }}
              onClick={() => {
                setConfirmingConcede(false);
                send({ type: 'CONCEDE', side: mySide });
              }}
            >
              {t('board.concedeConfirm')}
            </button>
          </div>
        </BattleModal>
      )}

      {/* o fim só é anunciado depois do último passo — o ponto que venceu se vê antes */}
      {view.winner && !animating && !replaying && (
        <GameOver
          won={view.winner === mySide}
          reason={t(
            view.endReason === 'points'
              ? 'board.byPoints'
              : view.endReason === 'concede'
                ? 'board.byConcede'
                : 'board.byTimeout',
          )}
          stats={t('board.overStats', {
            turn: view.turn,
            mine: me.points,
            theirs: opponent.points,
          })}
          {...(mode === 'training' ? { onRematch: () => startTraining() } : {})}
          onLeave={leave}
        />
      )}
    </div>
  );
}


/**
 * O carimbo do canto (decisão nº 44): com que versão do jogo esta partida foi
 * JOGADA — não a que está rodando agora.
 *
 * Ele existe para depuração. Quando alguém traz "esse combate resolveu errado",
 * a primeira pergunta é de que época é a partida: uma fita de agosto mostra as
 * regras de agosto, e sem o carimbo não dá para saber se o que se está vendo é
 * um erro do motor de hoje ou o comportamento correto da versão que jogou.
 *
 * Em ouro quando é fita gravada — o que se vê é o que aconteceu. Em vermelho
 * quando é reconstituição (partida anterior à decisão nº 44): aí o tabuleiro
 * saiu do motor de HOJE reexecutando a receita, e pode divergir.
 */
function ReplayStamp({ replay }: { replay: ReplayControl }) {
  const { t } = useTranslation();
  const version = replay.source === 'tape' ? replay.version : null;

  return (
    <div
      className="absolute top-2.5 right-3.5 z-3 flex flex-col items-end gap-0.75 border border-zn-edge bg-zn-panel/85 px-2.5 py-1.5"
      style={{ borderLeft: `2px solid ${version ? ZN.gold : ZN.red}` }}
      title={
        version
          ? t('replay.stamp.versionTitle', { version })
          : t('replay.stamp.rebuiltTitle')
      }
    >
      <span className="zn-num text-[7.5px] tracking-[0.22em] text-zn-fainter uppercase">
        {t(version ? 'replay.stamp.version' : 'replay.stamp.rebuilt')}
      </span>
      <span
        className="zn-num text-[11px] leading-none font-bold tracking-[0.08em]"
        style={{ color: version ? ZN.goldLight : ZN.redLight }}
      >
        {version ? `v${version}` : t('replay.stamp.rebuiltNote')}
      </span>
    </div>
  );
}

/**
 * Os controles do replay, no lugar exato onde ficam os do turno (decisão nº 43).
 *
 * Andar um passo para a FRENTE anima o lance; qualquer outro salto assenta o
 * tabuleiro sem animação — um pulo de trinta passos animado seria um borrão, e o
 * que se quer ao buscar é chegar, não assistir de novo o caminho.
 */
function ReplayControls({ replay }: { replay: ReplayControl }) {
  const { t } = useTranslation();
  const { replayStep, replayToggle, replaySpeed, replaySeek } = useMatchStore();
  const atEnd = replay.index >= replay.total - 1;

  return (
    <>
      <span className="zn-num text-[9px] tracking-[0.2em] text-zn-gold uppercase">
        {t('replay.tag')}
      </span>
      <span className="zn-num text-[10px] tracking-[0.12em] text-zn-muted">
        {t('replay.step', { index: replay.index + 1, total: replay.total })}
      </span>
      {replay.truncated && (
        <span
          className="zn-num max-w-70 truncate text-[9px] tracking-[0.1em]"
          style={{ color: ZN.redLight }}
          title={t('replay.truncated', { index: replay.total })}
        >
          {t('replay.truncated', { index: replay.total })}
        </span>
      )}

      <div className="zn-hair grid-flow-col border border-zn-edge">
        <button
          type="button"
          title={t('replay.restart')}
          aria-label={t('replay.restart')}
          disabled={replay.index === 0}
          className="zn-btn zn-btn-flat h-8 w-9 p-0 text-[12px]"
          onClick={() => replaySeek(0)}
        >
          ⏮
        </button>
        <button
          type="button"
          title={t('replay.back')}
          aria-label={t('replay.back')}
          disabled={replay.index === 0}
          className="zn-btn zn-btn-flat h-8 w-9 p-0 text-[12px]"
          onClick={() => replayStep(-1)}
        >
          ◀
        </button>
        <button
          type="button"
          title={t(replay.playing ? 'replay.pause' : 'replay.play')}
          aria-label={t(replay.playing ? 'replay.pause' : 'replay.play')}
          className="zn-btn zn-btn-gold h-8 w-11 p-0 text-[12px]"
          onClick={replayToggle}
        >
          {replay.playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          title={t('replay.forward')}
          aria-label={t('replay.forward')}
          disabled={atEnd}
          className="zn-btn zn-btn-flat h-8 w-9 p-0 text-[12px]"
          onClick={() => replayStep(1)}
        >
          {/* não é o "tocar" de novo: o passo a passo leva a barrinha do fim */}
          ▶|
        </button>
      </div>

      <div className="zn-hair grid-flow-col border border-zn-edge">
        {REPLAY_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={`zn-tab ${replay.speed === speed ? 'zn-tab-on' : ''} h-8 px-2.5`}
            onClick={() => replaySpeed(speed)}
          >
            {t('replay.speed', { n: speed })}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── fileira ─────────────────────────────────────────────────────────────── */

/**
 * Uma fileira do tabuleiro: placa do herói, campo e coluna de zonas.
 *
 * As três colunas têm a MESMA largura declarada nas duas fileiras, e é isso que
 * põe as colunas de ataque uma sobre a outra — "só ataca quem está em frente" é
 * regra do jogo, e ela precisa ser legível na tela sem contar slots.
 */
function BattleRow({
  side,
  mine,
  plate,
  field,
  zones,
  onClickSlot,
  targetable,
  forced,
  canAttackNow,
  attackDone,
  hasActivation,
}: {
  side: SideId;
  mine?: boolean;
  plate: React.ReactNode;
  field: readonly (CreatureInPlay | null)[];
  zones: React.ReactNode;
  onClickSlot: (slot: number) => void;
  /** esta coluna é alvo legal da carta que está sendo mirada */
  targetable?: (slot: number) => boolean;
  /** a criatura está obrigada a atacar (Marionete de Guerra) */
  forced?: (creature: CreatureInPlay) => boolean;
  canAttackNow?: (creature: CreatureInPlay, slot: number) => boolean;
  attackDone?: (creature: CreatureInPlay) => boolean;
  hasActivation?: (creature: CreatureInPlay, slot: number) => boolean;
}) {
  /* a faixa de anexos só rouba altura quando há anexo na fileira */
  const anyAttachment = field.some((creature) => (creature?.attachments.length ?? 0) > 0);

  return (
    <div
      className="grid min-h-0 items-center gap-3"
      style={{ gridTemplateColumns: 'minmax(196px,252px) minmax(0,1fr) 128px' }}
    >
      {plate}
      {/* o vão entre colunas nunca é menor que os dois losangos que se penduram
          nos cantos vizinhos, senão o ATQ de uma carta encosta na VIDA da outra */}
      <div
        className="flex min-h-0 items-center justify-center"
        style={{ gap: 'clamp(12px, 1.6cqw, 26px)' }}
      >
        {field.map((creature, slot) => (
          <Slot
            key={slot}
            side={side}
            slot={slot}
            creature={creature}
            field={field}
            mine={mine === true}
            reserveStrip={anyAttachment}
            onClick={() => onClickSlot(slot)}
            targeting={targetable?.(slot) ?? false}
            mustAttack={creature ? (forced?.(creature) ?? false) : false}
            canAttack={creature ? (canAttackNow?.(creature, slot) ?? false) : false}
            done={creature ? (attackDone?.(creature) ?? false) : false}
            ready={creature ? (hasActivation?.(creature, slot) ?? false) : false}
          />
        ))}
      </div>
      <div className={`flex justify-end ${mine ? 'items-end' : 'items-start'}`}>{zones}</div>
    </div>
  );
}

/**
 * Um slot do campo: a caixa existe com ou sem criatura, e o filete dela é o
 * estado — cinza parado, verde chamando um alvo, ouro pronto para atacar.
 *
 * A carta é a composta (decisão nº 23) e ela já imprime os números VIGENTES
 * (`statsAtuais` entra como `stats`). Os dois losangos que ficavam pendurados
 * nos cantos saíram: repetiam em cima da carta o que a carta mostra, e o pedido
 * do DevLukkas foi tirar a duplicata.
 */
function Slot({
  side,
  slot,
  creature,
  field,
  mine,
  reserveStrip,
  onClick,
  targeting,
  mustAttack,
  canAttack,
  done,
  ready,
}: {
  side: SideId;
  slot: number;
  creature: CreatureInPlay | null;
  field: readonly (CreatureInPlay | null)[];
  mine: boolean;
  /** a fileira tem anexo em alguma coluna: todas reservam a mesma altura */
  reserveStrip: boolean;
  onClick: () => void;
  /** esta coluna é alvo legal da carta que está sendo mirada */
  targeting: boolean;
  /** obrigada a atacar: o turno não encerra com ela parada */
  mustAttack: boolean;
  canAttack: boolean;
  done: boolean;
  ready: boolean;
}) {
  const { t } = useTranslation();
  /** o atacante sai do slot enquanto o fantasma vai bater e voltar */
  const movingUid = useMovingUid();
  const stats = creature ? currentStats(creature, field) : null;
  const attachments = creature?.attachments.length ?? 0;

  let border = mine ? '#39404e' : '#4a3038';
  let glow = 'none';
  if (targeting) {
    border = ZN.green;
    glow = `0 0 0 1px ${ZN.green}, 0 0 16px rgba(99,199,123,.25)`;
  }
  if (canAttack) {
    border = ZN.gold;
    glow = `0 0 0 1px ${ZN.gold}, 0 0 16px rgba(224,163,60,.3)`;
  }

  return (
    <div className="flex flex-col items-center" style={{ width: SLOT_WIDTH }}>
      <div
        data-anchor={`slot:${side}:${slot}`}
        className="zn-slot w-full"
        style={{
          aspectRatio: `${CARD_RATIO}`,
          borderColor: creature ? border : targeting ? ZN.green : ZN.edge,
          boxShadow: glow,
          opacity: done ? 0.68 : 1,
          ...(targeting && !creature
            ? { animation: 'zn-slot-pulse 1.4s ease-in-out infinite' }
            : ready
              ? { animation: 'zn-fx-aura 1.6s ease-in-out infinite' }
              : {}),
        }}
      >
        {creature && stats ? (
          <div className={`absolute inset-0 ${creature.uid === movingUid ? 'invisible' : ''}`}>
            <CreatureOnField
              creature={creature}
              field={field}
              owner={mine ? 'me' : 'opponent'}
              slot={slot}
              className="h-full w-full"
              onClick={onClick}
            />

            {/* o filete de elemento no topo: a cor que diz o elemento de longe */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
              style={{ background: ELEMENT_COLOR[creature.changedElement ?? elementOf(creature)] }}
            />

            {canAttack && (
              <span
                className="zn-num pointer-events-none absolute left-1 top-1 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]"
                style={{ background: ZN.gold, color: '#12130f' }}
              >
                {t('board.attack')}
              </span>
            )}
            {done && !canAttack && (
              <span className="zn-num pointer-events-none absolute left-1 top-1 bg-zn-ink/95 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-zn-green">
                {t('board.attackDone')}
              </span>
            )}
            {mustAttack && !canAttack && !done && (
              <span
                title={t('board.mustAttackTitle')}
                className="zn-num pointer-events-none absolute left-1 top-1 border px-1 py-0.5 text-[8px] uppercase tracking-[0.12em]"
                style={{ background: 'rgba(8,9,11,.94)', borderColor: ZN.red, color: ZN.redLight }}
              >
                {t('board.mustAttackTag')}
              </span>
            )}
            {attachments > 0 && (
              <span
                title={t('board.attachments')}
                className="zn-num pointer-events-none absolute right-1 top-1 border px-1 py-0.5 text-[8px] text-zn-green-light"
                style={{ background: 'rgba(8,9,11,.94)', borderColor: ZN.green }}
              >
                +{attachments}
              </span>
            )}
            {ready && (
              <span
                title={t('board.canActivate')}
                className="zn-num pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1.25 border px-1.5 py-0.75 text-[8px] uppercase tracking-[0.12em]"
                style={{
                  background: 'rgba(20,10,34,.94)',
                  borderColor: '#a875f0',
                  color: '#d6bcff',
                  animation: 'zn-fx-blink 1.1s ease-in-out infinite',
                }}
              >
                <span aria-hidden className="h-1.75 w-1.75 rotate-45 bg-[#a875f0]" />
                {t('board.effectTag')}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="zn-num absolute inset-0 grid cursor-pointer place-items-center px-1.5 text-center text-[8.5px] uppercase tracking-[0.16em]"
            style={{ color: targeting ? ZN.green : '#3e4450' }}
          >
            {targeting ? t('board.placeHere') : t('board.column', { n: slot + 1 })}
          </button>
        )}
      </div>

      {reserveStrip && (
        <AttachmentStrip attachments={creature?.attachments ?? []} />
      )}
    </div>
  );
}

/** o elemento impresso da criatura (a ficha não tem carta, e cai no neutro) */
function elementOf(creature: CreatureInPlay): Element {
  if (creature.cardId === null) return 'void';
  return cardById(creature.cardId).element;
}

/**
 * Os anexos da criatura, meus e do oponente, desenhados debaixo dela — antes só
 * existia o contador "+2" no canto, e o jogador não tinha como saber o que estava
 * anexado sem abrir a carta. O contador ficou também, no alto do slot, para quem
 * só quer o número; clique direito na miniatura amplia.
 */
function AttachmentStrip({ attachments }: { attachments: readonly AttachmentInPlay[] }) {
  const zoom = useCardZoomStore((state) => state.zoom);
  const { t, cardName } = useTranslation();
  const height = 'clamp(22px, 3.4vh, 34px)';

  return (
    <div
      className="mt-2.5 flex w-full items-start justify-center gap-1"
      style={{ height }}
      title={attachments.length ? t('board.attachments') : undefined}
    >
      {attachments.map((attachment) => (
        <button
          key={attachment.uid}
          type="button"
          onClick={() => zoom(attachment.cardId)}
          title={cardName(attachment.cardId)}
          className="zn-tile h-full cursor-pointer p-0"
          style={{
            ['--tile-line' as string]: ZN.green,
            width: `calc(${height} * ${CARD_RATIO})`,
          }}
        >
          <CardImage cardId={attachment.cardId} className="h-full w-full" />
        </button>
      ))}
    </div>
  );
}

/* ── placa do herói ──────────────────────────────────────────────────────── */

/**
 * A placa do herói: retrato, nome, efeito, os pontos em losango e os 15 cristais.
 *
 * Os cristais são a régua de "quanto falta para o outro vencer": cada ponto de
 * vitória do adversário apaga cinco, e o dano direto acumulado apaga o resto.
 * Os losangos ao lado do nome continuam sendo os pontos em si — a régua conta a
 * mesma história em outra escala, e é a que se lê de relance.
 *
 * O NOME segue sendo a âncora do ataque direto (`data-anchor`), não a placa.
 */
function HeroPlate({
  side,
  mine,
  hero,
  name,
  points,
  damageTaken,
  deck,
  hand,
  discard,
  active,
}: {
  side: SideId;
  /** o meu lado: verde em vez do vermelho do oponente */
  mine?: boolean;
  hero: string;
  name: string;
  points: number;
  /** cristais já apagados: pontos do adversário × 5 + dano direto acumulado */
  damageTaken: number;
  deck: number;
  hand: number;
  discard: number;
  active: boolean;
}) {
  const { t } = useTranslation();
  const heroName = t(`hero.${hero}.name` as TextKey);
  const effectName = t(`hero.${hero}.effectName` as TextKey);
  const effectText = t(`hero.${hero}.effectText` as TextKey);
  const accent = mine ? ZN.green : ZN.red;
  const shatter = useShatter(side);

  return (
    <div
      /*
        Trocar a chave REMONTA a placa, e é o que faz o CSS tocar o tranco de novo:
        o mesmo `animation` numa árvore que só teve o estilo atualizado não
        recomeça. A chave é o id do lote de cristais quebrados — um tranco por
        lote de dano direto, nunca dois pelo mesmo golpe.
      */
      key={shatter ? shatter.id : 'idle'}
      className="zn-plate"
      style={{
        borderColor: mine ? '#222c26' : '#2c2228',
        borderLeft: `3px solid ${accent}`,
        ...(active ? { boxShadow: `0 0 0 1px ${accent}44` } : {}),
        ...(shatter ? { animation: 'zn-shake .5s both' } : {}),
      }}
    >
      <div className="flex items-center gap-2.75">
        <HeroPortrait hero={hero} size={44} />
        <div className="flex min-w-0 flex-col gap-0.75">
          {/* o ataque direto mira o NOME do herói, não a placa inteira */}
          <span
            data-anchor={`hero:${side}`}
            className="zn-head truncate text-[17px] tracking-[0.06em]"
            title={`${name} — ${heroName}`}
          >
            {name}
          </span>
          <span
            title={effectText}
            className="zn-num truncate text-[8.5px] uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            {effectName}
          </span>
        </div>
        <div
          className="ml-auto flex shrink-0 gap-1"
          title={t('board.pointsTitle', { max: POINTS_TO_WIN })}
        >
          {Array.from({ length: POINTS_TO_WIN }, (_, index) => (
            <span
              key={index}
              className={`h-2.75 w-2.75 ${index < points ? 'zn-point zn-point-on' : 'zn-point'}`}
              style={{ ['--zn-crys' as string]: accent }}
            />
          ))}
        </div>
      </div>

      <LifeCrystals
        spent={damageTaken}
        accent={accent}
        fresh={shatter ? shatter.count : 0}
        {...(shatter ? { shatterId: shatter.id } : {})}
      />

      {/*
        A âncora da mão do OPONENTE é esta linha de contagens: a mão dele não é
        desenhada em lugar nenhum, e o descarte precisa sair de algum lugar
        visível. A minha vem do leque, lá embaixo — por isso a âncora só entra na
        placa de cima; duas com o mesmo nome fariam a camada medir a errada.
      */}
      <span
        {...(mine ? {} : { 'data-anchor': `hand:${side}` })}
        className="zn-num truncate text-[8.5px] uppercase tracking-[0.12em] text-zn-dim"
      >
        {t('board.counts', { hand, deck, discard })}
      </span>
    </div>
  );
}

/**
 * Os cristais da vida: `POINTS_TO_WIN × DIRECT_DAMAGE_PER_POINT` pedras em três
 * fileiras. Quem diz que um cristal quebrou AGORA é o evento (invariante 3), não
 * a diferença entre dois valores — `useShatter` entrega o lote que acabou de
 * chegar, e o `key` com o id do lote faz o CSS tocar o estilhaço de novo quando o
 * mesmo cristal quebrar numa partida seguinte.
 */
function LifeCrystals({
  spent,
  accent,
  fresh,
  shatterId,
}: {
  spent: number;
  accent: string;
  /** quantos dos apagados acabaram de quebrar */
  fresh: number;
  shatterId?: number;
}) {
  const { t } = useTranslation();
  const total = POINTS_TO_WIN * DIRECT_DAMAGE_PER_POINT;
  const left = Math.max(0, total - spent);

  return (
    <div
      className="flex flex-col gap-1"
      style={{ ['--zn-crys' as string]: accent }}
      title={t('board.life', { left, total })}
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-1.25">
          {[0, 1, 2, 3, 4].map((cell) => {
            const index = row * DIRECT_DAMAGE_PER_POINT + cell;
            const lit = index < left;
            /* apagar avança da direita para a esquerda: o lote novo é o que
               acabou de cruzar `left`, e só ele estilhaça */
            const justBroke = !lit && index < left + fresh;
            return (
              <span key={cell} className="relative block h-3.25 w-3.25">
                <span className={`absolute inset-0 ${lit ? 'zn-crystal' : 'zn-crystal-out'}`} />
                {justBroke && shatterId !== undefined && (
                  <span key={shatterId} className="zn-crystal-shard absolute inset-0" />
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── zonas ───────────────────────────────────────────────────────────────── */

/**
 * Deck e descarte lado a lado, cenário embaixo. É a coluna de 128px do desenho,
 * e ela é igual nas duas fileiras — o cenário do oponente é informação pública, e
 * escondê-lo obrigaria a decorar o que o outro pôs em campo.
 */
function ZoneColumn({
  side,
  mine,
  deckCount,
  discard,
  scenario,
  onViewDiscard,
}: {
  side: SideId;
  /** o meu lado: descarte primeiro, deck na borda — espelho do de cima */
  mine?: boolean;
  deckCount: number;
  discard: readonly CardInZone[];
  scenario: CardInZone | null;
  onViewDiscard: () => void;
}) {
  const { t } = useTranslation();
  const discardTop = discard[discard.length - 1];

  const deck = (
    <ZoneTile label={t('board.deck')} count={deckCount} tone={mine ? ZN.green : ZN.red}>
      <img
        src="/assets/img/cover.png"
        alt={t('board.deck')}
        draggable={false}
        data-anchor={`deck:${side}`}
        className="block h-full w-full object-cover"
        style={{
          border: `1px solid ${mine ? '#2a5a3a' : '#6a3434'}`,
          opacity: deckCount ? 1 : 0.25,
        }}
      />
    </ZoneTile>
  );

  const trash = (
    <ZoneTile label={t('board.discard')} count={discard.length} tone={ZN.redLight}>
      <button
        type="button"
        onClick={onViewDiscard}
        title={t('board.seeDiscard')}
        data-anchor={`discard:${side}`}
        className="block h-full w-full cursor-pointer"
      >
        {discardTop ? (
          <CardImage cardId={discardTop.cardId} className="h-full w-full" />
        ) : (
          <span className="block h-full w-full border border-dashed border-[#3a2a2e] bg-zn-panel/60" />
        )}
      </button>
    </ZoneTile>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2.5">
        {mine ? trash : deck}
        {mine ? deck : trash}
      </div>
      <ZoneTile
        label={t('board.scenario')}
        tone={ELEMENT_COLOR.wind}
        title={scenario ? undefined : t('board.noScenario')}
      >
        {scenario ? (
          <CardImage cardId={scenario.cardId} className="h-full w-full" />
        ) : (
          <span className="block h-full w-full border border-dashed border-[#2a3a38] bg-zn-panel/60" />
        )}
      </ZoneTile>
    </div>
  );
}

/** uma pilha da coluna de zonas: a imagem, a contagem no canto e o rótulo mono */
function ZoneTile({
  label,
  count,
  tone,
  title,
  children,
}: {
  label: string;
  count?: number;
  tone: string;
  title?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.25" title={title}>
      <div className="relative" style={{ width: ZONE_WIDTH, aspectRatio: `${CARD_RATIO}` }}>
        {children}
        {count !== undefined && (
          <span
            className="zn-num absolute -right-1.75 -top-1.75 min-w-5.5 bg-zn-ink px-1.25 py-0.5 text-center text-[10px] font-bold"
            style={{ border: `1px solid ${tone}`, color: tone }}
          >
            {count}
          </span>
        )}
      </div>
      <span
        className="zn-num text-[8px] uppercase tracking-[0.16em]"
        style={{ color: count === undefined ? '#6a7080' : tone }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── barra do turno ──────────────────────────────────────────────────────── */

/**
 * A faixa entre as duas fileiras: de quem é a vez, em que fase, quanto falta do
 * relógio e o que dá para fazer agora.
 *
 * "Ir para combate" e "Fim de turno" convivem na fase principal — o desenho traz
 * um botão só que muda de rótulo, mas encerrar o turno sem passar pelo combate é
 * lance legítimo do motor, e escondê-lo obrigaria a um clique inútil.
 */
function TurnBar({
  view,
  canAct,
  deadlineMs,
  deadlineIsReaction,
  targeting,
  logOpen,
  phaseLabel,
  onCancelTarget,
  onAdvance,
  onEndTurn,
  onToggleLog,
  onConcede,
  onLeaveReplay,
  replay,
}: {
  view: GameView;
  canAct: boolean;
  deadlineMs: number | null;
  /** o prazo que está correndo é o de uma janela de reação (7s), não o do turno */
  deadlineIsReaction: boolean;
  targeting: boolean;
  logOpen: boolean;
  phaseLabel: string;
  onCancelTarget: () => void;
  onAdvance: () => void;
  onEndTurn: () => void;
  onToggleLog: () => void;
  onConcede: () => void;
  onLeaveReplay: () => void;
  /** presente só no replay: os controles de turno dão lugar aos de reprodução */
  replay: ReplayControl | null;
}) {
  const { t } = useTranslation();
  const seekReplay = useMatchStore((state) => state.replaySeek);
  const mine = view.activeSide === view.side;
  /*
    A régua tem de ser a do prazo que veio, não a do meu estado: enquanto o
    OPONENTE responde uma janela de reação, o prazo na tela é o dela (7s) e
    medi-lo em 60 fazia a barra desabar e voltar ao cheio a cada lance —
    o "a linha do tempo diminui e volta pra onde tava" do relato.
  */
  const totalSeconds = deadlineIsReaction ? REACTION_SECONDS : TURN_SECONDS;
  const left = useTimeLeft(deadlineMs);
  const held = deadlineMs === null;
  const remaining = held ? totalSeconds * 1000 : left;
  const fraction = Math.max(0, Math.min(1, remaining / (totalSeconds * 1000)));
  const running = !held && !view.winner && view.phase !== 'mulligan';
  const fuseColor = !running ? '#2e333d' : remaining < 15_000 ? ZN.red : ZN.gold;
  /* no replay o fusível do turno não conta nada: o fio vira o avanço da fita */
  const progress = replay ? (replay.index + 1) / replay.total : fraction;

  const sideLabel = replay && view.winner
    ? t('replay.end')
    : view.winner
    ? t('board.overTag')
    : view.phase === 'mulligan'
      ? t('board.mulliganTitle')
      : mine
        ? t('board.announce.yourTurn')
        : t('board.announce.opponentTurn');

  return (
    <div className="relative flex items-center gap-3 px-1">
      {/* o fusível do legado: queima da esquerda para a direita, colado no topo */}
      {/*
        O fusível do turno e a fita do replay são o MESMO fio, e é o que faz a
        barra do replay caber onde cabia a do turno. No replay ele vira alvo de
        clique: é a busca, e o passo pedido é a fração da largura.
      */}
      <div
        className={`zn-track absolute inset-x-0 -top-0.5 ${replay ? 'h-1.5 cursor-pointer' : 'h-0.5'}`}
        {...(replay
          ? {
              role: 'slider' as const,
              'aria-label': t('replay.step', { index: replay.index + 1, total: replay.total }),
              'aria-valuenow': replay.index + 1,
              'aria-valuemin': 1,
              'aria-valuemax': replay.total,
              tabIndex: 0,
              onClick: (event: React.MouseEvent<HTMLDivElement>) => {
                const box = event.currentTarget.getBoundingClientRect();
                const at = (event.clientX - box.left) / box.width;
                seekReplay(Math.round(at * (replay.total - 1)));
              },
            }
          : {})}
      >
        <span
          className={`h-full ${replay ? '' : 'transition-[width] duration-1000 ease-linear'}`}
          style={{
            width: `${progress * 100}%`,
            background: replay ? ZN.gold : fuseColor,
          }}
        />
      </div>

      <span className="zn-num shrink-0 text-[9px] uppercase tracking-[0.22em] text-zn-faint">
        {t('board.turn', { turn: view.turn })}
      </span>
      <span
        className="zn-head shrink-0 text-[20px] tracking-[0.16em]"
        style={{ color: mine ? ZN.green : ZN.red }}
      >
        {sideLabel}
      </span>
      <span className="zn-num hidden shrink-0 text-[9px] uppercase tracking-[0.2em] text-zn-gold md:inline">
        {phaseLabel}
      </span>
      {!replay && (
        <span className="zn-num shrink-0 text-[12px] font-bold" style={{ color: fuseColor }}>
          {running ? Math.ceil(remaining / 1000) : '—'}
        </span>
      )}
      {view.waitingForOpponent && (
        <span className="zn-num truncate text-[9px] uppercase tracking-[0.16em] text-zn-gold-light">
          {t('board.opponentDeciding')}
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {replay && <ReplayControls replay={replay} />}
        {targeting && (
          <button
            type="button"
            className="zn-btn zn-btn-wire h-8 uppercase"
            onClick={onCancelTarget}
          >
            {t('common.cancel')}
          </button>
        )}
        {!replay && mine && view.phase === 'main' && !view.winner && (
          <button
            type="button"
            disabled={!canAct}
            className="zn-btn zn-btn-gold h-8.5 tracking-[0.18em] uppercase"
            onClick={onAdvance}
          >
            {t('board.goToBattle')}
          </button>
        )}
        {!replay && mine && view.phase !== 'mulligan' && !view.winner && (
          <button
            type="button"
            disabled={!canAct}
            className="zn-btn zn-btn-wire h-8.5 tracking-[0.18em] uppercase"
            style={{ borderColor: ZN.redDeep, color: ZN.redLight }}
            onClick={onEndTurn}
          >
            {t('board.endTurn')}
          </button>
        )}
        <button
          type="button"
          title={t(logOpen ? 'board.hideLog' : 'board.showLog')}
          className="zn-btn zn-btn-quiet h-8.5 px-3 uppercase tracking-[0.16em]"
          onClick={onToggleLog}
        >
          {logOpen ? '›' : '‹'} {t('board.log')}
        </button>
        {/* a última posição da barra é a da saída: desistir na partida, sair no replay */}
        {replay ? (
          <button
            type="button"
            className="zn-btn zn-btn-wire h-8.5 tracking-[0.18em] uppercase"
            onClick={onLeaveReplay}
          >
            {t('replay.exit')}
          </button>
        ) : (
          <button
            type="button"
            className="zn-btn zn-btn-quiet zn-btn-undo h-8.5 px-3 uppercase tracking-[0.16em]"
            onClick={onConcede}
          >
            {t('board.concede')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── mão ─────────────────────────────────────────────────────────────────── */

/**
 * A doca de baixo: a dica à esquerda, o cenário em campo à direita e a mão em
 * leque no meio.
 *
 * As cartas se sobrepõem, inclinam a partir do centro e a de baixo do ponteiro se
 * levanta reta e grande. A ESCOLHIDA sai do leque e abre os botões dela por cima
 * da própria carta — é o comportamento que já existia, e o desenho só trocou a
 * pele dele. Ampliar continua sendo o clique DIREITO, em qualquer carta.
 */
function HandDock({
  side,
  hand,
  selectedUid,
  hintText,
  hintTone,
  scenario,
  actionsOf,
  showActions,
  hasActivation,
  onSelect,
}: {
  /** o lado dono da mão: é a âncora `hand:<lado>` de onde o descarte parte */
  side: SideId;
  hand: readonly CardInZone[];
  selectedUid: string | null;
  hintText: string;
  hintTone: string;
  scenario: CardInZone | null;
  actionsOf: (inHand: CardInZone) => HandAction[];
  showActions: boolean;
  hasActivation: (inHand: CardInZone) => boolean;
  onSelect: (uid: string) => void;
}) {
  const { t, cardName } = useTranslation();
  const middle = (Math.max(1, hand.length) - 1) / 2;

  return (
    <div className="relative">
      <div className="absolute bottom-3.5 left-4 flex max-w-[34cqw] items-center gap-2.25">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0" style={{ background: hintTone }} />
        <span
          className="zn-num truncate text-[9px] uppercase tracking-[0.14em]"
          style={{ color: hintTone }}
          title={hintText}
        >
          {hintText}
        </span>
      </div>

      <div className="absolute bottom-3.5 right-4">
        <span
          className="zn-num block max-w-[26cqw] truncate border border-zn-edge bg-zn-bar/90 px-2.25 py-1.25 text-[9px] uppercase tracking-[0.12em]"
          style={{ color: ELEMENT_COLOR.wind }}
        >
          {t('board.scenarioTag', {
            name: scenario ? cardName(scenario.cardId) : t('board.noScenario'),
          })}
        </span>
      </div>

      <div
        data-anchor={`hand:${side}`}
        className="absolute bottom-2 left-1/2 flex h-[190px] -translate-x-1/2 items-end"
      >
        {hand.map((inHand, index) => {
          const offset = index - middle;
          const selected = selectedUid === inHand.uid;
          return (
            <HandCard
              key={inHand.uid}
              inHand={inHand}
              first={index === 0}
              tilt={Math.max(-FAN_TILT_MAX, Math.min(FAN_TILT_MAX, offset * FAN_TILT))}
              lift={Math.abs(offset) * FAN_LIFT - 18}
              selected={selected}
              flagged={hasActivation(inHand)}
              actions={selected && showActions ? actionsOf(inHand) : []}
              onSelect={() => onSelect(inHand.uid)}
            />
          );
        })}
        {hand.length === 0 && (
          <span className="zn-num self-center text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
            {t('board.emptyHand')}
          </span>
        )}
      </div>
    </div>
  );
}

function HandCard({
  inHand,
  first,
  tilt,
  lift,
  selected,
  flagged,
  actions,
  onSelect,
}: {
  inHand: CardInZone;
  /** a primeira não recua: é dela que o leque começa */
  first: boolean;
  tilt: number;
  lift: number;
  selected: boolean;
  /** tem efeito para ativar agora */
  flagged: boolean;
  actions: HandAction[];
  onSelect: () => void;
}) {
  const { t, cardName } = useTranslation();

  return (
    <div
      className="zn-hand-card relative"
      style={{
        width: HAND_WIDTH,
        marginLeft: first ? 0 : -HAND_OVERLAP,
        transform: selected
          ? 'rotate(0deg) translateY(-40px) scale(1.14)'
          : `rotate(${tilt}deg) translateY(${lift}px)`,
        zIndex: selected ? 40 : 1,
        ...(selected ? { filter: 'drop-shadow(0 0 16px rgba(224,163,60,.65))' } : {}),
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        title={cardName(inHand.cardId)}
        className="block w-full cursor-pointer"
        style={{ border: `1px solid ${selected ? ZN.gold : '#2a2e38'}` }}
      >
        <CardImage cardId={inHand.cardId} className="w-full" />
      </button>

      {flagged && (
        <span
          title={t('board.canActivate')}
          className="pointer-events-none absolute -right-1.75 -top-1.75 grid h-5.5 w-5.5 place-items-center"
        >
          <span
            aria-hidden
            className="absolute inset-0 rotate-45"
            style={{
              background: 'rgba(20,10,34,.96)',
              border: '1px solid #a875f0',
              animation: 'zn-fx-blink 1s ease-in-out infinite',
            }}
          />
          <span className="zn-num relative text-[11px] font-bold text-[#d6bcff]">★</span>
        </span>
      )}

      {actions.length > 0 && (
        <div className="absolute inset-x-1 bottom-1 flex flex-col gap-1">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              title={action.why ?? action.label}
              /* altura livre: "Descartar e ativar" não cabe numa linha na carta
                 de 112px, e rótulo cortado é pior que botão de duas linhas */
              className={`zn-btn h-auto min-h-6 px-1 py-1 text-[8.5px] leading-[1.15] tracking-[0.06em] uppercase ${
                action.tone === 'gold' ? 'zn-btn-gold' : 'zn-btn-wire'
              }`}
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── relógio ─────────────────────────────────────────────────────────────── */

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

function ReactionCountdown({ deadlineMs }: { deadlineMs: number }) {
  const remaining = useTimeLeft(deadlineMs);
  return (
    <span className="zn-num text-[22px] font-bold" style={{ color: ZN.red }}>
      {Math.max(0, Math.ceil(remaining / 1000))}s
    </span>
  );
}

/* ── ativação e janelas ──────────────────────────────────────────────────── */

/**
 * O painel de ativação da criatura.
 *
 * Lista TODA habilidade que a criatura traz, inclusive a que não dá para usar
 * agora — desligada, com o motivo do motor no lugar do rótulo. Antes o painel só
 * conhecia o que estava utilizável e dizia "esta criatura não tem habilidade
 * ativável": o Bebê Urso, que promete uma no texto impresso, parecia quebrado
 * quando faltava o Urso no descarte (relato do DevLukkas).
 */
function ActivationPanel({
  creature,
  slot,
  scope,
  onActivate,
}: {
  creature: CreatureInPlay;
  slot: number;
  scope: ActivationScope;
  onActivate: (sourceUid: string, abilityId: string, elements?: Element[]) => void;
}) {
  const { t, resolve, cardName } = useTranslation();
  /** a oferta sai do motor (activation.ts), não de uma segunda leitura do catálogo */
  const offers = creatureAbilityOffers(creature, slot, scope);

  if (!offers.length) {
    return (
      <p className="zn-num text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
        {t('board.noActivatable')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {offers.map((offer) => {
        const why = offer.blocked ? resolve(errorText(offer.blocked)) : undefined;
        return (
          <div key={`${offer.sourceUid}:${offer.abilityId}`} className="flex flex-col gap-1">
            <button
              type="button"
              disabled={!offer.available}
              title={why ?? undefined}
              className="zn-btn zn-btn-wire h-10 uppercase"
              onClick={() => onActivate(offer.sourceUid, offer.abilityId, offer.elements)}
            >
              {t(offer.available ? 'board.activateAbility' : 'board.abilityBlocked', {
                card: cardName(offer.cardId),
              })}
            </button>
            {why && (
              <span className="zn-num text-[9px] uppercase tracking-[0.12em] text-zn-ghost">
                {why}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A janela da partida. É o `ConsoleModal` sem a moldura do console: mesmo canto
 * chanfrado, mesmo cabeçalho de título condensado + nota mono, e o × só quando a
 * janela pode ser fechada sem responder (mulligan e reação não podem).
 */
function BattleModal({
  title,
  note,
  countdown,
  width,
  sourceCardId,
  onClose,
  children,
}: {
  title: string;
  note?: string;
  countdown?: React.ReactNode;
  width: number;
  /**
   * A carta de quem é o efeito. A pergunta trazia só o nome no título, e no meio
   * de uma corrente ("Mapa do Tesouro: comprar 1 e descartar 1?") o jogador não
   * tinha como conciliar de onde aquilo veio — pedido do DevLukkas, e vale
   * também para a janela de reação, onde a carta é a que o oponente jogou.
   */
  sourceCardId?: number;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="zn-backdrop z-50">
      <div
        role="dialog"
        aria-label={title}
        className="zn-dialog zn-notch-lg max-h-full overflow-auto px-6 pb-6 pt-5.5"
        style={{ width: `min(${width}px, 100%)` }}
      >
        <div className="flex flex-wrap items-baseline gap-3 pb-4">
          <h2 className="zn-head text-[27px] tracking-[0.1em]">{title}</h2>
          {note && (
            <span className="zn-num text-[9px] uppercase tracking-[0.2em] text-zn-faint">
              {note}
            </span>
          )}
          {countdown}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="zn-btn zn-btn-quiet zn-btn-undo ml-auto h-7 w-7 text-[13px]"
            >
              ×
            </button>
          )}
        </div>
        {sourceCardId === undefined ? (
          children
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            <div className="w-28 shrink-0 border border-zn-edge bg-zn-ink">
              <CardImage cardId={sourceCardId} className="w-full" />
            </div>
            <div className="min-w-[min(100%,240px)] flex-1">{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** O desfecho: título em Cinzel na cor do resultado, o porquê e o placar. */
function GameOver({
  won,
  reason,
  stats,
  onRematch,
  onLeave,
}: {
  won: boolean;
  reason: string;
  stats: string;
  onRematch?: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const color = won ? ZN.green : ZN.red;

  return (
    <div className="zn-backdrop z-60">
      <div
        className="w-[min(460px,100%)] border border-zn-edge bg-zn-bar p-7 text-center"
        style={{
          borderTop: `3px solid ${color}`,
          animation: 'zn-card-in .45s cubic-bezier(.2,.9,.3,1.2) both',
        }}
      >
        <div className="zn-label uppercase">{t('board.overTag')}</div>
        <div
          className="zn-wordmark mt-2.5 text-[42px] leading-none uppercase"
          style={{ color }}
        >
          {t(won ? 'board.victory' : 'board.defeat')}
        </div>
        <p className="mt-2.5 text-[14px] text-zn-muted">{reason}</p>
        <p className="zn-num mt-3.5 text-[10px] uppercase tracking-[0.16em] text-zn-dim">{stats}</p>
        <div className="mt-5.5 grid gap-2.5" style={{ gridTemplateColumns: onRematch ? '1fr 1fr' : '1fr' }}>
          {onRematch && (
            <button type="button" className="zn-btn zn-btn-green h-11 uppercase" onClick={onRematch}>
              {t('board.playAgain')}
            </button>
          )}
          <button type="button" className="zn-btn zn-btn-wire h-11 uppercase" onClick={onLeave}>
            {t('board.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}
