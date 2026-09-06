import { db } from './database.js';

/** Tous les employés, triés par nom puis prénom. */
export async function listerEmployes() {
  const tous = await db.employes.toArray();
  tous.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
  return tous;
}

/** `debutCle` est fourni par l'appelant (clé de la semaine courante) : la couche db ne connaît pas « maintenant ». */
export function ajouterEmploye({ nom, prenom, debutCle }) {
  return db.employes.add({ nom, prenom, debutCle, finCle: null, semaineType: Array(7).fill(null) });
}

export function modifierEmploye(id, { nom, prenom }) {
  return db.employes.update(id, { nom, prenom });
}

/** Marque l'employé parti : `finCle` (fourni par l'appelant) devient sa dernière semaine d'appartenance à l'effectif par défaut. */
export function marquerEmployeParti(id, finCle) {
  return db.employes.update(id, { finCle });
}

/** Annule un départ : l'employé redevient présent sans limite de fin. */
export function reintegrerEmploye(id) {
  return db.employes.update(id, { finCle: null });
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
