import type { Db } from './db.ts';

// migrações por PRAGMA user_version: cada item é uma leva de SQL aplicada uma
// vez, em transação. Nunca edite uma leva antiga — acrescente uma nova
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE contas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       email TEXT UNIQUE,
       senha TEXT,
       apelido TEXT NOT NULL DEFAULT 'Jogador',
       criada_em TEXT NOT NULL,
       ultimo_acesso TEXT NOT NULL
     )`,
    `CREATE TABLE sessoes (
       token TEXT PRIMARY KEY,
       conta_id INTEGER NOT NULL REFERENCES contas(id),
       criada_em TEXT NOT NULL
     )`,
    `CREATE TABLE tentativas (
       chave TEXT PRIMARY KEY,
       erros INTEGER NOT NULL,
       liberada_em TEXT NOT NULL
     )`,
    `CREATE TABLE decks (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conta_id INTEGER NOT NULL REFERENCES contas(id),
       nome TEXT NOT NULL,
       heroi TEXT NOT NULL,
       criada_em TEXT NOT NULL
     )`,
    `CREATE TABLE deck_cartas (
       deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
       carta_id INTEGER NOT NULL,
       quantidade INTEGER NOT NULL,
       PRIMARY KEY (deck_id, carta_id)
     )`,
  ],
  [
    `CREATE TABLE partidas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       conta_a INTEGER NOT NULL REFERENCES contas(id),
       conta_b INTEGER NOT NULL REFERENCES contas(id),
       seed INTEGER NOT NULL,
       estado_json TEXT NOT NULL,
       seq INTEGER NOT NULL DEFAULT 0,
       vencedor TEXT,
       motivo TEXT,
       criada_em TEXT NOT NULL,
       atualizada_em TEXT NOT NULL
     )`,
    `CREATE TABLE partida_eventos (
       partida_id INTEGER NOT NULL REFERENCES partidas(id),
       seq INTEGER NOT NULL,
       evento_json TEXT NOT NULL,
       PRIMARY KEY (partida_id, seq)
     )`,
    `CREATE TABLE salas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       codigo TEXT UNIQUE NOT NULL,
       conta_host INTEGER NOT NULL REFERENCES contas(id),
       deck_host INTEGER NOT NULL,
       criada_em TEXT NOT NULL,
       partida_id INTEGER
     )`,
  ],
  [
    // segundo formato de jogo (decisão nº 11). Decks e partidas anteriores são
    // clássicos por definição, então o DEFAULT já os classifica corretamente.
    `ALTER TABLE decks ADD COLUMN formato TEXT NOT NULL DEFAULT 'classico'`,
    `ALTER TABLE partidas ADD COLUMN formato TEXT NOT NULL DEFAULT 'classico'`,
  ],
  [
    // esquema em inglês (decisão nº 15): tabelas, colunas e valores guardados
    // acompanham o código. Contas e decks atravessam a virada; partidas em
    // andamento, não — o `estado_json` gravado é do formato antigo do
    // `GameState` (campos em português) e não teria como ser retomado.
    `ALTER TABLE contas RENAME TO accounts`,
    `ALTER TABLE accounts RENAME COLUMN senha TO password_hash`,
    `ALTER TABLE accounts RENAME COLUMN apelido TO nickname`,
    `ALTER TABLE accounts RENAME COLUMN criada_em TO created_at`,
    `ALTER TABLE accounts RENAME COLUMN ultimo_acesso TO last_seen_at`,

    `ALTER TABLE sessoes RENAME TO sessions`,
    `ALTER TABLE sessions RENAME COLUMN conta_id TO account_id`,
    `ALTER TABLE sessions RENAME COLUMN criada_em TO created_at`,

    `ALTER TABLE tentativas RENAME TO login_attempts`,
    `ALTER TABLE login_attempts RENAME COLUMN chave TO key`,
    `ALTER TABLE login_attempts RENAME COLUMN erros TO failures`,
    `ALTER TABLE login_attempts RENAME COLUMN liberada_em TO locked_until`,

    `ALTER TABLE decks RENAME COLUMN conta_id TO account_id`,
    `ALTER TABLE decks RENAME COLUMN nome TO name`,
    `ALTER TABLE decks RENAME COLUMN heroi TO hero`,
    `ALTER TABLE decks RENAME COLUMN criada_em TO created_at`,
    `ALTER TABLE decks RENAME COLUMN formato TO format`,
    `UPDATE decks SET format = 'classic' WHERE format = 'classico'`,
    `UPDATE decks SET format = 'four-elements' WHERE format = 'quatro-elementos'`,

    `ALTER TABLE deck_cartas RENAME TO deck_cards`,
    `ALTER TABLE deck_cards RENAME COLUMN carta_id TO card_id`,
    `ALTER TABLE deck_cards RENAME COLUMN quantidade TO amount`,

    `DELETE FROM partida_eventos`,
    `DELETE FROM partidas`,
    `UPDATE salas SET partida_id = NULL`,

    `ALTER TABLE partidas RENAME TO matches`,
    `ALTER TABLE matches RENAME COLUMN conta_a TO account_a`,
    `ALTER TABLE matches RENAME COLUMN conta_b TO account_b`,
    `ALTER TABLE matches RENAME COLUMN estado_json TO state_json`,
    `ALTER TABLE matches RENAME COLUMN vencedor TO winner`,
    `ALTER TABLE matches RENAME COLUMN motivo TO reason`,
    `ALTER TABLE matches RENAME COLUMN criada_em TO created_at`,
    `ALTER TABLE matches RENAME COLUMN atualizada_em TO updated_at`,
    `ALTER TABLE matches RENAME COLUMN formato TO format`,

    `ALTER TABLE partida_eventos RENAME TO match_events`,
    `ALTER TABLE match_events RENAME COLUMN partida_id TO match_id`,
    `ALTER TABLE match_events RENAME COLUMN evento_json TO event_json`,

    `ALTER TABLE salas RENAME TO rooms`,
    `ALTER TABLE rooms RENAME COLUMN codigo TO code`,
    `ALTER TABLE rooms RENAME COLUMN conta_host TO host_account`,
    `ALTER TABLE rooms RENAME COLUMN deck_host TO host_deck`,
    `ALTER TABLE rooms RENAME COLUMN criada_em TO created_at`,
    `ALTER TABLE rooms RENAME COLUMN partida_id TO match_id`,
  ],
];

export const applyMigrations = (db: Db): void => {
  const current = db.version();
  for (let index = current; index < MIGRATIONS.length; index += 1) {
    db.inTransaction(() => {
      for (const sql of MIGRATIONS[index]!) db.raw(sql);
      db.setVersion(index + 1);
    });
  }
};
