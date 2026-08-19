/**
 * Exercita o protocolo de ponta a ponta: sobe o servidor numa porta efêmera
 * com banco descartável e percorre contas → sessões → decks. Uso: `npm run api`.
 * Falha (exit 1) na primeira asserção quebrada.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../server/app.ts';

const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ezone-api-'));
const { server, db } = buildServer(path.join(tempFolder, 'teste.db'), null);

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = server.address();
if (typeof url !== 'object' || !url) throw new Error('sem porta');
const base = `http://127.0.0.1:${url.port}`;

interface Chamada {
  status: number;
  body: Record<string, unknown>;
}

async function chamar(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<Chamada> {
  const reply = await fetch(base + path, {
    method: method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: reply.status, body: (await reply.json()) as Record<string, unknown> };
}

// ── contas ───────────────────────────────────────────────────────────────────

const guest = await chamar('POST', '/api/guest', { nickname: 'Visitante' });
assert.equal(guest.status, 201);
const guestToken = guest.body.token as string;
assert.ok(guestToken);
assert.equal(guest.body.guest, true);

const semToken = await chamar('GET', '/api/account');
assert.equal(semToken.status, 401);

const minhaConta = await chamar('GET', '/api/account', undefined, guestToken);
assert.equal(minhaConta.status, 200);
assert.equal(minhaConta.body.nickname, 'Visitante');

const log = await chamar('POST', '/api/accounts', {
  email: 'lukkas@ezone.gg',
  password: 'senha-forte-123',
  nickname: 'Lukkas',
});
assert.equal(log.status, 201);
const tokenLukkas = log.body.token as string;

const duplicada = await chamar('POST', '/api/accounts', {
  email: 'lukkas@ezone.gg',
  password: 'outra-senha-456',
});
assert.equal(duplicada.status, 409);

const senhaErrada = await chamar('POST', '/api/sessions', {
  email: 'lukkas@ezone.gg',
  password: 'senha-errada-000',
});
assert.equal(senhaErrada.status, 401);

const login = await chamar('POST', '/api/sessions', {
  email: 'lukkas@ezone.gg',
  password: 'senha-forte-123',
});
assert.equal(login.status, 200);
assert.ok(login.body.token);

const promovida = await chamar(
  'POST',
  '/api/account/email',
  { email: 'visitante@ezone.gg', password: 'senha-do-visitante-1' },
  guestToken,
);
assert.equal(promovida.status, 200);
assert.equal(promovida.body.guest, false);

// ── decks ────────────────────────────────────────────────────────────────────

const validDeck = {
  name: 'Matilha',
  hero: 'badur',
  cards: { 28: 3, 29: 3, 30: 3, 31: 2, 36: 3, 37: 3, 38: 3, 43: 3, 44: 3 },
};

const created = await chamar('POST', '/api/decks', validDeck, tokenLukkas);
assert.equal(created.status, 201);
const deckId = created.body.id as number;

const listagem = await chamar('GET', '/api/decks', undefined, tokenLukkas);
assert.equal(listagem.status, 200);
const decks = listagem.body.decks as Record<string, unknown>[];
assert.equal(decks.length, 1);
assert.deepEqual((decks[0] as { cards: unknown }).cards, validDeck.cards);

const invalido = await chamar(
  'POST',
  '/api/decks',
  { name: 'Ruim', hero: 'zeus', cards: { 28: 9 } },
  tokenLukkas,
);
assert.equal(invalido.status, 422);

const editado = await chamar(
  'PUT',
  `/api/decks/${deckId}`,
  { ...validDeck, name: 'Matilha v2' },
  tokenLukkas,
);
assert.equal(editado.status, 200);
assert.equal(editado.body.name, 'Matilha v2');

const deOutro = await chamar('PUT', `/api/decks/${deckId}`, validDeck, guestToken);
assert.equal(deOutro.status, 404);

const apagado = await chamar('DELETE', `/api/decks/${deckId}`, undefined, tokenLukkas);
assert.equal(apagado.status, 200);

const vazia = await chamar('GET', '/api/decks', undefined, tokenLukkas);
assert.equal((vazia.body.decks as unknown[]).length, 0);

// ── partidas online (sala com código) ────────────────────────────────────────

const deckA = await chamar('POST', '/api/decks', validDeck, tokenLukkas);
const deckB = await chamar('POST', '/api/decks', { ...validDeck, name: 'Do visitante' }, guestToken);
const deckIdA = deckA.body.id as number;
const deckIdB = deckB.body.id as number;

const room = await chamar('POST', '/api/rooms', { deckId: deckIdA }, tokenLukkas);
assert.equal(room.status, 201);
const code = room.body.code as string;
assert.match(code, /^EZ-/);

const entrada = await chamar('POST', '/api/rooms/join', { code, deckId: deckIdB }, guestToken);
assert.equal(entrada.status, 201);
const matchId = entrada.body.matchId as number;

const atualDoHost = await chamar('GET', '/api/matches/current', undefined, tokenLukkas);
assert.equal(atualDoHost.body.matchId, matchId);

// a visão nunca carrega a mão do oponente
const fotoA = await chamar('GET', `/api/matches/${matchId}`, undefined, tokenLukkas);
assert.equal(fotoA.status, 200);
const visaoA = fotoA.body.view as Record<string, unknown>;
const me = visaoA.me as Record<string, unknown>;
const opponent = visaoA.opponent as Record<string, unknown>;
assert.equal(visaoA.phase, 'mulligan');
assert.equal((me.hand as unknown[]).length, 5);
assert.equal(opponent.handCount, 5);
assert.equal('mao' in opponent, false);

// o lado do comando é do jogador autenticado, mesmo que o corpo minta
const mulliganA = await chamar(
  'POST',
  `/api/matches/${matchId}/commands`,
  { command: { type: 'DECIDE_MULLIGAN', side: 'b', swap: false } },
  tokenLukkas,
);
assert.equal(mulliganA.status, 200);
const mulliganB = await chamar(
  'POST',
  `/api/matches/${matchId}/commands`,
  { command: { type: 'DECIDE_MULLIGAN', side: 'a', swap: true } },
  guestToken,
);
assert.equal(mulliganB.status, 200);
const visaoDepois = (mulliganB.body.view as Record<string, unknown>) ?? {};
assert.equal(visaoDepois.phase, 'main');

// comando fora da vez é recusado
const visaoAtual = (await chamar('GET', `/api/matches/${matchId}`, undefined, tokenLukkas))
  .body.view as Record<string, unknown>;
const souAtivo = visaoAtual.activeSide === visaoAtual.side;
const foraDaVez = await chamar(
  'POST',
  `/api/matches/${matchId}/commands`,
  { command: { type: 'END_TURN', side: 'a' } },
  souAtivo ? guestToken : tokenLukkas,
);
assert.equal(foraDaVez.status, 422);

// SSE reentrega o histórico redigido por destinatário
const streaming = await fetch(
  `${base}/api/matches/${matchId}/events?desde=0&token=${tokenLukkas}`,
  { headers: { accept: 'text/event-stream' } },
);
assert.equal(streaming.status, 200);
const leitor = streaming.body!.getReader();
let recebido = '';
while (!recebido.includes('MULLIGAN_DECIDED')) {
  const { value, done } = await leitor.read();
  if (done) break;
  recebido += Buffer.from(value).toString('utf8');
}
await leitor.cancel();
assert.ok(recebido.includes('MATCH_STARTED'));
// compra do oponente chega sem a carta; a minha, com
const eventosRecebidos = recebido
  .split('\n')
  .filter((row) => row.startsWith('data: '))
  .map((row) => JSON.parse(row.slice(6)) as { type: string; side?: string; card?: unknown });
const comprasDoOponente = eventosRecebidos.filter(
  (event) => event.type === 'CARD_DRAWN' && event.side === 'b',
);
assert.ok(comprasDoOponente.length >= 5);
assert.ok(comprasDoOponente.every((event) => event.card === undefined));
const minhasCompras = eventosRecebidos.filter(
  (event) => event.type === 'CARD_DRAWN' && event.side === 'a',
);
assert.ok(minhasCompras.every((event) => event.card !== undefined));

// conceder encerra e libera as contas
const concedida = await chamar(
  'POST',
  `/api/matches/${matchId}/commands`,
  { command: { type: 'CONCEDE', side: 'a' } },
  tokenLukkas,
);
assert.equal(concedida.status, 200);
const semPartida = await chamar('GET', '/api/matches/current', undefined, tokenLukkas);
assert.equal(semPartida.body.matchId, null);

// ── fila de matchmaking ──────────────────────────────────────────────────────

const filaA = await chamar('POST', '/api/queue', { deckId: deckIdA }, tokenLukkas);
assert.equal(filaA.status, 200);
assert.equal(filaA.body.waiting, true);
const filaB = await chamar('POST', '/api/queue', { deckId: deckIdB }, guestToken);
assert.equal(filaB.status, 201);
const matchFromQueue = filaB.body.matchId as number;
assert.ok(matchFromQueue > matchId);
await chamar(
  'POST',
  `/api/matches/${matchFromQueue}/commands`,
  { command: { type: 'CONCEDE', side: 'a' } },
  guestToken,
);

// ── encerramento ─────────────────────────────────────────────────────────────

server.close();
db.close();
fs.rmSync(tempFolder, { recursive: true, force: true });
console.log('api ok — contas, sessões e decks se comportam');
