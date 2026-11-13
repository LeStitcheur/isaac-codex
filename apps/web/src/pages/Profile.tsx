import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, LogOut, Plus, Trash2, Upload, UserRound } from 'lucide-react';
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
  const accounts = useAction();
  const manage = useAction();
  const io = useAction();
  const [rename, setRename] = useState('');
  const [pwd, setPwd] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (!window.confirm(`Remplacer toute la progression de « ${progress?.name} » par celle de ce fichier ?`)) return;
      const r = await api<{ profile: { id: string; name: string }; imported: Record<string, number>; skipped: number; datasetMismatch: boolean }>('/api/profiles/import', {
        method: 'POST',
        body: { data: parsed.data, mode: 'replace' },
      });
      await qc.invalidateQueries({ queryKey: ['progress'] });
      return `Import réussi dans « ${r.profile.name} » : ${r.imported.unlocks} succès, ${r.imported.marks} marques, ${r.imported.favorites} favoris.${r.skipped ? ` ${r.skipped} entrée(s) inconnue(s) ignorée(s).` : ''}${r.datasetMismatch ? " (export issu d'une autre version des données)" : ''}`;
    });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<UserRound />}
        title="Compte et sauvegardes"
        subtitle="Chaque compte a sa propre progression, ses favoris et ses paramètres, enregistrés sur le serveur et accessibles depuis tous vos appareils."
      />

      <Section title="Comptes sur cet appareil">
        <ul className="space-y-2">
          {store.profiles.map((p) => (
            <li key={p.id} className={cn('flex items-center justify-between gap-2 rounded-md p-2 ring-1', p.id === active?.id ? 'bg-surface-2 ring-parchment/40' : 'ring-parchment/10')}>
              <span className="truncate">{p.name}</span>
              {p.id === active?.id ? (
                <Badge variant="ok">Connecté</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => store.setActive(p.id)}>
                  Basculer
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => store.setAuthOpen(true)}>
            <Plus /> Ajouter un compte
          </Button>
          {active && (
            <Button
              variant="ghost"
              onClick={() =>
                accounts.run(async () => {
                  // Révocation du jeton côté serveur (au mieux), puis oubli du compte sur cet appareil.
                  await api(`/api/profiles/${active.id}/logout`, { method: 'POST' }).catch(() => undefined);
                  store.logout(active.id);
                })
              }
              data-testid="logout"
            >
              <LogOut /> Se déconnecter
            </Button>
          )}
        </div>
        <accounts.Message />
      </Section>

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
                        return 'Compte renommé.';
                      })
                    }
                  >
                    Renommer
                  </Button>
                </div>
                <Label htmlFor="pw" className="mt-3 block">
                  <KeyRound className="mr-1 inline size-4" /> {progress.hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe (obligatoire pour se reconnecter)'}
                </Label>
                {progress.hasPassword && <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" />}
                <Input id="pw" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Nouveau mot de passe (8 caractères min.)" autoComplete="new-password" />
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
                <manage.Message />
              </div>
            </Section>

            <Section title="Export, import et sauvegarde">
              <p className="mb-3 text-sm text-muted">L'export JSON contient toute la progression du compte (sans le jeton ni le mot de passe). L'import remplace la progression du compte connecté.</p>
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
            <p className="mb-3 text-sm text-muted">Supprime définitivement ce compte et toute sa progression du serveur. Pensez à exporter avant.</p>
            <Button
              variant="outline"
              className="border-blood/50 text-blood-bright hover:bg-blood/15"
              onClick={() =>
                manage.run(async () => {
                  if (!window.confirm(`Supprimer définitivement le compte « ${progress.name} » ?`)) return;
                  await api(`/api/profiles/${active.id}`, { method: 'DELETE' });
                  store.logout(active.id);
                })
              }
            >
              <Trash2 /> Supprimer ce compte
            </Button>
          </Section>
        </>
      )}
    </div>
  );
}
