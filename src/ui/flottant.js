import { el } from './dom.js';

// Un seul élément flottant (bulle de saisie, menu) est ouvert à la fois. Il se ferme sur
// Échap, sur un clic en dehors ou à l'ouverture d'un autre.
let actuel = null;
// Ancre sur laquelle on vient d'appuyer alors que son flottant était ouvert : le clic qui
// suit doit être lu comme « fermer », pas comme « rouvrir ».
let ancreQuiVientDeFermer = null;
document.addEventListener('click', () => {
  ancreQuiVientDeFermer = null;
});

/** Place `flottant` sous `ancre`, ou au-dessus s'il n'y a pas la place, sans sortir de la fenêtre. */
function positionner(flottant, ancre) {
  const marge = 8;
  const rect = ancre.getBoundingClientRect();
  const { offsetWidth: largeur, offsetHeight: hauteur } = flottant;
  const fenetre = document.documentElement;
  const hautLibre = rect.top - (document.querySelector('.app-header')?.offsetHeight ?? 0);
  const basLibre = fenetre.clientHeight - rect.bottom;
  const auDessus = basLibre < hauteur + marge && hautLibre > basLibre;
  const haut = auDessus ? rect.top - hauteur - 6 : rect.bottom + 6;
  const gauche = Math.min(Math.max(marge, rect.left), fenetre.clientWidth - largeur - marge);
  flottant.style.top = `${haut + window.scrollY}px`;
  flottant.style.left = `${gauche + window.scrollX}px`;
  flottant.classList.toggle('flottant-au-dessus', auDessus);
}

function surPointeur(evt) {
  if (!actuel || actuel.element.contains(evt.target)) return;
  if (actuel.ancre.contains(evt.target)) ancreQuiVientDeFermer = actuel.ancre;
  fermerFlottant('exterieur');
}

function surTouche(evt) {
  if (evt.key === 'Escape' && actuel) {
    evt.preventDefault();
    fermerFlottant('echap');
  }
}

/**
 * Ferme l'élément flottant ouvert. `raison` ('exterieur', 'echap', 'action', 'remplace')
 * est transmise à son `onFermer`, qui décide par exemple d'enregistrer ou non une saisie en cours.
 */
export function fermerFlottant(raison = 'action') {
  if (!actuel) return;
  const { element, ancre, onFermer } = actuel;
  actuel = null;
  document.removeEventListener('pointerdown', surPointeur, true);
  document.removeEventListener('keydown', surTouche, true);
  element.remove();
  ancre.removeAttribute('aria-expanded');
  if (raison !== 'exterieur' && raison !== 'remplace' && ancre.isConnected) ancre.focus();
  onFermer?.(raison);
}

/** Ouvre `element` en flottant, accroché à `ancre`. */
export function ouvrirFlottant(ancre, element, { onFermer } = {}) {
  fermerFlottant('remplace');
  element.classList.add('flottant');
  document.body.append(element);
  positionner(element, ancre);
  ancre.setAttribute('aria-expanded', 'true');
  actuel = { element, ancre, onFermer };
  document.addEventListener('pointerdown', surPointeur, true);
  document.addEventListener('keydown', surTouche, true);
}

/** Vrai si ce clic sur `ancre` vient de fermer son propre flottant : l'appelant ne doit alors pas le rouvrir. */
export function clicVientDeFermer(ancre) {
  return ancreQuiVientDeFermer === ancre;
}

/**
 * Ouvre un petit menu d'actions sous `ancre`.
 * @param {HTMLElement} ancre
 * @param {Array<{libelle: string, action: Function, danger?: boolean, desactive?: boolean}|null>} entrees
 *   `null` insère un séparateur.
 */
export function ouvrirMenu(ancre, entrees) {
  const menu = el('div', { class: 'menu', role: 'menu' });
  for (const entree of entrees) {
    if (!entree) {
      menu.append(el('hr'));
      continue;
    }
    menu.append(
      el('button', {
        type: 'button',
        role: 'menuitem',
        class: entree.danger ? 'menu-entree menu-entree-danger' : 'menu-entree',
        text: entree.libelle,
        disabled: Boolean(entree.desactive),
        on: {
          click: () => {
            fermerFlottant('action');
            entree.action();
          },
        },
      })
    );
  }
  if (clicVientDeFermer(ancre)) return;
  ouvrirFlottant(ancre, menu);
  menu.querySelector('button:not(:disabled)')?.focus();
}
