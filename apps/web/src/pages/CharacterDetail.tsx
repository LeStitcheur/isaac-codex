import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CharacterSwitcher, characterQuery } from '@/components/CharacterSwitcher';
import { Check, Crown, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Achievement, Character, CompletionMark, MarkKey, MarkUnlock } from '@isaac-codex/shared';
import { api } from '@/lib/api';
import { usePatchProgress, useProgressModel, useRecordView, type CharacterSummary } from '@/lib/queries';
import { Markup } from '@/components/Markup';
import { Sprite } from '@/components/Sprite';
import { EntityChip, ErrorState, Hearts, Loading, PageHeader, Section, SourceNote, StatusBadge, StatusControl, VersionBadge } from '@/components/common';
import { Badge, Button, Tip } from '@/components/ui';
import { cn, displayName } from '@/lib/utils';
import { asset, GameIcon, MarkIcon } from '@/lib/game-assets';

interface CharacterResponse {
  character: Character;
  startingItems: { kind: string; key: string; name: string; nameFr: string | null; exists: boolean }[];
  unlockAchievement: Achievement | null;
  markUnlocks: (MarkUnlock & { achievement: Achievement })[];
  otherAchievements: Achievement[];
  base: CharacterSummary | null;
  tainted: CharacterSummary | null;
  completionMarks: CompletionMark[];
}

const STAT_LABELS: [keyof Character['stats'], string][] = [
  ['damage', 'Dégâts'],
  ['tears', 'Cadence (tears)'],
  ['speed', 'Vitesse'],
  ['range', 'Portée'],
  ['shotSpeed', 'Vitesse des tirs'],
  ['luck', 'Chance'],
];

/** Cycle d'une marque : aucune → normal → difficile → aucune. */
function MarkCell({ slug, mark, value }: { slug: string; mark: CompletionMark; value: 'normal' | 'hard' | undefined }) {
  const patch = usePatchProgress();
  const next = value === undefined ? 'normal' : value === 'normal' ? 'hard' : null;
  return (
    <button
      onClick={() => patch.mutate({ marks: [{ characterSlug: slug, markKey: mark.key, difficulty: next }] })}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-xs font-semibold transition-colors',
        value === 'hard' && 'border-[#66313f] bg-[#391c27] text-[#ff839b]',
        value === 'normal' && 'border-[#46576a] bg-surface-2 text-parchment',
        !value && 'border-line bg-[#141920] text-faint hover:border-[#3d4856]',
      )}
      aria-label={`${mark.nameFr} : ${value === 'hard' ? 'difficile' : value === 'normal' ? 'normal' : 'non obtenue'} (cliquer pour changer)`}
      data-testid={`mark-${mark.key}`}
      data-state={value ?? 'none'}
    >
      {asset('marks', mark.key) ? <MarkIcon markKey={mark.key} state={value ?? 'none'} size={16} /> : value ? <Check className="size-4" /> : '—'}
      {value === 'hard' ? mark.hardLabelFr : value === 'normal' ? 'Normal' : 'Non obtenue'}
    </button>
  );
}

