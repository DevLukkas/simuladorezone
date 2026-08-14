import { abrirBanco } from './banco.ts';
import { rotasDeConta } from './contas.ts';
import { rotasDeDecks } from './decks.ts';
import { rotasDePartidas } from './partidas.ts';
import { rotasDeSalas } from './salas.ts';
import { aplicarMigracoes } from './esquema.ts';
import { servirPasta } from './estatico.ts';
import { montarServidor } from './http.ts';
import type { Banco } from './banco.ts';
import type http from 'node:http';

export interface ServidorMontado {
  servidor: http.Server;
  banco: Banco;
}

/** Composição completa: banco + migrações + rotas + estáticos do dist/. */
export function montar(caminhoDoBanco: string, pastaEstatica: string | null): ServidorMontado {
  const banco = abrirBanco(caminhoDoBanco);
  aplicarMigracoes(banco);

  const rotas = [
    ...rotasDeConta(banco),
    ...rotasDeDecks(banco),
    ...rotasDeSalas(banco),
    ...rotasDePartidas(banco),
  ];
  const servidor = montarServidor(rotas, pastaEstatica ? servirPasta(pastaEstatica) : null);
  return { servidor, banco };
}
