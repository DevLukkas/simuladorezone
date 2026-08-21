import { useEffect } from 'react';
import { heroByKey } from '../../data/heroes.ts';
import { POINTS_TO_WIN } from '../../engine/state.ts';
import type { TextKey } from '../../i18n/keys.ts';
import { HeroBadge } from '../components/HeroPortrait.tsx';
import {
  matchesFilter,
  useHistoryStore,
  type HistoryEntry,
  type HistoryFilter,
} from '../stores/historyStore.ts';
import { useMatchStore } from '../stores/matchStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { ZN, heroColor } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * O arquivo de partidas (decisão nº 43): a lista à esquerda, o relatório da
 * partida escolhida à direita.
 *
 * A lista responde "como eu venho jogando" (as quatro contas do topo) e o
 * relatório responde "o que aconteceu naquela" — e as duas perguntas se olham na
 * mesma tela de propósito: escolher uma linha não troca de tela.
 *
 * Nada aqui é apurado no cliente: placar, duração, origem dos pontos e os
 * momentos vêm prontos do servidor, que reexecutou a partida para escrevê-los.
 * O que se calcula aqui é só o que depende do FILTRO (as quatro contas do topo).
 */

const FILTERS: readonly HistoryFilter[] = ['all', 'wins', 'losses', 'online', 'training'];

/** a grade das duas colunas de linha (cabeçalho e corpo usam a mesma) */
const ROW_COLUMNS = '22px 76px minmax(112px,1fr) minmax(100px,150px) 46px';

export function History() {
  const { t } = useTranslation();
  const { entries, failed, filter, selectedId, load, setFilter, select } = useHistoryStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (entries === null) {
    return (
      <div className="zn-num grid min-h-0 flex-1 place-items-center text-[11px] tracking-[0.16em] text-zn-fainter uppercase">
        {failed ? t('common.failed') : t('history.loading')}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6">
        <div className="flex max-w-100 flex-col items-center gap-3 text-center">
          <span className="zn-head text-[24px]">{t('history.empty')}</span>
          <span className="text-[13.5px] leading-snug text-zn-dim">{t('history.emptyNote')}</span>
        </div>
      </div>
    );
  }

  const rows = entries.filter((entry) => matchesFilter(entry, filter));
  const selected = rows.find((entry) => entry.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="zn-split flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StatStrip entries={entries} />

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zn-line bg-zn-bar px-5 py-3.5">
          <div className="zn-hair grid-flow-col border border-zn-edge">
            {FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`zn-tab ${filter === key ? 'zn-tab-on' : ''} uppercase`}
              >
                {t(`history.filter.${key}` as TextKey)}
              </button>
            ))}
          </div>
          <span className="zn-num text-[10px] tracking-[0.14em] text-zn-fainter uppercase">
            {t('history.count', { shown: rows.length, total: entries.length })}
          </span>
          <span className="zn-num ml-auto flex items-center gap-4 text-[9px] tracking-[0.16em] text-zn-fainter uppercase">
            <Legend color={ZN.green} label={t('history.win')} />
            <Legend color={ZN.red} label={t('history.loss')} />
          </span>
        </div>

        <div
          className="zn-num grid shrink-0 items-center gap-2.5 border-b border-zn-line bg-zn-panel px-4 py-2.5 text-[8.5px] tracking-[0.2em] text-zn-fainter uppercase"
          style={{ gridTemplateColumns: ROW_COLUMNS }}
        >
          <span />
          <span>{t('history.column.date')}</span>
          <span>{t('history.column.opponent')}</span>
          <span>{t('history.column.outcome')}</span>
          <span>{t('history.column.score')}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              on={selected?.id === entry.id}
              onOpen={() => select(entry.id)}
            />
          ))}
          {!rows.length && (
            <p className="zn-num px-5 py-11 text-center text-[10px] tracking-[0.16em] text-zn-fainter uppercase">
              {t('history.emptyFilter')}
            </p>
          )}
        </div>
      </div>

      <aside className="flex w-[clamp(262px,27%,336px)] shrink-0 flex-col overflow-auto border-l border-zn-line bg-zn-bar">
        {selected ? (
          <Report entry={selected} />
        ) : (
          <p className="zn-num px-5 py-6 text-[10px] leading-loose tracking-[0.1em] text-zn-ghost uppercase">
            {t('history.select')}
          </p>
        )}
      </aside>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-1.75 w-1.75 rotate-45" style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * As quatro contas do topo. Elas leem o arquivo INTEIRO e não o filtro: a
 * pergunta que respondem é "como eu venho jogando", e trocar a aba para
 * "vitórias" não deveria devolver 100% de aproveitamento.
 */
