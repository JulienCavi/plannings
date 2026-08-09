import { db } from './database.js';
import { semaineVoisine } from '../utils/semaine.js';

const CLE_MIGRATION_HERITEE = 'planning_manager_migration_dimanche_v1';
const CLE_MIGRATION_SEMAINE_TYPE_HERITEE = 'planning_manager_migration_dimanche_semaine_type_v1';
const TABLES = ['employes', 'statuts', 'semaines', 'cases'];

/** Version courante du format de données (voir table des versions dans PLANNING-MANAGER-V4.md). */
export const VERSION_COURANTE = 3;

/**
 * v1 → v2 : la semaine passe d'un découpage lundi→dimanche à dimanche→samedi. Les
 * jours 0-5 (ancien lundi→samedi) glissent d'un cran (1-6) dans la même semaine ; le
 * jour 6 (ancien dimanche) devient le jour 0 de la semaine suivante (créée à la volée
 * si absente). Les `semaineType` des employés suivent la même rotation.
 */
export function migrer1vers2(donnees) {
  const semaines = donnees.semaines.map((s) => ({ ...s }));
  const semainesParCle = new Map(semaines.map((s) => [`${s.annee}-${s.numeroSemaine}`, s]));
  const semainesParId = new Map(semaines.map((s) => [s.id, s]));
  let prochainId = semaines.reduce((max, s) => Math.max(max, s.id), 0) + 1;

  function semaineSuivante(annee, numeroSemaine) {
    const { annee: a, numero } = semaineVoisine(annee, numeroSemaine, 1);
    const cle = `${a}-${numero}`;
    let semaine = semainesParCle.get(cle);
    if (!semaine) {
      semaine = { id: prochainId++, annee: a, numeroSemaine: numero, archivee: false };
      semaines.push(semaine);
      semainesParCle.set(cle, semaine);
    }
    return semaine;
  }

  const cases = donnees.cases.map((c) => {
    const semaine = semainesParId.get(c.semaineId);
    if (!semaine) return { ...c };
    if (c.jour === 6) {
      const cible = semaineSuivante(semaine.annee, semaine.numeroSemaine);
      return { ...c, semaineId: cible.id, jour: 0 };
    }
    return { ...c, jour: c.jour + 1 };
  });

  const employes = donnees.employes.map((e) => {
    if (!Array.isArray(e.semaineType) || e.semaineType.length !== 7) return { ...e };
    const [lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche] = e.semaineType;
    return { ...e, semaineType: [dimanche, lundi, mardi, mercredi, jeudi, vendredi, samedi] };
  });

  return { ...donnees, employes, semaines, cases };
}

/**
 * v2 → v3 : retire le champ `rayon` des cases et des entrées `semaineType`, retire le
 * champ `contrat` des employés, et nettoie les semaines vides (sans case, sans notes,
 * non archivées) créées par l'ancien comportement d'écriture à la navigation.
 */
export function migrer2vers3(donnees) {
  const sansRayon = ({ rayon, ...reste }) => reste;

  const cases = donnees.cases.map(sansRayon);

  const employes = donnees.employes.map((e) => {
    const { contrat, ...reste } = e;
    if (!Array.isArray(reste.semaineType)) return reste;
    return { ...reste, semaineType: reste.semaineType.map((entree) => (entree ? sansRayon(entree) : entree)) };
  });

  const idsAvecCases = new Set(cases.map((c) => c.semaineId));
  const semaines = donnees.semaines.filter(
    (s) => idsAvecCases.has(s.id) || Boolean(s.notes) || Boolean(s.archivee)
  );

  return { ...donnees, employes, semaines, cases };
}

const MIGRATIONS = { 1: migrer1vers2, 2: migrer2vers3 };

/** Chaîne les migrations pures nécessaires pour amener `donnees` à `VERSION_COURANTE`. */
export function migrerDonnees(donnees, versionDepart) {
  let resultat = donnees;
  for (let version = versionDepart; version < VERSION_COURANTE; version++) {
    resultat = MIGRATIONS[version](resultat);
  }
  return resultat;
}

/**
 * Détermine la version des données déjà en base lorsque `meta.versionDonnees` est
 * absent (mise à jour depuis une version antérieure à ce mécanisme), à partir de
 * l'ancien drapeau `localStorage` et du contenu de la base. Ne s'exécute qu'une seule
 * fois : les clés `localStorage` héritées sont supprimées définitivement juste après.
 */
async function determinerVersionInitiale() {
  let version;
  if (localStorage.getItem(CLE_MIGRATION_HERITEE) === 'fait') {
    version = 2;
  } else if ((await db.cases.count()) > 0) {
    version = 1;
  } else {
    version = VERSION_COURANTE;
  }
  localStorage.removeItem(CLE_MIGRATION_HERITEE);
  localStorage.removeItem(CLE_MIGRATION_SEMAINE_TYPE_HERITEE);
  return version;
}

/** À appeler au démarrage : lit/détermine la version des données et dit si une migration est due. */
export async function verifierVersionDonnees() {
  const entree = await db.meta.get('versionDonnees');
  let version = entree?.valeur;
  if (version === undefined) {
    version = await determinerVersionInitiale();
    if (version >= VERSION_COURANTE) {
      await db.meta.put({ cle: 'versionDonnees', valeur: VERSION_COURANTE });
    }
  }
  return { migrationRequise: version < VERSION_COURANTE, versionDepart: version };
}

async function dumperTables() {
  const [employes, statuts, semaines, cases] = await Promise.all(TABLES.map((t) => db[t].toArray()));
  return { employes, statuts, semaines, cases };
}

/** Sauvegarde JSON complète de l'état actuel, taguée avec sa version d'origine (réimportable telle quelle). */
export async function telechargerSauvegardeAvantMigration(versionDepart) {
  const donnees = await dumperTables();
  const fichier = { versionDonnees: versionDepart, exporteLe: new Date().toISOString(), ...donnees };
  const blob = new Blob([JSON.stringify(fichier, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `planning-manager-avant-migration-v${versionDepart}-${new Date().toISOString().slice(0, 10)}.json`;
  lien.click();
  URL.revokeObjectURL(url);
}

/** Migre les données en base vers `VERSION_COURANTE` en une seule transaction ; n'écrit rien en cas d'échec. */
export async function executerMigrationDemarrage(versionDepart) {
  const donnees = await dumperTables();
  const migrees = migrerDonnees(donnees, versionDepart);
  await db.transaction('rw', db.employes, db.statuts, db.semaines, db.cases, db.meta, async () => {
    await Promise.all(TABLES.map((t) => db[t].clear()));
    await Promise.all(TABLES.map((t) => db[t].bulkAdd(migrees[t])));
    await db.meta.put({ cle: 'versionDonnees', valeur: VERSION_COURANTE });
  });
}
