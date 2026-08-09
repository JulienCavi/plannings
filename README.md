# Planning Manager

Outil personnel et mono-poste pour monter le planning hebdomadaire d'une équipe, calculer les
heures automatiquement et sortir un aperçu propre pour l'équipe. 100 % local (IndexedDB via
Dexie), aucun backend, aucun compte.

## Lancement

```bash
npm install
npm run dev
```

## Build de production

```bash
npm run build
npm run preview
```

## Architecture

- `src/db/` — accès aux données (Dexie/IndexedDB) : employés, statuts, semaines, cases, backup,
  migrations.
- `src/views/` — un module par écran (`planning`, `employes`, `archives`, `reglages`, `export`),
  chacun exporte une fonction `afficher(conteneur, params)` qui construit le DOM directement
  (pas de framework, pas de virtual DOM).
- `src/utils/` — calcul des semaines ISO, calcul des horaires/heures.
- `src/styles/` — `main.css` (variables + mise en page) et `print.css` (impression A4 paysage).
- `src/main.js` — routeur minimal basé sur le hash de l'URL (`#/planning?annee=…&semaine=…`), et
  point d'entrée de la vérification de version des données au démarrage.

Toutes les données vivent dans IndexedDB. Réglages → Exporter/Importer sert de sauvegarde unique.

## Modèle de données

Quatre tables Dexie, plus une table `meta` (clé/valeur) :

- `employes` — `{ nom, prenom, actif, semaineType }`. `semaineType` est un tableau de 7 entrées
  (dimanche → samedi), chacune `null` (jour non défini) ou `{ statutId, heureDebut, heureFin }`.
- `statuts` — les six statuts fixes (Travaillé, Repos, CP, Maladie, Formation, Férié), non
  configurables.
- `semaines` — `{ annee, numeroSemaine, archivee, notes }`. `numeroSemaine` est le numéro ISO
  8601 (lundi → dimanche) de la portion lundi→samedi que contient la semaine commerciale
  (dimanche → samedi) — voir `src/utils/semaine.js`. Une semaine n'existe en base que si elle a
  déjà été écrite (case, notes, archivage) : la navigation seule ne crée aucune ligne.
- `cases` — `{ semaineId, employeId, jour, statutId, heureDebut, heureFin }`. `jour` va de 0
  (dimanche) à 6 (samedi). Une journée « Travaillé » est un statut + une heure de début + une
  heure de fin, rien de plus.
- `meta` — table clé/valeur ; contient l'entrée `versionDonnees`.

## Versionnement des données

Le format des données a une version numérique (`versionDonnees`), stockée dans la table `meta`
**et** dans chaque fichier exporté. C'est un mécanisme distinct de la version du schéma Dexie :
le schéma Dexie versionne les tables et les index (`db.version(n).stores(...)`), tandis que
`versionDonnees` versionne le contenu (la forme des enregistrements).

Cette séparation est ce qui rend l'export/import fiable : une sauvegarde JSON, quelle que soit
son ancienneté, porte sa propre version et peut donc être migrée puis réimportée sans perte ni
décalage — y compris après plusieurs mises à jour de l'application entre-temps.

`src/db/migrations.js` contient :
- les fonctions de migration, pures (`migrer1vers2`, `migrer2vers3`), qui prennent et rendent un
  jeu de données complet `{ employes, statuts, semaines, cases }` ;
- l'orchestration côté démarrage (`verifierVersionDonnees`, `executerMigrationDemarrage`) : si la
  version en base est inférieure à la version courante, une sauvegarde JSON est téléchargée
  avant toute modification, puis les données sont migrées et réécrites en une seule transaction.

Le même jeu de fonctions de migration sert à l'import d'un fichier JSON (`src/db/backup.js`,
`importerDonnees`) : un fichier plus ancien que la version courante est migré à la volée avant
d'être chargé ; un fichier plus récent que l'application est refusé.
