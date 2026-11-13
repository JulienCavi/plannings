import { db } from './database.js';

/** Tous les employés, triés par prénom puis nom (le même ordre que la grille du planning). */
export async function listerEmployes() {
  const tous = await db.employes.toArray();
  tous.sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr') || a.nom.localeCompare(b.nom, 'fr'));
  return tous;
}

/** `debutCle` est fourni par l'appelant (clé de la semaine courante) : la couche db ne connaît pas « maintenant ». */
export function ajouterEmploye({ nom, prenom, debutCle }) {
  return db.employes.add({ nom: nom.trim(), prenom: prenom.trim(), debutCle, finCle: null, semaineType: Array(7).fill(null) });
}

export function modifierEmploye(id, { nom, prenom }) {
  return db.employes.update(id, { nom: nom.trim(), prenom: prenom.trim() });
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

/** Supprime l'employé, toutes ses cases de planning et ses traces dans les exceptions d'effectif des semaines. */
export async function supprimerEmploye(id) {
  await db.transaction('rw', db.employes, db.cases, db.semaines, async () => {
    await db.cases.where('employeId').equals(id).delete();
    await db.semaines
      .filter((s) => (s.retires ?? []).includes(id) || (s.ajoutes ?? []).includes(id))
      .modify((s) => {
        s.retires = (s.retires ?? []).filter((e) => e !== id);
        s.ajoutes = (s.ajoutes ?? []).filter((e) => e !== id);
      });
    await db.employes.delete(id);
  });
}
