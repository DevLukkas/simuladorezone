import { useEffect, useState } from 'react';
import { useMatchStore, type TrainingDeck } from './stores/matchStore.ts';
import { useSessionStore } from './stores/sessionStore.ts';
import { useDecksStore } from './stores/decksStore.ts';
import { ALL_CARDS } from '../data/cards.ts';
import { CardImage } from './components/Card.tsx';
import { CardZoom } from './components/CardZoom.tsx';
import { LanguagePicker } from './components/LanguagePicker.tsx';
import { Wordmark } from './components/Wordmark.tsx';
import { Board } from './components/Board.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Collection } from './screens/Collection.tsx';
import { Decks } from './screens/Decks.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Studio } from './screens/Studio.tsx';
import { useAdminStore } from './stores/adminStore.ts';
import { api } from './services/api.ts';
import { useTranslation } from './useTranslation.ts';

type Screen = 'menu' | 'collection' | 'decks' | 'lobby' | 'studio';

/**
 * A carta que boia no menu é sorteada do catálogo inteiro a cada volta ao menu
 * (pedido do DevLukkas): o menu é vitrine, e vitrine fixa cansa.
 */
function randomShowcaseCard(): number {
  const index = Math.floor(Math.random() * ALL_CARDS.length);
  // Badur, o Urso Guardião, de reserva — o catálogo nunca é vazio, mas o índice é conferido
  return ALL_CARDS[index]?.id ?? 31;
}

export function App() {
  const { session, signOut } = useSessionStore();
  const { view, startTraining, startOnline } = useMatchStore();
  const [screen, setScreen] = useState<Screen>('menu');
  const { enabled: studioEnabled, checkEnabled } = useAdminStore();

  // o estúdio de cartas só existe quando o servidor sobe com --admin
  useEffect(() => {
    if (session) void checkEnabled();
  }, [session, checkEnabled]);

  // reconexão: se a conta tem partida em andamento, volta direto para ela
  useEffect(() => {
    if (!session || view) return;
    void api<{ matchId: number | null }>('GET', '/api/matches/current')
      .then((reply) => {
        if (reply.matchId) return startOnline(reply.matchId);
        return undefined;
      })
      .catch(() => undefined);
  }, [session, view, startOnline]);

  if (!session) return <SignIn />;

  let content: React.ReactNode;
  if (view) content = <Board />;
  else if (screen === 'collection') content = <Collection onBack={() => setScreen('menu')} />;
  else if (screen === 'decks') content = <Decks onBack={() => setScreen('menu')} />;
  else if (screen === 'studio') content = <Studio onBack={() => setScreen('menu')} />;
  else if (screen === 'lobby') {
    content = (
      <Lobby
        onBack={() => setScreen('menu')}
        onEnterMatch={(matchId) => {
          setScreen('menu');
          void startOnline(matchId);
        }}
      />
    );
  } else {
    content = (
      <MainMenu
        nickname={session.nickname}
        guest={session.guest}
        onTrain={startTraining}
        onOpenLobby={() => setScreen('lobby')}
        onOpenCollection={() => setScreen('collection')}
        onOpenDecks={() => setScreen('decks')}
        onSignOut={signOut}
        {...(studioEnabled ? { onOpenStudio: () => setScreen('studio') } : {})}
      />
    );
  }

  return (
    <>
      {content}
      <CardZoom />
    </>
  );
}

