import { text, type TextRef } from '../../shared/text.ts';

/** Cliente HTTP: sempre `/api` relativo (proxy em dev, mesma origem em produção). */

const SESSION_KEY = 'ezone:session';

export interface Session {
  token: string;
  nickname: string;
  email: string | null;
  guest: boolean;
}

export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Session;
    return typeof data.token === 'string' ? data : null;
  } catch {
    return null;
  }
}

export function storeSession(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

/**
 * O servidor é a autoridade também sobre quem está logado: se ele recusa (401) o
 * token guardado, a sessão local morreu (banco recriado, sessão apagada, logout
 * noutra aba). Sem isto o cliente fica preso numa conta fantasma — tela de menu
 * sem decks, repetindo 401 a cada montagem, e nada leva de volta ao login.
 */
type OnSessionLost = () => void;

let notifySessionLost: OnSessionLost | null = null;

export function onSessionLost(callback: OnSessionLost): void {
  notifySessionLost = callback;
}

/**
 * Recusa do servidor já pronta para traduzir: `ref` é a chave do erro e
 * `details` a lista de problemas quando há mais de um (validação de deck).
 */
export class ApiError extends Error {
  status: number;
  ref: TextRef;
  details: TextRef[];

  constructor(status: number, ref: TextRef, details: TextRef[] = []) {
    super(ref.key);
    this.status = status;
    this.ref = ref;
    this.details = details;
  }
}

function refFromBody(body: Record<string, unknown>): TextRef {
  const error = body.error;
  if (error && typeof error === 'object' && typeof (error as TextRef).key === 'string') {
    return error as TextRef;
  }
  return text('common.failed');
}

export async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
  /** cabeçalhos extras; hoje só a chave do estúdio de cartas os usa */
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const token = storedSession()?.token;
  const reply = await fetch(path, {
    method: method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await reply.json().catch(() => ({}))) as Record<string, unknown>;
  if (!reply.ok) {
    // só derruba se o token FOI apresentado e recusado; 401 de login errado não
    // é sessão caída
    if (reply.status === 401 && token) {
      storeSession(null);
      notifySessionLost?.();
    }
    throw new ApiError(
      reply.status,
      refFromBody(data),
      Array.isArray(data.details) ? (data.details as TextRef[]) : [],
    );
  }
  return data as T;
}
