import { DatabaseSync } from 'node:sqlite';

// único arquivo do servidor que conhece node:sqlite (padrão jogo-gacha):
// trocar de banco um dia é reescrever este arquivo, não caçar conexões
export type DbValue = string | number | bigint | null | Uint8Array;

export type Row = Record<string, unknown>;

export type Db = {
  all: (sql: string, ...params: DbValue[]) => Row[];
  one: (sql: string, ...params: DbValue[]) => Row | null;
  run: (sql: string, ...params: DbValue[]) => number;
  raw: (sql: string) => void;
  inTransaction: <T>(body: () => T) => T;
  version: () => number;
  setVersion: (value: number) => void;
  close: () => void;
};

export const openDb = (path: string): Db => {
  const connection = new DatabaseSync(path);
  connection.exec('PRAGMA journal_mode = WAL');
  connection.exec('PRAGMA foreign_keys = ON');

  return {
    all: (sql, ...params) => connection.prepare(sql).all(...params),
    one: (sql, ...params) => connection.prepare(sql).get(...params) ?? null,
    run: (sql, ...params) => Number(connection.prepare(sql).run(...params).changes),
    raw: (sql) => connection.exec(sql),
    inTransaction: (body) => {
      connection.exec('BEGIN');
      try {
        const returnedValue = body();
        connection.exec('COMMIT');
        return returnedValue;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    version: () => {
      const row = connection.prepare('PRAGMA user_version').get();
      return asInt(row?.user_version);
    },
    // PRAGMA não aceita parâmetro ligado; o número nunca vem de fora — é o
    // comprimento da lista de migrações deste código
    setVersion: (value) => connection.exec(`PRAGMA user_version = ${Math.trunc(value)}`),
    close: () => connection.close(),
  };
};

export const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const asInt = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  return 0;
};
