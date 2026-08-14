/** Cliente HTTP: sempre `/api` relativo (proxy em dev, mesma origem em produção). */

const CHAVE_DA_SESSAO = 'ezone:sessao';

export interface Sessao {
  token: string;
  apelido: string;
  email: string | null;
  convidada: boolean;
}

export function sessaoGuardada(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DA_SESSAO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Sessao;
    return typeof dados.token === 'string' ? dados : null;
  } catch {
    return null;
  }
}

export function guardarSessao(sessao: Sessao | null): void {
  if (sessao) localStorage.setItem(CHAVE_DA_SESSAO, JSON.stringify(sessao));
  else localStorage.removeItem(CHAVE_DA_SESSAO);
}

/**
 * O servidor é a autoridade também sobre quem está logado: se ele recusa (401) o
 * token guardado, a sessão local morreu (banco recriado, sessão apagada, logout
 * noutra aba). Sem isto o cliente fica preso numa conta fantasma — tela de menu
 * sem decks, repetindo 401 a cada montagem, e nada leva de volta ao login.
 */
type AoCairASessao = () => void;

let avisarQueCaiu: AoCairASessao | null = null;

export function quandoASessaoCair(callback: AoCairASessao): void {
  avisarQueCaiu = callback;
}

export class ErroDaApi extends Error {
  status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

export async function api<T = Record<string, unknown>>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const token = sessaoGuardada()?.token;
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) {
    // só derruba se o token FOI apresentado e recusado; 401 de login errado não
    // é sessão caída
    if (resposta.status === 401 && token) {
      guardarSessao(null);
      avisarQueCaiu?.();
    }
    throw new ErroDaApi(resposta.status, typeof dados.erro === 'string' ? dados.erro : 'falhou');
  }
  return dados as T;
}
