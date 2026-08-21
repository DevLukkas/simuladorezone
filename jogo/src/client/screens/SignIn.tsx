import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { LanguagePicker } from '../components/LanguagePicker.tsx';
import { Wordmark } from '../components/Wordmark.tsx';

/**
 * A porta de entrada, no console (decisão nº 31).
 *
 * Uma coluna só, centrada: brasão, o cartão de canto chanfrado com as duas abas
 * e, solto embaixo dele, o convidado. O convidado fica FORA do cartão de
 * propósito — ele não preenche campo nenhum, e dentro do mesmo painel o olho o
 * lia como um terceiro jeito de entrar com e-mail e senha.
 */
export function SignIn() {
  const { signIn, signUp, signInAsGuest, error, busy } = useSessionStore();
  const { t, resolve } = useTranslation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  return (
    <main className="zn-login flex flex-col items-center justify-center gap-6 overflow-hidden px-5 py-11">
      <GemField className="left-[7%] top-13 opacity-55" />
      <GemField className="bottom-16 right-[8%] opacity-40" />

      <div className="relative">
        <Wordmark />
      </div>

      <form
        className="zn-notch-lg relative flex w-[min(400px,94vw)] flex-col gap-3.25 border border-zn-edge bg-zn-rail p-5.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'signin') void signIn(email, password);
          else void signUp(email, password, nickname);
        }}
      >
        {/* o vão de 1px do `.zn-hair` é a divisória entre as duas abas */}
        <div className="zn-hair grid-cols-2 border border-zn-edge">
          {(['signin', 'signup'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`zn-tab uppercase ${mode === option ? 'zn-tab-loud' : 'zn-tab-quiet'}`}
              onClick={() => setMode(option)}
            >
              {t(option === 'signin' ? 'auth.signIn' : 'auth.createAccount')}
            </button>
          ))}
        </div>

        {mode === 'signup' && (
          <input
            className="zn-input zn-input-lg w-full"
            placeholder={t('auth.nickname')}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        )}
        <input
          className="zn-input zn-input-lg w-full"
          placeholder={t('auth.email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="zn-input zn-input-lg w-full"
          placeholder={t('auth.password')}
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button
          type="submit"
          disabled={busy}
          className="zn-btn zn-btn-gold h-11.5 w-full text-[11px] tracking-[0.22em] uppercase"
        >
          {mode === 'signin' ? t('auth.signInAction') : t('auth.createAction')}
        </button>

        {error && (
          <p
            role="alert"
            className="zn-num border-l-2 border-zn-red-deep pl-2.5 text-[11px] leading-snug text-zn-red-light"
          >
            {resolve(error)}
          </p>
        )}
      </form>

      <button
        type="button"
        disabled={busy}
        className="zn-btn zn-btn-wire relative h-10 w-[min(400px,94vw)] text-[10px] tracking-[0.2em] uppercase"
        onClick={() => void signInAsGuest()}
      >
        {t('auth.playAsGuest')}
      </button>

      <div className="relative flex items-center gap-3.5">
        <span aria-hidden className="zn-beacon h-1.5 w-1.5 bg-zn-green" />
        <span className="zn-num text-[9px] uppercase tracking-[0.18em] text-zn-fainter">
          {t('app.title')}
        </span>
        <LanguagePicker />
      </div>
    </main>
  );
}

/**
 * O enxame de losangos nos cantos: três fileiras de cinco, apagadas, só para o
 * fundo não ser um retângulo preto. Mesma pedra do brasão e do ponto de vitória
 * — é o único ornamento que este desenho tem, e ele se repete em vez de inventar
 * uma forma nova a cada tela.
 */
function GemField({ className }: { className: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute flex flex-col gap-2.5 ${className}`}>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-2.25">
          {[0, 1, 2, 3, 4].map((cell) => {
            const lit = (row * 5 + cell) % 4 === 0;
            return (
              <span
                key={cell}
                className="h-2.5 w-2.5 rotate-45"
                style={
                  lit
                    ? {
                        background: 'linear-gradient(135deg,#9fe8b4,#63c77b 55%,#1d6b4b)',
                        border: '1px solid #a9f0be',
                        boxShadow: '0 0 10px rgba(99,199,123,.55)',
                      }
                    : { background: 'rgba(15,17,21,.9)', border: '1px solid #2c313b' }
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
