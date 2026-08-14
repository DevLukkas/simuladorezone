import { useEffect, useState } from 'react';
import { TODAS_AS_CARTAS } from '../../data/cartas.ts';
import { decksProntos } from '../../data/decksProntos.ts';
import { herois } from '../../data/herois.ts';
import {
  MAXIMO_DE_CARTAS_NO_DECK,
  MAXIMO_DE_COPIAS,
  validarDeck,
} from '../../data/regras.ts';
import { CartaImagem } from '../componentes/Carta.tsx';
import { BarraDeFiltros, FILTRO_INICIAL, filtrarCartas } from '../componentes/FiltroDeCartas.tsx';
import { useDecksStore, type DeckSalvo } from '../estado/decksStore.ts';

export function Decks({ aoVoltar }: { aoVoltar: () => void }) {
  const { decks, carregado, erro, carregar, salvar, apagar } = useDecksStore();
  const [editando, setEditando] = useState<(Omit<DeckSalvo, 'id'> & { id?: number }) | null>(null);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (editando) {
    return (
      <EditorDeDeck
        inicial={editando}
        aoSalvar={async (deck) => {
          const salvo = await salvar(deck);
          if (salvo) setEditando(null);
        }}
        aoCancelar={() => setEditando(null)}
        erroDoServidor={erro}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={aoVoltar}>
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold">Meus decks</h1>
        <button
          type="button"
          className="rounded bg-emerald-800 px-3 py-1 font-bold hover:bg-emerald-700"
          onClick={() => setEditando({ nome: 'Novo deck', heroi: 'badur', cartas: {} })}
        >
          + Novo
        </button>
      </div>

      {!carregado && <p className="text-slate-400">Carregando…</p>}
      {erro && <p className="text-amber-400">{erro}</p>}

      <ul className="flex flex-col gap-2">
        {decks.map((deck) => {
          const total = Object.values(deck.cartas).reduce((soma, qtd) => soma + qtd, 0);
          return (
            <li
              key={deck.id}
              className="flex items-center gap-4 rounded border border-slate-800 bg-slate-900/60 p-3"
            >
              <span className="flex-1 font-bold">{deck.nome}</span>
              <span className="text-sm capitalize text-slate-400">herói: {deck.heroi}</span>
              <span className="text-sm text-slate-400">{total} cartas</span>
              <button
                type="button"
                className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
                onClick={() => setEditando(deck)}
              >
                Editar
              </button>
              <button
                type="button"
                className="rounded bg-red-900 px-3 py-1 text-sm hover:bg-red-800"
                onClick={() => void apagar(deck.id)}
              >
                Apagar
              </button>
            </li>
          );
        })}
      </ul>
      {carregado && decks.length === 0 && (
        <p className="mt-4 text-slate-400">Nenhum deck ainda — crie o primeiro.</p>
      )}
    </main>
  );
}

function EditorDeDeck({
  inicial,
  aoSalvar,
  aoCancelar,
  erroDoServidor,
}: {
  inicial: Omit<DeckSalvo, 'id'> & { id?: number };
  aoSalvar: (deck: Omit<DeckSalvo, 'id'> & { id?: number }) => Promise<void>;
  aoCancelar: () => void;
  erroDoServidor: string | null;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [heroi, setHeroi] = useState(inicial.heroi);
  const [cartas, setCartas] = useState<Record<number, number>>({ ...inicial.cartas });
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);

  const total = Object.values(cartas).reduce((soma, qtd) => soma + qtd, 0);
  const problemas = validarDeck({ nome, heroi, cartas });
  const cartasVisiveis = filtrarCartas(TODAS_AS_CARTAS, filtro);

  function ajustar(cartaId: number, delta: number) {
    setCartas((atuais) => {
      const quantidade = (atuais[cartaId] ?? 0) + delta;
      const proximas = { ...atuais };
      if (quantidade <= 0) delete proximas[cartaId];
      else proximas[cartaId] = Math.min(quantidade, MAXIMO_DE_COPIAS);
      return proximas;
    });
  }

  function carregarDeckPronto(chave: string) {
    const pronto = decksProntos.find((deck) => deck.chave === chave);
    if (!pronto) return;
    if (total > 0 && !window.confirm(`Substituir as cartas atuais pelas de "${pronto.nome}"?`)) {
      return;
    }
    setNome(pronto.nome);
    setHeroi(pronto.heroi);
    setCartas({ ...pronto.cartas });
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={aoCancelar}>
          ← Cancelar
        </button>
        <input
          className="rounded bg-slate-800 px-3 py-1 font-bold"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
        />
        <select
          className="rounded bg-slate-800 px-3 py-1 capitalize"
          value={heroi}
          onChange={(evento) => setHeroi(evento.target.value)}
        >
          {herois.map((opcao) => (
            <option key={opcao.chave} value={opcao.chave}>
              {opcao.nome} — {opcao.nomeDoEfeito}
            </option>
          ))}
        </select>
        <select
          className="rounded bg-slate-800 px-3 py-1"
          value=""
          onChange={(evento) => carregarDeckPronto(evento.target.value)}
        >
          <option value="" disabled>
            Carregar deck pronto…
          </option>
          {decksProntos.map((pronto) => (
            <option key={pronto.chave} value={pronto.chave}>
              {pronto.nome} ({pronto.elemento})
            </option>
          ))}
        </select>
        <span className={`font-bold ${total > MAXIMO_DE_CARTAS_NO_DECK ? 'text-red-400' : 'text-slate-300'}`}>
          {total}/{MAXIMO_DE_CARTAS_NO_DECK}
        </span>
        <button
          type="button"
          disabled={problemas.length > 0}
          className="rounded bg-emerald-800 px-4 py-1 font-bold hover:bg-emerald-700 disabled:opacity-40"
          onClick={() => {
            const deck: Omit<DeckSalvo, 'id'> & { id?: number } = { nome, heroi, cartas };
            if (inicial.id !== undefined) deck.id = inicial.id;
            void aoSalvar(deck);
          }}
        >
          SALVAR
        </button>
      </div>

      {problemas.length > 0 && <p className="mb-2 text-sm text-amber-400">{problemas.join(' ')}</p>}
      {erroDoServidor && <p className="mb-2 text-sm text-red-400">{erroDoServidor}</p>}

      <BarraDeFiltros valor={filtro} aoMudar={setFiltro} />
      <p className="mb-3 text-xs text-slate-500">
        Clique numa carta para adicioná-la ao deck — clique direito para ampliá-la e ler o efeito.
      </p>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {cartasVisiveis.map((carta) => {
          const quantidade = cartas[carta.id] ?? 0;
          return (
            <div key={carta.id} className={quantidade ? '' : 'opacity-60'}>
              <button type="button" className="block w-full" onClick={() => ajustar(carta.id, 1)}>
                <CartaImagem cartaId={carta.id} className="w-full rounded transition-transform hover:scale-105" />
              </button>
              <div className="mt-1 flex items-center justify-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded bg-slate-800 px-2 disabled:opacity-30"
                  disabled={!quantidade}
                  onClick={() => ajustar(carta.id, -1)}
                >
                  −
                </button>
                <span className={quantidade ? 'font-bold' : 'text-slate-500'}>
                  {quantidade}/{MAXIMO_DE_COPIAS}
                </span>
                <button
                  type="button"
                  className="rounded bg-slate-800 px-2 disabled:opacity-30"
                  disabled={quantidade >= MAXIMO_DE_COPIAS || total >= MAXIMO_DE_CARTAS_NO_DECK}
                  onClick={() => ajustar(carta.id, 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {cartasVisiveis.length === 0 && (
        <p className="mt-6 text-center text-slate-500">Nenhuma carta com esses filtros.</p>
      )}
    </main>
  );
}