function StatStrip({ entries }: { entries: readonly HistoryEntry[] }) {
  const { t } = useTranslation();
  const wins = entries.filter((entry) => entry.won).length;
  const rate = Math.round((wins / entries.length) * 100);
  const newest = entries[0]!;
  let streak = 0;
  for (const entry of entries) {
    if (entry.won !== newest.won) break;
    streak += 1;
  }
  const averageTurns = Math.round(
    entries.reduce((sum, entry) => sum + entry.turns, 0) / entries.length,
  );

  return (
    <div
      className="zn-hair shrink-0 border-b border-zn-line"
      style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))' }}
    >
      <Stat
        label={t('history.stat.record')}
        value={`${wins}–${entries.length - wins}`}
        note={t('history.stat.recordNote', { count: entries.length })}
      />
      <Stat
        label={t('history.stat.rate')}
        value={`${rate}%`}
        note={rate >= 50 ? t('history.stat.rateAbove') : t('history.stat.rateBelow')}
        color={rate >= 50 ? ZN.green : ZN.red}
      />
      <Stat
        label={t('history.stat.streak')}
        value={String(streak)}
        note={newest.won ? t('history.stat.streakWins') : t('history.stat.streakLosses')}
        color={newest.won ? ZN.green : ZN.red}
      />
      <Stat
        label={t('history.stat.length')}
        value={String(averageTurns)}
        note={t('history.stat.lengthNote')}
        color={ZN.gold}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-zn-bar px-5 py-3.5">
      <span className="zn-label tracking-[0.26em] text-zn-faint uppercase">{label}</span>
      <span className="flex items-baseline gap-2">
        <span
          className="zn-num text-[23px] leading-none font-bold"
          style={{ color: color ?? '#f0eadc' }}
        >
          {value}
        </span>
        <span className="text-[12.5px] text-zn-dim">{note}</span>
      </span>
    </div>
  );
}

