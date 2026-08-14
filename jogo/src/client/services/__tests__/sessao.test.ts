import { beforeEach, describe, expect, it, vi } from 'vitest';

// o cliente guarda a sessão no localStorage e fala por fetch; os testes rodam em
// node, então os dois entram de mentira antes de importar os módulos
const armazenamentoDeMentira = (): Storage => {
  const dados = new Map<string, string>();
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => void dados.set(chave, String(valor)),
    removeItem: (chave) => void dados.delete(chave),
    clear: () => dados.clear(),
    key: (indice) => [...dados.keys()][indice] ?? null,
    get length() {
      return dados.size;
    },
  } as Storage;
};

const responder = (status: number, corpo: Record<string, unknown>): typeof fetch =>
  (() => Promise.resolve(new Response(JSON.stringify(corpo), { status }))) as typeof fetch;

const SESSAO_VELHA = JSON.stringify({
  token: 'token-que-o-servidor-nao-conhece',
  apelido: 'Convidado',
  email: null,
  convidada: true,
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', armazenamentoDeMentira());
});

describe('sessão recusada pelo servidor', () => {
  it('401 com token guardado derruba a sessão e volta para o login', async () => {
    localStorage.setItem('ezone:sessao', SESSAO_VELHA);
    vi.stubGlobal('fetch', responder(401, { erro: 'é preciso estar em uma conta' }));

    const { useSessaoStore } = await import('../../estado/sessaoStore.ts');
    const { api, sessaoGuardada } = await import('../api.ts');
    expect(useSessaoStore.getState().sessao).not.toBeNull();

    await expect(api('GET', '/api/decks')).rejects.toThrow();

    expect(sessaoGuardada()).toBeNull();
    expect(useSessaoStore.getState().sessao).toBeNull();
    expect(useSessaoStore.getState().erro).toBe('sua sessão expirou; entre de novo');
  });

  it('401 de login errado não é sessão caída: mantém a recusa do servidor', async () => {
    vi.stubGlobal('fetch', responder(401, { erro: 'e-mail ou senha não conferem' }));

    const { useSessaoStore } = await import('../../estado/sessaoStore.ts');
    await useSessaoStore.getState().entrar('alguem@exemplo.com', 'senha-errada');

    expect(useSessaoStore.getState().erro).toBe('e-mail ou senha não conferem');
  });

  it('sessão viva segue de pé', async () => {
    localStorage.setItem('ezone:sessao', SESSAO_VELHA);
    vi.stubGlobal('fetch', responder(200, { decks: [] }));

    const { useSessaoStore } = await import('../../estado/sessaoStore.ts');
    const { api, sessaoGuardada } = await import('../api.ts');

    await api('GET', '/api/decks');

    expect(sessaoGuardada()).not.toBeNull();
    expect(useSessaoStore.getState().sessao).not.toBeNull();
  });
});
