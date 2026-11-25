import React, { useEffect, useState } from 'react';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const expired = () => setAuthenticated(false);
    window.addEventListener('session-expired', expired);
    fetch('/api/session', { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAuthenticated(data.authenticated);
    }).catch(() => setError('Não foi possível verificar a sessão. Tente entrar novamente.'))
      .finally(() => setChecking(false));
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao entrar.');
      setPassword(''); setAuthenticated(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao entrar.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível encerrar a sessão.');
      for (const key of Object.keys(localStorage)) if (key.startsWith('chronos_event_')) localStorage.removeItem(key);
      setAuthenticated(false);
    } catch { alert('Não foi possível sair. Tente novamente.'); }
  }
  if (checking) return <div className="h-screen grid place-items-center text-gray-400">Verificando acesso…</div>;
  if (authenticated) return <>{children}<button onClick={logout} className="fixed top-4 left-4 z-[9999] rounded bg-gray-900/90 border border-gray-700 px-3 py-2 text-xs text-gray-300">Sair</button></>;
  return <main className="min-h-screen flex items-center justify-center bg-black p-6 text-white">
    <form onSubmit={login} className="w-full max-w-md space-y-6 rounded-2xl border border-gray-800 bg-gray-900 p-8">
      <div><h1 className="text-2xl font-bold">Gestão de Cultos e Eventos</h1><p className="text-gray-400 mt-2">Entre para acessar os painéis e eventos.</p></div>
      <label className="block">Senha de acesso<input type="password" autoComplete="current-password" autoFocus required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded border border-gray-700 bg-black p-3" /></label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="w-full rounded bg-red-600 py-3 font-bold disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </main>;
}
