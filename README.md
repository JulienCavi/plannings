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

## Tests

```bash
npm test
```

Tests automatiques des fonctions pures (durées, lecture des heures tapées, semaines, effectif,
migrations v1 → v4), lancés avec le lanceur intégré à Node : aucune dépendance en plus. Pour
vérifier en prime un vrai fichier d'export :

```bash
EXPORT_REEL=chemin/vers/planning-manager-….json npm test
```

Les fichiers d'export contiennent des données personnelles : ils sont exclus du dépôt par le
`.gitignore` et doivent être rangés hors de ce dossier.

## Architecture

- `src/db/` — accès aux données (Dexie/IndexedDB) : employés, statuts, semaines, cases, backup,
  migrations.
- `src/views/` — un module par écran (`planning`, `employes`, `archives`, `reglages`, `export`),
  chacun exporte une fonction `afficher(conteneur, params)` qui construit le DOM directement
  (pas de framework, pas de virtual DOM).
- `src/utils/` — calcul des semaines ISO, calcul des horaires/heures et lecture des heures tapées
  librement (`analyserHeure`), calcul de l'effectif visible d'une semaine, créneaux proposés en un
  clic (`creneaux.js`), sauvegarde différée des notes (`differe.js`).
- `src/ui/` — briques d'interface partagées par les écrans : création d'éléments (`dom.js`),
  boîtes de dialogue et confirmation (`dialogue.js`), bulle de saisie et menus (`flottant.js`),
  messages brefs (`toast.js`).
- `tests/` — tests automatiques (`npm test`).
- `src/styles/` — `main.css` (variables + mise en page) et `print.css` (impression A4 paysage).
- `src/main.js` — routeur minimal basé sur le hash de l'URL (`#/planning?annee=…&semaine=…`), et
  point d'entrée de la vérification de version des données au démarrage. Chaque écran se construit
  dans un conteneur détaché, mis en place seulement s'il correspond encore à la dernière navigation
  demandée. Toute erreur non traitée est affichée à l'écran.

## Écran Planning

- **Saisie d'une case** : la bulle propose les créneaux en un clic (le créneau habituel de la
  personne ce jour-là d'après sa semaine type, puis les plus fréquents des douze dernières semaines
  renseignées), deux champs d'heure en saisie libre (« 1330 », « 13h30 », « 13 »), et les statuts.
  Les champs d'heure ne sont enregistrés qu'à la validation : Entrée, bouton OK, ou clic en dehors
  quand les deux heures sont valides. Échap annule. Seule la case modifiée est repeinte, avec le
  total de la ligne et le pied de grille.
- **Actions d'une ligne** (menu « ⋯ ») : appliquer la semaine type, semaine entière en absence
  (statut + jours cochés), vider la semaine de la personne, la retirer de la semaine.
- **Semaines types** : remplit la grille avec la semaine type de toute l'équipe ; sur une semaine
  déjà entamée, complète les cases vides ou remplace, au choix.
- **Dupliquer** : copie par défaut les jours travaillés et les repos ; une case à cocher ajoute les
  absences (CP, maladie, formation, férié).
- **Pied de grille** : nombre de personnes présentes par jour et total d'heures de l'équipe.
- **Notes** : enregistrées pendant la frappe. Les notes de la semaine vivent dans `semaines.notes` ;
  le pense-bête, affiché sur toutes les semaines, vit dans la table `meta`.

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
- `meta` — table clé/valeur ; contient l'entrée `versionDonnees`, plus deux réglages hors format
  versionné : `pensebete` (le pense-bête permanent) et `dernierExport` (date du dernier export, pour
  le rappel de sauvegarde sur l'onglet Réglages).

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
seulement via la condition 1 ou 2 (donc hors de sa période) est signalé `horsEffectif`, avec un
`motif` : `'apres'` pour un collaborateur parti, consulté sur une semaine où il travaillait encore
(ligne grisée, mention « parti », en fin de liste) ; `'avant'` pour une recrue ajoutée à une semaine
antérieure à son arrivée (mention « ajouté », ligne normale). Dans les deux cas la ligne reste
entièrement modifiable tant que la semaine n'est pas archivée.

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

Quand la base contient déjà des données, l'import télécharge d'abord une copie de l'état actuel
(`planning-manager-avant-import-….json`). Le fichier exporté peut porter un champ optionnel
`pensebete` : il ne fait pas partie du format versionné, et une version de l'application qui ne le
connaît pas l'ignore à l'import.
