import { useState } from 'react';
import { MAX_DECK_CARDS } from '../../data/deckRules.ts';
import { useDecksStore, activeDeckOf } from '../stores/decksStore.ts';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useToastStore } from '../stores/toastStore.ts';
import { DeckSwitcher } from './DeckSwitcher.tsx';
import { LanguagePicker } from './LanguagePicker.tsx';
import { useTranslation } from '../useTranslation.ts';
import { ZN } from '../theme.ts';

/** as telas de fora da partida, na ordem em que a trilha as numera */
export type Screen = 'hub' | 'builder' | 'collection' | 'online' | 'history' | 'studio';

const NAV: readonly {
  screen: Screen;
  label: 'hub' | 'builder' | 'collection' | 'online' | 'history';
}[] = [
  { screen: 'hub', label: 'hub' },
  { screen: 'builder', label: 'builder' },
  { screen: 'collection', label: 'collection' },
  { screen: 'online', label: 'online' },
  { screen: 'history', label: 'history' },
];

/**
 * A moldura do console (decisão nº 29): trilha à esquerda, barra no topo, tela
 * no meio. Toda tela de fora da partida mora aqui dentro — o desenho não tem
 * botão "voltar" em lugar nenhum porque a trilha nunca sai da vista.
 *
 * O rodapé da trilha é o BARALHO ATIVO, e ele é clicável: é por ali que se troca
 * de baralho e se cria outro (o desenho supõe um baralho só; a conta tem vários).
 */
export function AppShell({
  screen,
  onNavigate,
  title,
  subtitle,
  studioEnabled,
  children,
}: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  title: string;
  /** a linha mono ao lado do título, em caixa alta */
  subtitle: string;
  /** o estúdio só existe quando o servidor subiu com --admin */
  studioEnabled: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [switching, setSwitching] = useState(false);
  const nav = studioEnabled ? [...NAV, { screen: 'studio' as const, label: 'studio' as const }] : NAV;

  return (
    <div className="zn-shell">
      <nav className="zn-rail">
        <div className="border-b border-zn-line px-4.5 pb-4.5 pt-5">
          <div className="zn-wordmark zn-rail-wide text-[19px]">
            {t('shell.brandTop')}
            <br />
            {t('shell.brandBottom')}
          </div>
          <div className="zn-wordmark zn-rail-narrow text-center text-[17px]">EZ</div>
          <div className="zn-label zn-rail-wide mt-1.5 tracking-[0.34em] text-zn-fainter uppercase">
            {t('app.subtitle')}
          </div>
        </div>

        <div className="flex flex-col py-2.5">
          {nav.map((entry, index) => (
            <button
              key={entry.screen}
              type="button"
              title={t(`shell.nav.${entry.label}`)}
              onClick={() => onNavigate(entry.screen)}
              className={`zn-nav ${screen === entry.screen ? 'zn-nav-on' : ''}`}
            >
              <span className="zn-num text-[10px] text-zn-fainter">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="zn-rail-wide font-head text-[17px] font-semibold uppercase tracking-[0.09em]">
                {t(`shell.nav.${entry.label}`)}
              </span>
            </button>
          ))}
        </div>

        <ActiveDeckPlate onOpen={() => setSwitching(true)} />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="zn-topbar">
          <span aria-hidden className="h-5.5 w-[3px] shrink-0 bg-zn-gold" />
          <h1 className="zn-head shrink-0 text-[25px] tracking-[0.13em]">{title}</h1>
          <span className="zn-num truncate text-[10px] uppercase tracking-[0.2em] text-zn-faint">
            {subtitle}
          </span>
          <TopbarStatus />
        </header>

        {children}
      </div>

      {switching && (
        <DeckSwitcher
          onClose={() => setSwitching(false)}
          onOpenBuilder={() => {
            setSwitching(false);
            onNavigate('builder');
          }}
        />
      )}
      <Toast />
    </div>
  );
}

/**
 * O rodapé da trilha: nome do baralho ativo, contagem e o fio de progresso até
 * as 40 cartas. É o único lugar da moldura que fala do deck, e é de propósito —
 * o desenho quer o número de cartas visível em TODA tela, não só no construtor.
 */
function ActiveDeckPlate({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const deck = useDecksStore(activeDeckOf);
  const total = deck ? Object.values(deck.cards).reduce((sum, amount) => sum + amount, 0) : 0;
  const color = total === MAX_DECK_CARDS ? ZN.green : total > MAX_DECK_CARDS ? ZN.red : ZN.gold;

  return (
    <button
      type="button"
      title={t('shell.switchDeck')}
      onClick={onOpen}
      className="mt-auto flex cursor-pointer flex-col gap-2.5 border-0 border-t border-zn-line bg-transparent px-4.5 py-4 text-left hover:bg-zn-raise"
    >
      <span className="zn-label zn-rail-wide tracking-[0.26em] text-zn-fainter uppercase">
        {t('shell.activeDeck')}
      </span>
      <span className="zn-name zn-rail-wide truncate text-[16px] text-zn-text">
        {deck ? deck.name : t('shell.noDeck')}
      </span>
      {/* na trilha estreita sobram o número e o fio: é a porta da gaveta de baralhos,
          e escondê-la inteira tirava o único caminho para trocar de baralho ali */}
      <span className="zn-num flex items-baseline gap-1.5 text-[11px] text-zn-muted uppercase">
        <span className="text-[19px] font-bold" style={{ color }}>
          {total}
        </span>
        <span className="zn-rail-wide">{t('shell.deckTotal', { max: MAX_DECK_CARDS })}</span>
      </span>
      <span className="zn-track h-[3px]">
        <span
          style={{
            width: `${Math.min(100, Math.round((total / MAX_DECK_CARDS) * 100))}%`,
            background: color,
          }}
        />
      </span>
    </button>
  );
}

/** o canto direito da barra: idioma e quem está logado */
function TopbarStatus() {
  const { t } = useTranslation();
  const { session, signOut } = useSessionStore();

  return (
    <div className="ml-auto flex shrink-0 items-center gap-3.5">
      <LanguagePicker />
      <span className="zn-panel flex items-center gap-2 px-3 py-1.5">
        <span aria-hidden className="zn-beacon h-1.5 w-1.5 bg-zn-green" />
        {/*
          Convidada mostra o selo traduzido primeiro e o apelido sorteado depois
          ("CONVIDADO · SUMMONER-A3F91C"): o selo diz o QUE a conta é, o apelido diz
          QUEM ela é — e é ele que a distingue de outro convidado na mesma sala.
          Conta com e-mail não tem selo: só o apelido.
        */}
        <span className="zn-num text-[10px] uppercase tracking-[0.14em] text-zn-muted">
          {session?.guest ? `${t('shell.guest')} · ` : ''}
          {session?.nickname}
        </span>
      </span>
      <button
        type="button"
        onClick={signOut}
        className="zn-num cursor-pointer border-0 bg-transparent p-0 text-[10px] uppercase tracking-[0.18em] text-zn-fainter transition-colors hover:text-zn-gold-light"
      >
        {t('shell.signOut')}
      </button>
    </div>
  );
}

function Toast() {
  const message = useToastStore((state) => state.message);
  if (!message) return null;
  return (
    <div role="status" className="zn-toast uppercase">
      {message}
    </div>
  );
}
