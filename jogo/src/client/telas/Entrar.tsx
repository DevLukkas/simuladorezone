import { useState } from 'react';
import { useSessaoStore } from '../estado/sessaoStore.ts';

export function Entrar() {
  const { entrar, registrar, entrarComoConvidado, erro, ocupado } = useSessaoStore();
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [apelido, setApelido] = useState('');

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-3xl font-bold">Ezone TCG</h1>

      <form
        className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-5"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (modo === 'entrar') void entrar(email, senha);
          else void registrar(email, senha, apelido);
        }}
      >
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={`flex-1 rounded py-1 font-bold ${modo === 'entrar' ? 'bg-emerald-800' : 'bg-slate-800 text-slate-400'}`}
            onClick={() => setModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`flex-1 rounded py-1 font-bold ${modo === 'registrar' ? 'bg-emerald-800' : 'bg-slate-800 text-slate-400'}`}
            onClick={() => setModo('registrar')}
          >
            Criar conta
          </button>
        </div>

        {modo === 'registrar' && (
          <input
            className="rounded bg-slate-800 px-3 py-2"
            placeholder="Apelido"
            value={apelido}
            onChange={(evento) => setApelido(evento.target.value)}
          />
        )}
        <input
          className="rounded bg-slate-800 px-3 py-2"
          placeholder="E-mail"
          type="email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
        />
        <input
          className="rounded bg-slate-800 px-3 py-2"
          placeholder="Senha (mínimo 8)"
          type="password"
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
        />
        <button
          type="submit"
          disabled={ocupado}
          className="rounded bg-emerald-700 py-2 font-bold hover:bg-emerald-600 disabled:opacity-50"
        >
          {modo === 'entrar' ? 'ENTRAR' : 'CRIAR CONTA'}
        </button>
        {erro && <p className="text-sm text-amber-400">{erro}</p>}
      </form>

      <button
        type="button"
        disabled={ocupado}
        className="rounded border border-slate-700 py-2 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        onClick={() => void entrarComoConvidado('Convidado')}
      >
        Jogar como convidado
      </button>
    </main>
  );
}
