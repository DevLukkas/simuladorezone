/**
 * Exercita o protocolo de ponta a ponta: sobe o servidor numa porta efêmera
 * com banco descartável e percorre contas → sessões → decks. Uso: `npm run api`.
 * Falha (exit 1) na primeira asserção quebrada.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { montar } from '../server/servidor.ts';

const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'ezone-api-'));
const { servidor, banco } = montar(path.join(pastaTemporaria, 'teste.db'), null);

await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
const endereco = servidor.address();
if (typeof endereco !== 'object' || !endereco) throw new Error('sem porta');
const base = `http://127.0.0.1:${endereco.port}`;

interface Chamada {
  status: number;
  corpo: Record<string, unknown>;
}

async function chamar(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  token?: string,
): Promise<Chamada> {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

// ── contas ───────────────────────────────────────────────────────────────────

const convidada = await chamar('POST', '/api/convidada', { apelido: 'Visitante' });
assert.equal(convidada.status, 201);
const tokenConvidada = convidada.corpo.token as string;
assert.ok(tokenConvidada);
assert.equal(convidada.corpo.convidada, true);

const semToken = await chamar('GET', '/api/conta');
assert.equal(semToken.status, 401);

const minhaConta = await chamar('GET', '/api/conta', undefined, tokenConvidada);
assert.equal(minhaConta.status, 200);
assert.equal(minhaConta.corpo.apelido, 'Visitante');

const registro = await chamar('POST', '/api/contas', {
  email: 'lukkas@ezone.gg',
  senha: 'senha-forte-123',
  apelido: 'Lukkas',
});
assert.equal(registro.status, 201);
const tokenLukkas = registro.corpo.token as string;

const duplicada = await chamar('POST', '/api/contas', {
  email: 'lukkas@ezone.gg',
  senha: 'outra-senha-456',
});
assert.equal(duplicada.status, 409);

const senhaErrada = await chamar('POST', '/api/sessoes', {
  email: 'lukkas@ezone.gg',
  senha: 'senha-errada-000',
});
assert.equal(senhaErrada.status, 401);

const login = await chamar('POST', '/api/sessoes', {
  email: 'lukkas@ezone.gg',
  senha: 'senha-forte-123',
});
assert.equal(login.status, 200);
assert.ok(login.corpo.token);

const promovida = await chamar(
  'POST',
  '/api/conta/email',
  { email: 'visitante@ezone.gg', senha: 'senha-do-visitante-1' },
  tokenConvidada,
);
assert.equal(promovida.status, 200);
assert.equal(promovida.corpo.convidada, false);

// ── decks ────────────────────────────────────────────────────────────────────

const deckValido = {
  nome: 'Matilha',
  heroi: 'badur',
  cartas: { 28: 3, 29: 3, 30: 3, 31: 2, 36: 3, 37: 3, 38: 3, 43: 3, 44: 3 },
};

const criado = await chamar('POST', '/api/decks', deckValido, tokenLukkas);
assert.equal(criado.status, 201);
const deckId = criado.corpo.id as number;

const listagem = await chamar('GET', '/api/decks', undefined, tokenLukkas);
assert.equal(listagem.status, 200);
const decks = listagem.corpo.decks as Record<string, unknown>[];
assert.equal(decks.length, 1);
assert.deepEqual((decks[0] as { cartas: unknown }).cartas, deckValido.cartas);

const invalido = await chamar(
  'POST',
  '/api/decks',
  { nome: 'Ruim', heroi: 'zeus', cartas: { 28: 9 } },
  tokenLukkas,
);
assert.equal(invalido.status, 422);

const editado = await chamar(
  'PUT',
  `/api/decks/${deckId}`,
  { ...deckValido, nome: 'Matilha v2' },
  tokenLukkas,
);
assert.equal(editado.status, 200);
assert.equal(editado.corpo.nome, 'Matilha v2');

const deOutro = await chamar('PUT', `/api/decks/${deckId}`, deckValido, tokenConvidada);
assert.equal(deOutro.status, 404);

const apagado = await chamar('DELETE', `/api/decks/${deckId}`, undefined, tokenLukkas);
assert.equal(apagado.status, 200);

const vazia = await chamar('GET', '/api/decks', undefined, tokenLukkas);
assert.equal((vazia.corpo.decks as unknown[]).length, 0);

// ── partidas online (sala com código) ────────────────────────────────────────

const deckA = await chamar('POST', '/api/decks', deckValido, tokenLukkas);
const deckB = await chamar('POST', '/api/decks', { ...deckValido, nome: 'Do visitante' }, tokenConvidada);
const deckIdA = deckA.corpo.id as number;
const deckIdB = deckB.corpo.id as number;

const sala = await chamar('POST', '/api/salas', { deckId: deckIdA }, tokenLukkas);
assert.equal(sala.status, 201);
const codigo = sala.corpo.codigo as string;
assert.match(codigo, /^EZ-/);

const entrada = await chamar('POST', '/api/salas/entrada', { codigo, deckId: deckIdB }, tokenConvidada);
assert.equal(entrada.status, 201);
const partidaId = entrada.corpo.partidaId as number;

const atualDoHost = await chamar('GET', '/api/partidas/atual', undefined, tokenLukkas);
assert.equal(atualDoHost.corpo.partidaId, partidaId);

// a visão nunca carrega a mão do oponente
const fotoA = await chamar('GET', `/api/partidas/${partidaId}`, undefined, tokenLukkas);
assert.equal(fotoA.status, 200);
const visaoA = fotoA.corpo.visao as Record<string, unknown>;
const eu = visaoA.eu as Record<string, unknown>;
const oponente = visaoA.oponente as Record<string, unknown>;
assert.equal(visaoA.fase, 'mulligan');
assert.equal((eu.mao as unknown[]).length, 5);
assert.equal(oponente.maoQuantidade, 5);
assert.equal('mao' in oponente, false);

// o lado do comando é do jogador autenticado, mesmo que o corpo minta
const mulliganA = await chamar(
  'POST',
  `/api/partidas/${partidaId}/comandos`,
  { comando: { tipo: 'DECIDIR_MULLIGAN', lado: 'b', trocar: false } },
  tokenLukkas,
);
assert.equal(mulliganA.status, 200);
const mulliganB = await chamar(
  'POST',
  `/api/partidas/${partidaId}/comandos`,
  { comando: { tipo: 'DECIDIR_MULLIGAN', lado: 'a', trocar: true } },
  tokenConvidada,
);
assert.equal(mulliganB.status, 200);
const visaoDepois = (mulliganB.corpo.visao as Record<string, unknown>) ?? {};
assert.equal(visaoDepois.fase, 'principal');

// comando fora da vez é recusado
const visaoAtual = (await chamar('GET', `/api/partidas/${partidaId}`, undefined, tokenLukkas))
  .corpo.visao as Record<string, unknown>;
const souAtivo = visaoAtual.ladoAtivo === visaoAtual.lado;
const foraDaVez = await chamar(
  'POST',
  `/api/partidas/${partidaId}/comandos`,
  { comando: { tipo: 'ENCERRAR_TURNO', lado: 'a' } },
  souAtivo ? tokenConvidada : tokenLukkas,
);
assert.equal(foraDaVez.status, 422);

// SSE reentrega o histórico redigido por destinatário
const streaming = await fetch(
  `${base}/api/partidas/${partidaId}/eventos?desde=0&token=${tokenLukkas}`,
  { headers: { accept: 'text/event-stream' } },
);
assert.equal(streaming.status, 200);
const leitor = streaming.body!.getReader();
let recebido = '';
while (!recebido.includes('MULLIGAN_DECIDIDO')) {
  const { value, done } = await leitor.read();
  if (done) break;
  recebido += Buffer.from(value).toString('utf8');
}
await leitor.cancel();
assert.ok(recebido.includes('PARTIDA_INICIADA'));
// compra do oponente chega sem a carta; a minha, com
const eventosRecebidos = recebido
  .split('\n')
  .filter((linha) => linha.startsWith('data: '))
  .map((linha) => JSON.parse(linha.slice(6)) as { tipo: string; lado?: string; carta?: unknown });
const comprasDoOponente = eventosRecebidos.filter(
  (evento) => evento.tipo === 'CARTA_COMPRADA' && evento.lado === 'b',
);
assert.ok(comprasDoOponente.length >= 5);
assert.ok(comprasDoOponente.every((evento) => evento.carta === undefined));
const minhasCompras = eventosRecebidos.filter(
  (evento) => evento.tipo === 'CARTA_COMPRADA' && evento.lado === 'a',
);
assert.ok(minhasCompras.every((evento) => evento.carta !== undefined));

// conceder encerra e libera as contas
const concedida = await chamar(
  'POST',
  `/api/partidas/${partidaId}/comandos`,
  { comando: { tipo: 'CONCEDER', lado: 'a' } },
  tokenLukkas,
);
assert.equal(concedida.status, 200);
const semPartida = await chamar('GET', '/api/partidas/atual', undefined, tokenLukkas);
assert.equal(semPartida.corpo.partidaId, null);

// ── fila de matchmaking ──────────────────────────────────────────────────────

const filaA = await chamar('POST', '/api/fila', { deckId: deckIdA }, tokenLukkas);
assert.equal(filaA.status, 200);
assert.equal(filaA.corpo.aguardando, true);
const filaB = await chamar('POST', '/api/fila', { deckId: deckIdB }, tokenConvidada);
assert.equal(filaB.status, 201);
const partidaDaFila = filaB.corpo.partidaId as number;
assert.ok(partidaDaFila > partidaId);
await chamar(
  'POST',
  `/api/partidas/${partidaDaFila}/comandos`,
  { comando: { tipo: 'CONCEDER', lado: 'a' } },
  tokenConvidada,
);

// ── encerramento ─────────────────────────────────────────────────────────────

servidor.close();
banco.fechar();
fs.rmSync(pastaTemporaria, { recursive: true, force: true });
console.log('api ok — contas, sessões e decks se comportam');
