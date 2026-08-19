import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useTranslation } from '../useTranslation.ts';
import { LanguagePicker } from '../components/LanguagePicker.tsx';
import { Wordmark } from '../components/Wordmark.tsx';

export function SignIn() {
  const { signIn, signUp, signInAsGuest, error, busy } = useSessionStore();
  const { t, resolve } = useTranslation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  return (
    <main className="ez-page relative flex flex-col items-center justify-center gap-7 overflow-hidden p-10">
      {/* o círculo de runas atrás do brasão: um parado, um girando devagar */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-36 left-1/2 -ml-70 h-140 w-140 rounded-full border border-ez-gold/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 -ml-82 h-165 w-165 rounded-full border border-dashed border-ez-gold/8"
        style={{ animation: 'ez-spin-slow 90s linear infinite' }}
      />

      <Wordmark />

      <div className="relative w-[min(420px,92vw)]">
        <span className="ez-corner -left-2 -top-2 rounded-tl-[10px] border-l-2 border-t-2 border-ez-gold" />
        <span className="ez-corner -right-2 -top-2 rounded-tr-[10px] border-r-2 border-t-2 border-ez-gold" />
        <span className="ez-corner -bottom-2 -left-2 rounded-bl-[10px] border-b-2 border-l-2 border-ez-gold" />
        <span className="ez-corner -bottom-2 -right-2 rounded-br-[10px] border-b-2 border-r-2 border-ez-gold" />

        <form
          className="ez-panel flex flex-col gap-3.5 p-5.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'signin') void signIn(email, password);
            else void signUp(email, password, nickname);
          }}
        >
          <div className="grid grid-cols-2 gap-2 rounded-[11px] border border-ez-line bg-ez-field p-1.5">
            {(['signin', 'signup'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`ez-btn ez-btn-sm ${
                  mode === option ? 'ez-btn-gold' : 'ez-btn-ghost border-transparent bg-transparent'
                }`}
                onClick={() => setMode(option)}
              >
                {t(option === 'signin' ? 'auth.signIn' : 'auth.createAccount')}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <input
              className="ez-input"
              placeholder={t('auth.nickname')}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          )}
          <input
            className="ez-input"
            placeholder={t('auth.email')}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="ez-input"
            placeholder={t('auth.password')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" disabled={busy} className="ez-btn ez-btn-gold w-full">
            {mode === 'signin' ? t('auth.signInAction') : t('auth.createAction')}
          </button>
          {error && <p className="text-sm text-ez-gold-light">{resolve(error)}</p>}
        </form>
      </div>

      <button
        type="button"
        disabled={busy}
        className="ez-btn ez-btn-ghost w-[min(420px,92vw)]"
        onClick={() => void signInAsGuest(t('auth.guestName'))}
      >
        {t('auth.playAsGuest')}
      </button>

      <LanguagePicker />
    </main>
  );
}
