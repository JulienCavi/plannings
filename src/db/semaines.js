import { db } from './database.js';

/** Lecture seule : retourne la semaine (annee, numeroSemaine), ou `null` si elle n'existe pas encore. */
export async function obtenirSemaine(annee, numeroSemaine) {
  const existante = await db.semaines
    .where('[annee+numeroSemaine]')
    .equals([annee, numeroSemaine])
    .first();
  return existante ?? null;
}

/** Crée la semaine si nécessaire et retourne son id. À appeler uniquement au moment d'un vrai enregistrement. */
export async function assurerSemaine(annee, numeroSemaine) {
  const existante = await obtenirSemaine(annee, numeroSemaine);
  if (existante) return existante.id;
  return db.semaines.add({ annee, numeroSemaine, archivee: false });
}

export function toggleArchiveeSemaine(id, archivee) {
  return db.semaines.update(id, { archivee });
}

/** Enregistre les notes libres attachées à une semaine (rappels personnels). */
export function enregistrerNotes(id, notes) {
  return db.semaines.update(id, { notes });
}

/** Semaines archivées, les plus récentes en premier. */
export async function listerSemainesArchivees() {
  const toutes = await db.semaines.toArray();
  return toutes
    .filter((s) => s.archivee)
    .sort((a, b) => b.annee - a.annee || b.numeroSemaine - a.numeroSemaine);
}

/** Semaines contenant au moins une case renseignée, les plus récentes en premier. */
export async function listerSemainesRenseignees() {
  const [semaines, cases] = await Promise.all([db.semaines.toArray(), db.cases.toArray()]);
  const idsAvecCases = new Set(cases.map((c) => c.semaineId));
  return semaines
    .filter((s) => idsAvecCases.has(s.id))
    .sort((a, b) => b.annee - a.annee || b.numeroSemaine - a.numeroSemaine);
}
