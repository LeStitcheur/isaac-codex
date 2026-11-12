# Rapport de couverture des données

> Généré automatiquement par `npm run data:build` le 2026-11-08.
> Version du jeu de données : `23b0509170a332e1` — données brutes récupérées le 2026-11-08.

## Source et licence

- **The Binding of Isaac: Rebirth Wiki** — https://bindingofisaacrebirth.wiki.gg/
- Licence : **Creative Commons Attribution-ShareAlike 4.0 License** (https://creativecommons.org/licenses/by-sa/4.0). Les textes de jeu (descriptions, effets, notes, synergies)
  sont des extraits de ce wiki : ils restent sous CC BY-SA 4.0 et chaque fiche indique sa page source et sa révision.
- Méthode : API MediaWiki (action=cargoquery, action=query&prop=revisions), ~1 requête/s. Aucune page HTML n'a été aspirée : seules les tables Cargo et les sections utiles des pages ont été extraites.
- **Sprites : aucun.** Les images du jeu appartiennent à leurs ayants droit. L'application génère des emblèmes
  pixel-art neutres et accepte des sprites fournis légalement par l'utilisateur (voir README).

## Volumes

| Catégorie | Entrées | Remarques |
|---|---:|---|
| Objets (collectibles) | 718 | qualité : 100 % ; nom FR : 85 % ; pools : 97 % ; effets détaillés : 100 % |
| Trinkets | 188 | nom FR : 94 % ; effets détaillés : 100 % |
| Consommables | 147 | cartes/runes/pierres d'âme/autres : 97, pilules : 50 |
| Personnages | 34 | dont 17 Tainted ; avis éditorial : 34 |
| Succès | 641 | liés à une marque : 340 ; paliers de dons : 22 ; défis : 46 |
| Déblocages de marques (personnage × marque) | 340 | issus du tableau « Completion Marks » du wiki |
| Transformations | 16 | |
| Synergies / interactions | 7052 | synergies : 3355, interactions : 3697 (dont 1705 signalées « possiblement négatives » par heuristique) |
| Boss et mini-boss | 123 | PV renseignés : 107 |
| Étages | 27 | |
| Défis (challenges) | 45 | |
| Guides (rédaction française) | 14 | |
| Parcours du planificateur | 7 | |
| Routes | 6 | |
| Astuces | 25 | |

## Déblocages de marques par personnage

| Personnage | Déblocages liés aux marques | Avis éditorial |
|---|---:|---|
| Isaac | 13 | oui |
| Magdalene | 13 | oui |
| Cain | 13 | oui |
| Judas | 13 | oui |
| ??? | 13 | oui |
| Eve | 13 | oui |
| Samson | 13 | oui |
| Azazel | 13 | oui |
| Lazarus | 13 | oui |
| Eden | 13 | oui |
| The Lost | 13 | oui |
| Lilith | 13 | oui |
| Keeper | 13 | oui |
| Apollyon | 13 | oui |
| The Forgotten | 13 | oui |
| Bethany | 13 | oui |
| Jacob & Esau | 13 | oui |
| Tainted Isaac | 7 | oui |
| Tainted Magdalene | 7 | oui |
| Tainted Cain | 7 | oui |
| Tainted Judas | 7 | oui |
| Tainted ??? | 7 | oui |
| Tainted Eve | 7 | oui |
| Tainted Samson | 7 | oui |
| Tainted Azazel | 7 | oui |
| Tainted Lazarus | 7 | oui |
| Tainted Eden | 7 | oui |
| Tainted Lilith | 7 | oui |
| Tainted Keeper | 7 | oui |
| Tainted Apollyon | 7 | oui |
| Tainted Bethany | 7 | oui |
| Tainted Jacob | 7 | oui |
| Tainted Forgotten | 7 | oui |
| Tainted Lost | 7 | oui |

## Limites connues

- **Traductions françaises** : les noms français proviennent des liens interlangues du wiki (wiki francophone communautaire) quand ils existent ;
  sinon le nom anglais est affiché. Les descriptions, effets et notes restent en **anglais** (langue de la source) ; l'interface,
  les guides, les parcours et les astuces sont rédigés en français. Des traductions peuvent être importées (voir `docs/IMPORT-DONNEES.md`).
- **Familiers** : le wiki n'expose pas de champ « familier » ; la classification est déduite des tags (baby, monstermanual, uniquefamiliar)
  et du texte d'effet. Elle peut contenir quelques erreurs.
- **Interactions négatives** : le wiki ne distingue pas synergies et anti-synergies ; les interactions dont le texte contient des
  formulations négatives sont signalées « possiblement négatives » (heuristique, affichée comme telle dans l'interface).
- **Difficulté des succès** : estimation calculée (marque, mode difficile, personnage) — ce n'est pas une donnée du jeu.
- **Points de vie des boss** : renseignés uniquement quand la page du boss n'en décrit qu'un seul.
- **Plateformes** : le wiki ne documente pas les différences par console de manière structurée. La Nintendo Switch reçoit les mêmes
  extensions (Repentance puis Repentance+) ; aucune différence de contenu par plateforme n'est affirmée sans source.
- Liens internes non résolus (convertis en texte simple) : 39.

## Avertissements de construction

- Objet « Tonsil » (ID 474, masque 4) non inclus : identifiant réutilisé par « Broken Glass Cannon » dans la version de référence.
