import { db } from './database.js';
import { compterCreneaux, ajouterCreneau } from '../utils/creneaux.js';
import { cleSemaine } from '../utils/semaine.js';

/** Nombre de semaines récentes prises en compte pour proposer les créneaux les plus fréquents. */
const SEMAINES_POUR_CRENEAUX = 12;

let compteurCreneaux = null;

/** Ne garde que les trois champs de contenu d'une case (écarte tout champ parasite de l'appelant). */
function contenuCase({ statutId, heureDebut, heureFin }) {
  return { statutId, heureDebut: heureDebut ?? null, heureFin: heureFin ?? null };
}

function trouverCase(semaineId, employeId, jour) {
  return db.cases.where('[semaineId+employeId+jour]').equals([semaineId, employeId, jour]).first();
}

export function listerCasesSemaine(semaineId) {
  return db.cases.where('semaineId').equals(semaineId).toArray();
}

/** Ensemble des ids d'employés ayant au moins une case en base (lecture de l'index seul). */
export async function listerEmployeIdsAvecCases() {
  return new Set(await db.cases.orderBy('employeId').uniqueKeys());
}

/** Ensemble des ids de semaines ayant au moins une case en base (lecture de l'index seul). */
export async function listerSemaineIdsAvecCases() {
  return new Set(await db.cases.orderBy('semaineId').uniqueKeys());
}

/**
 * Compteur des créneaux horaires saisis sur les dernières semaines renseignées (voir
 * `creneauxSuggeres`). Calculé une fois par session puis tenu à jour à chaque enregistrement ;
 * `oublierCompteurCreneaux` force son recalcul après un remplacement complet des données.
 */
export function obtenirCompteurCreneaux() {
  compteurCreneaux ??= (async () => {
    const idsAvecCases = await listerSemaineIdsAvecCases();
    const recentes = (await db.semaines.toArray())
      .filter((s) => idsAvecCases.has(s.id))
      .sort((a, b) => cleSemaine(b.annee, b.numeroSemaine) - cleSemaine(a.annee, a.numeroSemaine))
      .slice(0, SEMAINES_POUR_CRENEAUX)
      .map((s) => s.id);
    return compterCreneaux(await db.cases.where('semaineId').anyOf(recentes).toArray());
  })();
  return compteurCreneaux;
}

export function oublierCompteurCreneaux() {
  compteurCreneaux = null;
}

async function noterCreneaux(liste) {
  if (!compteurCreneaux) return;
  const compteur = await compteurCreneaux;
  for (const c of liste) ajouterCreneau(compteur, c.heureDebut, c.heureFin);
}

/**
 * Crée ou met à jour plusieurs cases d'une semaine en une seule transaction (tout ou rien).
 * @param {number} semaineId
 * @param {Array<{employeId: number, jour: number, statutId: number, heureDebut: string|null, heureFin: string|null}>} liste
 * @param {{seulementVides?: boolean}} [options] `seulementVides` : ne touche pas aux cases déjà renseignées.
 * @returns {Promise<number>} nombre de cases réellement écrites
 */
export async function enregistrerCases(semaineId, liste, { seulementVides = false } = {}) {
  const ecrites = [];
  await db.transaction('rw', db.cases, async () => {
    for (const entree of liste) {
      const existante = await trouverCase(semaineId, entree.employeId, entree.jour);
      const contenu = contenuCase(entree);
      if (existante) {
        if (seulementVides) continue;
        await db.cases.update(existante.id, contenu);
      } else {
        await db.cases.add({ semaineId, employeId: entree.employeId, jour: entree.jour, ...contenu });
      }
      ecrites.push(contenu);
    }
  });
  await noterCreneaux(ecrites);
  return ecrites.length;
}

/** Crée ou met à jour la case d'un employé pour un jour donné (upsert). */
export function enregistrerCase(semaineId, employeId, jour, donnees) {
  return enregistrerCases(semaineId, [{ employeId, jour, ...donnees }]);
}

/** Supprime la case d'un employé pour un jour donné (retour à l'état vide). */
export function supprimerCase(semaineId, employeId, jour) {
  return db.cases.where('[semaineId+employeId+jour]').equals([semaineId, employeId, jour]).delete();
}

/** Supprime toutes les cases d'un employé sur une semaine (action volontaire « Vider sa semaine »). */
export function supprimerCasesEmploye(semaineId, employeId) {
  return db.cases
    .where('[semaineId+employeId+jour]')
    .between([semaineId, employeId, 0], [semaineId, employeId, 6], true, true)
    .delete();
}

/**
 * Remplace les cases de la semaine cible par celles de la semaine source, pour les
 * employés fournis : les cases existantes de la cible sont d'abord supprimées, puis
 * celles de la source sont copiées (vrai écrasement, une seule transaction).
 * `statutIds`, s'il est fourni, limite la copie aux cases de ces statuts (par exemple
 * Travaillé et Repos, sans reporter les absences) ; la suppression, elle, porte toujours
 * sur toutes les cases des employés concernés.
 * @returns {Promise<number>} nombre de cases copiées
 */
export async function dupliquerSemaine(semaineSourceId, semaineCibleId, employeIds, { statutIds = null } = {}) {
  const employes = new Set(employeIds);
  const statuts = statutIds && new Set(statutIds);
  let nouvellesCases = [];
  await db.transaction('rw', db.cases, async () => {
    const casesSource = await listerCasesSemaine(semaineSourceId);
    const casesCibleASupprimer = (await listerCasesSemaine(semaineCibleId)).filter((c) => employes.has(c.employeId));
    await db.cases.bulkDelete(casesCibleASupprimer.map((c) => c.id));
    nouvellesCases = casesSource
      .filter((c) => employes.has(c.employeId) && (!statuts || statuts.has(c.statutId)))
      .map((c) => ({ semaineId: semaineCibleId, employeId: c.employeId, jour: c.jour, ...contenuCase(c) }));
    await db.cases.bulkAdd(nouvellesCases);
  });
  await noterCreneaux(nouvellesCases);
  return nouvellesCases.length;
}
