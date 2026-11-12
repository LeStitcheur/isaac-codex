import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Circle, Coins, Minus, Plus } from 'lucide-react';
import { nextMilestone, type DonationMilestone } from '@isaac-codex/shared';
import { useMeta, usePatchProgress, useProgressModel } from '@/lib/queries';
import { ErrorState, Loading, PageHeader, Section, StatTile } from '@/components/common';
import { Button, Input, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { asset, GameIcon } from '@/lib/game-assets';

const MACHINES = {
  donation: {
    title: 'Donation Machine',
    max: 999,
    guide: 'optimiser-donation-machine',
    how: [
      "Présente dans presque toutes les boutiques (plus rarement Black Market, Arcade, Vault).",
      'Le total est conservé entre les parties ; 999 pièces au maximum.',
      'Repentance : 0,15 % de risque de blocage au premier don, +0,15 % par pièce donnée sur le même étage → répartissez vos dons sur plusieurs étages.',
      'Ne donnez jamais une 1000e pièce : la machine explose et le compteur revient à 0.',
      'Repentance : faire exploser la machine est une perte nette (pièces déduites du total).',
    ],
  },
  greed: {
    title: 'Greed Donation Machine',
    max: 1000,
    guide: 'optimiser-greed-donation-machine',
    how: [
      "Apparaît après chaque combat contre Ultra Greed (modes Greed et Greedier).",
      'Le risque de blocage dépend du total déjà donné avec le personnage qui touche la machine (0 % sous 55 pièces).',
      'En Greedier, le risque est plafonné à 1 % : idéal une fois débloqué (500 pièces).',
      'Le 1000e don fait exploser la machine mais il est nécessaire : il débloque Keeper.',
    ],
  },
} as const;

function MachineCard({ machine, milestones, coins }: { machine: 'donation' | 'greed'; milestones: DonationMilestone[]; coins: number }) {
  const patch = usePatchProgress();
  const cfg = MACHINES[machine];
  const [value, setValue] = useState(String(coins));
  useEffect(() => setValue(String(coins)), [coins]);
  const info = nextMilestone(milestones, machine, coins);
  const save = (n: number) => {
    const v = Math.max(0, Math.min(cfg.max, Math.round(n)));
    patch.mutate({ donations: { [machine]: v } });
  };
  const list = milestones.filter((m) => m.machine === machine);
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <GameIcon src={asset('machines', 'donation')} size={26} />
          {cfg.title}
        </span>
      }
      actions={<Link to={`/guides/${cfg.guide}`} className="text-sm text-muted hover:text-ink">Guide →</Link>}
    >
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Pièces déposées" value={coins} sub={`sur ${cfg.max}`} tone="blood" />
        <StatTile label="Prochain palier" value={info.next ? info.next.coins : '—'} sub={info.next ? `encore ${info.remaining} pièce${info.remaining > 1 ? 's' : ''}` : 'Tous les paliers atteints'} />
      </div>
      <Progress value={info.pct} className="mt-4" />
      {info.next && (
        <p className="mt-2 text-sm">
          Récompense suivante : <Link to={`/succes/${info.next.achievementId}`} className="text-parchment hover:underline">{info.next.label}</Link>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => save(coins - 1)} aria-label="Retirer une pièce"><Minus /></Button>
        <Input
          type="number"
          min={0}
          max={cfg.max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(Number(value) || 0)}
          onKeyDown={(e) => e.key === 'Enter' && save(Number(value) || 0)}
          className="w-28 text-center font-display"
          aria-label={`Pièces déposées dans la ${cfg.title}`}
          data-testid={`donation-input-${machine}`}
        />
        <Button variant="outline" size="icon" onClick={() => save(coins + 1)} aria-label="Ajouter une pièce"><Plus /></Button>
        {[5, 10, 50].map((n) => (
          <Button key={n} variant="subtle" size="sm" onClick={() => save(coins + n)}>+{n}</Button>
        ))}
      </div>
      <ol className="mt-5 space-y-1.5" data-testid={`milestones-${machine}`}>
        {list.map((m) => {
          const reached = coins >= m.coins;
          return (
            <li key={m.coins} className={cn('flex items-center gap-3 rounded-md px-2 py-1.5', reached ? 'bg-ok/10' : info.next?.coins === m.coins ? 'bg-blood/10 ring-1 ring-blood/30' : '')}>
              {reached ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <Circle className="size-4 shrink-0 text-faint" />}
              <span className="w-12 font-display text-parchment">{m.coins}</span>
              <Link to={`/succes/${m.achievementId}`} className="hover:underline">{m.label}</Link>
            </li>
          );
        })}
      </ol>
      <ul className="mt-5 space-y-1 border-t border-parchment/10 pt-3 text-sm text-muted">
        {cfg.how.map((h) => <li key={h}>• {h}</li>)}
      </ul>
    </Section>
  );
}

export function DonationsPage() {
  const meta = useMeta();
  const { progress, isLoading, error } = useProgressModel();
  if (isLoading || meta.isLoading) return <Loading />;
  if (error || !progress || !meta.data) return <ErrorState error={error ?? meta.error} />;
  return (
    <div>
      <PageHeader
        icon={<Coins />}
        title="Machines de dons"
        subtitle="Indiquez le nombre de pièces affiché sur chaque machine : le Codex calcule les paliers atteints, la prochaine récompense et met à jour vos déblocages."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <MachineCard machine="donation" milestones={meta.data.donationMilestones} coins={progress.donations.donation} />
        <MachineCard machine="greed" milestones={meta.data.donationMilestones} coins={progress.donations.greed} />
      </div>
    </div>
  );
}
