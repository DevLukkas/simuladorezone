import { useEffect, useRef, useState } from 'react';
import { ALL_CARDS, PLAYABLE_CARDS } from '../../data/cards.ts';
import { CardForm } from '../components/admin/CardForm.tsx';
import { CardList } from '../components/admin/CardList.tsx';
import { ArtLibraryPanel } from '../components/admin/ArtLibraryPanel.tsx';
import { StudioModal } from '../components/admin/StudioParts.tsx';
import { draftBlocked, rememberedIntent, useAdminStore, type StudioTab } from '../stores/adminStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * Estúdio de cartas (decisões nº 22 e nº 41): edita o catálogo e grava em `src/data`.
 *
 * Três salas na mesma moldura — o FORMULÁRIO da carta aberta, as CARTAS CRIADAS
 * (o catálogo visto pela esteira) e a BIBLIOTECA DE IMAGENS. Elas dividem uma
 * store: escolher arte na biblioteca vincula na carta que está no formulário, e
 * publicar pela lista grava o mesmo arquivo que o botão do formulário grava.
 *
 * O catálogo continua não passando pela store: quem lê carta é o import de
 * `ALL_CARDS`, que o HMR do Vite recarrega quando o servidor reescreve o arquivo.
 */

const TABS: readonly StudioTab[] = ['form', 'cards', 'library'];

export function Studio({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { keyStatus, verifyKey, tab, goTab, draft, dirty, pending, resume, create } =
    useAdminStore();
  const showToast = useToastStore((state) => state.show);

  /**
   * `onBack` nasce de novo a cada render do App (que assina esta store inteira). No
   * vetor de dependências da conferência abaixo ele a faria repetir sem fim, então
   * chega por ref: a conferência é UMA por montagem, que é o que a tela promete.
   */
  const back = useRef(onBack);
  back.current = onBack;

  // gravar recarrega a página pelo HMR; a carta que estava aberta volta sozinha
  useEffect(() => {
    if (draft) return;
    const again = rememberedIntent();
    if (again.kind !== 'none') resume(again);
  }, [draft, resume]);

  /**
   * O recarregamento do HMR também apaga rascunho não gravado, e ele pode vir de
   * um arquivo que o autor nem tocou. Esta é a mesma promessa da guarda de troca de
   * carta, feita ao navegador.
   */
  useEffect(() => {
    function hold(event: BeforeUnloadEvent) {
      if (!dirty()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', hold);
    return () => window.removeEventListener('beforeunload', hold);
  }, [dirty]);

  /**
   * A chave é do PROCESSO do servidor: sem `EZONE_ADMIN_KEY` ela é sorteada a cada
   * `--admin`, e reiniciar o servidor mata a que está guardada no navegador. Conferir
   * ao MONTAR — que é também o F5 — é o que impede a tela de abrir com uma chave que
   * já não vale; antes disso a descoberta vinha no erro da gravação, e não havia
   * lugar nenhum para pôr a chave nova.
   */
  useEffect(() => {
    let watching = true;
    void verifyKey().then((verdict) => {
      if (!watching || verdict !== 'refused') return;
      // recusa na entrada não se resolve aqui dentro: a chave morta já foi esquecida,
      // o autor volta ao hub e a próxima entrada cai na portaria pedindo a nova
      showToast(t('admin.keyChanged'));
      back.current();
    });
    return () => {
      watching = false;
    };
  }, [verifyKey, showToast, t]);

  if (keyStatus === 'unknown') {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <p className="zn-num text-[11px] uppercase tracking-[0.16em] text-zn-fainter">
          {t('admin.keyChecking')}
        </p>
      </div>
    );
  }

  if (keyStatus === 'missing') return <StudioGate onBack={onBack} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-none flex-wrap items-center gap-3.5 border-b border-zn-line bg-zn-bar px-5 py-2.5">
        <div className="flex gap-px border border-zn-edge bg-zn-edge">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`zn-tab ${tab === entry ? 'zn-tab-on' : ''}`}
              onClick={() => goTab(entry)}
            >
              {t(`admin.tab.${entry}`)}
            </button>
          ))}
        </div>

        <span className="zn-num truncate text-[9.5px] uppercase tracking-[0.14em] text-zn-fainter">
          <TabHint tab={tab} />
        </span>

        <div className="ml-auto flex items-center gap-2.5">
          {dirty() && (
            <span className="zn-num text-[9.5px] uppercase tracking-[0.14em] text-zn-gold">
              {t('admin.unsavedBadge')}
            </span>
          )}
          <button type="button" className="zn-btn zn-btn-gold uppercase" onClick={create}>
            + {t('admin.newCard')}
          </button>
          <span className="zn-num hidden items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-zn-green lg:flex">
            <span aria-hidden className="zn-beacon h-1.5 w-1.5 bg-zn-green" />
            {t('admin.session')}
          </span>
          <LockButton />
        </div>
      </div>

      {tab === 'form' && <CardForm />}
      {tab === 'cards' && <CardList />}
      {tab === 'library' && <ArtLibraryPanel />}

      {pending && <UnsavedGate />}
      {keyStatus === 'stale' && <StaleKeyGate onBack={onBack} />}
    </div>
  );
}

