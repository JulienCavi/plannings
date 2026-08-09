import { db } from './database.js';

/** Tous les employés, triés par nom puis prénom. */
export async function listerEmployes() {
  const tous = await db.employes.toArray();
  tous.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  return tous;
}

export function ajouterEmploye({ nom, prenom }) {
  return db.employes.add({ nom, prenom, actif: true, semaineType: Array(7).fill(null) });
}

export function modifierEmploye(id, { nom, prenom }) {
  return db.employes.update(id, { nom, prenom });
}

export function toggleActifEmploye(id, actif) {
  return db.employes.update(id, { actif });
}

/** Enregistre le modèle de semaine type (7 entrées, une par jour, null si non défini). */
export function definirSemaineType(id, semaineType) {
  return db.employes.update(id, { semaineType });
}

/** Supprime l'employé et toutes ses cases de planning. */
export async function supprimerEmploye(id) {
  await db.transaction('rw', db.employes, db.cases, async () => {
    await db.cases.where('employeId').equals(id).delete();
    await db.employes.delete(id);
  });
}
