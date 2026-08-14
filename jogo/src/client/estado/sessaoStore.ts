import { create } from 'zustand';
import {
  api,
  guardarSessao,
  quandoASessaoCair,
  sessaoGuardada,
  type Sessao,
} from '../services/api.ts';

interface SessaoState {
  sessao: Sessao | null;
  erro: string | null;
  ocupado: boolean;
  entrarComoConvidado: (apelido: string) => Promise<void>;
  registrar: (email: string, senha: string, apelido: string) => Promise<void>;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
}

type RespostaDeSessao = { token: string; apelido: string; email: string | null; convidada: boolean };

export const useSessaoStore = create<SessaoState>((set) => {
  async function autenticar(chamada: () => Promise<RespostaDeSessao>): Promise<void> {
    set({ ocupado: true, erro: null });
    try {
      const dados = await chamada();
      const sessao: Sessao = {
        token: dados.token,
        apelido: dados.apelido,
        email: dados.email,
        convidada: dados.convidada,
      };
      guardarSessao(sessao);
      set({ sessao, ocupado: false });
    } catch (erro) {
      set({ erro: erro instanceof Error ? erro.message : 'falhou', ocupado: false });
    }
  }

  return {
    sessao: sessaoGuardada(),
    erro: null,
    ocupado: false,

    entrarComoConvidado: (apelido) =>
      autenticar(() => api<RespostaDeSessao>('POST', '/api/convidada', { apelido })),

    registrar: (email, senha, apelido) =>
      autenticar(() => api<RespostaDeSessao>('POST', '/api/contas', { email, senha, apelido })),

    entrar: (email, senha) =>
      autenticar(() => api<RespostaDeSessao>('POST', '/api/sessoes', { email, senha })),

    sair: () => {
      void api('DELETE', '/api/sessoes').catch(() => undefined);
      guardarSessao(null);
      set({ sessao: null });
    },
  };
});

// token recusado pelo servidor volta para a tela de login já explicado, em vez
// de deixar a conta fantasma de pé (o localStorage o `api` já limpou)
quandoASessaoCair(() => {
  useSessaoStore.setState({
    sessao: null,
    ocupado: false,
    erro: 'sua sessão expirou; entre de novo',
  });
});
