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
  return db.semaines.add({ annee, numeroSemaine, archivee: false, retires: [], ajoutes: [] });
}

export function toggleArchiveeSemaine(id, archivee) {
  return db.semaines.update(id, { archivee });
}

/** Retire explicitement un employé de l'effectif de cette semaine (idempotent). Ne touche à aucune case. */
export async function retirerEmployeSemaine(semaineId, employeId) {
  const semaine = await db.semaines.get(semaineId);
  const retires = new Set(semaine.retires ?? []);
  retires.add(employeId);
  return db.semaines.update(semaineId, { retires: [...retires] });
}

/** Annule un retrait ponctuel (idempotent). */
export async function reintegrerEmployeSemaine(semaineId, employeId) {
  const semaine = await db.semaines.get(semaineId);
  const retires = new Set(semaine.retires ?? []);
  retires.delete(employeId);
  return db.semaines.update(semaineId, { retires: [...retires] });
}

/** Ajoute explicitement un employé à l'effectif de cette semaine, en rattrapage (idempotent). */
export async function ajouterEmployeSemaine(semaineId, employeId) {
  const semaine = await db.semaines.get(semaineId);
  const ajoutes = new Set(semaine.ajoutes ?? []);
  ajoutes.add(employeId);
  return db.semaines.update(semaineId, { ajoutes: [...ajoutes] });
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
