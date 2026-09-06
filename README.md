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
- `src/utils/` — calcul des semaines ISO, calcul des horaires/heures, calcul de l'effectif visible
  d'une semaine.
- `src/styles/` — `main.css` (variables + mise en page) et `print.css` (impression A4 paysage).
- `src/main.js` — routeur minimal basé sur le hash de l'URL (`#/planning?annee=…&semaine=…`), et
  point d'entrée de la vérification de version des données au démarrage.

Toutes les données vivent dans IndexedDB. Réglages → Exporter/Importer sert de sauvegarde unique.

## Modèle de données (version 4)

Quatre tables Dexie, plus une table `meta` (clé/valeur) :

- `employes` — `{ nom, prenom, debutCle, finCle, semaineType }`. `semaineType` est un tableau de
  7 entrées (dimanche → samedi), chacune `null` (jour non défini) ou
  `{ statutId, heureDebut, heureFin }`. `debutCle`/`finCle` sont des `number | null` : la clé
  (voir plus bas) de la première et de la dernière semaine où l'employé appartient à l'effectif
  par défaut. `null` = sans borne dans cette direction. Il n'y a pas de champ `actif` : la
  présence d'un employé est une question de semaine, pas un booléen global.
- `statuts` — les six statuts fixes (Travaillé, Repos, CP, Maladie, Formation, Férié), non
  configurables.
- `semaines` — `{ annee, numeroSemaine, archivee, notes, retires, ajoutes }`. `numeroSemaine` est
  le numéro ISO 8601 (lundi → dimanche) de la portion lundi→samedi que contient la semaine
  commerciale (dimanche → samedi) — voir `src/utils/semaine.js`. `retires`/`ajoutes` sont des
  tableaux d'`employeId` (par défaut `[]`) : des exceptions ponctuelles à l'effectif par défaut de
  cette semaine (voir « Effectif d'une semaine » ci-dessous). Une semaine n'existe en base que si
  elle a déjà été écrite (case, notes, archivage, exception d'effectif) : la navigation seule ne
  crée aucune ligne.
- `cases` — `{ semaineId, employeId, jour, statutId, heureDebut, heureFin }`. `jour` va de 0
  (dimanche) à 6 (samedi). Une journée « Travaillé » est un statut + une heure de début + une
  heure de fin, rien de plus. **Aucune action de l'application ne supprime la case d'un employé
  parce qu'il a quitté l'équipe ou a été retiré d'une semaine** : archiver un employé ou le
  retirer d'une semaine ne fait qu'ajuster sa visibilité, jamais ses données. Seul un vrai
  « Vider » sur une case précise, action volontaire de l'utilisateur, l'efface.
- `meta` — table clé/valeur ; contient l'entrée `versionDonnees`.

### Effectif d'une semaine

L'effectif n'est plus un filtre global (`employes.filter(e => e.actif)`) mais une propriété de
chaque semaine, calculée par la fonction pure `effectifVisible` (`src/utils/effectif.js`) et
utilisée par tous les écrans sans exception. Pour une semaine de clé `cleW` (voir
`cleSemaine(annee, numero)`, seul mode de comparaison entre deux semaines), un employé est
visible si et seulement s'il n'est **pas** dans `semaine.retires`, et qu'au moins une de ces
conditions est vraie :

1. il a au moins une case dans cette semaine (vérité historique) ;
2. il est dans `semaine.ajoutes` (rattrapage rétroactif explicite) ;
3. il est dans sa période de présence par défaut : `(debutCle == null || cleW >= debutCle) &&
   (finCle == null || cleW <= finCle)`.

`retires` l'emporte sur tout le reste, y compris sur l'existence de cases : c'est ce qui permet
de masquer un employé d'une semaine précise sans toucher à ses horaires. Un employé visible
seulement via la condition 1 ou 2 (donc hors de sa période) est signalé `horsEffectif` : c'est le
cas d'un collaborateur parti, consulté sur une semaine où il travaillait encore — sa ligne
apparaît grisée mais reste entièrement modifiable tant que la semaine n'est pas archivée.

Archiver un employé (écran Employés) pose `finCle` à la clé de la semaine *précédant* la semaine
courante : il disparaît donc de la semaine courante et des semaines futures, mais reste visible
normalement sur les semaines où il était présent. Une nouvelle recrue reçoit `debutCle` = clé de
la semaine courante et n'apparaît sur aucune semaine antérieure, sauf ajout explicite via
« Ajouter à la semaine ».

## Versionnement des données

Le format des données a une version numérique (`versionDonnees`), stockée dans la table `meta`
**et** dans chaque fichier exporté. C'est un mécanisme distinct de la version du schéma Dexie :
le schéma Dexie versionne les tables et les index (`db.version(n).stores(...)`), tandis que
`versionDonnees` versionne le contenu (la forme des enregistrements).

Cette séparation est ce qui rend l'export/import fiable : une sauvegarde JSON, quelle que soit
son ancienneté, porte sa propre version et peut donc être migrée puis réimportée sans perte ni
décalage — y compris après plusieurs mises à jour de l'application entre-temps.

`src/db/migrations.js` contient :
- les fonctions de migration, pures (`migrer1vers2`, `migrer2vers3`, `migrer3vers4`), qui
  prennent et rendent un jeu de données complet `{ employes, statuts, semaines, cases }` ;
  `migrer3vers4` fait passer l'effectif d'un filtre global (`employes.actif`) à une propriété de
  chaque semaine (`debutCle`/`finCle` par employé, `retires`/`ajoutes` par semaine — voir
  « Effectif d'une semaine » ci-dessus) ;
- l'orchestration côté démarrage (`verifierVersionDonnees`, `executerMigrationDemarrage`) : si la
  version en base est inférieure à la version courante, une sauvegarde JSON est téléchargée
  avant toute modification, puis les données sont migrées et réécrites en une seule transaction.

Le même jeu de fonctions de migration sert à l'import d'un fichier JSON (`src/db/backup.js`,
`importerDonnees`) : un fichier plus ancien que la version courante est migré à la volée avant
d'être chargé ; un fichier plus récent que l'application est refusé.
