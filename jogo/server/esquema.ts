import type { Banco } from './banco.ts';

// migrações por PRAGMA user_version: cada item é uma leva de SQL aplicada uma
// vez, em transação. Nunca edite uma leva antiga — acrescente uma nova
const MIGRACOES: string[][] = [
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
];

export const aplicarMigracoes = (banco: Banco): void => {
  const atual = banco.versao();
  for (let indice = atual; indice < MIGRACOES.length; indice += 1) {
    banco.emTransacao(() => {
      for (const sql of MIGRACOES[indice]!) banco.cru(sql);
      banco.definirVersao(indice + 1);
    });
  }
};
