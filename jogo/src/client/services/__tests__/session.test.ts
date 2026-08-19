import { beforeEach, describe, expect, it, vi } from 'vitest';

// o cliente guarda a sessão no localStorage e fala por fetch; os testes rodam em
// node, então os dois entram de mentira antes de importar os módulos
const fakeStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
};

const answer = (status: number, body: Record<string, unknown>): typeof fetch =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

const STALE_SESSION = JSON.stringify({
  token: 'token-que-o-servidor-nao-conhece',
  nickname: 'Convidado',
  email: null,
  guest: true,
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('sessão recusada pelo servidor', () => {
  it('401 com token guardado derruba a sessão e volta para o login', async () => {
    localStorage.setItem('ezone:session', STALE_SESSION);
    vi.stubGlobal('fetch', answer(401, { error: { key: 'error.account_required' } }));

    const { useSessionStore } = await import('../../stores/sessionStore.ts');
    const { api, storedSession } = await import('../api.ts');
    expect(useSessionStore.getState().session).not.toBeNull();

    await expect(api('GET', '/api/decks')).rejects.toThrow();

    expect(storedSession()).toBeNull();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().error).toEqual({ key: 'auth.sessionExpired' });
  });

  it('401 de login errado não é sessão caída: mantém a recusa do servidor', async () => {
    vi.stubGlobal('fetch', answer(401, { error: { key: 'error.bad_credentials' } }));

    const { useSessionStore } = await import('../../stores/sessionStore.ts');
    await useSessionStore.getState().signIn('alguem@exemplo.com', 'senha-errada');

    // a recusa do servidor chega como chave, e é ela que a tela traduz
    expect(useSessionStore.getState().error).toEqual({ key: 'error.bad_credentials' });
  });

  it('sessão viva segue de pé', async () => {
    localStorage.setItem('ezone:session', STALE_SESSION);
    vi.stubGlobal('fetch', answer(200, { decks: [] }));

    const { useSessionStore } = await import('../../stores/sessionStore.ts');
    const { api, storedSession } = await import('../api.ts');

    await api('GET', '/api/decks');

    expect(storedSession()).not.toBeNull();
    expect(useSessionStore.getState().session).not.toBeNull();
  });
});
