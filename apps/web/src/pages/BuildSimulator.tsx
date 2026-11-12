import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FlaskConical, Trash2, X } from 'lucide-react';
import type { BuildAnalysis, EntityRef, StatKey } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { useProgress } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { EmptyState, EntityChip, PageHeader, Section } from '@/components/common';
import { Badge, Button, Progress } from '@/components/ui';
import { EntityPicker, type PickedRef } from './Synergies';

const STORAGE_KEY = 'isaac-codex-build';
type Label = { kind: string; key: string; name: string; nameFr: string | null };
type Analysis = Omit<BuildAnalysis, 'synergies' | 'interactions' | 'transformations' | 'suggestions'> & {
  synergies: (BuildAnalysis['synergies'][number] & { aLabel: Label; bLabel: Label })[];
  interactions: (BuildAnalysis['interactions'][number] & { aLabel: Label; bLabel: Label })[];
  transformations: (BuildAnalysis['transformations'][number] & { missingLabels: Label[]; haveLabels: Label[] })[];
  suggestions: (BuildAnalysis['suggestions'][number] & { label: Label })[];
  disclaimer: string;
};

const STATS: [StatKey, string][] = [
  ['damage', 'Dégâts'],
  ['tears', 'Cadence (tears)'],
  ['speed', 'Vitesse'],
  ['range', 'Portée'],
  ['shotSpeed', 'Vitesse des tirs'],
  ['luck', 'Chance'],
];

export function BuildSimulatorPage() {
  const { data: progress } = useProgress();
  const [build, setBuild] = useState<PickedRef[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PickedRef[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(build));
    } catch {
      /* stockage indisponible : le build n'est simplement pas mémorisé */
    }
  }, [build]);
  const version = progress?.settings.gameVersion ?? 'repentance';
  const analysis = useQuery({
    queryKey: ['build', build.map((b) => `${b.kind}:${b.key}`).join(','), version],
    enabled: build.length > 0,
    queryFn: () =>
      api<Analysis>('/api/builds/analyze', { method: 'POST', body: { items: build.map((b): EntityRef => ({ kind: b.kind, key: b.key })), version }, auth: false }),
  });
  const add = (p: PickedRef) => setBuild((b) => (b.some((x) => x.kind === p.kind && x.key === p.key) ? b : [...b, p]));
  const a = analysis.data;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<FlaskConical />}
        title="Simulateur de build"
        subtitle="Ajoutez les objets obtenus pendant votre partie : le Codex affiche les synergies documentées, les transformations en cours et le cumul des modificateurs de statistiques simples."
      />
      <Section
        title={`Mon build (${build.length})`}
        actions={build.length > 0 && <Button variant="ghost" size="sm" onClick={() => setBuild([])}><Trash2 /> Vider</Button>}
      >
        <EntityPicker onPick={add} testId="build-picker" />
        <div className="mt-3 flex flex-wrap gap-2" data-testid="build-items">
          {build.length === 0 && <p className="text-sm text-muted">Aucun objet pour l'instant.</p>}
          {build.map((b) => (
            <span key={`${b.kind}:${b.key}`} className="inline-flex items-center gap-1">
              <EntityChip kind={b.kind} id={b.key} name={b.name} />
              <button onClick={() => setBuild((x) => x.filter((y) => !(y.kind === b.kind && y.key === b.key)))} className="rounded p-1 text-faint hover:text-blood" aria-label={`Retirer ${b.name}`}>
                <X className="size-4" />
              </button>
            </span>
          ))}
        </div>
      </Section>

      {a && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={`Synergies documentées (${a.synergies.length})`}>
              {a.synergies.length === 0 ? (
                <p className="text-sm text-muted">Aucune synergie documentée entre ces objets.</p>
              ) : (
                <ul className="space-y-2" data-testid="build-synergies">
                  {a.synergies.map((s, i) => (
                    <li key={i} className="rounded-md bg-abyss/40 p-2">
                      <div className="mb-1 text-sm text-parchment">{s.aLabel.nameFr ?? s.aLabel.name} + {s.bLabel.nameFr ?? s.bLabel.name}</div>
                      <Markup text={s.text} className="text-sm" />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Interactions et incompatibilités (${a.interactions.length})`}>
              {a.interactions.length === 0 ? (
                <p className="text-sm text-muted">Aucune interaction documentée entre ces objets.</p>
              ) : (
                <ul className="space-y-2">
                  {a.interactions.map((s, i) => (
                    <li key={i} className="rounded-md bg-abyss/40 p-2">
                      <div className="mb-1 flex items-center gap-2 text-sm text-parchment">
                        {s.aLabel.nameFr ?? s.aLabel.name} + {s.bLabel.nameFr ?? s.bLabel.name}
                        {s.possiblyNegative && <Badge variant="warn"><AlertTriangle className="size-3" /> possiblement négative</Badge>}
                      </div>
                      <Markup text={s.text} className="text-sm" />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Transformations">
              {a.transformations.length === 0 ? (
                <p className="text-sm text-muted">Aucun objet de transformation dans ce build.</p>
              ) : (
                <ul className="space-y-3">
                  {a.transformations.map((t) => (
                    <li key={t.slug}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-display text-parchment">{t.name}</span>
                        <span className={t.complete ? 'text-ok' : 'text-muted'}>{t.complete ? 'Transformation obtenue' : `${t.count}/3`}</span>
                      </div>
                      <Progress value={Math.min(100, (t.count / 3) * 100)} tone={t.complete ? 'ok' : 'parchment'} className="mt-1" />
                      {!t.complete && <p className="mt-1 text-xs text-faint">Manquants possibles : {t.missingLabels.slice(0, 6).map((m) => m.nameFr ?? m.name).join(', ')}{t.missingLabels.length > 6 ? '…' : ''}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Statistiques théoriques (indicatif)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted"><th className="py-1">Statistique</th><th>Bonus additifs</th><th>Multiplicateur</th></tr>
                </thead>
                <tbody>
                  {STATS.map(([k, label]) => (
                    <tr key={k} className="border-t border-parchment/5">
                      <td className="py-1.5">{label}</td>
                      <td className={a.stats.additive[k] > 0 ? 'text-ok' : a.stats.additive[k] < 0 ? 'text-blood-bright' : 'text-faint'}>{a.stats.additive[k] > 0 ? '+' : ''}{a.stats.additive[k]}</td>
                      <td className={a.stats.multipliers[k] !== 1 ? 'text-q4' : 'text-faint'}>×{a.stats.multipliers[k]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-faint">{a.disclaimer}</p>
            </Section>
          </div>
          <Section title="Objets qui compléteraient ce build">
            {a.suggestions.length === 0 ? (
              <EmptyState>Aucune suggestion documentée.</EmptyState>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {a.suggestions.map((s) => (
                  <li key={`${s.ref.kind}:${s.ref.key}`} className="rounded-md bg-abyss/40 p-2">
                    <EntityChip kind={s.ref.kind as 'item'} id={s.ref.key} name={s.label.nameFr ?? s.label.name} />
                    <ul className="mt-1 text-xs text-muted">{s.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
