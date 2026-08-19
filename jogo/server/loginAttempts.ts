import { asInt, text } from './db.ts';
import type { Db } from './db.ts';

// abaixo disso ninguém espera nada: errar a senha três vezes é uma tarde ruim, e
// não um ataque
export const FAILURES_BEFORE_LOCKOUT = 5;
export const INITIAL_LOCKOUT_SECONDS = 5;
export const MAX_LOCKOUT_SECONDS = 15 * 60;

// duas chaves, e não uma. Só por e-mail, varrer mil endereços com a senha
// `123456` nunca esbarra no limite, porque cada e-mail erra uma vez; só por
// origem, quem tem muitos endereços de saída passa igual. As duas juntas não
// fecham o problema — nada fecha, sem HTTPS na frente —, e o que elas compram é
// o preço: espera que dobra torna a varredura cara em vez de gratuita
const keys = (email: string, origin: string): string[] => [
  `email:${email}`,
  `origem:${origin}`,
];

const waitOf = (failures: number): number => {
  if (failures <= FAILURES_BEFORE_LOCKOUT) return 0;
  const doublings = failures - FAILURES_BEFORE_LOCKOUT - 1;
  return Math.min(MAX_LOCKOUT_SECONDS, INITIAL_LOCKOUT_SECONDS * 2 ** doublings);
};

const secondsLeft = (db: Db, key: string, now: Date): number => {
  const row = db.one('SELECT locked_until FROM login_attempts WHERE key = ?', key);
  if (!row) return 0;

  const unlockedAt = Date.parse(text(row.locked_until));
  if (!Number.isFinite(unlockedAt)) return 0;

  return Math.max(0, Math.ceil((unlockedAt - now.getTime()) / 1000));
};

export const lockoutSeconds = (
  db: Db,
  email: string,
  origin: string,
  now = new Date(),
): number =>
  Math.max(...keys(email, origin).map((key) => secondsLeft(db, key, now)), 0);

export const noteFailure = (
  db: Db,
  email: string,
  origin: string,
  now = new Date(),
): void => {
  for (const key of keys(email, origin)) {
    const row = db.one('SELECT failures FROM login_attempts WHERE key = ?', key);
    const failures = asInt(row?.failures) + 1;

    db.run(
      `INSERT INTO login_attempts (key, failures, locked_until) VALUES (?, ?, ?)
         ON CONFLICT (key)
         DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`,
      key,
      failures,
      new Date(now.getTime() + waitOf(failures) * 1000).toISOString(),
    );
  }
};

// acertar zera as duas chaves. A de origem também, porque quem acertou dali é
// gente e não varredura — e deixá-la contando puniria a casa inteira pelo
// primeiro que errou a senha algumas vezes
export const clearFailures = (db: Db, email: string, origin: string): void => {
  for (const key of keys(email, origin)) {
    db.run('DELETE FROM login_attempts WHERE key = ?', key);
  }
};