function MainMenu({
  nickname,
  guest,
  onTrain,
  onOpenLobby,
  onOpenCollection,
  onOpenDecks,
  onOpenStudio,
  onSignOut,
}: {
  nickname: string;
  guest: boolean;
  onTrain: (deck?: TrainingDeck) => void;
  onOpenLobby: () => void;
  onOpenCollection: () => void;
  onOpenDecks: () => void;
  /** ausente quando o servidor não subiu com --admin */
  onOpenStudio?: () => void;
  onSignOut: () => void;
}) {
  const { decks, loaded, load } = useDecksStore();
  const { t } = useTranslation();
  const [chosenDeckId, setChosenDeckId] = useState<number | 'default'>('default');
  // sorteada uma vez por visita ao menu: voltar de uma partida ou da coleção troca a carta
  const [showcaseCard] = useState(randomShowcaseCard);

  useEffect(() => {
    void load();
  }, [load]);

  function train() {
    const deck = decks.find((candidate) => candidate.id === chosenDeckId);
    if (!deck) {
      onTrain();
      return;
    }
    const cards: number[] = [];
    for (const [cardId, amount] of Object.entries(deck.cards)) {
      for (let i = 0; i < amount; i++) cards.push(Number(cardId));
    }
    onTrain({ hero: deck.hero, cards, format: deck.format ?? 'classic' });
  }

  return (
    <main className="ez-page relative flex flex-col items-center justify-center gap-5.5 overflow-hidden p-11">
      <div className="absolute right-5 top-4 flex items-center gap-3.5 text-sm text-ez-muted">
        <span>
          {t('menu.greeting', { nickname })}
          {guest && t('menu.guestSuffix')}
        </span>
        <button
          type="button"
          onClick={onSignOut}
          className="cursor-pointer text-ez-muted transition-colors hover:text-ez-gold-light"
        >
          {t('menu.signOut')}
        </button>
      </div>

      {/*
        A carta que boia no menu é uma carta DO JOGO, não o verso impresso: o verso
        traz o brasão do "EZone Tatics", que é outro jogo do DevLukkas, e ele não
        pode ser o rosto deste. Qual carta é fica por conta do sorteio. Clique
        direito amplia, como em qualquer carta.
      */}
      <div className="relative aspect-[415/555] h-[296px] max-h-[34vh]">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-11"
          style={{
            background: 'radial-gradient(closest-side, rgba(63,169,245,.28), transparent 72%)',
            animation: 'ez-glow-pulse 4s ease-in-out infinite',
          }}
        />
        <div
          className="h-full"
          style={{
            filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.65))',
            animation: 'ez-floaty 6s ease-in-out infinite',
          }}
        >
          <CardImage cardId={showcaseCard} className="h-full w-auto" />
        </div>
      </div>

      <Wordmark compact />

      <div className="ez-panel flex items-center gap-2.5 px-4 py-2.5">
        <label htmlFor="deck" className="text-sm text-ez-muted">
          {t('menu.deck')}
        </label>
        <select
          id="deck"
          className="ez-select ez-select-sm"
          value={chosenDeckId}
          onChange={(event) =>
            setChosenDeckId(
              event.target.value === 'default' ? 'default' : Number(event.target.value),
            )
          }
        >
          <option value="default">{t('menu.demoDeck')}</option>
          {loaded &&
            decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} — {t(`format.${deck.format ?? 'classic'}`)}
              </option>
            ))}
        </select>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <button type="button" onClick={onOpenLobby} className="ez-btn ez-btn-blue min-w-55 py-4">
          {t('menu.playOnline')}
        </button>
        <button type="button" onClick={train} className="ez-btn ez-btn-gold min-w-55 py-4">
          {t('menu.trainVsBot')}
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onOpenDecks} className="ez-btn ez-btn-ghost ez-btn-sm">
          {t('menu.myDecks')}
        </button>
        <button type="button" onClick={onOpenCollection} className="ez-btn ez-btn-ghost ez-btn-sm">
          {t('menu.collection')}
        </button>
        {onOpenStudio && (
          <button type="button" onClick={onOpenStudio} className="ez-btn ez-btn-ghost ez-btn-sm">
            {t('admin.open')}
          </button>
        )}
        <LanguagePicker />
      </div>

      <p className="text-[13px] text-ez-dim">{t('menu.onlineHint')}</p>
    </main>
  );
}
