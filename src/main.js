import './styles/main.css';
import './styles/print.css';
import * as planning from './views/planning.js';
import * as employes from './views/employes.js';
import * as archives from './views/archives.js';
import * as reglages from './views/reglages.js';
import * as exportEquipe from './views/export.js';
import {
  verifierVersionDonnees,
  telechargerSauvegardeAvantMigration,
  executerMigrationDemarrage,
} from './db/migrations.js';
import { lireMeta } from './db/meta.js';
import { baseContientDesDonnees } from './db/backup.js';
import { viderSauvegardesEnAttente } from './utils/differe.js';
import { fermerFlottant } from './ui/flottant.js';
import { notifier } from './ui/toast.js';
import { el, bouton } from './ui/dom.js';

const VUES = {
  planning: planning.afficher,
  employes: employes.afficher,
  archives: archives.afficher,
  reglages: reglages.afficher,
  export: exportEquipe.afficher,
};

/** Au-delà de ce délai sans export, l'onglet Réglages porte un point de rappel. */
const JOURS_AVANT_RAPPEL = 7;

const conteneur = document.getElementById('vue');
const liensNav = document.querySelectorAll('#nav a');
let navigationEnCours = 0;

function analyserHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [chemin, requete] = hash.split('?');
  const nomVue = chemin in VUES ? chemin : 'planning';
  const params = Object.fromEntries(new URLSearchParams(requete));
  return { nomVue, params };
}

/**
 * Affiche l'écran désigné par l'URL. Chaque écran se construit dans un conteneur détaché,
 * mis en place seulement s'il correspond encore à la dernière navigation demandée : deux
 * clics rapprochés ne peuvent pas laisser à l'écran une semaine différente de celle de l'URL.
 */
async function router() {
  const numero = ++navigationEnCours;
  fermerFlottant();
  await viderSauvegardesEnAttente();
  const { nomVue, params } = analyserHash();
  liensNav.forEach((lien) => {
    const actif = lien.dataset.vue === nomVue;
    lien.classList.toggle('actif', actif);
    if (actif) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  });
  const racine = el('div', { class: 'vue-racine' });
  await VUES[nomVue](racine, params);
  if (numero !== navigationEnCours) return;
  conteneur.replaceChildren(racine);
  majRappelSauvegarde();
}

/** Point de rappel sur « Réglages » quand des données existent et n'ont pas été exportées récemment. */
async function majRappelSauvegarde() {
  const lien = document.querySelector('#nav a[data-vue="reglages"]');
  const [dernierExport, aDesDonnees] = await Promise.all([lireMeta('dernierExport'), baseContientDesDonnees()]);
  const jours = dernierExport ? (Date.now() - new Date(dernierExport).getTime()) / 86400000 : Infinity;
  const aRappeler = aDesDonnees && jours > JOURS_AVANT_RAPPEL;
  lien.classList.toggle('a-rappel', aRappeler);
  lien.title = aRappeler
    ? dernierExport
      ? `Dernier export il y a ${Math.floor(jours)} jours`
      : 'Aucun export enregistré depuis ce navigateur'
    : '';
}

async function demarrer() {
  // Demande au navigateur de ne pas purger les données de lui-même (sans effet visible, refus possible).
  navigator.storage?.persist?.().catch(() => {});
  const { migrationRequise, versionDepart } = await verifierVersionDonnees();
  if (migrationRequise) {
    afficherEcranMigration(versionDepart);
    return;
  }
  router();
}

function afficherEcranMigration(versionDepart) {
  const statut = el('p', { class: 'message-statut', role: 'status' });
  const boutonContinuer = bouton('Télécharger la sauvegarde et continuer', { variante: 'accent' });
  boutonContinuer.addEventListener('click', async () => {
    boutonContinuer.disabled = true;
    statut.classList.remove('message-statut-erreur');
    try {
      statut.textContent = 'Sauvegarde en cours…';
      await telechargerSauvegardeAvantMigration(versionDepart);
      statut.textContent = 'Mise à jour des données…';
      await executerMigrationDemarrage(versionDepart);
      router();
    } catch (erreur) {
      statut.textContent = `Échec de la mise à jour : ${erreur.message}. Vos données n'ont pas été modifiées. Réessayez ; si l'erreur revient, gardez la sauvegarde téléchargée.`;
      statut.classList.add('message-statut-erreur');
      boutonContinuer.disabled = false;
    }
  });
  conteneur.replaceChildren(
    el(
      'div',
      { class: 'bloc bloc-migration' },
      el('h1', { text: 'Mise à jour du format de données' }),
      el('p', {
        text: "Cette version de l'application range les données un peu différemment. Vos plannings et employés existants vont être mis à jour automatiquement, sans rien perdre.",
      }),
      el('p', { text: 'Une sauvegarde JSON de vos données actuelles est téléchargée avant toute modification, par sécurité.' }),
      statut,
      boutonContinuer
    )
  );
}

/** Aucune erreur ne doit passer inaperçue : un enregistrement qui échoue est toujours signalé. */
function signalerErreur(erreur) {
  console.error(erreur);
  const detail = erreur?.message ? ` (${erreur.message})` : '';
  notifier(`Une erreur est survenue${detail}. La dernière action n’a peut-être pas été enregistrée : rechargez la page pour vérifier.`, { erreur: true });
}

window.addEventListener('unhandledrejection', (evt) => signalerErreur(evt.reason));
window.addEventListener('error', (evt) => signalerErreur(evt.error ?? new Error(evt.message)));
window.addEventListener('hashchange', router);
window.addEventListener('pagehide', () => viderSauvegardesEnAttente());
document.addEventListener('etat-sauvegarde-change', majRappelSauvegarde);
window.addEventListener('DOMContentLoaded', demarrer);
