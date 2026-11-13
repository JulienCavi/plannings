// Sauvegardes différées (notes tapées au clavier) : on attend une courte pause de frappe
// avant d'écrire, et tout ce qui est encore en attente est écrit avant de changer d'écran.
const enAttente = new Set();

/**
 * Enveloppe `enregistrer` (asynchrone) : `planifier()` déclenche l'écriture après `delai` ms
 * sans nouvel appel, `vider()` l'exécute tout de suite si elle était en attente.
 */
export function creerSauvegardeDifferee(enregistrer, delai = 600) {
  let minuteur = null;
  const tache = {
    planifier() {
      clearTimeout(minuteur);
      minuteur = setTimeout(tache.vider, delai);
      enAttente.add(tache);
    },
    async vider() {
      if (!enAttente.has(tache)) return;
      clearTimeout(minuteur);
      enAttente.delete(tache);
      await enregistrer();
    },
  };
  return tache;
}

/** Écrit immédiatement tout ce qui attendait encore (changement d'écran, fermeture de l'onglet). */
export function viderSauvegardesEnAttente() {
  return Promise.all([...enAttente].map((tache) => tache.vider()));
}
