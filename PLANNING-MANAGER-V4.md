# Planning Manager — V4 : simplification du modèle et correction de bugs

## Comment tu dois travailler

Avant d'écrire la moindre ligne, **relis intégralement le code existant** : `src/main.js`,
`src/db/*`, `src/views/*`, `src/utils/*`, `src/styles/*`, `index.html`, `README.md`. Tu dois
être capable de résumer le rôle de chaque fichier et le flux de données complet avant de
toucher à quoi que ce soit.

Ensuite, **ne rustine pas**. Cette V4 retire deux concepts du modèle de données et corrige
quatre défauts structurels : la bonne approche est de réécrire proprement les fichiers
concernés, pas d'ajouter des conditions autour du code actuel. Si un module devient plus
simple, il doit finir plus court, pas plus long.

Commence par me présenter ton plan (fichiers touchés, ordre d'exécution) avant d'attaquer.

---

## Ce qui ne change pas

- SPA Vanilla JS + Vite, **Dexie comme seule dépendance runtime**. Aucune nouvelle dépendance,
  aucun framework, aucune librairie PDF, aucun utilitaire de dates.
- Mono-poste, 100 % local, IndexedDB. Aucun backend, aucun compte, aucune synchronisation.
- Semaine **dimanche → samedi**, numérotée avec le numéro ISO de la portion lundi→samedi
  qu'elle contient. La logique de `src/utils/semaine.js` est correcte : n'y touche pas sauf
  pour ce qui est explicitement demandé plus bas.
- Statuts fixes, non configurables : Travaillé, Repos, CP, Maladie, Formation, Férié.
- Onglets : Planning, Employés, Archives, Réglages. Plus la vue Aperçu équipe.
- `src/styles/print.css` est réussi (badges aplatis en texte, chiffres tabulaires, filets
  gris, A4 paysage). **Conserve-le tel quel** en dehors des ajustements rendus nécessaires
  par la suppression des rayons.
- Sauvegarde JSON manuelle depuis les Réglages : c'est l'unique filet de sécurité de l'app.

---

# PARTIE 1 — Suppressions

## 1a. Supprimer entièrement la notion de rayon

Le rayon ne sert à rien dans cet usage. Il doit disparaître complètement, pas être masqué.

- Supprime le fichier `src/utils/rayons.js`.
- Supprime le champ `rayon` du modèle `cases` et des entrées de `semaineType`.
- Supprime le `<select>` rayon du popover de saisie et de la boîte de dialogue « Semaine type ».
- Supprime la pastille de rayon dans les cellules de la grille et tout le CSS associé
  (`.pastille-rayon` et ce qui n'est plus référencé).
- Une journée « Travaillé » = un statut + une heure de début + une heure de fin. Point.
- Vérifie qu'aucune occurrence de `rayon` / `RAYONS` ne subsiste dans le dépôt.

## 1b. Supprimer entièrement la notion de contrat

- Supprime le champ `contrat` du modèle `employes`.
- Supprime le champ « Contrat » du formulaire d'ajout / édition d'employé.
- Supprime la colonne « Contrat » de la liste des employés.
- Un employé = prénom, nom, actif/inactif, semaine type. Point.

**Ce qui reste :** la colonne « Total » de la grille planning, qui affiche la somme des heures
travaillées de l'employé sur la semaine affichée. Elle est conservée telle quelle. Il n'y a
aucune notion d'heures dues, d'écart, de dépassement ou d'alerte, et il ne doit pas en
apparaître.

---

# PARTIE 2 — Corrections

## 2a. « Écraser et dupliquer » doit réellement écraser

`dupliquerSemaine` fait aujourd'hui un upsert case par case depuis la source : les cases de la
semaine cible qui n'ont pas d'équivalent dans la source **survivent**. Le résultat est un
mélange silencieux des deux semaines, alors que la boîte de dialogue promet un écrasement.

Comportement attendu, dans **une seule transaction** :

1. Supprimer toutes les cases de la semaine cible appartenant aux employés concernés.
2. Copier les cases de la semaine source pour ces mêmes employés.

La confirmation « Écraser la semaine actuelle ? » ne s'affiche que si la cible contient déjà
au moins une case. Son texte doit dire ce qui se passe vraiment : les cases existantes de la
semaine seront supprimées puis remplacées par celles de la semaine source.

## 2b. Corriger le calcul de durée

`dureeHeures('08:00', '08:00')` retourne actuellement **24 heures** : le code interprète
`fin <= début` comme un créneau traversant minuit. Une faute de frappe fait donc exploser le
total de la semaine sans le moindre signal.

Règle attendue :

- début ou fin invalide → `0`
- fin **égale** au début → `0`
- fin **après** le début → durée normale
- fin **avant** le début → créneau de nuit, on ajoute 24 h (comportement actuel, à conserver)

Ajoute un test manuel de ces quatre cas dans ta vérification finale.

## 2c. Versionner les données, pas le navigateur — correction critique

**Le problème.** L'état de migration vit dans `localStorage`
(`planning_manager_migration_dimanche_v1` et sa variante semaine type). Il n'est donc pas lié
aux données. Une fois le drapeau posé, la migration ne se redéclenche jamais — y compris à
l'import d'un fichier JSON antérieur à la migration, dont les journées sont décalées d'un
jour. Le fichier téléchargé automatiquement « par sécurité » avant la migration est justement
un fichier de ce type : le filet de sécurité de l'app corrompt les données quand on s'en sert.

**La correction.** La version du format de données doit être inscrite **dans les données
elles-mêmes**, en base et dans le fichier d'export.

### Versions du format

| Version | Description |
|---|---|
| 1 | Semaine lundi→dimanche (jour 0 = lundi), cases avec `rayon`, employés avec `contrat` |
| 2 | Semaine dimanche→samedi (jour 0 = dimanche) |
| 3 | Sans `rayon`, sans `contrat` — **version cible actuelle** |

### Migrations sous forme de fonctions pures

Écris les migrations comme des **fonctions pures** prenant et rendant un jeu de données
complet en mémoire, sous la forme `{ employes, statuts, semaines, cases }` :

- `migrer1vers2(donnees)` — décale les journées : les jours 0→5 (ancien lundi→samedi)
  deviennent 1→6 dans la même semaine ; le jour 6 (ancien dimanche) devient le jour 0 de la
  **semaine suivante**, créée dans le tableau `semaines` si elle n'existe pas encore. Fait
  également tourner d'un cran les tableaux `semaineType` des employés (l'ancien dimanche, en
  dernière position, revient en première).
- `migrer2vers3(donnees)` — retire le champ `rayon` des cases et des entrées de `semaineType`,
  retire le champ `contrat` des employés, et supprime les semaines qui n'ont ni case, ni
  notes, ni statut archivé (nettoyage des semaines vides créées par l'ancien comportement,
  cf. 2d).

Travailler en mémoire supprime le besoin du contournement en deux phases actuellement présent
dans `migrationSemaineDimanche.js` (parquer les cases sur un jour négatif pour éviter les
collisions d'index unique). Ce fichier disparaît au profit d'un module de migration propre.

Ces fonctions servent **à l'identique** dans les deux chemins ci-dessous. C'est le point
essentiel de cette correction : un seul code de migration, deux points d'entrée.

### Où est stockée la version

Ajoute une table Dexie `meta` (clé/valeur, ex. `meta: '&cle'`) contenant une entrée
`versionDonnees`. **Bump la version du schéma Dexie** pour l'ajouter, sans détruire les
données existantes. Le schéma Dexie versionne les tables et les index ; `versionDonnees`
versionne le **contenu**. Ne mélange pas les deux mécanismes : aucune transformation de
contenu ne doit se faire dans une fonction `upgrade` de Dexie.

### Chemin 1 — au démarrage

1. Lire `versionDonnees` en base.
2. **S'il est absent**, le déterminer une seule fois, dans cet ordre :
   - le drapeau hérité `planning_manager_migration_dimanche_v1` vaut `'fait'` → version 2
     (les données sont déjà en convention dimanche) ;
   - sinon la base contient au moins une case → version 1 ;
   - sinon (base vide) → version courante.
   Puis supprimer les deux clés `localStorage` héritées, définitivement.
3. Si la version obtenue est inférieure à la version courante : **télécharger d'abord une
   sauvegarde JSON complète** de l'état actuel — portant sa version d'origine, donc
   réimportable sans dégât — puis appliquer la chaîne de migrations et réécrire la base en une
   transaction, `versionDonnees` inclus.
4. Si la migration échoue, ne rien écrire, afficher un message clair indiquant que les données
   n'ont pas été modifiées.

L'écran d'information avant migration existant est à conserver dans son principe : expliquer
ce qui va se passer, télécharger la sauvegarde, puis migrer.

### Chemin 2 — à l'import d'un fichier JSON

1. Lire `versionDonnees` dans le fichier. **Absent → version 1.**
2. Version supérieure à la version courante → refuser avec un message explicite (fichier issu
   d'une version plus récente de l'application).
3. Appliquer la même chaîne de migrations jusqu'à la version courante.
4. Valider la structure (les quatre tableaux attendus sont présents) puis remplacer le contenu
   de la base en une transaction, `versionDonnees` inclus.

### Export

Le fichier exporté contient `versionDonnees` à sa version réelle, la date d'export, et les
quatre tableaux. N'importe quelle sauvegarde, ancienne ou récente, doit pouvoir être
réimportée sans perte et sans décalage. **C'est le critère d'acceptation de cette partie.**

## 2d. Ne plus créer de semaines en base à la navigation

`obtenirOuCreerSemaine` écrit en base à chaque affichage : chaque clic sur ◀ ▶ crée une ligne
`semaines` vide, qui finit dans le fichier de sauvegarde.

Comportement attendu :

- `obtenirSemaine(annee, numero)` — lecture seule, retourne `null` si la semaine n'existe pas.
- La vue Planning sait afficher une semaine absente de la base : grille vide, non archivée,
  notes vides, navigation et bannière « Cette semaine est vide » fonctionnelles.
- `assurerSemaine(annee, numero)` — crée la ligne si nécessaire et retourne son id. Elle n'est
  appelée qu'au moment d'un **véritable enregistrement** : saisie d'une case, saisie de notes,
  archivage, ou duplication vers cette semaine.
- Les semaines vides déjà présentes en base sont supprimées par `migrer2vers3` (cf. 2c).

---

# PARTIE 3 — Interdictions

Ces éléments ont déjà fait dérailler une version précédente du projet. Ils sont **interdits**,
même si tu les juges utiles :

- mode pinceau, glisser-déposer, remplissage par balayage ;
- créneaux favoris configurables — les trois créneaux rapides restent **codés en dur** ;
- système de raccourcis clavier, navigation de la grille aux flèches ;
- vue mois, vue couverture, vue par jour, tableau de bord, statistiques ;
- statuts configurables, rayons sous une autre forme, postes, compétences, sites ;
- alertes de cohérence, contrôle de légalité, calcul d'écart ou de dépassement ;
- toute forme de sauvegarde automatique, de cloud, de compte, d'historique de modifications ;
- toute nouvelle dépendance, y compris de développement.

Fonctionnalités existantes à **conserver telles quelles** : semaine type par employé et son
application depuis la grille, copier/coller entre cases, bouton Vider, archivage et onglet
Archives en lecture seule, notes libres par semaine, aperçu équipe en prénoms seuls, export /
import JSON.

---

# PARTIE 4 — Qualité et livrable

- Arborescence inchangée : `src/db`, `src/views`, `src/utils`, `src/styles`.
- Le module de migration remplace `src/db/migrationSemaineDimanche.js`, dont le nom ne
  correspond plus à son rôle. Nomme-le pour ce qu'il fait (ex. `src/db/migrations.js`).
- JSDoc sur : chaque fonction de migration, le calcul de durée, la duplication de semaine, la
  détermination initiale de `versionDonnees`. Un commentaire par intention, pas par ligne.
- Aucun code mort, aucun CSS orphelin, aucun import inutilisé après les suppressions.
- Dans la boîte de dialogue de confirmation d'import, le nom du fichier est injecté dans
  `innerHTML` sans échappement : passe par `textContent`.
- Mets à jour le `README.md` : modèle de données réel, mécanisme de versionnement des données
  et son rôle dans la sauvegarde.

## Vérification avant de me rendre la main

Déroule ces points et rends-moi le résultat de chacun :

1. `npm run dev` démarre sans erreur ni avertissement en console.
2. Plus aucune occurrence de `rayon`, `RAYONS` ou `contrat` dans le dépôt.
3. Saisie d'une case : statut simple en un clic, créneau travaillé via les trois boutons
   rapides, horaire libre, Vider, Copier, Coller.
4. `dureeHeures` : `08:00→16:00` = 8 h ; `08:00→08:00` = 0 h ; `22:00→06:00` = 8 h ; entrée
   invalide = 0 h.
5. Duplication vers une semaine à moitié remplie : les cases préexistantes de la cible ont bien
   disparu, la cible est le reflet exact de la source pour les employés actifs.
6. Navigation sur quinze semaines vides d'affilée, puis export : le JSON ne contient **aucune**
   semaine vide.
7. Export → import du même fichier : état strictement identique, aucun décalage de jour.
8. Import d'un fichier sans `versionDonnees` (simule une sauvegarde ancienne, jours indexés
   lundi = 0, cases avec `rayon`, employés avec `contrat`) : les journées atterrissent au bon
   endroit, les champs obsolètes sont retirés, rien ne casse.
9. Aperçu équipe : prénoms seuls, aucun total, aucun nom de famille. Impression en A4 paysage
   sur une page, lisible en noir et blanc.
10. Archivage : grille en lecture seule, bandeau visible, duplication désactivée, désarchivage
    fonctionnel depuis l'onglet Archives.