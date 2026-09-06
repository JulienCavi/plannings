import {
  listerEmployes,
  ajouterEmploye,
  modifierEmploye,
  marquerEmployeParti,
  reintegrerEmploye,
  supprimerEmploye,
  definirSemaineType,
} from '../db/employes.js';
import { listerEmployeIdsAvecCases } from '../db/cases.js';
import { listerStatuts } from '../db/statuts.js';
import { NOMS_JOURS, semaineActuelle, semaineVoisine, cleSemaine, depuisCleSemaine } from '../utils/semaine.js';

export async function afficher(conteneur) {
  const [tous, idsAvecCases] = await Promise.all([listerEmployes(), listerEmployeIdsAvecCases()]);
  const { annee, numero } = semaineActuelle();
  const cleActuelle = cleSemaine(annee, numero);
  const dansEquipe = tous.filter((e) => e.finCle == null || cleActuelle <= e.finCle);
  const partis = tous.filter((e) => e.finCle != null && cleActuelle > e.finCle);

  const page = document.createElement('div');
  page.className = 'page-employes';

  const entete = document.createElement('div');
  entete.className = 'entete-page';
  entete.innerHTML = '<h2>Employés</h2>';
  const boutonAjouter = document.createElement('button');
  boutonAjouter.type = 'button';
  boutonAjouter.className = 'bouton bouton-accent';
  boutonAjouter.textContent = 'Ajouter un employé';
  boutonAjouter.addEventListener('click', () => ouvrirDialogueEmploye());
  entete.appendChild(boutonAjouter);
  page.appendChild(entete);

  if (dansEquipe.length === 0 && partis.length === 0) {
    page.appendChild(construireEtatVide());
  } else {
    page.appendChild(construireListe("Dans l'équipe", dansEquipe, false));
    if (partis.length > 0) {
      page.appendChild(construireListe('Partis', partis, true));
    }
  }

  conteneur.appendChild(page);

  function construireEtatVide() {
    const vide = document.createElement('div');
    vide.className = 'etat-vide';
    vide.innerHTML = `
      <p>Aucun employé pour l'instant.</p>
      <p class="etat-vide-sous-texte">Ajoutez votre première recrue pour commencer à monter un planning.</p>
    `;
    return vide;
  }

  function construireListe(titre, liste, estParti) {
    const section = document.createElement('section');
    section.className = 'section-employes';
    const h3 = document.createElement('h3');
    h3.textContent = titre;
    section.appendChild(h3);

    const table = document.createElement('table');
    table.className = 'table-employes';
    liste.forEach((employe) => {
      const ligne = document.createElement('tr');
      if (estParti) ligne.classList.add('ligne-inactive');

      const tdNom = document.createElement('td');
      const nom = document.createElement('span');
      nom.textContent = `${employe.prenom} ${employe.nom}`;
      tdNom.appendChild(nom);
      // finCle: 0 est une sentinelle (aucune période de présence), pas une semaine réelle — pas de mention dans ce cas.
      if (estParti && employe.finCle) {
        const { annee: a, numero: n } = depuisCleSemaine(employe.finCle);
        const mention = document.createElement('span');
        mention.className = 'mention-depart';
        mention.textContent = ` — dernière semaine dans l'effectif : semaine ${n} — ${a}`;
        tdNom.appendChild(mention);
      }
      ligne.appendChild(tdNom);

      const tdActions = document.createElement('td');
      tdActions.className = 'cellule-actions';

      const boutonEditer = document.createElement('button');
      boutonEditer.type = 'button';
      boutonEditer.className = 'bouton-icone';
      boutonEditer.textContent = 'Éditer';
      boutonEditer.addEventListener('click', () => ouvrirDialogueEmploye(employe));
      tdActions.appendChild(boutonEditer);

      const boutonSemaineType = document.createElement('button');
      boutonSemaineType.type = 'button';
      boutonSemaineType.className = 'bouton-icone';
      boutonSemaineType.textContent = 'Semaine type';
      boutonSemaineType.addEventListener('click', () => ouvrirDialogueSemaineType(employe));
      tdActions.appendChild(boutonSemaineType);

      const boutonArchiver = document.createElement('button');
      boutonArchiver.type = 'button';
      boutonArchiver.className = 'bouton-icone';
      boutonArchiver.textContent = estParti ? 'Réintégrer' : 'Archiver';
      boutonArchiver.addEventListener('click', async () => {
        if (estParti) {
          await reintegrerEmploye(employe.id);
        } else {
          const precedente = semaineVoisine(annee, numero, -1);
          await marquerEmployeParti(employe.id, cleSemaine(precedente.annee, precedente.numero));
        }
        rafraichir();
      });
      tdActions.appendChild(boutonArchiver);

      if (!idsAvecCases.has(employe.id)) {
        const boutonSupprimer = document.createElement('button');
        boutonSupprimer.type = 'button';
        boutonSupprimer.className = 'bouton-icone bouton-danger';
        boutonSupprimer.textContent = 'Supprimer';
        boutonSupprimer.addEventListener('click', () => ouvrirDialogueSuppression(employe));
        tdActions.appendChild(boutonSupprimer);
      }

      ligne.appendChild(tdActions);
      table.appendChild(ligne);
    });
    section.appendChild(table);
    return section;
  }

  function ouvrirDialogueEmploye(employe) {
    const estEdition = Boolean(employe);
    const dialogue = document.createElement('dialog');
    dialogue.className = 'dialogue';
    dialogue.innerHTML = `
      <form method="dialog" class="formulaire">
        <h3>${estEdition ? "Éditer l'employé" : 'Ajouter un employé'}</h3>
        <label>Prénom <input type="text" name="prenom" required value="${champEchappe(employe?.prenom)}" /></label>
        <label>Nom <input type="text" name="nom" required value="${champEchappe(employe?.nom)}" /></label>
        <div class="dialogue-actions">
          <button type="button" class="bouton" data-annuler>Annuler</button>
          <button type="submit" class="bouton bouton-accent">Enregistrer</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialogue);
    dialogue.querySelector('[data-annuler]').addEventListener('click', () => dialogue.close());
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.querySelector('form').addEventListener('submit', async (evt) => {
      const donnees = Object.fromEntries(new FormData(evt.target).entries());
      if (estEdition) {
        await modifierEmploye(employe.id, donnees);
      } else {
        await ajouterEmploye({ ...donnees, debutCle: cleActuelle });
      }
      dialogue.close();
      rafraichir();
    });
    dialogue.showModal();
  }

  function ouvrirDialogueSuppression(employe) {
    const dialogue = document.createElement('dialog');
    dialogue.className = 'dialogue';
    dialogue.innerHTML = `
      <div class="formulaire">
        <h3>Supprimer ${champEchappe(employe.prenom)} ${champEchappe(employe.nom)} ?</h3>
        <p>Cet employé n'a aucune case de planning enregistrée. Cette action est irréversible.</p>
        <div class="dialogue-actions">
          <button type="button" class="bouton" data-annuler>Annuler</button>
          <button type="button" class="bouton bouton-danger" data-confirmer>Supprimer</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialogue);
    dialogue.querySelector('[data-annuler]').addEventListener('click', () => dialogue.close());
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.querySelector('[data-confirmer]').addEventListener('click', async () => {
      await supprimerEmploye(employe.id);
      dialogue.close();
      rafraichir();
    });
    dialogue.showModal();
  }

  async function ouvrirDialogueSemaineType(employe) {
    const statuts = await listerStatuts();
    const template =
      Array.isArray(employe.semaineType) && employe.semaineType.length === 7
        ? employe.semaineType
        : Array(7).fill(null);

    const dialogue = document.createElement('dialog');
    dialogue.className = 'dialogue dialogue-large';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'formulaire';

    const titre = document.createElement('h3');
    titre.textContent = `Semaine type de ${employe.prenom}`;
    form.appendChild(titre);

    const grille = document.createElement('div');
    grille.className = 'grille-semaine-type';
    const lignes = NOMS_JOURS.map((nomJour, jour) =>
      construireLigneJourType(nomJour, template[jour], statuts)
    );
    lignes.forEach((ligne) => grille.appendChild(ligne.element));
    form.appendChild(grille);

    const actions = document.createElement('div');
    actions.className = 'dialogue-actions';

    const boutonEffacer = document.createElement('button');
    boutonEffacer.type = 'button';
    boutonEffacer.className = 'bouton';
    boutonEffacer.textContent = 'Tout effacer';
    boutonEffacer.addEventListener('click', () => lignes.forEach((l) => l.reinitialiser()));
    actions.appendChild(boutonEffacer);

    const boutonAnnuler = document.createElement('button');
    boutonAnnuler.type = 'button';
    boutonAnnuler.className = 'bouton';
    boutonAnnuler.textContent = 'Annuler';
    boutonAnnuler.addEventListener('click', () => dialogue.close());
    actions.appendChild(boutonAnnuler);

    const boutonEnregistrer = document.createElement('button');
    boutonEnregistrer.type = 'submit';
    boutonEnregistrer.className = 'bouton bouton-accent';
    boutonEnregistrer.textContent = 'Enregistrer';
    actions.appendChild(boutonEnregistrer);

    form.appendChild(actions);
    dialogue.appendChild(form);
    document.body.appendChild(dialogue);
    dialogue.addEventListener('close', () => dialogue.remove());
    form.addEventListener('submit', async () => {
      const nouveauTemplate = lignes.map((l) => l.valeur());
      await definirSemaineType(employe.id, nouveauTemplate);
      dialogue.close();
      rafraichir();
    });
    dialogue.showModal();
  }

  function rafraichir() {
    conteneur.innerHTML = '';
    afficher(conteneur);
  }
}

