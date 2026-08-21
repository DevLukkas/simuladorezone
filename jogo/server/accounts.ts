import crypto from 'node:crypto';
import { asInt, text } from './db.ts';
import { created, ok, rejected } from './http.ts';
import { noteFailure, lockoutSeconds, clearFailures } from './loginAttempts.ts';
import { fuse } from './rateLimit.ts';
import type { Db } from './db.ts';
import type { ApiRequest, ApiReply, Route } from './http.ts';

export type Account = {
  id: number;
  /** null = conta convidada (joga inteira; promover preenche a mesma linha) */
  email: string | null;
  nickname: string;
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_EMAIL_LENGTH = 160;
const MAX_NICKNAME_LENGTH = 24;

/**
 * Fusíveis de CRIAÇÃO de conta, por origem.
 *
 * Conta nasce sem ninguém autenticado na frente, então a única chave possível é
 * o endereço de quem pediu — e atrás de proxy ele é o do proxy, o que faz o teto
 * valer para todo mundo junto (ver `rateLimit.ts`). Daí os números folgados: 30
 * contas convidadas por 10 minutos são mais jogadores novos do que este projeto
 * vê num dia, e ainda assim param um script no trigésimo pedido em vez de no
 * milésimo.
 *
 * O cadastro com e-mail é mais apertado porque cada tentativa custa um scrypt —
 * dezenas de ms de CPU num servidor de uma thread só.
 */
const guestFuse = fuse(30, 10 * 60);
const signupFuse = fuse(20, 10 * 60);

// scrypt do node:crypto (padrão jogo-gacha): N=16384 leva dezenas de ms por
// tentativa — o rate limit de tentativas.ts faz o resto
const PASSWORD_COST = 16384;
const PASSWORD_BYTES = 64;

const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, PASSWORD_BYTES, { N: PASSWORD_COST });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
};

const passwordMatches = (password: string, stored: string): boolean => {
  const [algorithm, salt, expectedHash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHash) return false;

  const target = Buffer.from(expectedHash, 'hex');
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), target.length, {
    N: PASSWORD_COST,
  });

  return crypto.timingSafeEqual(derived, target);
};

// o token viaja em claro e é guardado em hash: quem ler o banco não sai
// logando com o que leu
const tokenFingerprint = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Apelido de quem entra como convidado: `Summoner-A3F91C`.
 *
 * Antes toda conta convidada nascia chamada "Convidado" — na barra isso saía como
 * "CONVIDADO · CONVIDADO" (o apelido e o selo de convidado repetidos), e numa sala
 * com dois convidados nenhum dos dois sabia quem era quem. O sufixo em hexa é o que
 * separa um do outro; não é chave de nada (apelido nunca foi único no banco), então
 * 16,7 milhões de combinações bastam para a colisão ser irrelevante.
 *
 * O nome fica em inglês de propósito: é identidade da pessoa, não rótulo de tela —
 * quem trocar de idioma continua sendo o mesmo Summoner. O selo ao lado dele, esse
 * sim, é traduzido (`shell.guest`).
 */
