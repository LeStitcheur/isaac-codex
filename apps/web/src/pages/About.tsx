import { Link } from 'react-router';
import { Ghost, Info } from 'lucide-react';
import { useMeta } from '@/lib/queries';
import { Loading, PageHeader, Section, StatTile } from '@/components/common';
import { Button } from '@/components/ui';

const COUNT_LABELS: Record<string, string> = {
  items: 'Objets', trinkets: 'Trinkets', consumables: 'Consommables', characters: 'Personnages', achievements: 'Succès',
  markUnlocks: 'Déblocages de marques', transformations: 'Transformations', synergies: 'Synergies & interactions', bosses: 'Boss',
  floors: 'Étages', challenges: 'Défis', guides: 'Guides', plannerPaths: 'Parcours', routes: 'Routes', tips: 'Astuces', pools: "Pools d'objets",
};

export function AboutPage() {
  const meta = useMeta();
  if (meta.isLoading || !meta.data) return <Loading />;
  const m = meta.data.meta;
  return (
    <div className="space-y-5">
      <PageHeader icon={<Info />} title="Sources et à propos" subtitle={meta.data.disclaimer} />
      <Section title="Contenu du Codex">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(m.counts).map(([k, v]) => <StatTile key={k} label={COUNT_LABELS[k] ?? k} value={v} />)}
        </div>
        <p className="mt-3 text-sm text-muted">Jeu de données {m.datasetVersion}, construit le {new Date(m.builtAt).toLocaleDateString('fr-FR')}. Version de référence : Repentance (les différences Repentance+ sont signalées).</p>
      </Section>
      <Section title="Sources et licences">
        <ul className="space-y-3 text-sm">
          {m.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-medium text-parchment underline">{s.name}</a>
              <div className="text-muted">Licence : <a href={s.licenseUrl} className="underline" target="_blank" rel="noreferrer noopener">{s.license}</a> — récupéré le {new Date(s.fetchedAt).toLocaleDateString('fr-FR')} ({s.method}).</div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 text-sm text-muted">
          <p>Les textes de jeu (descriptions, effets, notes, synergies) sont des extraits du wiki communautaire et restent sous licence CC BY-SA 4.0 : chaque fiche cite sa page source et sa révision. Ils sont présentés en anglais, langue de la source ; les noms français proviennent des liens interlangues du wiki quand ils existent.</p>
          <p>Les guides, parcours, astuces, analyses de personnages et traductions d'interface sont rédigés pour Isaac Codex ; les estimations de difficulté sont indicatives.</p>
          <p><strong className="text-ink">Images :</strong> les portraits, noms manuscrits, cœurs, icônes et faces de cartes proviennent des mods « Better Character Menu » et « External Item Descriptions » (graphismes dérivés du jeu, usage personnel). Les objets et trinkets utilisent des emblèmes pixel-art générés, remplaçables par vos propres images dans <code className="rounded bg-abyss px-1">data/sprites</code> (voir README).</p>
          <p>The Binding of Isaac est une œuvre d'Edmund McMillen et Nicalis. Isaac Codex n'est ni affilié, ni approuvé par les détenteurs des droits.</p>
        </div>
      </Section>
      <Section title="Limites connues">
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>Descriptions détaillées en anglais (traductions importables, voir la documentation).</li>
          <li>La classification « familier » est déduite des étiquettes et du texte d'effet.</li>
          <li>Les interactions « possiblement négatives » sont repérées automatiquement dans le texte.</li>
          <li>Le simulateur de build cumule les modificateurs simples : il ne reproduit pas le moteur du jeu.</li>
          <li>Les différences entre plateformes (dont Nintendo Switch) ne sont pas documentées de façon structurée par la source.</li>
        </ul>
      </Section>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Ghost className="mx-auto mb-4 size-14 text-parchment/50" />
      <h1 className="text-3xl text-parchment">Salle vide</h1>
      <p className="mt-2 text-muted">Cette page n'existe pas… ou elle se cache derrière un mur à bombarder.</p>
      <Button asChild className="mt-6"><Link to="/">Retour à l'accueil</Link></Button>
    </div>
  );
}
