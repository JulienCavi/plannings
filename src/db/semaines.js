import { db } from './database.js';
import { listerSemaineIdsAvecCases } from './cases.js';

const plusRecentesDAbord = (a, b) => b.annee - a.annee || b.numeroSemaine - a.numeroSemaine;

/** Lecture seule : retourne la semaine (annee, numeroSemaine), ou `null` si elle n'existe pas encore. */
export async function obtenirSemaine(annee, numeroSemaine) {
  const existante = await db.semaines.where('[annee+numeroSemaine]').equals([annee, numeroSemaine]).first();
  return existante ?? null;
}

/**
 * Crée la semaine si nécessaire et retourne son id. À appeler uniquement au moment d'un vrai
 * enregistrement. Lecture et création se font dans une même transaction : deux appels
 * simultanés ne peuvent pas créer la semaine deux fois.
 */
export function assurerSemaine(annee, numeroSemaine) {
  return db.transaction('rw', db.semaines, async () => {
    const existante = await obtenirSemaine(annee, numeroSemaine);
    if (existante) return existante.id;
    return db.semaines.add({ annee, numeroSemaine, archivee: false, retires: [], ajoutes: [] });
  });
}

export function toggleArchiveeSemaine(id, archivee) {
  return db.semaines.update(id, { archivee });
}

/** Lit la semaine, applique `modifier` à ses deux listes d'exceptions (des Set) et les réécrit, en une transaction. */
function modifierExceptions(semaineId, modifier) {
  return db.transaction('rw', db.semaines, async () => {
    const semaine = await db.semaines.get(semaineId);
    const retires = new Set(semaine.retires ?? []);
    const ajoutes = new Set(semaine.ajoutes ?? []);
    modifier(retires, ajoutes);
    await db.semaines.update(semaineId, { retires: [...retires], ajoutes: [...ajoutes] });
  });
}

/**
 * Retire explicitement un employé de l'effectif de cette semaine (idempotent). Ne touche à
 * aucune case. Annule du même coup un éventuel ajout explicite : on ne peut pas être à la
 * fois ajouté et retiré.
 */
export function retirerEmployeSemaine(semaineId, employeId) {
  return modifierExceptions(semaineId, (retires, ajoutes) => {
    retires.add(employeId);
    ajoutes.delete(employeId);
  });
}

/** Annule un retrait ponctuel (idempotent). */
export function reintegrerEmployeSemaine(semaineId, employeId) {
  return modifierExceptions(semaineId, (retires) => retires.delete(employeId));
}

/** Ajoute explicitement un employé à l'effectif de cette semaine, en rattrapage (idempotent). */
export function ajouterEmployeSemaine(semaineId, employeId) {
  return modifierExceptions(semaineId, (retires, ajoutes) => {
    ajoutes.add(employeId);
    retires.delete(employeId);
  });
}

/** Enregistre les notes libres attachées à une semaine (rappels personnels). */
export function enregistrerNotes(id, notes) {
  return db.semaines.update(id, { notes });
}

/** Semaines archivées, les plus récentes en premier. */
export async function listerSemainesArchivees() {
  const toutes = await db.semaines.toArray();
  return toutes.filter((s) => s.archivee).sort(plusRecentesDAbord);
}

/** Semaines contenant au moins une case renseignée, les plus récentes en premier. */
export async function listerSemainesRenseignees() {
  const [semaines, idsAvecCases] = await Promise.all([db.semaines.toArray(), listerSemaineIdsAvecCases()]);
  return semaines.filter((s) => idsAvecCases.has(s.id)).sort(plusRecentesDAbord);
}
