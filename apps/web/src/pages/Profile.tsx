import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, LogIn, Plus, Trash2, Upload, UserRound } from 'lucide-react';
import { PLATFORMS, VERSIONS, profileExport } from '@isaac-codex/shared';
import { api, ApiError } from '@/lib/api';
import { useActiveProfile, useProfileStore } from '@/lib/profile-store';
import { usePatchProgress, useProgress } from '@/lib/queries';
import { PageHeader, Section } from '@/components/common';
import { Badge, Button, Input, Label, Select } from '@/components/ui';
import { cn, downloadJson } from '@/lib/utils';

function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      const details = e instanceof ApiError && e.details?.length ? ` (${e.details.map((d) => `${d.path} : ${d.message}`).join(' ; ')})` : '';
      setMsg({ ok: false, text: (e instanceof Error ? e.message : 'Erreur') + details });
    }
  };
  const Message = () => (msg ? <p className={cn('mt-2 text-sm', msg.ok ? 'text-ok' : 'text-blood-bright')} role="status">{msg.text}</p> : null);
  return { run, Message };
}

export function ProfilePage() {
  const store = useProfileStore();
  const active = useActiveProfile();
  const { data: progress } = useProgress();
  const patch = usePatchProgress();
  const qc = useQueryClient();
  const create = useAction();
  const manage = useAction();
  const login = useAction();
  const io = useAction();
  const [newName, setNewName] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [rename, setRename] = useState('');
  const [pwd, setPwd] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'new' | 'replace'>('new');

  const onImport = async (file: File) =>
    io.run(async () => {
      if (file.size > 2_000_000) throw new Error('Fichier trop volumineux (2 Mo maximum)');
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error("Ce fichier n'est pas un JSON valide");
      }
      const parsed = profileExport.safeParse(json);
      if (!parsed.success) throw new Error(`Export invalide : ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}`);
      const r = await api<{ profile: { id: string; name: string }; token: string | null; imported: Record<string, number>; skipped: number; datasetMismatch: boolean }>(
        '/api/profiles/import',
        { method: 'POST', body: { data: parsed.data, mode: importMode }, auth: importMode === 'replace' },
      );
      if (r.token) store.add({ id: r.profile.id, name: r.profile.name, token: r.token });
      await qc.invalidateQueries({ queryKey: ['progress'] });
      return `Import réussi dans « ${r.profile.name} » : ${r.imported.unlocks} succès, ${r.imported.marks} marques, ${r.imported.favorites} favoris.${r.skipped ? ` ${r.skipped} entrée(s) inconnue(s) ignorée(s).` : ''}${r.datasetMismatch ? ' (export issu d\'une autre version des données)' : ''}`;
    });

  return (
    <div className="space-y-5">
      <PageHeader icon={<UserRound />} title="Profil et sauvegardes" subtitle="Aucun compte n'est obligatoire. Chaque profil a sa propre progression, ses favoris et ses paramètres, stockés sur le serveur et protégés par un jeton secret." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Profils de ce navigateur">
          <ul className="space-y-2">
            {store.profiles.map((p) => (
              <li key={p.id} className={cn('flex items-center justify-between gap-2 rounded-md p-2 ring-1', p.id === active?.id ? 'bg-surface-2 ring-parchment/40' : 'ring-parchment/10')}>
                <span className="truncate">{p.name}</span>
                {p.id === active?.id ? <Badge variant="ok">Actif</Badge> : <Button size="sm" variant="outline" onClick={() => store.setActive(p.id)}>Utiliser</Button>}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-parchment/10 pt-4">
            <Label htmlFor="np">Nouveau profil</Label>
            <Input id="np" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du profil" maxLength={40} />
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mot de passe (facultatif, 8 caractères min.)" autoComplete="new-password" />
            <Button
              onClick={() =>
                create.run(async () => {
                  const r = await api<{ profile: { id: string; name: string }; token: string }>('/api/profiles', {
                    method: 'POST',
                    body: { name: newName, password: newPwd || undefined },
                    auth: false,
                  });
                  store.add({ id: r.profile.id, name: r.profile.name, token: r.token });
                  setNewName('');
                  setNewPwd('');
                  return `Profil « ${r.profile.name} » créé et activé.`;
                })
              }
              disabled={!newName.trim()}
            >
              <Plus /> Créer
            </Button>
            <create.Message />
          </div>
        </Section>

        <Section title="Récupérer un profil protégé">
          <p className="mb-3 text-sm text-muted">Si vous avez défini un mot de passe, vous pouvez retrouver votre profil sur un autre appareil.</p>
          <div className="space-y-2">
            <Input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="Nom du profil" autoComplete="username" />
            <Input type="password" value={loginPwd} onChange={(e) => setLoginPwd(e.target.value)} placeholder="Mot de passe" autoComplete="current-password" />
            <Button
              variant="outline"
              onClick={() =>
                login.run(async () => {
                  const r = await api<{ profile: { id: string; name: string }; token: string }>('/api/profiles/login', { method: 'POST', body: { name: loginName, password: loginPwd }, auth: false });
                  store.add({ id: r.profile.id, name: r.profile.name, token: r.token });
                  setLoginPwd('');
                  return `Connecté à « ${r.profile.name} ».`;
                })
              }
              disabled={!loginName || loginPwd.length < 8}
            >
              <LogIn /> Se connecter
            </Button>
            <login.Message />
          </div>
        </Section>
      </div>

      {active && progress && (
        <>
          <Section title={`Paramètres de « ${progress.name} »`}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-ver">Version du jeu</Label>
                <Select id="s-ver" value={progress.settings.gameVersion} onChange={(e) => patch.mutate({ settings: { gameVersion: e.target.value } })}>
                  {VERSIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-plat">Plateforme</Label>
                <Select id="s-plat" value={progress.settings.platform} onChange={(e) => patch.mutate({ settings: { platform: e.target.value } })}>
                  {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={progress.settings.autoUnlockFromMarks} onChange={(e) => patch.mutate({ settings: { autoUnlockFromMarks: e.target.checked } })} className="accent-[var(--color-blood)]" />
                Déduire les déblocages des marques cochées
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={progress.settings.showRepPlusDiff} onChange={(e) => patch.mutate({ settings: { showRepPlusDiff: e.target.checked } })} className="accent-[var(--color-blood)]" />
                Signaler les différences Repentance+
              </label>
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Nom et mot de passe">
              <div className="space-y-2">
                <Label htmlFor="rn">Renommer</Label>
                <div className="flex gap-2">
                  <Input id="rn" value={rename} onChange={(e) => setRename(e.target.value)} placeholder={progress.name} maxLength={40} />
                  <Button
                    variant="outline"
                    disabled={!rename.trim()}
                    onClick={() =>
                      manage.run(async () => {
                        const r = await api<{ profile: { name: string } }>(`/api/profiles/${active.id}`, { method: 'PATCH', body: { name: rename } });
                        store.rename(active.id, r.profile.name);
                        setRename('');
                        await qc.invalidateQueries({ queryKey: ['progress'] });
                        return 'Profil renommé.';
                      })
                    }
                  >
                    Renommer
                  </Button>
                </div>
                <Label htmlFor="pw" className="mt-3 block"><KeyRound className="mr-1 inline size-4" /> Mot de passe {progress.hasPassword ? '(défini)' : '(aucun)'}</Label>
                {progress.hasPassword && <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" />}
                <Input id="pw" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Nouveau mot de passe (8 caractères min.)" autoComplete="new-password" />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={pwd.length < 8}
                    onClick={() =>
                      manage.run(async () => {
                        await api(`/api/profiles/${active.id}`, { method: 'PATCH', body: { password: pwd, currentPassword: currentPwd || undefined } });
                        setPwd('');
                        setCurrentPwd('');
                        await qc.invalidateQueries({ queryKey: ['progress'] });
                        return 'Mot de passe enregistré.';
                      })
                    }
                  >
                    Enregistrer
                  </Button>
                  {progress.hasPassword && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        manage.run(async () => {
                          await api(`/api/profiles/${active.id}`, { method: 'PATCH', body: { password: null, currentPassword: currentPwd } });
                          await qc.invalidateQueries({ queryKey: ['progress'] });
                          return 'Mot de passe supprimé.';
                        })
                      }
                    >
                      Supprimer le mot de passe
                    </Button>
                  )}
                </div>
                <manage.Message />
              </div>
            </Section>

            <Section title="Export, import et sauvegarde">
              <p className="mb-3 text-sm text-muted">L'export JSON contient toute la progression du profil (sans le jeton ni le mot de passe).</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="parchment"
                  onClick={() =>
                    io.run(async () => {
                      const data = await api<{ exportedAt: string }>(`/api/profiles/${active.id}/export`, { method: 'POST' });
                      downloadJson(`isaac-codex-${progress.name.replace(/[^a-z0-9-_]+/gi, '_')}-${data.exportedAt.slice(0, 10)}.json`, data);
                      return 'Export téléchargé.';
                    })
                  }
                  data-testid="export-profile"
                >
                  <Download /> Exporter en JSON
                </Button>
                <Select value={importMode} onChange={(e) => setImportMode(e.target.value as 'new' | 'replace')} className="w-auto" aria-label="Mode d'import">
                  <option value="new">Importer dans un nouveau profil</option>
                  <option value="replace">Remplacer la progression du profil actif</option>
                </Select>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload /> Importer…
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  data-testid="import-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onImport(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <io.Message />
            </Section>
          </div>

          <Section title="Zone sensible">
            <p className="mb-3 text-sm text-muted">Supprime définitivement ce profil et toute sa progression du serveur. Pensez à exporter avant.</p>
            <Button
              variant="outline"
              className="border-blood/50 text-blood-bright hover:bg-blood/15"
              onClick={() =>
                manage.run(async () => {
                  if (!window.confirm(`Supprimer définitivement le profil « ${progress.name} » ?`)) return;
                  await api(`/api/profiles/${active.id}`, { method: 'DELETE' });
                  store.remove(active.id);
                  return 'Profil supprimé.';
                })
              }
            >
              <Trash2 /> Supprimer ce profil
            </Button>
          </Section>
        </>
      )}
    </div>
  );
}
