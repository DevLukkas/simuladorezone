import { openDb } from './db.ts';
import { accountRoutes } from './accounts.ts';
import { adminRoutes, type AdminOptions } from './admin.ts';
import { deckRoutes } from './decks.ts';
import { matchRoutes } from './matches.ts';
import { roomRoutes } from './rooms.ts';
import { applyMigrations } from './schema.ts';
import { serveFolder } from './staticFiles.ts';
import { createHttpServer } from './http.ts';
import type { Db } from './db.ts';
import type http from 'node:http';

export interface BuiltServer {
  server: http.Server;
  db: Db;
}

/**
 * Composição completa: banco + migrações + rotas + estáticos do dist/.
 *
 * `admin` nulo (o padrão) monta só a rota que diz que o estúdio de cartas está
 * desligado — nenhuma rota de escrita no repositório existe sem ele.
 */
export function buildServer(
  dbPath: string,
  staticFolder: string | null,
  admin: AdminOptions | null = null,
): BuiltServer {
  const db = openDb(dbPath);
  applyMigrations(db);

  const routes = [
    ...accountRoutes(db),
    ...deckRoutes(db),
    ...roomRoutes(db),
    ...matchRoutes(db),
    ...adminRoutes(db, admin),
  ];
  const server = createHttpServer(routes, staticFolder ? serveFolder(staticFolder) : null);
  return { server, db };
}
