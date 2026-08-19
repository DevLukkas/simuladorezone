import { useEffect, useState } from 'react';
import { ALL_CARDS } from '../data/cards.ts';
import { MAX_COPIES, MAX_DECK_CARDS } from '../data/deckRules.ts';
import { useMatchStore } from './stores/matchStore.ts';
import { useSessionStore } from './stores/sessionStore.ts';
import { useDecksStore, activeDeckOf } from './stores/decksStore.ts';
import { AppShell, type Screen } from './components/AppShell.tsx';
import { CardZoom } from './components/CardZoom.tsx';
import { Board } from './components/Board.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Hub } from './screens/Hub.tsx';
import { Collection } from './screens/Collection.tsx';
import { DeckBuilder } from './screens/DeckBuilder.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Studio } from './screens/Studio.tsx';
import { useAdminStore } from './stores/adminStore.ts';
import { api } from './services/api.ts';
import { useTranslation } from './useTranslation.ts';

/**
 * A raiz do cliente. Três estados, nesta ordem: sem conta é o login; com partida
 * em andamento é o tabuleiro; o resto é o console (decisão nº 29), que embrulha
 * hub, construtor, coleção, online e estúdio numa moldura só.
 *
 * Login e tabuleiro seguem no tema anterior — ficaram de fora desta leva de
 * redesign de propósito, e por isso não moram dentro do `AppShell`.
 */
export function App() {
  const { session } = useSessionStore();
  const { view, startTraining, startOnline } = useMatchStore();
  const [screen, setScreen] = useState<Screen>('hub');
  const { enabled: studioEnabled, checkEnabled } = useAdminStore();
  const { load } = useDecksStore();
  const deck = useDecksStore(activeDeckOf);
  const { t } = useTranslation();

  // o estúdio de cartas só existe quando o servidor sobe com --admin
  useEffect(() => {
    if (session) void checkEnabled();
  }, [session, checkEnabled]);

  // a moldura inteira lê o baralho ativo: ele é carregado uma vez, aqui em cima
  useEffect(() => {
    if (session) void load();
  }, [session, load]);

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
  if (view) {
    return (
      <>
        <Board />
        <CardZoom />
      </>
    );
  }

  /** o treino usa o baralho ativo; sem ele, o deck de demonstração do motor */
  function train() {
    if (!deck) {
      startTraining();
      return;
    }
    const cards: number[] = [];
    for (const [cardId, amount] of Object.entries(deck.cards)) {
      for (let copy = 0; copy < amount; copy++) cards.push(Number(cardId));
    }
    startTraining({ hero: deck.hero, cards, format: deck.format ?? 'classic' });
  }

  const heading = {
    hub: [t('hub.title'), t('hub.subtitle')],
    builder: [t('decks.title'), t('decks.subtitle', { max: MAX_DECK_CARDS, copies: MAX_COPIES })],
    collection: [t('collection.title'), t('collection.subtitle', { count: ALL_CARDS.length })],
    online: [t('lobby.title'), t('lobby.subtitle')],
    studio: [t('admin.title'), t('admin.subtitle')],
  }[screen];

  return (
    <>
      <AppShell
        screen={screen}
        onNavigate={setScreen}
        title={heading[0]!}
        subtitle={heading[1]!}
        studioEnabled={studioEnabled === true}
      >
        {screen === 'hub' && <Hub onNavigate={setScreen} onTrain={train} />}
        {screen === 'builder' && <DeckBuilder />}
        {screen === 'collection' && <Collection />}
        {screen === 'online' && (
          <Lobby
            onEnterMatch={(matchId) => void startOnline(matchId)}
            onOpenBuilder={() => setScreen('builder')}
          />
        )}
        {/*
          O estúdio é ferramenta de bastidor e segue no tema anterior por dentro
          (decisão nº 26): entra na moldura como está, dentro da própria rolagem.
        */}
        {screen === 'studio' && (
          <div className="min-h-0 flex-1 overflow-auto">
            <Studio onBack={() => setScreen('hub')} />
          </div>
        )}
      </AppShell>
      <CardZoom />
    </>
  );
}
