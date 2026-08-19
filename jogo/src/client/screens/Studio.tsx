import { useEffect, useMemo, useState } from 'react';
import { ALL_CARDS } from '../../data/cards.ts';
import { retype } from '../../data/defaults.ts';
import { validateCard } from '../../data/validate.ts';
import {
  CARD_TYPES,
  EDITIONS,
  ELEMENTS,
  KEYWORDS,
  RACES,
  RARITIES,
  type Card,
  type CardType,
} from '../../data/types.ts';
import { ComposedCard } from '../components/ComposedCard.tsx';
import { FilterBar, INITIAL_FILTER, filterCards } from '../components/CardFilters.tsx';
import { EffectBuilder } from '../components/admin/EffectBuilder.tsx';
import { useAdminStore, TRANSLATED_LOCALES, reopenableId } from '../stores/adminStore.ts';
import { useTranslation } from '../useTranslation.ts';
import type { TextKey } from '../../i18n/keys.ts';

/**
 * Estúdio de cartas (decisão nº 22): edita o catálogo e grava em `src/data`.
 *
 * A lista da esquerda lê `ALL_CARDS` — o mesmo import do resto do jogo. Depois de
 * gravar, quem atualiza essa lista é o HMR do Vite relendo o arquivo que o servidor
 * acabou de escrever; o estúdio não guarda catálogo próprio nem espera resposta com
 * a carta dentro.
 */

type Plain = Record<string, unknown>;

const BOX = 'ez-input ez-input-sm text-sm';
const PANEL = 'ez-panel p-3.5';

