import http from 'node:http';
import { errorText, type ErrorCode } from '../src/shared/errors.ts';
import type { TextRef } from '../src/shared/text.ts';
import https from 'node:https';

// Roteador mínimo sobre node:http (padrão jogo-gacha). Rotas JSON devolvem
// `Resposta`; rotas `bruta` (SSE) recebem a resposta crua e cuidam dela.

export type ApiRequest = {
  method: string;
  path: string;
  params: Record<string, string>;
  search: URLSearchParams;
  body: unknown;
  authorization: string | null;
  /** cabeçalhos crus, para quem precisa de um que não seja o de autorização */
  headers: http.IncomingHttpHeaders;
  // endereço de quem pediu, usado só pelo contador de tentativas de login.
  // Atrás de proxy é o do proxy — confiar em x-forwarded-for sem conhecer o
  // proxy deixaria quem varre escolher a própria chave
  origin: string;
};

export type ApiReply = {
  status: number;
  body: unknown;
};

export type Route =
  | {
      method: string;
      pattern: string;
      handle: (request: ApiRequest) => Promise<ApiReply> | ApiReply;
      /** teto do corpo desta rota; sem isto vale `MAX_BODY_BYTES` */
      maxBody?: number;
      raw?: undefined;
    }
  | {
      method: string;
      pattern: string;
      handle?: undefined;
      maxBody?: undefined;
      raw: (request: ApiRequest, reply: http.ServerResponse) => Promise<void> | void;
    };

export const ok = (body: unknown): ApiReply => ({ status: 200, body });

export const created = (body: unknown): ApiReply => ({ status: 201, body });

/**
 * Recusa com texto adiado: o corpo leva a CHAVE do erro (e os parâmetros), não a
 * frase — quem escolhe o idioma é o cliente. `details` carrega a lista de
 * problemas quando há mais de um (validação de deck).
 */
export const rejected = (
  status: number,
  code: ErrorCode,
  params?: Record<string, string | number>,
  details?: TextRef[],
): ApiReply => ({
  status,
  body: details?.length ? { error: errorText(code, params), details } : { error: errorText(code, params) },
});

const MAX_BODY_BYTES = 256 * 1024;

const readBody = async (req: http.IncomingMessage, limit: number): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const block = chunk as Buffer;
    size += block.length;
    if (size > limit) throw new Error('body_too_large');
    chunks.push(block);
  }

  if (chunks.length === 0) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('body_not_json');
  }
};

const matchPattern = (pattern: string, path: string): Record<string, string> | null => {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index] ?? '';
    const gotPart = pathParts[index] ?? '';
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(gotPart);
      continue;
    }
    if (expected !== gotPart) return null;
  }

  return params;
};

const sendJson = (reply: http.ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body ?? null);
  reply.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  reply.end(text);
};

export type StaticHandler = (path: string, reply: http.ServerResponse) => Promise<boolean>;

export type Tls = { cert: string | Buffer; key: string | Buffer };

export const createHttpServer = (
  routes: Route[],
  serveStatic: StaticHandler | null,
  tls: Tls | null = null,
): http.Server => {
  const handleRequest = makeRequestHandler(routes, serveStatic);
  return tls
    ? (https.createServer(tls, handleRequest) as unknown as http.Server)
    : http.createServer(handleRequest);
};

type RequestHandler = (req: http.IncomingMessage, reply: http.ServerResponse) => void;

const makeRequestHandler =
  (routes: Route[], serveStatic: StaticHandler | null): RequestHandler =>
  (req, reply) => {
    void (async (): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://interno');
      const path = url.pathname;
      const method = req.method ?? 'GET';

      if (!path.startsWith('/api/')) {
        if (serveStatic && (await serveStatic(path, reply))) return;
        sendJson(reply, 404, rejected(404, 'not_found').body);
        return;
      }

      const matching = routes.filter((route) => matchPattern(route.pattern, path) !== null);
      if (matching.length === 0) {
        sendJson(reply, 404, { error: 'não existe' });
        return;
      }

      const route = matching.find((candidate) => candidate.method === method);
      if (!route) {
        sendJson(reply, 405, rejected(405, 'method_not_allowed').body);
        return;
      }

      try {
        const body = method === 'GET' ? null : await readBody(req, route.maxBody ?? MAX_BODY_BYTES);
        const request: ApiRequest = {
          method,
          path,
          params: matchPattern(route.pattern, path) ?? {},
          search: url.searchParams,
          body,
          authorization: req.headers.authorization ?? null,
          headers: req.headers,
          origin: req.socket.remoteAddress ?? 'desconhecida',
        };

        if (route.raw) {
          await route.raw(request, reply);
          return;
        }

        const returned = await route.handle(request);
        sendJson(reply, returned.status, returned.body);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'falha ao atender';
        const fromClient = reason === 'corpo não é json' || reason === 'corpo grande demais';
        if (!fromClient) console.error('[servidor]', error);
        if (!reply.headersSent) {
          sendJson(reply, fromClient ? 400 : 500, { error: reason });
        }
      }
    })();
  };
