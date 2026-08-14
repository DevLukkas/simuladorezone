import type { Carta } from '../../data/tipos.ts';

export const TIPOS_DE_FILTRO = ['todas', 'criatura', 'habilidade', 'item', 'comando', 'cenario'] as const;
export const ELEMENTOS_DE_FILTRO = [
  'todos',
  'fogo',
  'agua',
  'terra',
  'vento',
  'neutro',
  'vazio',
  'arcano',
] as const;

export interface FiltroDeCartas {
  busca: string;
  tipo: (typeof TIPOS_DE_FILTRO)[number];
  elemento: (typeof ELEMENTOS_DE_FILTRO)[number];
}

export const FILTRO_INICIAL: FiltroDeCartas = { busca: '', tipo: 'todas', elemento: 'todos' };

/** Minúsculas e sem diacríticos: buscar "tritao" acha "Tritão". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filtrarCartas(cartas: readonly Carta[], filtro: FiltroDeCartas): Carta[] {
  const busca = normalizar(filtro.busca.trim());
  return cartas.filter((carta) => {
    if (filtro.tipo !== 'todas' && carta.tipo !== filtro.tipo) return false;
    if (filtro.elemento !== 'todos' && carta.elemento !== filtro.elemento) return false;
    if (busca && !normalizar(`${carta.nome} ${carta.efeito ?? ''}`).includes(busca)) return false;
    return true;
  });
}

/** Barra de filtros compartilhada pela Coleção e pelo construtor de decks. */
export function BarraDeFiltros({
  valor,
  aoMudar,
}: {
  valor: FiltroDeCartas;
  aoMudar: (filtro: FiltroDeCartas) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <input
        className="w-56 rounded bg-slate-800 px-3 py-1 placeholder:text-slate-500"
        placeholder="Buscar por nome ou efeito…"
        value={valor.busca}
        onChange={(evento) => aoMudar({ ...valor, busca: evento.target.value })}
      />
      {TIPOS_DE_FILTRO.map((tipo) => (
        <button
          key={tipo}
          type="button"
          className={`rounded px-3 py-1 capitalize ${
            valor.tipo === tipo ? 'bg-emerald-800' : 'bg-slate-800 text-slate-400'
          }`}
          onClick={() => aoMudar({ ...valor, tipo })}
        >
          {tipo}
        </button>
      ))}
      <select
        className="rounded bg-slate-800 px-2 py-1 capitalize"
        value={valor.elemento}
        onChange={(evento) =>
          aoMudar({ ...valor, elemento: evento.target.value as FiltroDeCartas['elemento'] })
        }
      >
        {ELEMENTOS_DE_FILTRO.map((elemento) => (
          <option key={elemento} value={elemento}>
            {elemento === 'todos' ? 'todos os elementos' : elemento}
          </option>
        ))}
      </select>
    </div>
  );
}
