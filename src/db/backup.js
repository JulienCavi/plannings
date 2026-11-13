import { db } from './database.js';
import { VERSION_COURANTE, migrerDonnees } from './migrations.js';
import { oublierCompteurCreneaux } from './cases.js';

const TABLES = ['employes', 'statuts', 'semaines', 'cases'];

/**
 * Jeu de données complet prêt à être écrit dans un fichier. `pensebete` est un champ
 * optionnel, présent seulement s'il est renseigné : il ne fait pas partie du format
 * versionné, et une version de l'application qui ne le connaît pas l'ignore à l'import.
 */
export async function exporterDonnees() {
  const [employes, statuts, semaines, cases] = await Promise.all(TABLES.map((t) => db[t].toArray()));
  const pensebete = (await db.meta.get('pensebete'))?.valeur;
  return {
    versionDonnees: VERSION_COURANTE,
    exporteLe: new Date().toISOString(),
    employes,
    statuts,
    semaines,
    cases,
    ...(pensebete ? { pensebete } : {}),
  };
}

/** Vrai si la base contient au moins un employé ou une case (donc quelque chose à perdre). */
export async function baseContientDesDonnees() {
  return (await db.employes.count()) > 0 || (await db.cases.count()) > 0;
}

/** Remplace intégralement les données existantes par celles fournies, après migration vers VERSION_COURANTE. */
export async function importerDonnees(donnees) {
  if (!donnees || typeof donnees !== 'object') {
    throw new Error('Fichier invalide : contenu JSON attendu.');
  }
  for (const t of TABLES) {
    if (!Array.isArray(donnees[t])) {
      throw new Error(`Fichier invalide : champ "${t}" manquant.`);
    }
  }
  const versionFichier = donnees.versionDonnees ?? 1;
  if (versionFichier > VERSION_COURANTE) {
    throw new Error("Ce fichier provient d'une version plus récente de l'application.");
  }
  const migrees = migrerDonnees(donnees, versionFichier);
  const pensebete = typeof donnees.pensebete === 'string' ? donnees.pensebete : '';
  await db.transaction('rw', db.employes, db.statuts, db.semaines, db.cases, db.meta, async () => {
    await Promise.all(TABLES.map((t) => db[t].clear()));
    await Promise.all(TABLES.map((t) => db[t].bulkAdd(migrees[t])));
    await db.meta.put({ cle: 'versionDonnees', valeur: VERSION_COURANTE });
    await db.meta.put({ cle: 'pensebete', valeur: pensebete });
  });
  oublierCompteurCreneaux();
}
