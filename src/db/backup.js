import { db } from './database.js';
import { VERSION_COURANTE, migrerDonnees } from './migrations.js';

const TABLES = ['employes', 'statuts', 'semaines', 'cases'];

export async function exporterDonnees() {
  const [employes, statuts, semaines, cases] = await Promise.all(
    TABLES.map((t) => db[t].toArray())
  );
  return { versionDonnees: VERSION_COURANTE, exporteLe: new Date().toISOString(), employes, statuts, semaines, cases };
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
  await db.transaction('rw', db.employes, db.statuts, db.semaines, db.cases, db.meta, async () => {
    await Promise.all(TABLES.map((t) => db[t].clear()));
    await Promise.all(TABLES.map((t) => db[t].bulkAdd(migrees[t])));
    await db.meta.put({ cle: 'versionDonnees', valeur: VERSION_COURANTE });
  });
}
