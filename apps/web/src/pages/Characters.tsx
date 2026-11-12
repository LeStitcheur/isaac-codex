import { useState } from 'react';
import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { useMeta, useProgressModel } from '@/lib/queries';
import { Sprite } from '@/components/Sprite';
import { ErrorState, Hearts, Loading, PageHeader, StatusBadge, VersionBadge } from '@/components/common';
import { Progress, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { displayName } from '@/lib/utils';
import { asset, MarkIcon } from '@/lib/game-assets';

export function CharactersPage() {
  const meta = useMeta();
  const { model, progress } = useProgressModel();
  const [tab, setTab] = useState<'normal' | 'tainted'>('normal');
  if (meta.isLoading) return <Loading />;
  if (meta.error || !meta.data) return <ErrorState error={meta.error} />;
  const list = meta.data.characters.filter((c) => c.tainted === (tab === 'tainted'));
  const completionMarks = meta.data.completionMarks.filter((m) => m.mask & (model?.bit ?? 8));
  return (
    <div>
      <PageHeader
        icon={<Users />}
        title="Personnages"
        subtitle="Tous les personnages jouables et leurs versions Tainted (Repentance) : statistiques, objets de départ, marques de complétion et déblocages."
        actions={
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'normal' | 'tainted')}>
            <TabsList>
              <TabsTrigger value="normal">Normaux (17)</TabsTrigger>
              <TabsTrigger value="tainted">Tainted (17)</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c, i) => {
          const marks = model?.stats.byCharacter.find((b) => b.slug === c.slug);
          const unlockStatus = c.unlockAchievementId ? model?.statuses.get(c.unlockAchievementId) : 'unlocked';
          return (
            <Link
              key={c.slug}
              to={`/personnages/${c.slug}`}
              className="panel card-hover flex gap-4 p-4 animate-rise"
              style={{ animationDelay: `${i * 20}ms` }}
              data-testid="character-card"
            >
              <span className="grid size-[76px] shrink-0 place-items-center rounded-xl bg-[radial-gradient(circle_at_50%_40%,#2a1a20,#141920_70%)] ring-1 ring-line">
                <Sprite kind="character" id={c.slug} size={60} className="bg-transparent ring-0" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[15px] font-semibold text-parchment">{displayName(c)}</h2>
                  <VersionBadge mask={c.mask} />
                </div>
                <p className="truncate text-xs text-muted">{displayName(c)}{c.nameFr && c.nameFr !== c.nameEn ? ` · ${c.nameEn}` : ''}</p>
                <div className="mt-2">
                  <Hearts health={c.health} />
                </div>
                {completionMarks.some((m) => asset('marks', m.key)) ? (
                  <div className="mt-3 grid w-max grid-cols-6 gap-[3px]" aria-label={`Marques : ${marks ? `${marks.marks.done}/${marks.marks.total}` : '—'}`}>
                    {completionMarks.map((m) => (
                      <MarkIcon key={m.key} markKey={m.key} state={progress?.marks[c.slug]?.[m.key] ?? 'none'} size={10} title={m.nameFr} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <span className="shrink-0">Marques</span>
                    <Progress value={marks?.marks.pct ?? 0} className="h-1.5" tone="parchment" />
                    <span className="shrink-0">{marks ? `${marks.marks.done}/${marks.marks.total}` : '—'}</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge status={unlockStatus} />
                  <span className="whitespace-nowrap text-xs text-muted">{marks ? `${marks.marks.done}/${marks.marks.total}` : "—"} marques</span>
                  {c.difficulty && <span className="whitespace-nowrap text-xs text-faint">Difficulté {'◆'.repeat(c.difficulty)}{'◇'.repeat(5 - c.difficulty)}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
