import { useEffect, useMemo, useState } from 'react';
import { cardById, cardExists } from '../../../data/cards.ts';
import { Chip, Confirm, humanBytes } from './StudioParts.tsx';
import { extensionOf } from './CardForm.tsx';
import { useAdminStore, useArtUrl, type ArtFile } from '../../stores/adminStore.ts';
import { useToastStore } from '../../stores/toastStore.ts';
import { ZN } from '../../theme.ts';
import { useTranslation } from '../../useTranslation.ts';

/**
 * A biblioteca de imagens (decisão nº 41).
 *
 * A lista sai do DISCO, e não do catálogo: nem toda arte chegou pelo estúdio — as
 * 45 clássicas foram recortadas da carta impressa e as 33 do Quatro Elementos saíram
 * do Figma por script —, e é justamente o arquivo que veio por fora que ninguém
 * consegue apontar sem saber o nome de cor.
 *
 * Duas marcas moram aqui, e as duas vivem no índice que o servidor grava ao lado das
 * imagens: ARTE FINAL, que diz que a ilustração está aprovada, e ARQUIVADA, que é a
 * antessala do apagar. Excluir do disco só aparece na faixa das arquivadas, e o
 * servidor ainda recusa apagar imagem que alguma carta esteja usando.
 */

type LibraryFilter = 'all' | 'linked' | 'free' | 'final' | 'archived';

const FILTERS: readonly LibraryFilter[] = ['all', 'linked', 'free', 'final', 'archived'];

const FILTER_LABEL: Record<LibraryFilter, 'filterAll' | 'filterLinked' | 'filterFree' | 'filterFinal' | 'filterArchived'> =
  {
    all: 'filterAll',
    linked: 'filterLinked',
    free: 'filterFree',
    final: 'filterFinal',
    archived: 'filterArchived',
  };