function Row({
  entry,
  on,
  onOpen,
}: {
  entry: HistoryEntry;
  on: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const hero = heroByKey(entry.heroThem);
  const color = entry.won ? ZN.green : ZN.red;
  const when = new Date(entry.endedAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full cursor-pointer items-center gap-2.5 border-0 border-b border-zn-line px-4 py-3.5 text-left hover:bg-zn-raise"
      style={{
        gridTemplateColumns: ROW_COLUMNS,
        borderLeft: `3px solid ${on ? ZN.gold : 'transparent'}`,
        background: on ? ZN.panel : 'transparent',
      }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rotate-45"
        style={{ background: color, boxShadow: `0 0 10px ${color}88` }}
      />

      <span className="zn-num flex flex-col gap-0.75">
        <span className="text-[11px] text-zn-soft">
          {when.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
        </span>
        <span className="text-[9px] tracking-[0.1em] text-zn-fainter">
          {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-[9px] tracking-[0.06em] text-zn-ghost">
          {t('history.rowTime', { turns: entry.turns, duration: clock(entry.seconds) })}
        </span>
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        {hero && <HeroBadge hero={hero.key} size={32} />}
        <span className="flex min-w-0 flex-col gap-0.75">
          <span className="zn-head truncate text-[19px] tracking-[0.07em]">{entry.opponent}</span>
          <span
            className="zn-num truncate text-[9px] tracking-[0.13em] uppercase"
            style={{ color: entry.mode === 'online' ? ZN.green : '#8a90a0' }}
          >
            {t(`history.mode.${entry.mode}` as TextKey)}
            {hero ? ` · ${t(`hero.${hero.key}.name` as TextKey)}` : ''}
          </span>
        </span>
      </span>

      <span className="flex min-w-0 flex-col gap-0.75">
        <span
          className="zn-num text-[10px] tracking-[0.12em] uppercase"
          style={{ color }}
        >
          {t(entry.won ? 'history.win' : 'history.loss')}
        </span>
        <span className="text-[12.5px] leading-tight text-zn-dim">
          {t(`history.outcome.${entry.reason}` as TextKey)}
        </span>
      </span>

      <span className="zn-num text-[15px] font-bold" style={{ color }}>
        {entry.pointsMe}–{entry.pointsThem}
      </span>
    </button>
  );
}

/** o relatório da partida escolhida: cabeçalho, números, pontos, momentos, deck */
function Report({ entry }: { entry: HistoryEntry }) {
  const { t, resolveParts } = useTranslation();
  const { watchReplay, startTraining } = useMatchStore();
  const toast = useToastStore((state) => state.show);
  const heroThem = heroByKey(entry.heroThem);
  const heroMe = heroByKey(entry.heroMe);
  const color = entry.won ? ZN.green : ZN.red;

  // dando certo, o tabuleiro assume sozinho: a raiz troca de tela quando a
  // `matchStore` passa a ter visão, e sair do replay devolve a esta lista
  async function watch() {
    try {
      await watchReplay(entry.id);
    } catch {
      toast(t('history.replayFailed'));
    }
  }

  return (
    <div className="flex flex-col">
      <header
        className="border-b border-zn-line px-5 pt-4.5 pb-4"
        style={{ background: entry.won ? '#0c120e' : '#130c0b' }}
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-2.25 w-2.25 rotate-45" style={{ background: color }} />
          <span className="zn-num text-[10px] tracking-[0.24em] uppercase" style={{ color }}>
            {t(entry.won ? 'history.win' : 'history.loss')}
          </span>
          <span className="zn-num ml-auto text-[9px] tracking-[0.14em] text-zn-fainter">
            #{entry.id}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {heroThem && <HeroBadge hero={heroThem.key} size={40} />}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="zn-head truncate text-[25px] tracking-[0.07em]">
              {t('history.versus', { opponent: entry.opponent })}
            </span>
            {heroThem && (
              <span
                className="zn-num text-[9px] tracking-[0.16em] uppercase"
                style={{ color: heroColor(heroThem.element) }}
              >
                {t(`hero.${heroThem.key}.name` as TextKey)}
              </span>
            )}
          </div>
        </div>
        <p className="mt-2.5 text-[13.5px] text-zn-muted">
          {t('history.endedAt', {
            reason: t(`history.reasonInline.${entry.reason}` as TextKey),
            turn: entry.turns,
          })}
        </p>
      </header>

      <div className="zn-hair grid-cols-2 border-b border-zn-line">
        <Fact
          label={t('history.fact.score')}
          value={`${entry.pointsMe} – ${entry.pointsThem}`}
          color={color}
        />
        <Fact
          label={t('history.fact.mode')}
          value={t(`history.mode.${entry.mode}` as TextKey)}
          color={entry.mode === 'online' ? ZN.green : '#c9c4b8'}
        />
        <Fact label={t('history.fact.turns')} value={String(entry.turns)} />
        <Fact label={t('history.fact.duration')} value={clock(entry.seconds)} />
        <Fact
          label={t('history.fact.dealt')}
          value={String(entry.directDealt)}
          color={ZN.gold}
        />
        <Fact label={t('history.fact.taken')} value={String(entry.directTaken)} />
      </div>

      <section className="flex flex-col gap-3 border-b border-zn-line px-5 py-4.5">
        <h3 className="zn-label tracking-[0.26em] text-zn-faint uppercase">
          {t('history.pointsTitle')}
        </h3>
        {/* a barra mede PONTOS (a pergunta da seção), e o `×n` diz quantas
            criaturas foram: a lendária vale 2, então 2 aqui é UMA lendária */}
        <PointBar
          label={t('history.points.legendary')}
          value={entry.points.legendary * 2}
          count={entry.points.legendary}
        />
        <PointBar
          label={t('history.points.rare')}
          value={entry.points.rare}
          count={entry.points.rare}
        />
        <PointBar label={t('history.points.direct')} value={entry.points.direct} />
      </section>

      <section className="flex flex-col gap-2.75 border-b border-zn-line px-5 py-4.5">
        <h3 className="zn-label tracking-[0.26em] text-zn-faint uppercase">
          {t('history.logTitle')}
        </h3>
        {entry.highlights.map((moment, index) => (
          <div key={index} className="grid items-start gap-2.75 [grid-template-columns:34px_1fr]">
            <span className="zn-num pt-0.5 text-[9px] tracking-[0.1em] text-zn-fainter">
              {t('history.turnTag', { turn: moment.turn })}
            </span>
            <span
              className="border-l border-zn-line pl-2.75 text-[13.5px] leading-snug"
              style={{
                color:
                  moment.tone === 'good'
                    ? ZN.greenLight
                    : moment.tone === 'bad'
                      ? ZN.redLight
                      : '#8a90a0',
              }}
            >
              {resolveParts(moment.ref).map((part, at) => (
                <span key={at} style={part.role === 'card' ? { color: ZN.goldLight } : undefined}>
                  {part.text}
                </span>
              ))}
            </span>
          </div>
        ))}
        {!entry.highlights.length && (
          <p className="text-[13px] text-zn-dim">{t('history.noMoments')}</p>
        )}
      </section>

      <section className="flex flex-col gap-2.5 px-5 py-4.5">
        <h3 className="zn-label tracking-[0.26em] text-zn-faint uppercase">
          {t('history.deckTitle')}
        </h3>
        <span className="zn-name text-[18px] text-zn-text">
          {entry.deckName || t('history.noDeck')}
        </span>
        {heroMe && (
          <span className="flex items-center gap-2.5 border-t border-zn-line pt-2.5">
            <HeroBadge hero={heroMe.key} size={30} />
            <span className="text-[13px] text-zn-muted">
              {t(`hero.${heroMe.key}.name` as TextKey)}
            </span>
          </span>
        )}
        <button
          type="button"
          className="zn-btn zn-btn-gold mt-1 h-10 uppercase"
          onClick={() => void watch()}
        >
          {t('history.replay')}
        </button>
        {entry.mode === 'training' && (
          <button
            type="button"
            className="zn-btn zn-btn-wire h-10 uppercase"
            onClick={() => startTraining()}
          >
            {t('history.rematch')}
          </button>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-zn-bar px-3.5 py-3">
      <span className="zn-num text-[8.5px] tracking-[0.2em] text-zn-faint uppercase">{label}</span>
      <span className="zn-num text-[13px] font-bold" style={{ color: color ?? '#c9c4b8' }}>
        {value}
      </span>
    </div>
  );
}

/** um pedaço da conta dos pontos, medido contra os 3 que vencem a partida */
function PointBar({ label, value, count }: { label: string; value: number; count?: number }) {
  const color = value ? ZN.gold : ZN.edgeHi;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="zn-name text-[15px] tracking-[0.06em] text-zn-text">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="zn-num text-[10px] text-zn-fainter">×{count}</span>
        )}
        <span className="zn-num ml-auto text-[12px] font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <span className="zn-track h-1">
        <span
          style={{
            width: `${Math.min(100, Math.round((value / POINTS_TO_WIN) * 100))}%`,
            background: color,
          }}
        />
      </span>
    </div>
  );
}

/** segundos → m:ss, que é como se lê a duração de uma partida */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