export function CharacterDetailPage() {
  const { slug = '' } = useParams();
  // L'ancienne fiche reste affichée pendant le chargement de la suivante : pas d'écran vide entre deux personnages.
  const q = useQuery({ ...characterQuery<CharacterResponse>(slug), placeholderData: keepPreviousData });
  const { model, progress } = useProgressModel();
  const recordView = useRecordView();
  useEffect(() => {
    if (q.data) recordView('character', slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.character.slug]);

  if (q.isLoading) return <div className="space-y-5"><CharacterSwitcher slug={slug} /><Loading /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const { character: c, markUnlocks, completionMarks } = q.data;
  const bit = model?.bit ?? 8;
  const marks = completionMarks.filter((m) => m.mask & bit);
  const charMarks = progress?.marks[c.slug] ?? {};
  const unlockStatus = c.unlockAchievementId ? model?.statuses.get(c.unlockAchievementId) : 'unlocked';
  const unlocksByMark = (key: MarkKey) => markUnlocks.filter((m) => m.marks.includes(key));

  return (
    <div className={cn('space-y-5 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
      <CharacterSwitcher slug={slug} />
      <PageHeader
        kicker={c.tainted ? 'Personnage Tainted' : 'Personnage'}
        title={
          <span className="flex items-center gap-4">
            <Sprite kind="character" id={c.slug} size={84} className="bg-transparent ring-0 drop-shadow-[3px_4px_0_rgb(0_0_0/0.6)]" />
            <span>
              <span className="block">{displayName(c)}</span>
              {c.nameFr && c.nameFr !== c.nameEn && <span className="block text-base text-muted">{c.nameFr}</span>}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <VersionBadge mask={c.mask} />
            {q.data.tainted && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/personnages/${q.data.tainted.slug}`}>Version Tainted →</Link>
              </Button>
            )}
            {q.data.base && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/personnages/${q.data.base.slug}`}>← {displayName(q.data.base)}</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Déblocage">
          {q.data.unlockAchievement ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={unlockStatus} />
                <Link to={`/succes/${q.data.unlockAchievement.id}`} className="text-sm text-parchment hover:underline">
                  Succès « {q.data.unlockAchievement.name} »
                </Link>
              </div>
              <Markup text={q.data.unlockAchievement.requirement} />
              <StatusControl achievementId={q.data.unlockAchievement.id} status={unlockStatus} compact />
            </div>
          ) : (
            <p className="text-muted">Disponible dès le départ.</p>
          )}
        </Section>

        <Section title="Statistiques initiales">
          <div className="mb-3">
            <Hearts health={c.health} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {STAT_LABELS.map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="flex items-center gap-1.5 text-muted"><GameIcon src={asset('stats', k)} size={14} />{label}</dt>
                <dd className="text-right font-display text-parchment">{c.stats[k] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {c.forms.length > 0 && <p className="mt-3 text-xs text-muted">Formes : {c.forms.join(', ')}</p>}
        </Section>

        <Section title="Objets de départ">
          {q.data.startingItems.length ? (
            <div className="flex flex-wrap gap-2">
              {q.data.startingItems.map((s) => (
                <EntityChip key={`${s.kind}:${s.key}`} kind={s.kind as 'item'} id={s.key} name={s.name} />
              ))}
            </div>
          ) : (
            <p className="text-muted">Aucun objet fixe.</p>
          )}
          {c.startingText && q.data.startingItems.length === 0 && <Markup text={c.startingText} className="mt-3 text-sm text-muted" />}
          {c.pickups && <Markup text={`Consommables : ${c.pickups.replace(/\n/g, ', ')}`} className="mt-2 text-sm text-muted" />}
        </Section>
      </div>

      {c.editorial && (
        <Section
          title="Analyse"
          actions={
            <Tip content="Appréciation éditoriale, pas une donnée du jeu">
              <Badge variant="parchment" className="cursor-help">
                Difficulté indicative {c.editorial.difficulty}/5
              </Badge>
            </Tip>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm text-ok"><ThumbsUp className="size-4" /> Forces</h3>
              <ul className="space-y-1">{c.editorial.strengths.map((s) => <li key={s}><Markup text={`* ${s}`} /></li>)}</ul>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm text-blood-bright"><ThumbsDown className="size-4" /> Faiblesses</h3>
              <ul className="space-y-1">{c.editorial.weaknesses.map((s) => <li key={s}><Markup text={`* ${s}`} /></li>)}</ul>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm text-q4"><Crown className="size-4" /> Stratégies recommandées</h3>
              <ul className="space-y-1">{c.editorial.tips.map((s) => <li key={s}><Markup text={`* ${s}`} /></li>)}</ul>
            </div>
          </div>
        </Section>
      )}

      <Section
        title="Marques de complétion"
        id="marques"
        actions={<span className="text-xs text-muted">Cliquez pour cycler : non obtenue → normal → difficile</span>}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {marks.map((m) => {
            const unlocks = unlocksByMark(m.key);
            return (
              <div key={m.key} className="rounded-xl border border-line bg-[#141920] p-3.5" data-testid="mark-row">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <MarkIcon markKey={m.key} state="hard" size={24} title={m.boss} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-parchment">{m.nameFr}</div>
                      <div className="text-xs text-faint">{m.description}</div>
                    </div>
                  </div>
                  <VersionBadge mask={m.mask} />
                </div>
                <MarkCell slug={c.slug} mark={m} value={charMarks[m.key]} />
                <div className="mt-2 space-y-1">
                  {unlocks.length === 0 && <p className="text-xs text-faint">Aucun déblocage associé pour ce personnage.</p>}
                  {unlocks.map((u) => (
                    <Link key={u.achievementId} to={`/succes/${u.achievementId}`} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
                      <span className="min-w-0 truncate">
                        {u.achievement.name}
                        {u.hard && <span className="ml-1 text-xs text-blood-bright">(difficile)</span>}
                        {u.marks.length > 1 && (
                          <Tip content={`Nécessite aussi : ${u.marks.filter((k) => k !== m.key).map((k) => completionMarks.find((x) => x.key === k)?.nameFr).join(', ')}`}>
                            <span className="ml-1 cursor-help text-xs text-q4">+{u.marks.length - 1}</span>
                          </Tip>
                        )}
                      </span>
                      <StatusBadge status={model?.statuses.get(u.achievementId)} />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {q.data.otherAchievements.length > 0 && (
        <Section title="Autres déblocages liés à ce personnage">
          <ul className="divide-y divide-parchment/5">
            {q.data.otherAchievements.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={`/succes/${a.id}`} className="text-parchment hover:underline">{a.name}</Link>
                  <Markup text={a.requirement} inline className="block text-sm text-muted" />
                </div>
                <StatusBadge status={model?.statuses.get(a.id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(c.strategy || c.notes) && (
        <Section title="Notes du wiki (anglais)" actions={<span className="flex items-center gap-1 text-xs text-faint"><ShieldAlert className="size-3" /> texte source non traduit</span>}>
          {c.strategy && <Markup text={c.strategy} className="mb-4" />}
          <details>
            <summary className="cursor-pointer text-sm text-muted">Afficher les notes détaillées</summary>
            <Markup text={c.notes} className="mt-3 text-sm" />
          </details>
        </Section>
      )}
      <SourceNote source={c.source} />
    </div>
  );
}
