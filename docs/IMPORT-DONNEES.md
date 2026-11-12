# Données du jeu : sources, régénération et import

## Chaîne de données

```
wiki.gg (API Cargo + révisions)  ──npm run data:fetch──▶  packages/game-data/raw/*.json      (cache brut + manifest)
packages/game-data/curated/*.json (rédaction française)  ─┐
                                                         ├─npm run data:build──▶ packages/game-data/generated/dataset.json
                                                         │                       docs/COUVERTURE-DONNEES.md
dataset.json ──(démarrage du serveur, si nouvelle version)──▶ SQLite (tables normalisées)
```

- **Source** : The Binding of Isaac: Rebirth Wiki (wiki.gg), licence **CC BY-SA 4.0** vérifiée via l'API `siteinfo` ; `robots.txt` autorise l'usage de référence (`use=reference`). Récupération par l'API officielle (pas de scraping HTML), environ 1 requête par seconde, une centaine de requêtes au total.
- **Traçabilité** : chaque entité porte `source` (page, révision, date de vérification, niveau de confiance). La table `sources` garde l'historique des imports.
- **Validation** : `dataset.json` est validé par les schémas Zod (`packages/shared/src/game-schema.ts`) à la construction **et** à l'import en base. Les contenus éditoriaux référencent les succès par leur nom : un nom inconnu fait échouer la construction.
- **Déduplication** : identifiants d'objets réutilisés entre versions (ex. ID 474), slugs en double (cartes inversées « ? »), lignes Cargo multiples par version : voir les règles dans `scripts/data/build-dataset.ts` et les avertissements du rapport de couverture.

## Régénérer les données

```bash
npm run data:fetch            # utilise le cache ; « -- --force » pour tout récupérer à nouveau
npm run data:build            # reconstruit dataset.json + docs/COUVERTURE-DONNEES.md
npm start                     # la nouvelle version est importée automatiquement (profils intacts)
```

## Importer des traductions (JSON ou CSV)

Les descriptions sont en anglais (langue de la source). Vous pouvez importer des traductions françaises que vous avez le droit d'utiliser :

```csv
entity_kind,entity_key,field,lang,value,source
item,118,name,fr,Soufre,ma traduction
item,118,description,fr,Remplace les larmes par un laser de sang chargé.,ma traduction
character,isaac,name,fr,Isaac,ma traduction
```

- `entity_kind` : item, trinket, consumable, character, boss, floor, transformation
- `entity_key` : identifiant numérique (objets, trinkets) ou slug (visible dans l'URL de la fiche)
- `field` : `name` ou `description` ; `lang` : `fr`
- JSON accepté : tableau d'objets avec les mêmes clés, ou `{ "translations": [...] }`.

```bash
npm run data:import -- traductions.csv --dry-run                          # validation sans écriture
npm run data:import -- traductions.csv --db data/isaac-codex.sqlite        # import
```

Chaque ligne est validée (Zod) ; les erreurs sont listées par numéro de ligne, les doublons fusionnés (la dernière occurrence l'emporte) et les entités inconnues ignorées. Redémarrez le serveur pour afficher les traductions. Elles sont stockées dans la table `translations`, qui n'est jamais effacée par la réimportation des données du jeu.

## Sprites

Aucun sprite officiel n'est distribué. Voir [`data/sprites/README.md`](../data/sprites/README.md) pour ajouter des images obtenues légalement.
