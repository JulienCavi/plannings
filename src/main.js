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

const VUES = {
  planning: planning.afficher,
  employes: employes.afficher,
  archives: archives.afficher,
  reglages: reglages.afficher,
  export: exportEquipe.afficher,
};

const conteneur = document.getElementById('vue');
const liensNav = document.querySelectorAll('#nav a');

function analyserHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [chemin, requete] = hash.split('?');
  const nomVue = chemin || 'planning';
  const params = Object.fromEntries(new URLSearchParams(requete));
  return { nomVue, params };
}

async function router() {
  const { nomVue, params } = analyserHash();
  const rendu = VUES[nomVue] || VUES.planning;
  liensNav.forEach((lien) => {
    lien.classList.toggle('actif', lien.dataset.vue === nomVue);
  });
  conteneur.innerHTML = '';
  await rendu(conteneur, params);
}

async function demarrer() {
  const { migrationRequise, versionDepart } = await verifierVersionDonnees();
  if (migrationRequise) {
    afficherEcranMigration(versionDepart);
    return;
  }
  router();
}

function afficherEcranMigration(versionDepart) {
  conteneur.innerHTML = '';
  const bloc = document.createElement('div');
  bloc.className = 'bloc-migration';
  bloc.innerHTML = `
    <h2>Mise à jour du format de données</h2>
    <p>Cette version de l'application range les données un peu différemment. Vos plannings et
    employés existants vont être mis à jour automatiquement (rien n'est perdu).</p>
    <p>Une sauvegarde JSON de vos données actuelles sera téléchargée avant toute modification,
    par sécurité.</p>
    <p class="message-statut" data-statut></p>
  `;
  const boutonContinuer = document.createElement('button');
  boutonContinuer.type = 'button';
  boutonContinuer.className = 'bouton bouton-accent';
  boutonContinuer.textContent = 'Télécharger la sauvegarde et continuer';
  bloc.appendChild(boutonContinuer);
  conteneur.appendChild(bloc);

  const statut = bloc.querySelector('[data-statut]');
  boutonContinuer.addEventListener('click', async () => {
    boutonContinuer.disabled = true;
    try {
      statut.textContent = 'Sauvegarde en cours…';
      await telechargerSauvegardeAvantMigration(versionDepart);
      statut.textContent = 'Mise à jour des données…';
      await executerMigrationDemarrage(versionDepart);
      router();
    } catch (erreur) {
      statut.textContent = `Échec de la mise à jour : ${erreur.message}. Vos données n'ont pas été modifiées (rien n'est perdu). Réessayez, ou contactez le support avec ce message.`;
      statut.classList.add('message-erreur');
      boutonContinuer.disabled = false;
    }
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', demarrer);