export function Studio({ onBack }: { onBack: () => void }) {
  const { t, resolve } = useTranslation();
  const { key, setKey, draft, edit, create, close, change, translate, save, remove, busy, error, problems, savedTo } =
    useAdminStore();
  const [filter, setFilter] = useState(INITIAL_FILTER);

  const cards = filterCards(ALL_CARDS, filter);
  const localProblems = useMemo(() => (draft ? validateCard(draft.card) : []), [draft]);

  // gravar recarrega a página pelo HMR; a carta que estava aberta volta sozinha
  useEffect(() => {
    if (draft) return;
    const again = reopenableId();
    if (again !== null) edit(again);
  }, [draft, edit]);

  /**
   * O servidor recusa carta sem tradução (o teste de i18n exige as três), então a
   * tela cobra antes: o problema aparece na mesma lista dos estruturais, com o
   * idioma no lugar do caminho do campo.
   */
  const missingTranslations = useMemo(
    () =>
      draft
        ? TRANSLATED_LOCALES.filter((locale) => {
            const entry = draft.translations[locale];
            return !entry?.name.trim() || !entry?.text.trim();
          })
        : [],
    [draft],
  );

  if (!key) return <KeyGate onBack={onBack} onSubmit={setKey} />;

  return (
    <main className="ez-page mx-auto flex max-w-[110rem] flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-sm" onClick={onBack}>
          {t('common.back')}
        </button>
        <h1 className="ez-title text-2xl">{t('admin.title')}</h1>
        <p className="text-sm text-ez-dim">{t('admin.subtitle')}</p>
        <button type="button" className="ez-btn ez-btn-gold ez-btn-sm ml-auto" onClick={create}>
          {t('admin.newCard')}
        </button>
      </header>

      <div className="flex flex-1 gap-4">
        <aside className="w-72 shrink-0">
          <FilterBar value={filter} onChange={setFilter} />
          <ul className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
            {cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-white/5 ${
                    draft?.card.id === card.id ? 'bg-ez-panel text-ez-gold-light' : ''
                  }`}
                  onClick={() => edit(card.id)}
                >
                  <span className="w-8 shrink-0 font-mono text-xs text-slate-500">{card.id}</span>
                  <span className="truncate">{card.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {!draft ? (
          <p className="m-auto text-slate-500">{t('admin.pickCard')}</p>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <h2 className="text-lg font-bold text-slate-300">
                {draft.fresh
                  ? t('admin.creating', { id: draft.card.id })
                  : t('admin.editing', { id: draft.card.id })}
              </h2>

              <Identity card={draft.card} onChange={change} />

              <section className={PANEL}>
                <h3 className="mb-2 text-sm font-bold text-sky-300">{t('admin.translations')}</h3>
                {TRANSLATED_LOCALES.map((locale) => {
                  const entry = draft.translations[locale] ?? { name: '', text: '' };
                  return (
                    <div key={locale} className="mb-2">
                      <p className="font-mono text-xs text-slate-500">{locale}</p>
                      <input
                        className={`${BOX} mb-1 w-full`}
                        value={entry.name}
                        placeholder="name"
                        onChange={(event) =>
                          translate(locale, { ...entry, name: event.target.value })
                        }
                      />
                      <textarea
                        className={`${BOX} h-16 w-full`}
                        value={entry.text}
                        placeholder="text"
                        onChange={(event) =>
                          translate(locale, { ...entry, text: event.target.value })
                        }
                      />
                    </div>
                  );
                })}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold text-sky-300">{t('admin.declarative')}</h3>
                <EffectBuilder card={draft.card} onChange={change} />
              </section>
            </div>

            <aside className="w-72 shrink-0">
              <div className="sticky top-4 flex flex-col gap-3">
                <ComposedCard
                  card={draft.card}
                  {...(artPreview(draft.card) === undefined
                    ? {}
                    : { art: artPreview(draft.card) })}
                  draft={{ name: draft.card.name, text: draft.card.text ?? '' }}
                />

                <ArtUpload card={draft.card} onChange={change} />

                {(localProblems.length > 0 || missingTranslations.length > 0) && (
                  <ul className="rounded bg-amber-950/50 p-2 text-xs text-amber-300">
                    {localProblems.map((problem) => (
                      <li key={`${problem.path}:${problem.problem}`}>
                        {t(`admin.problem.${problem.problem}` as TextKey, {
                          path: problem.path || '·',
                        })}
                      </li>
                    ))}
                    {missingTranslations.map((locale) => (
                      <li key={locale}>{t('error.translation_required', { locale })}</li>
                    ))}
                  </ul>
                )}

                {error && (
                  <div className="rounded bg-rose-950/60 p-2 text-xs text-rose-300">
                    <p className="font-bold">{resolve(error)}</p>
                    <ul>
                      {problems.map((item, index) => (
                        <li key={index}>{resolve(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {savedTo && (
                  <div className="rounded bg-emerald-950/60 p-2 text-xs text-emerald-300">
                    <p>{t('admin.saved', { file: savedTo })}</p>
                    <p className="text-emerald-500">{t('admin.reloadHint')}</p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={busy || localProblems.length > 0 || missingTranslations.length > 0}
                  className="ez-btn ez-btn-gold ez-btn-sm"
                  onClick={() => void save()}
                >
                  {busy ? t('admin.saving') : t('admin.save')}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="ez-btn ez-btn-ghost ez-btn-sm flex-1"
                    onClick={close}
                  >
                    {t('common.close')}
                  </button>
                  {!draft.fresh && (
                    <button
                      type="button"
                      className="ez-btn ez-btn-danger ez-btn-sm"
                      onClick={() => {
                        if (confirm(t('admin.removeConfirm', { name: draft.card.name }))) {
                          void remove();
                        }
                      }}
                    >
                      {t('admin.remove')}
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}

/** o caminho que a prévia usa; igual ao do jogo, mas sem cache do navegador atrapalhar */
function artPreview(card: Card): string | undefined {
  const file = card.art ?? card.img?.replace(/\.png$/, '.webp');
  return file ? `/assets/arte/${file}` : undefined;
}

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-0.5">
      <span className="w-40 shrink-0 text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Identity({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const { t } = useTranslation();
  const source = card as unknown as Plain;
  const creature = card.type === 'creature' ? card : null;

  const set = (key: string, value: unknown) => {
    const next = { ...source };
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
    onChange(next as unknown as Card);
  };

  const textOf = (key: string) => (typeof source[key] === 'string' ? (source[key] as string) : '');

  return (
    <section className={PANEL}>
      <h3 className="mb-2 text-sm font-bold text-sky-300">{t('admin.identity')}</h3>

      <Row label={t('admin.field.id')}>
        <span className="font-mono text-sm text-slate-500">{card.id}</span>
      </Row>

      <Row label={t('admin.field.type')}>
        <select
          className={BOX}
          value={card.type}
          onChange={(event) => onChange(retype(card, event.target.value as CardType))}
        >
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t('admin.field.name')}>
        <input
          className={`${BOX} flex-1`}
          value={card.name}
          onChange={(event) => onChange({ ...card, name: event.target.value } as Card)}
        />
      </Row>

      <label className="flex items-start gap-2 py-0.5">
        <span className="w-40 shrink-0 text-xs text-slate-400">{t('admin.field.text')}</span>
        <textarea
          className={`${BOX} h-24 flex-1`}
          value={card.text ?? ''}
          onChange={(event) => onChange({ ...card, text: event.target.value } as Card)}
        />
      </label>

      <div className="flex flex-wrap gap-x-6">
        <Row label={t('admin.field.element')}>
          <select className={BOX} value={card.element} onChange={(e) => set('element', e.target.value)}>
            {ELEMENTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('admin.field.rarity')}>
          <select className={BOX} value={card.rarity} onChange={(e) => set('rarity', e.target.value)}>
            {RARITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('admin.field.edition')}>
          <select className={BOX} value={card.edition} onChange={(e) => set('edition', e.target.value)}>
            {EDITIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Row>
      </div>

      {creature && (
        <div className="flex flex-wrap gap-x-6">
          <Row label={t('admin.field.race')}>
            <select className={BOX} value={creature.race} onChange={(e) => set('race', e.target.value)}>
              {RACES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('admin.field.attack')}>
            <input
              type="number"
              min={0}
              className={`${BOX} w-20`}
              value={creature.attack}
              onChange={(event) => set('attack', Number(event.target.value))}
            />
          </Row>
          <Row label={t('admin.field.health')}>
            <input
              type="number"
              min={0}
              className={`${BOX} w-20`}
              value={creature.health}
              onChange={(event) => set('health', Number(event.target.value))}
            />
          </Row>
        </div>
      )}

      {creature && (
        <Row label={t('admin.field.keywords')}>
          <div className="flex flex-wrap gap-1">
            {KEYWORDS.map((keyword) => {
              const on = (creature.keywords ?? []).includes(keyword);
              return (
                <button
                  key={keyword}
                  type="button"
                  className={`rounded px-2 py-0.5 text-xs ${
                    on ? 'bg-emerald-800' : 'bg-slate-800 text-slate-400'
                  }`}
                  onClick={() => {
                    const now = creature.keywords ?? [];
                    const next = on ? now.filter((item) => item !== keyword) : [...now, keyword];
                    set('keywords', next.length ? next : undefined);
                  }}
                >
                  {keyword}
                </button>
              );
            })}
          </div>
        </Row>
      )}

      {creature && (
        <Row label={t('admin.field.summonRule')}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={creature.summonRule?.normal !== false}
            onChange={(event) =>
              set('summonRule', event.target.checked ? undefined : { normal: false })
            }
          />
        </Row>
      )}

      <div className="flex flex-wrap gap-x-6">
        <Row label={t('admin.field.ref')}>
          <input className={`${BOX} w-40`} value={textOf('ref')} onChange={(e) => set('ref', e.target.value)} />
        </Row>
        <Row label={t('admin.field.author')}>
          <input
            className={`${BOX} w-52`}
            value={textOf('author')}
            onChange={(e) => set('author', e.target.value)}
          />
        </Row>
      </div>

      <div className="flex flex-wrap gap-x-6">
        <Row label={t('admin.field.art')}>
          <input className={`${BOX} w-40`} value={textOf('art')} onChange={(e) => set('art', e.target.value)} />
        </Row>
        <Row label={t('admin.field.img')}>
          <input className={`${BOX} w-40`} value={textOf('img')} onChange={(e) => set('img', e.target.value)} />
        </Row>
      </div>

      <label className="flex items-center gap-2 pt-1 text-xs text-slate-400">
        <input
          type="checkbox"
          className="h-3 w-3 accent-amber-500"
          checked={source.behaviorPending === true}
          onChange={(event) => set('behaviorPending', event.target.checked ? true : undefined)}
        />
        {t('admin.behaviorPending')}
      </label>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ilustração
// ---------------------------------------------------------------------------

function ArtUpload({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const { t } = useTranslation();
  const uploadArt = useAdminStore((state) => state.uploadArt);
  const [sent, setSent] = useState(0);

  return (
    <div className={PANEL}>
      <h3 className="mb-1 text-sm font-bold text-sky-300">{t('admin.illustration')}</h3>
      <input
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-300"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const extension = file.name.toLowerCase().endsWith('.png') ? 'png' : 'webp';
          const name = card.art ?? `${card.id}.${extension}`;
          void uploadArt(file, name).then((won) => {
            if (!won) return;
            if (!card.art) onChange({ ...card, art: name } as Card);
            setSent((count) => count + 1);
          });
        }}
      />
      <p className="mt-1 text-[10px] text-slate-600">{t('admin.artHint')}</p>
      {sent > 0 && <p className="text-[10px] text-emerald-400">✓ {card.art}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portaria
// ---------------------------------------------------------------------------

function KeyGate({ onBack, onSubmit }: { onBack: () => void; onSubmit: (key: string) => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');

  return (
    <main className="ez-page mx-auto flex max-w-md flex-col items-center justify-center gap-3 p-8">
      <h1 className="ez-title text-2xl">{t('admin.keyTitle')}</h1>
      <p className="text-center text-sm text-ez-dim">{t('admin.keyHint')}</p>
      <input
        className={`${BOX} w-full`}
        placeholder={t('admin.keyPlaceholder')}
        value={typed}
        autoFocus
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && typed.trim()) onSubmit(typed.trim());
        }}
      />
      <div className="flex gap-2">
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-sm" onClick={onBack}>
          {t('common.back')}
        </button>
        <button
          type="button"
          className="ez-btn ez-btn-gold ez-btn-sm"
          onClick={() => typed.trim() && onSubmit(typed.trim())}
        >
          {t('auth.signInAction')}
        </button>
      </div>
    </main>
  );
}
