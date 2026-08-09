import { db } from './database.js';

export function listerCasesSemaine(semaineId) {
  return db.cases.where('semaineId').equals(semaineId).toArray();
}

/** Crée ou met à jour la case d'un employé pour un jour donné (upsert). */
export async function enregistrerCase(semaineId, employeId, jour, donnees) {
  const existante = await db.cases
    .where('[semaineId+employeId+jour]')
    .equals([semaineId, employeId, jour])
    .first();
  const valeurs = { semaineId, employeId, jour, ...donnees };
  if (existante) {
    await db.cases.update(existante.id, valeurs);
    return existante.id;
  }
  return db.cases.add(valeurs);
}

/** Supprime la case d'un employé pour un jour donné (retour à l'état vide). */
export async function supprimerCase(semaineId, employeId, jour) {
  const existante = await db.cases
    .where('[semaineId+employeId+jour]')
    .equals([semaineId, employeId, jour])
    .first();
  if (existante) {
    await db.cases.delete(existante.id);
  }
}

/**
 * Remplace les cases de la semaine cible par celles de la semaine source, pour les
 * employés fournis : les cases existantes de la cible sont d'abord supprimées, puis
 * celles de la source sont copiées (vrai écrasement, une seule transaction).
 */
export async function dupliquerSemaine(semaineSourceId, semaineCibleId, employeIds) {
  await db.transaction('rw', db.cases, async () => {
    const casesSource = await listerCasesSemaine(semaineSourceId);
    const casesCibleASupprimer = (await listerCasesSemaine(semaineCibleId)).filter((c) =>
      employeIds.includes(c.employeId)
    );
    await db.cases.bulkDelete(casesCibleASupprimer.map((c) => c.id));
    const nouvellesCases = casesSource
      .filter((c) => employeIds.includes(c.employeId))
      .map((c) => ({
        semaineId: semaineCibleId,
        employeId: c.employeId,
        jour: c.jour,
        statutId: c.statutId,
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
      }));
    await db.cases.bulkAdd(nouvellesCases);
  });
}