const guestNickname = (): string => `Summoner-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const isValidEmail = (value: string): boolean => {
  if (value.length < 3 || value.length > MAX_EMAIL_LENGTH) return false;
  const parts = value.split('@');
  return parts.length === 2 && (parts[0]?.length ?? 0) > 0 && (parts[1]?.includes('.') ?? false);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Credentials = { email: string; password: string; nickname: string | null };

const credentials = (body: unknown): Credentials | null => {
  if (!isObject(body)) return null;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;

  const email = body.email.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  if (body.password.length < MIN_PASSWORD_LENGTH) return null;
  if (body.password.length > MAX_PASSWORD_LENGTH) return null;

  const nickname =
    typeof body.nickname === 'string' && body.nickname.trim().length > 0
      ? body.nickname.trim().slice(0, MAX_NICKNAME_LENGTH)
      : null;

  return { email, password: body.password, nickname };
};

/**
 * Quantos dias PARADA uma sessão continua valendo.
 *
 * Ocioso, e não absoluto: cada dia de uso empurra o prazo, então quem joga nunca
 * é deslogado. O prazo é largo porque numa conta convidada o token é a única
 * credencial que existe — não há e-mail nem senha para voltar —, e encurtar isto
 * não tranca a porta de ninguém, só apaga o baralho de quem viajou. O que ele
 * fecha é a outra ponta: token copiado de um log ou de um navegador emprestado
 * deixa de valer para sempre.
 */
const SESSION_IDLE_DAYS = 90;

const openSession = (db: Db, accountId: number): string => {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO sessions (token, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?)',
    tokenFingerprint(token),
    accountId,
    now,
    now,
  );
  return token;
};

const createAccount = (
  db: Db,
  email: string | null,
  password: string | null,
  nickname: string,
): number => {
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO accounts (email, password_hash, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    email,
    password,
    nickname,
    now,
    now,
  );
  return asInt(db.one('SELECT last_insert_rowid() AS id')?.id);
};

const onDay = (timestamp: string): string => timestamp.slice(0, 10);

// grava o último acesso quando o DIA muda, não a cada pedido
const noteAccess = (db: Db, accountId: number, storedAt: string): void => {
  const now = new Date().toISOString();
  if (onDay(storedAt) === onDay(now)) return;
  db.run('UPDATE accounts SET last_seen_at = ? WHERE id = ?', now, accountId);
};

/**
 * A sessão passou do prazo de ociosidade?
 *
 * Data ilegível conta como vencida: linha que não sabe dizer quando foi usada
 * não pode servir de credencial. As de antes da coluna existir vêm com a data de
 * criação copiada pela migração, então elas envelhecem a partir dali.
 */
const sessionExpired = (usedAt: string, now: number): boolean => {
  const last = Date.parse(usedAt);
  if (!Number.isFinite(last)) return true;
  return now - last > SESSION_IDLE_DAYS * 24 * 3_600_000;
};

export const accountOfRequest = (db: Db, request: ApiRequest): Account | null => {
  const header = request.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;

  const fingerprint = tokenFingerprint(header.slice(7));
  const row = db.one(
    `SELECT accounts.id AS id, accounts.email AS email, accounts.nickname AS nickname,
            accounts.last_seen_at AS last_seen_at, sessions.last_used_at AS last_used_at
       FROM sessions JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token = ?`,
    fingerprint,
  );

  if (!row) return null;

  const usedAt = text(row.last_used_at);
  if (sessionExpired(usedAt, Date.now())) {
    // a linha vencida sai do banco no ato: deixá-la ali só daria a mesma recusa
    // mais caro, todo pedido, para sempre
    db.run('DELETE FROM sessions WHERE token = ?', fingerprint);
    return null;
  }

  const id = asInt(row.id);
  noteAccess(db, id, text(row.last_seen_at));
  // mesma regra do acesso da conta: empurra o prazo quando o DIA muda, e não a
  // cada pedido — senão cada quadro de uma partida viraria uma escrita
  const today = new Date().toISOString();
  if (onDay(usedAt) !== onDay(today)) {
    db.run('UPDATE sessions SET last_used_at = ? WHERE token = ?', today, fingerprint);
  }

  return {
    id,
    email: typeof row.email === 'string' ? row.email : null,
    nickname: text(row.nickname) || 'Jogador',
  };
};

export const withAccount = (
  db: Db,
  handle: (request: ApiRequest, account: Account) => Promise<ApiReply> | ApiReply,
): ((request: ApiRequest) => Promise<ApiReply> | ApiReply) => {
  return (request) => {
    const account = accountOfRequest(db, request);
    if (!account) return rejected(401, 'account_required');
    return handle(request, account);
  };
};

const summary = (account: Account): Record<string, unknown> => ({
  nickname: account.nickname,
  email: account.email,
  guest: account.email === null,
});

export const accountRoutes = (db: Db): Route[] => [
  {
    // a porta do jogo: quem chega ganha conta na hora, sem cadastro
    method: 'POST',
    pattern: '/api/guest',
    handle: (request) => {
      const wait = guestFuse(request.origin);
      if (wait > 0) return rejected(429, 'too_many_attempts', { seconds: wait });

      const body = isObject(request.body) ? request.body : {};
      const nickname =
        typeof body.nickname === 'string' && body.nickname.trim()
          ? body.nickname.trim().slice(0, MAX_NICKNAME_LENGTH)
          : guestNickname();
      const id = createAccount(db, null, null, nickname);
      return created({ token: openSession(db, id), nickname, email: null, guest: true });
    },
  },
  {
    method: 'POST',
    pattern: '/api/accounts',
    handle: (request) => {
      const wait = signupFuse(request.origin);
      if (wait > 0) return rejected(429, 'too_many_attempts', { seconds: wait });

      const data = credentials(request.body);
      if (!data) {
        return rejected(400, 'bad_credentials_format', { min: MIN_PASSWORD_LENGTH });
      }

      const exists = db.one('SELECT id FROM accounts WHERE email = ?', data.email);
      if (exists) return rejected(409, 'email_taken');

      const nickname = data.nickname ?? data.email.split('@')[0]!.slice(0, MAX_NICKNAME_LENGTH);
      const id = createAccount(db, data.email, hashPassword(data.password), nickname);
      return created({ token: openSession(db, id), nickname, email: data.email, guest: false });
    },
  },
  {
    // promover convidada: preenche e-mail e senha na linha que já existe —
    // nada de progresso é copiado, então nada pode ser copiado duas vezes
    method: 'POST',
    pattern: '/api/account/email',
    handle: withAccount(db, (request, account) => {
      if (account.email !== null) return rejected(409, 'account_has_email');

      const data = credentials(request.body);
      if (!data) {
        return rejected(400, 'bad_credentials_format', { min: MIN_PASSWORD_LENGTH });
      }

      const exists = db.one(
        'SELECT id FROM accounts WHERE email = ? AND id <> ?',
        data.email,
        account.id,
      );
      if (exists) return rejected(409, 'email_taken');

      db.run(
        'UPDATE accounts SET email = ?, password_hash = ? WHERE id = ?',
        data.email,
        hashPassword(data.password),
        account.id,
      );
      return ok({ nickname: account.nickname, email: data.email, guest: false });
    }),
  },
  {
    method: 'POST',
    pattern: '/api/sessions',
    handle: (request) => {
      const data = credentials(request.body);
      // recusa idêntica para e-mail inexistente e senha errada — distinguir
      // as duas entregaria a lista de quem tem conta
      const deny = (): ApiReply => rejected(401, 'bad_credentials');

      const fromBody = isObject(request.body) ? request.body : {};
      const attempted = data?.email ?? (typeof fromBody.email === 'string' ? fromBody.email : '');
      const wait = lockoutSeconds(db, attempted.trim().toLowerCase(), request.origin);
      if (wait > 0) {
        return rejected(429, 'too_many_attempts', { seconds: wait });
      }

      if (!data) return deny();

      const row = db.one('SELECT id, password_hash, nickname FROM accounts WHERE email = ?', data.email);
      if (!row || !passwordMatches(data.password, text(row.password_hash))) {
        noteFailure(db, data.email, request.origin);
        return deny();
      }

      clearFailures(db, data.email, request.origin);
      return ok({
        token: openSession(db, asInt(row.id)),
        nickname: text(row.nickname) || 'Jogador',
        email: data.email,
        guest: false,
      });
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/sessions',
    handle: (request) => {
      const header = request.authorization ?? '';
      if (header.startsWith('Bearer ')) {
        db.run('DELETE FROM sessions WHERE token = ?', tokenFingerprint(header.slice(7)));
      }
      return ok({ ended: true });
    },
  },
  {
    method: 'GET',
    pattern: '/api/account',
    handle: withAccount(db, (_pedido, account) => ok(summary(account))),
  },
];
