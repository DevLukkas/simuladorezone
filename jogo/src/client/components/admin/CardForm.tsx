import { useMemo } from 'react';
import { retype } from '../../../data/defaults.ts';
import { validateCard } from '../../../data/validate.ts';
import {
  CARD_STATUSES,
  CARD_TYPES,
  EDITIONS,
  ELEMENTS,
  KEYWORDS,
  RACES,
  RARITIES,
  type Card,
  type CardStatus,
  type CardType,
} from '../../../data/types.ts';
import { cardStatus } from '../../../data/cards.ts';
import { artFileOf } from '../Card.tsx';
import { ComposedCard } from '../ComposedCard.tsx';
import { EffectBuilder } from './EffectBuilder.tsx';
import {
  Chip,
  Field,
  FieldGrid,
  Segmented,
  SectionCard,
  StatusDot,
  Stepper,
  Toggle,
} from './StudioParts.tsx';
import {
  missingTranslationsOf,
  useAdminStore,
  useArtUrl,
  TRANSLATED_LOCALES,
} from '../../stores/adminStore.ts';
import { DEFAULT_LOCALE } from '../../../i18n/index.ts';
import { ELEMENT_COLOR, STATUS_COLOR, ZN } from '../../theme.ts';
import { useTranslation } from '../../useTranslation.ts';
import type { TextKey } from '../../../i18n/keys.ts';

/**
 * O formulário da carta e, ao lado dele, a carta (decisão nº 41).
 *
 * A prévia NÃO é um desenho aproximado: é o mesmo `ComposedCard` que o jogo usa,
 * recebendo o rascunho que está sendo digitado. O que aparece aqui é, letra por
 * letra, o que vai aparecer na coleção e na mão — era isso que faltava para a
 * decisão de arte e de texto poder ser tomada dentro do estúdio.
 */

type Plain = Record<string, unknown>;

/** o texto impresso é apertado no molde; passar disto começa a sobrar da caixa */
const TEXT_BUDGET = 180;