/** Construit une ligne éditable (statut + horaire) pour un jour de la semaine type. */
function construireLigneJourType(nomJour, entree, statuts) {
  const ligne = document.createElement('div');
  ligne.className = 'ligne-jour-type';

  const label = document.createElement('span');
  label.className = 'jour-type-nom';
  label.textContent = nomJour;
  ligne.appendChild(label);

  const selectStatut = document.createElement('select');
  const optionVide = document.createElement('option');
  optionVide.value = '';
  optionVide.textContent = 'Non défini';
  selectStatut.appendChild(optionVide);
  statuts.forEach((statut) => {
    const option = document.createElement('option');
    option.value = String(statut.id);
    option.textContent = statut.nom;
    if (entree?.statutId === statut.id) option.selected = true;
    selectStatut.appendChild(option);
  });
  ligne.appendChild(selectStatut);

  const champDebut = document.createElement('input');
  champDebut.type = 'time';
  champDebut.value = entree?.heureDebut || '';
  const champFin = document.createElement('input');
  champFin.type = 'time';
  champFin.value = entree?.heureFin || '';
  ligne.append(champDebut, champFin);

  function majEtatChamps() {
    const statut = statuts.find((s) => s.id === Number(selectStatut.value));
    const travaille = Boolean(statut?.compteCommeTravail);
    champDebut.disabled = !travaille;
    champFin.disabled = !travaille;
  }
  selectStatut.addEventListener('change', majEtatChamps);
  majEtatChamps();

  return {
    element: ligne,
    reinitialiser() {
      selectStatut.value = '';
      champDebut.value = '';
      champFin.value = '';
      majEtatChamps();
    },
    valeur() {
      if (!selectStatut.value) return null;
      const statutId = Number(selectStatut.value);
      const statut = statuts.find((s) => s.id === statutId);
      if (statut?.compteCommeTravail) {
        if (!champDebut.value || !champFin.value) return null;
        return { statutId, heureDebut: champDebut.value, heureFin: champFin.value };
      }
      return { statutId, heureDebut: null, heureFin: null };
    },
  };
}

function champEchappe(valeur) {
  if (!valeur) return '';
  const div = document.createElement('div');
  div.textContent = valeur;
  return div.innerHTML;
}
