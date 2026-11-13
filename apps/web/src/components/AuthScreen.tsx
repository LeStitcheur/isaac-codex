/**
 * Écran d'accueil obligatoire : connexion ou création de compte (plus de session invité).
 * Les comptes déjà connectés sur cet appareil sont proposés en reprise rapide.
 */
import { useState, type FormEvent } from 'react';
import { LogIn, UserPlus, UserRound, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { asset } from '@/lib/game-assets';
import { useProfileStore } from '@/lib/profile-store';
import { cn } from '@/lib/utils';
import { Button, Input, Label } from './ui';

type Mode = 'login' | 'signup';
type AuthResponse = { profile: { id: string; name: string }; token: string };

export function AuthScreen({ onCancel }: { onCancel?: () => void }) {
  const profiles = useProfileStore((s) => s.profiles);
  const add = useProfileStore((s) => s.add);
  const setActive = useProfileStore((s) => s.setActive);
  const [mode, setMode] = useState<Mode>(profiles.length ? 'login' : 'signup');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = mode === 'signup' && confirm.length > 0 && confirm !== password;
  const canSubmit = name.trim().length > 0 && password.length >= 8 && (mode === 'login' || confirm === password) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<AuthResponse>(mode === 'login' ? '/api/profiles/login' : '/api/profiles', {
        method: 'POST',
        body: { name: name.trim(), password },
        auth: false,
      });
      add({ id: r.profile.id, name: r.profile.name, token: r.token });
      onCancel?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setConfirm('');
  };

  return (
    <div className="relative grid min-h-dvh place-items-center bg-abyss px-4 py-10">
      <div className="w-full max-w-sm">
        {onCancel && (
          <button onClick={onCancel} className="absolute right-4 top-4 rounded-md p-2 text-muted hover:text-ink" aria-label="Fermer">
            <X className="size-5" />
          </button>
        )}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-16 place-items-center rounded-2xl border border-[#ff758666] bg-gradient-to-br from-[#ff5266] to-[#b31432] shadow-[0_6px_25px_#ed21401a]">
            <img src={asset('characters', 'isaac') ?? '/favicon.svg'} alt="" className="size-10 [image-rendering:pixelated]" />
          </span>
          <h1 className="brand-font text-3xl text-white">ISAAC CODEX</h1>
          <p className="text-sm text-muted">Votre progression, vos marques et vos favoris, sur tous vos appareils.</p>
        </div>

        {profiles.length > 0 && (
          <div className="mb-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-faint">Comptes sur cet appareil</p>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActive(p.id);
                  onCancel?.();
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-[#3d4856]"
              >
                <span className="grid size-8 place-items-center rounded-full border border-[#5f2a38] bg-[#2f1922] text-xs font-semibold uppercase text-[#ff7187]">{p.name[0]}</span>
                <span className="truncate text-parchment">{p.name}</span>
                <UserRound className="ml-auto size-4 text-faint" />
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-abyss p-1" role="tablist">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn('rounded-md py-2 text-xs font-semibold transition-colors', mode === m ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink')}
              >
                {m === 'login' ? 'Se connecter' : 'Créer un compte'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Nom du compte</Label>
              <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="username" data-testid="auth-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-pwd">Mot de passe</Label>
              <Input
                id="auth-pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? '8 caractères minimum' : undefined}
                data-testid="auth-password"
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-confirm">Confirmer le mot de passe</Label>
                <Input id="auth-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" data-testid="auth-confirm" />
                {mismatch && <p className="text-xs text-blood-bright">Les mots de passe ne correspondent pas.</p>}
              </div>
            )}
            {error && <p className="text-sm text-blood-bright" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={!canSubmit} data-testid="auth-submit">
              {mode === 'login' ? <><LogIn /> Se connecter</> : <><UserPlus /> Créer mon compte</>}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-[11px] text-faint">Wiki communautaire non officiel de The Binding of Isaac.</p>
      </div>
    </div>
  );
}
