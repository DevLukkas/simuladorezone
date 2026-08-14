import { useEffect, useState } from 'react';
import { usePartidaStore, type DeckParaTreino } from './estado/partidaStore.ts';
import { useSessaoStore } from './estado/sessaoStore.ts';
import { useDecksStore } from './estado/decksStore.ts';
import { CartaAmpliada } from './componentes/CartaAmpliada.tsx';
import { ToggleRenderizacao } from './componentes/ToggleRenderizacao.tsx';
import { Tabuleiro } from './componentes/Tabuleiro.tsx';
import { Entrar } from './telas/Entrar.tsx';
import { Colecao } from './telas/Colecao.tsx';
import { Decks } from './telas/Decks.tsx';
import { Lobby } from './telas/Lobby.tsx';
import { api } from './services/api.ts';

type Tela = 'menu' | 'colecao' | 'decks' | 'lobby';

export function App() {
  const { sessao, sair: sairDaConta } = useSessaoStore();
  const { visao, iniciarTreino, iniciarOnline } = usePartidaStore();
  const [tela, setTela] = useState<Tela>('menu');

  // reconexão: se a conta tem partida em andamento, volta direto para ela
  useEffect(() => {
    if (!sessao || visao) return;
    void api<{ partidaId: number | null }>('GET', '/api/partidas/atual')
      .then((resposta) => {
        if (resposta.partidaId) return iniciarOnline(resposta.partidaId);
        return undefined;
      })
      .catch(() => undefined);
  }, [sessao, visao, iniciarOnline]);

  if (!sessao) return <Entrar />;

  let conteudo: React.ReactNode;
  if (visao) conteudo = <Tabuleiro />;
  else if (tela === 'colecao') conteudo = <Colecao aoVoltar={() => setTela('menu')} />;
  else if (tela === 'decks') conteudo = <Decks aoVoltar={() => setTela('menu')} />;
  else if (tela === 'lobby') {
    conteudo = (
      <Lobby
        aoVoltar={() => setTela('menu')}
        aoEntrarNaPartida={(partidaId) => {
          setTela('menu');
          void iniciarOnline(partidaId);
        }}
      />
    );
  } else {
    conteudo = (
      <Menu
        apelido={sessao.apelido}
        convidada={sessao.convidada}
        aoTreinar={iniciarTreino}
        aoAbrirLobby={() => setTela('lobby')}
        aoAbrirColecao={() => setTela('colecao')}
        aoAbrirDecks={() => setTela('decks')}
        aoSair={sairDaConta}
      />
    );
  }

  return (
    <>
      {conteudo}
      <CartaAmpliada />
      <ToggleRenderizacao />
    </>
  );
}

function Menu({
  apelido,
  convidada,
  aoTreinar,
  aoAbrirLobby,
  aoAbrirColecao,
  aoAbrirDecks,
  aoSair,
}: {
  apelido: string;
  convidada: boolean;
  aoTreinar: (deck?: DeckParaTreino) => void;
  aoAbrirLobby: () => void;
  aoAbrirColecao: () => void;
  aoAbrirDecks: () => void;
  aoSair: () => void;
}) {
  const { decks, carregado, carregar } = useDecksStore();
  const [deckEscolhido, setDeckEscolhido] = useState<number | 'padrao'>('padrao');

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function treinar() {
    const deck = decks.find((candidato) => candidato.id === deckEscolhido);
    if (!deck) {
      aoTreinar();
      return;
    }
    const cartas: number[] = [];
    for (const [cartaId, quantidade] of Object.entries(deck.cartas)) {
      for (let i = 0; i < quantidade; i++) cartas.push(Number(cartaId));
    }
    aoTreinar({ heroi: deck.heroi, cartas, formato: deck.formato ?? 'classico' });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-5 p-8 text-center">
      <img src="/assets/img/cover.png" alt="" className="w-40 rounded shadow-lg" />
      <h1 className="text-4xl font-bold tracking-tight">Ezone TCG</h1>
      <p className="text-slate-400">
        Olá, <span className="font-bold text-slate-200">{apelido}</span>
        {convidada && ' (convidado)'}
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor="deck" className="text-sm text-slate-400">
          Deck:
        </label>
        <select
          id="deck"
          className="rounded bg-slate-800 px-3 py-1"
          value={deckEscolhido}
          onChange={(evento) =>
            setDeckEscolhido(evento.target.value === 'padrao' ? 'padrao' : Number(evento.target.value))
          }
        >
          <option value="padrao">Deck de demonstração</option>
          {carregado &&
            decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.nome}
              </option>
            ))}
        </select>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={aoAbrirLobby}
          className="rounded-lg bg-sky-700 px-8 py-3 text-lg font-bold shadow hover:bg-sky-600"
        >
          JOGAR ONLINE
        </button>
        <button
          type="button"
          onClick={treinar}
          className="rounded-lg bg-emerald-700 px-8 py-3 text-lg font-bold shadow hover:bg-emerald-600"
        >
          TREINO VS BOT
        </button>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={aoAbrirDecks} className="rounded bg-slate-800 px-5 py-2 hover:bg-slate-700">
          Meus decks
        </button>
        <button type="button" onClick={aoAbrirColecao} className="rounded bg-slate-800 px-5 py-2 hover:bg-slate-700">
          Coleção
        </button>
        <button type="button" onClick={aoSair} className="rounded px-5 py-2 text-slate-500 hover:bg-slate-800">
          Sair
        </button>
      </div>

      <p className="text-xs text-slate-600">
        Partidas online: entre na fila ou crie uma sala com código de convite.
      </p>
    </main>
  );
}