export function CardForm() {
  const { t, resolve } = useTranslation();
  const {
    draft,
    change,
    translate,
    save,
    close,
    busy,
    error,
    problems,
    savedTo,
    dirty,
    create,
    pickArt,
    uploadArt,
  } = useAdminStore();
  const artUrl = useArtUrl();

  const structural = useMemo(() => (draft ? validateCard(draft.card) : []), [draft]);
  const missingTranslations = useMemo(
    () => (draft ? missingTranslationsOf(draft) : []),
    [draft],
  );

  if (!draft) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <p className="text-[13.5px] leading-relaxed text-zn-dim">{t('admin.pickCard')}</p>
          <button type="button" className="zn-btn zn-btn-gold uppercase" onClick={create}>
            {t('admin.newCard')}
          </button>
        </div>
      </div>
    );
  }

  const card = draft.card;
  const source = card as unknown as Plain;
  const creature = card.type === 'creature' ? card : null;
  const artFile = artFileOf(card);

  /** mexe num campo de identidade; valor vazio APAGA o campo, não o guarda em branco */
  const set = (key: string, value: unknown) => {
    const next = { ...source };
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
    change(next as unknown as Card);
  };

  const textOf = (key: string) => (typeof source[key] === 'string' ? (source[key] as string) : '');
  const rules = card.text ?? '';

  /*
   * A conferência do VOCABULÁRIO tira o que as duas linhas de cima já cobram: nome
   * e texto vazios são problema estrutural, e sem isto uma carta recém-criada
   * acendia três vermelhos pela mesma razão — o que faz a lista parecer pior do que
   * a carta está, e some com a informação de que o vocabulário, esse, está em ordem.
   */
  const vocabulary = structural.filter(
    (problem) => problem.path !== 'name' && problem.path !== 'text',
  );

  const checks = [
    { key: 'name', ok: card.name.trim().length > 0 },
    { key: 'text', ok: rules.trim().length > 0 },
    { key: 'translations', ok: missingTranslations.length === 0 },
    { key: 'rules', ok: vocabulary.length === 0 },
    { key: 'art', ok: artFile !== undefined },
  ] as const;
  const ready = checks.every((check) => check.ok);
  const blocked = busy || structural.length > 0 || missingTranslations.length > 0;

  return (
    <div className="zn-split flex min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-8 pt-4.5">
        <div className="flex max-w-3xl flex-col gap-3.5">
          <SectionCard
            index={1}
            title={t('admin.section.identity')}
            note={t('admin.section.identityNote')}
          >
            <FieldGrid>
              <Field label={t('admin.field.name')} hint={t('admin.hint.name')} wide>
                <input
                  className="zn-input w-full"
                  value={card.name}
                  placeholder="Azzure, Sacerdotisa de Atlantis"
                  onChange={(event) => change({ ...card, name: event.target.value } as Card)}
                />
              </Field>
              <Field label={t('admin.field.id')} hint={t('admin.hint.id')}>
                <span className="zn-inset zn-num flex h-8.5 items-center px-3 text-[13px] text-zn-muted">
                  #{card.id}
                </span>
              </Field>
              <Field label={t('admin.field.ref')} hint={t('admin.hint.ref')}>
                <input
                  className="zn-input w-full"
                  value={textOf('ref')}
                  placeholder="RDI - 080/001"
                  onChange={(event) => set('ref', event.target.value)}
                />
              </Field>
              <Field label={t('admin.field.author')} hint={t('admin.hint.author')} wide>
                <input
                  className="zn-input w-full"
                  value={textOf('author')}
                  onChange={(event) => set('author', event.target.value)}
                />
              </Field>
            </FieldGrid>
          </SectionCard>

          <SectionCard
            index={2}
            title={t('admin.section.classification')}
            note={t('admin.section.classificationNote')}
          >
            <Field label={t('admin.field.type')} hint={t('admin.hint.type')}>
              <Segmented
                options={CARD_TYPES}
                value={card.type}
                labelOf={(type) => t(`cardType.${type}`)}
                onPick={(type) => change(retype(card, type as CardType))}
              />
            </Field>

            <Field label={t('admin.field.element')} hint={t('admin.hint.element')}>
              <div className="flex flex-wrap gap-1.5">
                {ELEMENTS.map((element) => (
                  <Chip
                    key={element}
                    on={card.element === element}
                    color={ELEMENT_COLOR[element]}
                    label={t(`element.${element}`)}
                    onClick={() => set('element', element)}
                  />
                ))}
              </div>
            </Field>

            <FieldGrid>
              <Field label={t('admin.field.rarity')} hint={t('admin.hint.rarity')}>
                <Segmented
                  options={RARITIES}
                  value={card.rarity}
                  labelOf={(rarity) => t(`rarity.${rarity}`)}
                  onPick={(rarity) => set('rarity', rarity)}
                />
              </Field>
              <Field label={t('admin.field.edition')} hint={t('admin.hint.edition')}>
                <select
                  className="zn-select h-8.5 w-full"
                  value={card.edition}
                  onChange={(event) => set('edition', event.target.value)}
                >
                  {EDITIONS.map((edition) => (
                    <option key={edition} value={edition}>
                      {edition}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGrid>
          </SectionCard>

          {creature && (
            <SectionCard
              index={3}
              title={t('admin.section.combat')}
              note={t('admin.section.combatNote')}
            >
              <FieldGrid>
                <Field label={t('admin.field.race')} hint={t('admin.hint.race')} wide>
                  <select
                    className="zn-select h-8.5 w-full"
                    value={creature.race}
                    onChange={(event) => set('race', event.target.value)}
                  >
                    {RACES.map((race) => (
                      <option key={race} value={race}>
                        {t(`race.${race}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('admin.field.attack')} hint={t('admin.hint.attack')}>
                  <Stepper
                    value={creature.attack}
                    color={ZN.goldLight}
                    onChange={(value) => set('attack', value)}
                  />
                </Field>
                <Field label={t('admin.field.health')} hint={t('admin.hint.health')}>
                  <Stepper
                    value={creature.health}
                    color={ZN.greenLight}
                    onChange={(value) => set('health', value)}
                  />
                </Field>
              </FieldGrid>

              <Field label={t('admin.field.keywords')} hint={t('admin.hint.keywords')}>
                <div className="flex flex-wrap gap-1.5">
                  {KEYWORDS.map((keyword) => {
                    const on = (creature.keywords ?? []).includes(keyword);
                    return (
                      <Chip
                        key={keyword}
                        on={on}
                        color={ZN.spell}
                        label={t(`keyword.${keyword}`)}
                        title={t(`keywordHint.${keyword}`)}
                        onClick={() => {
                          const now = creature.keywords ?? [];
                          const next = on
                            ? now.filter((item) => item !== keyword)
                            : [...now, keyword];
                          set('keywords', next.length ? next : undefined);
                        }}
                      />
                    );
                  })}
                </div>
              </Field>

              <Field label={t('admin.field.summonRule')} hint={t('admin.hint.summonRule')}>
                <Toggle
                  on={creature.summonRule?.normal !== false}
                  label={t('admin.field.summonRule')}
                  onChange={(on) => set('summonRule', on ? undefined : { normal: false })}
                />
              </Field>
            </SectionCard>
          )}

          <SectionCard
            index={creature ? 4 : 3}
            title={t('admin.section.texts')}
            note={t('admin.section.textsNote')}
          >
            <Field
              label={`${t('admin.field.text')} · ${DEFAULT_LOCALE}`}
              hint={t('admin.hint.text')}
            >
              <textarea
                className="zn-area h-24 w-full"
                value={rules}
                onChange={(event) => change({ ...card, text: event.target.value } as Card)}
              />
              <span
                className="zn-num self-end text-[9.5px]"
                style={{ color: rules.length > TEXT_BUDGET ? ZN.red : ZN.edgeHi }}
              >
                {rules.length} / {TEXT_BUDGET}
              </span>
            </Field>

            {TRANSLATED_LOCALES.map((locale) => {
              const entry = draft.translations[locale] ?? { name: '', text: '' };
              return (
                <Field
                  key={locale}
                  label={locale}
                  hint={
                    missingTranslations.includes(locale)
                      ? t('admin.hint.translations')
                      : t('admin.sourceLocale')
                  }
                >
                  <input
                    className="zn-input w-full"
                    value={entry.name}
                    placeholder={t('admin.field.name')}
                    onChange={(event) =>
                      translate(locale, { ...entry, name: event.target.value })
                    }
                  />
                  <textarea
                    className="zn-area h-20 w-full"
                    value={entry.text}
                    placeholder={t('admin.field.text')}
                    onChange={(event) =>
                      translate(locale, { ...entry, text: event.target.value })
                    }
                  />
                </Field>
              );
            })}
          </SectionCard>

          <SectionCard
            index={creature ? 5 : 4}
            title={t('admin.section.rules')}
            note={t('admin.section.rulesNote')}
          >
            <EffectBuilder card={card} onChange={change} />
          </SectionCard>

          <SectionCard
            index={creature ? 6 : 5}
            title={t('admin.section.art')}
            note={t('admin.section.artNote')}
          >
            <div className="grid gap-4 [grid-template-columns:88px_1fr]">
              <div
                className="grid place-items-center overflow-hidden border bg-zn-ink"
                style={{
                  aspectRatio: '415 / 555',
                  borderColor: artFile ? ELEMENT_COLOR[card.element] : ZN.edge,
                }}
              >
                {artFile ? (
                  <img
                    src={artUrl(artFile)}
                    alt={artFile}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="zn-label px-1 text-center leading-snug text-zn-ghost">
                    {t('admin.list.noArt')}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="zn-num truncate text-[11px] text-zn-muted">
                  {artFile ?? t('admin.lib.factNoCard')}
                </span>
                <span className="text-[12.5px] leading-snug text-zn-fainter">
                  {t('admin.hint.art')}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="zn-btn zn-btn-wire uppercase" onClick={pickArt}>
                    {t('admin.lib.pick')}
                  </button>
                  <label className="zn-btn zn-btn-wire flex cursor-pointer items-center uppercase">
                    {t('admin.lib.upload')}
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        // mantém o nome que a carta já usa, com a extensão do arquivo
                        // enviado: gravar PNG dentro de um `.webp` era enganar o navegador
                        const base = (artFile ?? String(card.id)).replace(/\.[^.]+$/, '');
                        const name = `${base}.${extensionOf(file)}`;
                        void uploadArt(file, name).then((won) => {
                          if (won && card.art !== name) set('art', name);
                        });
                      }}
                    />
                  </label>
                  {artFile !== undefined && (
                    <button
                      type="button"
                      className="zn-btn zn-btn-quiet zn-btn-undo px-3.5 uppercase"
                      onClick={() => set('art', undefined)}
                    >
                      {t('admin.lib.unlink')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            index={creature ? 7 : 6}
            title={t('admin.section.status')}
            note={t('admin.section.statusNote')}
          >
            <Field label={t('admin.field.status')} hint={t(`admin.statusNote.${cardStatus(card)}`)}>
              <Segmented
                options={CARD_STATUSES}
                value={cardStatus(card)}
                labelOf={(status) => t(`cardStatus.${status}`)}
                titleOf={(status) => t(`admin.statusNote.${status}`)}
                /*
                 * Publicar exige a conferência inteira, arte inclusive. A carta que JÁ
                 * está publicada é exceção: as 78 anteriores à esteira entraram sem
                 * passar por ela (há publicada sem arte entre elas), e trancar a
                 * situação em que a carta já está seria proibi-la de continuar como está.
                 */
                disabledOf={(option) =>
                  option === 'published' && !ready && cardStatus(card) !== 'published'
                }
                onPick={(status) => set('status', status)}
              />
            </Field>
            {!ready && (
              <p className="zn-num text-[10px] uppercase tracking-[0.1em] text-zn-gold">
                {t('admin.statusPublishBlocked')}
              </p>
            )}

            <Field label="behaviorPending" hint={t('admin.hint.behaviorPending')}>
              <Toggle
                on={source.behaviorPending === true}
                label={t('admin.behaviorPending')}
                onChange={(on) => set('behaviorPending', on ? true : undefined)}
              />
            </Field>
          </SectionCard>
        </div>
      </div>

      <aside className="w-93 flex-none overflow-auto border-l border-zn-line bg-zn-bar p-4.5">
        <div className="flex items-center gap-2.5">
          <span className="zn-label tracking-[0.26em] uppercase">{t('admin.preview')}</span>
          <span className="zn-num ml-auto text-[9.5px] uppercase tracking-[0.12em] text-zn-fainter">
            {draft.fresh
              ? t('admin.creating', { id: card.id })
              : t('admin.editing', { id: card.id })}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-zn-fainter">{t('admin.previewNote')}</p>

        <div className="mt-3.5">
          <ComposedCard
            card={card}
            {...(artFile === undefined ? {} : { art: artUrl(artFile) })}
            draft={{ name: card.name, text: rules }}
          />
        </div>

        <div className="zn-hair mt-4 grid-cols-1 border border-zn-line">
          {checks.map((check) => (
            <div key={check.key} className="flex items-center gap-2.5 px-3 py-2.5">
              <span
                className="zn-num text-[11px]"
                style={{ color: check.ok ? ZN.green : ZN.red }}
              >
                {check.ok ? '✓' : '×'}
              </span>
              <span className="zn-num text-[9.5px] uppercase tracking-[0.1em] text-zn-muted">
                {t(`admin.check.${check.key}`)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3.5 grid gap-2 [grid-template-columns:1fr_auto]">
          <button
            type="button"
            disabled={blocked}
            className="zn-btn zn-btn-gold h-10 uppercase"
            onClick={() => void save()}
          >
            {busy ? t('admin.saving') : t('admin.save')}
          </button>
          <button type="button" className="zn-btn zn-btn-wire h-10 uppercase" onClick={close}>
            {t('admin.reset')}
          </button>
        </div>

        {dirty() && (
          <p className="zn-num mt-2.5 text-[9.5px] uppercase tracking-[0.14em] text-zn-gold">
            {t('admin.unsavedBadge')}
          </p>
        )}

        {(structural.length > 0 || missingTranslations.length > 0) && (
          <div className="mt-3.5 border border-zn-gold-edge bg-zn-gold-shade p-3">
            <p className="zn-num text-[9.5px] uppercase tracking-[0.14em] text-zn-gold-light">
              {t('admin.problemsTitle')}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-[12px] leading-snug text-zn-soft">
              {structural.map((problem) => (
                <li key={`${problem.path}:${problem.problem}`}>
                  {t(`admin.problem.${problem.problem}` as TextKey, { path: problem.path || '·' })}
                </li>
              ))}
              {missingTranslations.map((locale) => (
                <li key={locale}>{t('error.translation_required', { locale })}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div
            className="mt-3.5 border p-3"
            style={{ borderColor: ZN.redDeep, background: 'rgba(126,51,40,.18)' }}
          >
            <p className="text-[12.5px] font-bold text-zn-red-light">{resolve(error)}</p>
            <ul className="mt-1 flex flex-col gap-1 text-[12px] text-zn-soft">
              {problems.map((item, index) => (
                <li key={index}>{resolve(item)}</li>
              ))}
            </ul>
          </div>
        )}

        {savedTo && (
          <div
            className="mt-3.5 border p-3"
            style={{ borderColor: ZN.greenDeep, background: 'rgba(29,107,75,.16)' }}
          >
            <p className="zn-num text-[11px] text-zn-green-light">
              {t('admin.saved', { file: savedTo })}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-zn-dim">{t('admin.reloadHint')}</p>
          </div>
        )}

        <StatusLegend status={cardStatus(card)} />
      </aside>
    </div>
  );
}

/** o que a situação escolhida significa, escrito por extenso ao pé da prévia */
function StatusLegend({ status }: { status: CardStatus }) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 flex items-start gap-2.5 border-t border-zn-line pt-4">
      <span className="mt-1">
        <StatusDot status={status} />
      </span>
      <div className="flex flex-col gap-1">
        <span
          className="zn-num text-[9.5px] uppercase tracking-[0.16em]"
          style={{ color: STATUS_COLOR[status] }}
        >
          {t(`cardStatus.${status}`)}
        </span>
        <span className="text-[12px] leading-snug text-zn-fainter">
          {t(`admin.statusNote.${status}`)}
        </span>
      </div>
    </div>
  );
}

/** a extensão que o arquivo enviado tem de fato; o servidor só aceita estas três */
export function extensionOf(file: File): string {
  const found = /\.(png|webp|jpg|jpeg)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (found === 'jpeg') return 'jpg';
  if (found) return found;
  return file.type === 'image/png' ? 'png' : 'webp';
}
