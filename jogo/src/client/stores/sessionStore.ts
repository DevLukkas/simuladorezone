import { create } from 'zustand';
import { text, type TextRef } from '../../shared/text.ts';
import {
  ApiError,
  api,
  storeSession,
  onSessionLost,
  storedSession,
  type Session,
} from '../services/api.ts';

interface SessionState {
  session: Session | null;
  error: TextRef | null;
  busy: boolean;
  /** o apelido é sorteado pelo servidor (`Summoner-XXXXXX`): a tela não escolhe nome */
  signInAsGuest: () => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

type SessionReply = { token: string; nickname: string; email: string | null; guest: boolean };

export const useSessionStore = create<SessionState>((set) => {
  async function authenticate(call: () => Promise<SessionReply>): Promise<void> {
    set({ busy: true, error: null });
    try {
      const data = await call();
      const session: Session = {
        token: data.token,
        nickname: data.nickname,
        email: data.email,
        guest: data.guest,
      };
      storeSession(session);
      set({ session, busy: false });
    } catch (error) {
      set({ error: error instanceof ApiError ? error.ref : text('common.failed'), busy: false });
    }
  }

  return {
    session: storedSession(),
    error: null,
    busy: false,

    signInAsGuest: () => authenticate(() => api<SessionReply>('POST', '/api/guest', {})),

    signUp: (email, password, nickname) =>
      authenticate(() => api<SessionReply>('POST', '/api/accounts', { email, password, nickname })),

    signIn: (email, password) =>
      authenticate(() => api<SessionReply>('POST', '/api/sessions', { email, password })),

    signOut: () => {
      void api('DELETE', '/api/sessions').catch(() => undefined);
      storeSession(null);
      set({ session: null });
    },
  };
});

// token recusado pelo servidor volta para a tela de login já explicado, em vez
// de deixar a conta fantasma de pé (o localStorage o `api` já limpou)
onSessionLost(() => {
  useSessionStore.setState({
    session: null,
    busy: false,
    error: text('auth.sessionExpired'),
  });
});