/** a linha ao lado das abas: o que cada sala está mostrando agora */
function TabHint({ tab }: { tab: StudioTab }) {
  const { t, cardName } = useTranslation();
  const { draft, artFiles } = useAdminStore();

  if (tab === 'cards') {
    return (
      <>{t('admin.tabHint.cards', { count: ALL_CARDS.length, playable: PLAYABLE_CARDS.length })}</>
    );
  }

  if (tab === 'library') {
    const files = artFiles ?? [];
    return (
      <>
        {t('admin.tabHint.library', {
          count: files.length,
          free: files.filter((art) => art.usedBy === null).length,
        })}
      </>
    );
  }

  if (!draft) return <>{t('admin.tabHint.form')}</>;
  return (
    <>
      {draft.fresh
        ? t('admin.creating', { id: draft.card.id })
        : t('admin.editing', { id: draft.card.id })}
      {' · '}
      {cardName(draft.card.id) || draft.card.name}
    </>
  );
}

function LockButton() {
  const { t } = useTranslation();
  const lock = useAdminStore((state) => state.lock);
  return (
    <button type="button" className="zn-btn zn-btn-quiet zn-btn-undo px-3" onClick={lock}>
      {t('admin.lock')}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Portaria
// ---------------------------------------------------------------------------

/**
 * A portaria de entrada: ocupa a tela inteira e não deixa nada do estúdio aparecer
 * por baixo. As três lajotas embaixo dizem o que existe do outro lado — o estúdio é
 * ferramenta de bastidor, e quem chega nele pela primeira vez não tem como saber.
 */
function StudioGate({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const perks = ['form', 'library', 'review'] as const;

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-8">
      <div className="flex w-full max-w-117 flex-col items-center gap-4.5">
        <span
          aria-hidden
          className="grid h-14 w-14 rotate-45 place-items-center border border-zn-gold-edge bg-zn-panel"
        >
          <span className="flex -rotate-45 flex-col items-center gap-0.5">
            <span className="h-3 w-3 rounded-full border-2 border-zn-gold" />
            <span className="h-2.5 w-1 bg-zn-gold" />
          </span>
        </span>

        <div className="flex flex-col items-center gap-2">
          <h2 className="zn-wordmark text-[26px] uppercase">{t('admin.title')}</h2>
          <span className="zn-label tracking-[0.32em] uppercase">{t('admin.gateNote')}</span>
        </div>

        <div className="zn-panel zn-notch-lg w-full p-5.5">
          <KeyForm onBack={onBack} />
        </div>

        <div className="zn-hair w-full grid-cols-1 border border-zn-line sm:grid-cols-3">
          {perks.map((perk) => (
            <div key={perk} className="flex flex-col gap-1.5 bg-zn-bar px-3.5 py-3">
              <span className="zn-label tracking-[0.16em] text-zn-gold uppercase">
                {t(`admin.perk.${perk}`)}
              </span>
              <span className="text-[12.5px] leading-snug text-zn-dim">
                {t(`admin.perk.${perk}Note`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * O formulário da chave. A chave digitada só é GUARDADA depois que o servidor a
 * aceita: guardar primeiro e conferir na hora de gravar era o que deixava o estúdio
 * abrir inteiro com uma chave morta, e a recusa aparecia com a carta já editada.
 *
 * Serve as duas portarias — a da entrada, que ocupa a tela, e a que sobe por cima do
 * rascunho quando a chave morre no meio do trabalho. Nenhuma das duas precisa avisar
 * quando deu certo: quem some com elas é a própria `keyStatus`.
 */
function KeyForm({ onBack }: { onBack: () => void }) {
  const { t, resolve } = useTranslation();
  const { submitKey, busy, error } = useAdminStore();
  const [typed, setTyped] = useState('');

  const send = () => {
    if (typed.trim() && !busy) void submitKey(typed.trim());
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="zn-label tracking-[0.28em] uppercase">{t('admin.keyLabel')}</span>
      <input
        className="zn-input zn-input-lg w-full text-center tracking-[0.22em] uppercase"
        placeholder={t('admin.keyPlaceholder')}
        value={typed}
        autoFocus
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') send();
        }}
      />
      {error && (
        <span className="zn-num flex items-center gap-2 text-[10px] tracking-[0.1em] text-zn-red">
          <span aria-hidden className="h-1.5 w-1.5 bg-zn-red" />
          {resolve(error)}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        className="zn-btn zn-btn-gold h-11 w-full uppercase"
        onClick={send}
      >
        {t('admin.unlock')}
      </button>
      <div className="flex items-center gap-3 border-t border-zn-line pt-3">
        <span className="text-[12px] leading-snug text-zn-fainter">{t('admin.keyHint')}</span>
        <button type="button" className="zn-btn zn-btn-wire ml-auto uppercase" onClick={onBack}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}

/**
 * A chave morreu com o estúdio JÁ aberto — o servidor foi reiniciado enquanto a
 * carta estava sendo editada.
 *
 * Aqui a portaria NÃO manda ninguém embora: sair levaria junto o rascunho que ainda
 * não foi para o catálogo. Ela sobe por cima da tela, recebe a chave nova e devolve
 * o trabalho intacto — a gravação que tomou o 403 é só repetir.
 */
function StaleKeyGate({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <StudioModal title={t('admin.keyTitle')} width={480} onClose={null}>
      <div className="flex flex-col gap-3.5">
        <p className="text-[13px] leading-relaxed text-zn-gold-light">{t('admin.keyStale')}</p>
        <KeyForm onBack={onBack} />
      </div>
    </StudioModal>
  );
}

// ---------------------------------------------------------------------------
// A guarda do rascunho
// ---------------------------------------------------------------------------

/**
 * Trocar de carta (ou sair) com campo mexido não pode simplesmente jogar fora o que
 * foi digitado. As três saídas são explícitas: descartar, gravar antes de seguir, ou
 * ficar onde está. "Gravar e continuar" fica indisponível enquanto a carta não puder
 * ser gravada — é o mesmo bloqueio do botão principal, e sem ele a resposta óbvia
 * levaria a um erro do servidor no meio da troca.
 */
function UnsavedGate() {
  const { t } = useTranslation();
  const { discardPending, savePending, cancelPending, busy, draft } = useAdminStore();
  const blocked = busy || (draft !== null && draftBlocked(draft));

  return (
    <StudioModal title={t('admin.unsavedTitle')} width={480} onClose={null}>
      <p className="text-[13.5px] leading-relaxed text-zn-soft">{t('admin.unsavedQuestion')}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="zn-btn zn-btn-wire uppercase" onClick={cancelPending}>
          {t('admin.unsavedCancel')}
        </button>
        <button type="button" className="zn-btn zn-btn-blood uppercase" onClick={discardPending}>
          {t('admin.unsavedDiscard')}
        </button>
        <button
          type="button"
          disabled={blocked}
          className="zn-btn zn-btn-gold uppercase"
          onClick={() => void savePending()}
        >
          {t('admin.unsavedSave')}
        </button>
      </div>
      {blocked && (
        <p className="zn-num mt-2.5 text-right text-[9.5px] uppercase tracking-[0.12em] text-zn-gold">
          {t('admin.unsavedBlocked')}
        </p>
      )}
    </StudioModal>
  );
}