export function ArtLibraryPanel() {
  const { t, cardName } = useTranslation();
  const {
    artFiles,
    loadArt,
    uploadArt,
    markArt,
    deleteArt,
    picking,
    cancelPick,
    draft,
    change,
    busy,
  } = useAdminStore();
  const toast = useToastStore((state) => state.show);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ArtFile | null>(null);

  useEffect(() => {
    void loadArt();
  }, [loadArt]);

  const all = useMemo(() => artFiles ?? [], [artFiles]);

  const shown = all.filter((art) => {
    if (filter === 'linked' && art.usedBy === null) return false;
    if (filter === 'free' && art.usedBy !== null) return false;
    if (filter === 'final' && !art.final) return false;
    if (filter === 'archived' && !art.archived) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const owner = art.usedBy !== null && cardExists(art.usedBy) ? cardName(art.usedBy) : '';
    return `${art.file} ${owner}`.toLowerCase().includes(needle);
  });

  const detail = open === null ? null : (all.find((art) => art.file === open) ?? null);

  const stats = [
    { key: 'statFiles', value: String(all.length), color: ZN.goldLight },
    {
      key: 'statLinked',
      value: String(all.filter((art) => art.usedBy !== null).length),
      color: ZN.green,
    },
    {
      key: 'statFree',
      value: String(all.filter((art) => art.usedBy === null).length),
      color: ZN.gold,
    },
    { key: 'statFinal', value: String(all.filter((art) => art.final).length), color: ZN.greenLight },
    {
      key: 'statWeight',
      value: humanBytes(all.reduce((sum, art) => sum + art.bytes, 0)),
      color: '#8a90a0',
    },
  ] as const;

  /** vincula o arquivo à carta aberta e devolve o autor ao formulário */
  const useInCard = (file: string) => {
    if (!draft) {
      toast(t('admin.lib.useBlocked'));
      return;
    }
    change({ ...draft.card, art: file } as typeof draft.card);
    cancelPick();
  };

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const sending = [...files];
    void (async () => {
      let done = 0;
      for (const file of sending) {
        const base = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-');
        const name = `${base || 'arte'}.${extensionOf(file)}`;
        if (await uploadArt(file, name)) done += 1;
      }
      if (done) toast(t('admin.lib.uploaded', { count: done }));
    })();
  };

  const mark = (files: string[], marks: { final?: boolean; archived?: boolean }) => {
    void (async () => {
      for (const file of files) await markArt(file, marks);
      setChosen([]);
    })();
  };

  const remove = (art: ArtFile) => {
    setConfirming(null);
    void deleteArt(art.file).then((won) => {
      if (!won) return;
      toast(t('admin.lib.deleted'));
      setOpen(null);
      setChosen((now) => now.filter((file) => file !== art.file));
    });
  };

  return (
    <div className="zn-split flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {picking && (
          <div className="flex flex-none items-center gap-2.5 border-b border-zn-gold-edge bg-zn-gold-shade px-5 py-2.5">
            <span aria-hidden className="h-1.5 w-1.5 bg-zn-gold" />
            <span className="zn-num text-[10px] uppercase tracking-[0.12em] text-zn-gold-light">
              {t('admin.lib.pickFor', {
                card: draft ? cardName(draft.card.id) || `#${draft.card.id}` : '—',
              })}
            </span>
            <button
              type="button"
              className="zn-btn zn-btn-wire ml-auto uppercase"
              onClick={cancelPick}
            >
              {t('admin.lib.cancelPick')}
            </button>
          </div>
        )}

        <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-zn-line bg-zn-bar px-5 py-3.5">
          <label className="zn-panel flex h-8.5 min-w-52 items-center gap-2 px-3">
            <span aria-hidden className="zn-num text-[11px] text-zn-fainter">
              /
            </span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-zn-text outline-none"
              placeholder={t('admin.lib.search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <Chip
                key={option}
                on={filter === option}
                label={t(`admin.lib.${FILTER_LABEL[option]}`)}
                onClick={() => setFilter(option)}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="zn-num text-[10px] uppercase tracking-[0.14em] text-zn-fainter">
              {t('admin.lib.shown', { shown: shown.length, total: all.length })}
            </span>
            <label className="zn-btn zn-btn-gold flex cursor-pointer items-center uppercase">
              {busy ? t('admin.lib.uploading') : t('admin.lib.upload')}
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                multiple
                className="hidden"
                onChange={(event) => {
                  upload(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        <div className="zn-hair flex-none grid-cols-[repeat(5,1fr)] border-b border-zn-line">
          {stats.map((stat) => (
            <div key={stat.key} className="flex items-baseline gap-2 bg-zn-bar px-4.5 py-2.5">
              <span className="zn-num text-[16px] font-bold" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span className="zn-label tracking-[0.16em] uppercase">
                {t(`admin.lib.${stat.key}`)}
              </span>
            </div>
          ))}
        </div>

        {filter === 'archived' && (
          <div className="flex flex-none items-center gap-2.5 border-b border-zn-edge bg-zn-panel px-5 py-2.5">
            <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-zn-red" />
            <span className="text-[12.5px] text-zn-dim">{t('admin.lib.archivedNote')}</span>
          </div>
        )}

        {chosen.length > 0 && (
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-zn-edge bg-zn-panel px-5 py-2.5">
            <span className="zn-num text-[10px] uppercase tracking-[0.12em] text-zn-gold-light">
              {t('admin.lib.selected', { count: chosen.length })}
            </span>
            <button
              type="button"
              className="zn-btn zn-btn-wire uppercase"
              onClick={() => mark(chosen, { final: true })}
            >
              {t('admin.lib.batchFinal')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire uppercase"
              onClick={() => mark(chosen, { final: false })}
            >
              {t('admin.lib.batchUnfinal')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire uppercase"
              onClick={() => mark(chosen, { archived: true })}
            >
              {t('admin.lib.batchArchive')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire uppercase"
              onClick={() => mark(chosen, { archived: false })}
            >
              {t('admin.lib.batchRestore')}
            </button>
            <button
              type="button"
              className="zn-num ml-auto cursor-pointer border-0 bg-transparent text-[10px] uppercase tracking-[0.12em] text-zn-muted hover:text-zn-bright"
              onClick={() => setChosen([])}
            >
              {t('admin.lib.clearSelection')}
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-7 pt-4">
          {artFiles === null ? (
            <p className="zn-num mt-6 text-center text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
              {t('admin.lib.loading')}
            </p>
          ) : shown.length === 0 ? (
            <p className="zn-num mt-6 text-center text-[11px] uppercase tracking-[0.14em] text-zn-ghost">
              {t('admin.lib.empty')}
            </p>
          ) : (
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
              {shown.map((art) => (
                <ArtTile
                  key={art.file}
                  art={art}
                  chosen={chosen.includes(art.file)}
                  open={art.file === open}
                  picking={picking}
                  onOpen={() => (picking ? useInCard(art.file) : setOpen(art.file))}
                  onToggle={() =>
                    setChosen((now) =>
                      now.includes(art.file)
                        ? now.filter((file) => file !== art.file)
                        : [...now, art.file],
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {detail && (
        <aside
          className="w-85 flex-none overflow-auto border-l border-zn-line bg-zn-bar p-4.5"
          style={{ animation: 'zn-fade .18s ease both' }}
        >
          <div className="flex items-center justify-between gap-2.5">
            <span className="zn-label tracking-[0.24em] uppercase">{t('admin.lib.file')}</span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="zn-btn zn-btn-quiet zn-btn-undo h-6.5 w-6.5 text-[12px]"
            >
              ×
            </button>
          </div>

          <ArtPreview art={detail} />

          <p className="zn-num mt-3.5 break-all text-[12px] text-zn-bright">{detail.file}</p>

          <div className="zn-hair mt-3.5 grid-cols-1 border border-zn-line">
            <Fact
              label={t('admin.lib.factSize')}
              value={
                detail.width && detail.height ? `${detail.width} × ${detail.height}` : '—'
              }
            />
            <Fact label={t('admin.lib.factWeight')} value={humanBytes(detail.bytes)} />
            <Fact
              label={t('admin.lib.factCard')}
              value={
                detail.usedBy !== null && cardExists(detail.usedBy)
                  ? `${cardName(detail.usedBy)} (#${detail.usedBy})`
                  : t('admin.lib.factNoCard')
              }
              color={detail.usedBy === null ? ZN.gold : undefined}
            />
            <Fact
              label={t('admin.lib.factFinal')}
              value={detail.final ? t('admin.lib.yes') : t('admin.lib.no')}
              color={detail.final ? ZN.green : undefined}
            />
            <Fact
              label={t('admin.lib.factArchived')}
              value={detail.archived ? t('admin.lib.yes') : t('admin.lib.no')}
              color={detail.archived ? ZN.red : undefined}
            />
          </div>

          <div className="mt-3.5 flex flex-col gap-2">
            <button
              type="button"
              className="zn-btn zn-btn-wire h-9.5 uppercase"
              onClick={() => useInCard(detail.file)}
            >
              {t('admin.lib.useInForm')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire h-9.5 uppercase"
              onClick={() => mark([detail.file], { final: !detail.final })}
            >
              {detail.final ? t('admin.lib.unmarkFinal') : t('admin.lib.markFinal')}
            </button>
            <button
              type="button"
              className="zn-btn zn-btn-wire h-9.5 uppercase"
              onClick={() => mark([detail.file], { archived: !detail.archived })}
            >
              {detail.archived ? t('admin.lib.restore') : t('admin.lib.archive')}
            </button>
            {detail.archived && (
              <button
                type="button"
                disabled={detail.usedBy !== null}
                title={detail.usedBy === null ? undefined : t('error.art_in_use', { id: detail.usedBy })}
                className="zn-btn zn-btn-blood h-9.5 uppercase"
                onClick={() => setConfirming(detail)}
              >
                {t('admin.lib.delete')}
              </button>
            )}
          </div>
        </aside>
      )}

      {confirming && (
        <Confirm
          title={t('admin.lib.delete')}
          question={t('admin.lib.deleteConfirm', { file: confirming.file })}
          confirmLabel={t('admin.lib.delete')}
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string | undefined }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="zn-label tracking-[0.16em] uppercase">{label}</span>
      <span
        className="zn-num ml-auto truncate text-right text-[10.5px]"
        style={{ color: color ?? '#c9c4b8' }}
      >
        {value}
      </span>
    </div>
  );
}

function ArtPreview({ art }: { art: ArtFile }) {
  const artUrl = useArtUrl();
  return (
    <img
      src={artUrl(art.file)}
      alt={art.file}
      className="mt-3.5 block w-full border border-zn-edge bg-zn-ink"
    />
  );
}

function ArtTile({
  art,
  chosen,
  open,
  picking,
  onOpen,
  onToggle,
}: {
  art: ArtFile;
  chosen: boolean;
  open: boolean;
  picking: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { t, cardName } = useTranslation();
  const artUrl = useArtUrl();
  const owner = art.usedBy !== null && cardExists(art.usedBy) ? cardById(art.usedBy) : null;
  const badge = art.archived
    ? { label: t('admin.lib.badgeArchived'), color: ZN.red }
    : art.final
      ? { label: t('admin.lib.badgeFinal'), color: ZN.green }
      : art.usedBy === null
        ? { label: t('admin.lib.badgeFree'), color: ZN.gold }
        : null;

  return (
    <div
      className="zn-tile relative"
      style={{ ['--tile-line' as string]: chosen || open ? ZN.gold : ZN.line }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={picking ? t('admin.lib.useInForm') : art.file}
        className="block w-full cursor-pointer border-0 bg-zn-ink p-0"
      >
        <img
          src={artUrl(art.file)}
          alt={art.file}
          loading="lazy"
          className="block aspect-square w-full object-cover object-top"
          style={{ opacity: art.archived ? 0.45 : 1 }}
        />
      </button>

      <button
        type="button"
        onClick={onToggle}
        title={t('admin.lib.selected', { count: 1 })}
        className="zn-num absolute left-1.5 top-1.5 h-5 w-5 cursor-pointer text-[11px] leading-none"
        style={{
          border: `1px solid ${chosen ? ZN.gold : ZN.edgeHi}`,
          background: chosen ? ZN.gold : 'rgba(8,9,11,.8)',
          color: ZN.goldInk,
        }}
      >
        {chosen ? '✓' : ''}
      </button>

      {badge && (
        <span
          className="zn-num absolute right-1.5 top-1.5 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]"
          style={{
            background: 'rgba(8,9,11,.9)',
            border: `1px solid ${badge.color}`,
            color: badge.color,
          }}
        >
          {badge.label}
        </span>
      )}

      <div className="flex flex-col gap-1 border-t border-zn-line px-2 py-2">
        <span className="zn-num truncate text-[9.5px] text-zn-soft">{art.file}</span>
        <span className="zn-num truncate text-[8.5px] uppercase tracking-[0.08em] text-zn-fainter">
          {owner ? cardName(owner.id) : t('admin.lib.factNoCard')}
        </span>
      </div>
    </div>
  );
}
