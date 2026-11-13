import { el, bouton } from './dom.js';

/**
 * Ouvre une boîte de dialogue modale et rend une promesse résolue à sa fermeture.
 * `construire(fermer)` rend le contenu (un nœud ou un tableau de nœuds) ; appeler
 * `fermer(valeur)` ferme la boîte et résout la promesse avec `valeur`. Échap ou un clic
 * sur le fond ferment aussi, avec `null`.
 */
export function ouvrirDialogue(titre, construire, { large = false } = {}) {
  return new Promise((resoudre) => {
    let resultat = null;
    const dialogue = el('dialog', { class: large ? 'dialogue dialogue-large' : 'dialogue' });
    const fermer = (valeur = null) => {
      resultat = valeur;
      dialogue.close();
    };
    const corps = el('div', { class: 'dialogue-corps' }, el('h2', { text: titre }), construire(fermer));
    dialogue.append(corps);
    dialogue.addEventListener('pointerdown', (evt) => {
      if (evt.target === dialogue) fermer();
    });
    dialogue.addEventListener('close', () => {
      dialogue.remove();
      resoudre(resultat);
    });
    document.body.append(dialogue);
    dialogue.showModal();
  });
}

/** Rangée de boutons alignée à droite en bas d'une boîte de dialogue. */
export function ligneActions(...boutons) {
  return el('div', { class: 'dialogue-actions' }, boutons);
}

/**
 * Demande une confirmation. Rend `true` si l'utilisateur confirme, `false` sinon.
 * `danger` signale une action qui supprime ou remplace quelque chose.
 */
export async function confirmer({ titre, texte, libelle = 'Confirmer', danger = false }) {
  const reponse = await ouvrirDialogue(titre, (fermer) => [
    el('p', { text: texte }),
    ligneActions(
      bouton('Annuler', { on: () => fermer(false) }),
      bouton(libelle, { variante: danger ? 'danger' : 'accent', on: () => fermer(true), autofocus: true })
    ),
  ]);
  return reponse === true;
}
