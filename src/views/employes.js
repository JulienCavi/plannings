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
import { analyserHeure, dureeHeures, formatHeures } from '../utils/horaire.js';
import { el, bouton } from '../ui/dom.js';
import { ouvrirDialogue, ligneActions, confirmer } from '../ui/dialogue.js';
import { notifier } from '../ui/toast.js';

const nomComplet = (employe) => `${employe.prenom} ${employe.nom}`.trim();

export async function afficher(conteneur) {
  const [tous, idsAvecCases, statuts] = await Promise.all([listerEmployes(), listerEmployeIdsAvecCases(), listerStatuts()]);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));
  const { annee, numero } = semaineActuelle();
  const cleActuelle = cleSemaine(annee, numero);
  const dansEquipe = tous.filter((e) => e.finCle == null || cleActuelle <= e.finCle);
  const partis = tous.filter((e) => e.finCle != null && cleActuelle > e.finCle);
  const rafraichir = () => afficher(conteneur);

  const page = el(
    'div',
    { class: 'page-employes' },
    el(
      'header',
      { class: 'entete-page' },
      el('h1', { text: 'Employés' }),
      bouton('Ajouter un employé', { variante: 'accent', on: () => ouvrirDialogueEmploye() })
    )
  );

  if (tous.length === 0) {
    page.append(
      el(
        'div',
        { class: 'etat-vide' },
        el('p', { text: 'Aucun employé pour l’instant.' }),
        el('p', { class: 'etat-vide-sous-texte', text: 'Ajoutez une première personne pour commencer à monter un planning.' })
      )
    );
  } else {
    page.append(construireListe(`Dans l’équipe (${dansEquipe.length})`, dansEquipe, false));
    if (partis.length > 0) page.append(construireListe(`Partis (${partis.length})`, partis, true));
  }
  conteneur.replaceChildren(page);

  /** Résumé d'une semaine type : « 5 jours · 37h30 », ou une invitation à la définir. */
  function resumeSemaineType(employe) {
    const entrees = (employe.semaineType ?? []).filter(Boolean);
    const travailles = entrees.filter((e) => statutsParId.get(e.statutId)?.compteCommeTravail && e.heureDebut && e.heureFin);
    if (travailles.length === 0) return 'Semaine type à définir';
    const heures = travailles.reduce((total, e) => total + dureeHeures(e.heureDebut, e.heureFin), 0);
    return `${travailles.length} jour${travailles.length > 1 ? 's' : ''} · ${formatHeures(heures)}`;
  }

  function construireListe(titre, liste, estParti) {
    const lignes = liste.map((employe) => {
      const celluleNom = el('td', {}, el('span', { class: 'nom-employe', text: nomComplet(employe) }));
      // finCle: 0 est une sentinelle (aucune période de présence), pas une semaine réelle : pas de mention dans ce cas.
      if (estParti && employe.finCle) {
        const { annee: a, numero: n } = depuisCleSemaine(employe.finCle);
        celluleNom.append(el('span', { class: 'mention', text: `dernière semaine dans l’équipe : ${n} de ${a}` }));
      }
      return el(
        'tr',
        { class: estParti ? 'ligne-partie' : '' },
        celluleNom,
        el('td', { class: 'cellule-resume', text: resumeSemaineType(employe) }),
        el(
          'td',
          { class: 'cellule-actions' },
          el('button', { type: 'button', class: 'bouton-texte', text: 'Semaine type', on: { click: () => ouvrirDialogueSemaineType(employe) } }),
          el('button', { type: 'button', class: 'bouton-texte', text: 'Renommer', on: { click: () => ouvrirDialogueEmploye(employe) } }),
          el('button', {
            type: 'button',
            class: 'bouton-texte',
            text: estParti ? 'Réintégrer' : 'Marquer parti',
            on: { click: () => (estParti ? reintegrer(employe) : marquerParti(employe)) },
          }),
          !idsAvecCases.has(employe.id) &&
            el('button', { type: 'button', class: 'bouton-texte bouton-texte-danger', text: 'Supprimer', on: { click: () => supprimer(employe) } })
        )
      );
    });
    return el('section', { class: 'section-employes' }, el('h2', { text: titre }), el('table', { class: 'table-liste' }, el('tbody', {}, lignes)));
  }

  async function marquerParti(employe) {
    const precedente = semaineVoisine(annee, numero, -1);
    await marquerEmployeParti(employe.id, cleSemaine(precedente.annee, precedente.numero));
    await rafraichir();
    notifier(`${employe.prenom} ne figure plus sur les semaines à venir. Ses anciens plannings sont conservés.`);
  }

  async function reintegrer(employe) {
    await reintegrerEmploye(employe.id);
    await rafraichir();
    notifier(`${employe.prenom} est de retour dans l’équipe.`);
  }

  async function supprimer(employe) {
    const ok = await confirmer({
      titre: `Supprimer ${nomComplet(employe)} ?`,
      texte: 'Cette personne n’a aucune case de planning enregistrée. La suppression est définitive.',
      libelle: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await supprimerEmploye(employe.id);
    rafraichir();
  }

  async function ouvrirDialogueEmploye(employe) {
    const donnees = await ouvrirDialogue(employe ? `Renommer ${employe.prenom}` : 'Ajouter un employé', (fermer) => {
      const champPrenom = el('input', { type: 'text', name: 'prenom', required: true, value: employe?.prenom ?? '', autocomplete: 'off' });
      const champNom = el('input', { type: 'text', name: 'nom', required: true, value: employe?.nom ?? '', autocomplete: 'off' });
      return el(
        'form',
        {
          method: 'dialog',
          class: 'formulaire',
          on: {
            submit: (evt) => {
              evt.preventDefault();
              fermer({ prenom: champPrenom.value, nom: champNom.value });
            },
          },
        },
        el('label', {}, 'Prénom', champPrenom),
        el('label', {}, 'Nom', champNom),
        !employe && el('p', { class: 'aide', text: `Figurera sur le planning à partir de la semaine ${numero}.` }),
        ligneActions(bouton('Annuler', { on: () => fermer() }), bouton('Enregistrer', { variante: 'accent', type: 'submit' }))
      );
    });
    if (!donnees) return;
    if (employe) await modifierEmploye(employe.id, donnees);
    else await ajouterEmploye({ ...donnees, debutCle: cleActuelle });
    rafraichir();
  }

  async function ouvrirDialogueSemaineType(employe) {
    const modele = Array.isArray(employe.semaineType) && employe.semaineType.length === 7 ? employe.semaineType : Array(7).fill(null);
    const nouveau = await ouvrirDialogue(
      `Semaine type de ${employe.prenom}`,
      (fermer) => {
        const lignes = NOMS_JOURS.map((nomJour, jour) => construireLigneJourType(nomJour, modele[jour], statuts));
        const total = el('p', { class: 'aide' });
        const majTotal = () => {
          const heures = lignes.reduce((somme, l) => somme + l.heures(), 0);
          total.textContent = heures > 0 ? `Total de la semaine type : ${formatHeures(heures)}` : '';
        };
        const grille = el('div', { class: 'grille-semaine-type', on: { input: majTotal, change: majTotal } }, lignes.map((l) => l.element));
        majTotal();
        return el(
          'form',
          {
            method: 'dialog',
            class: 'formulaire',
            on: {
              submit: (evt) => {
                evt.preventDefault();
                const invalide = lignes.find((l) => !l.valide());
                if (invalide) {
                  invalide.signaler();
                  return;
                }
                fermer(lignes.map((l) => l.valeur()));
              },
            },
          },
          el('p', { class: 'aide', text: 'Laissez « Non défini » les jours qui changent d’une semaine à l’autre.' }),
          grille,
          total,
          ligneActions(
            bouton('Tout effacer', {
              on: () => {
                lignes.forEach((l) => l.reinitialiser());
                majTotal();
              },
            }),
            bouton('Annuler', { on: () => fermer() }),
            bouton('Enregistrer', { variante: 'accent', type: 'submit' })
          )
        );
      },
      { large: true }
    );
    if (!nouveau) return;
    await definirSemaineType(employe.id, nouveau);
    rafraichir();
  }
}

/** Construit une ligne éditable (statut + horaires) pour un jour de la semaine type. */
function construireLigneJourType(nomJour, entree, statuts) {
  const selectStatut = el(
    'select',
    { 'aria-label': `Statut du ${nomJour.toLowerCase()}` },
    el('option', { value: '', text: 'Non défini' }),
    statuts.map((s) => el('option', { value: String(s.id), text: s.nom, selected: entree?.statutId === s.id }))
  );
  const champ = (libelle, valeur) =>
    el('input', {
      type: 'text',
      class: 'champ-heure',
      inputMode: 'numeric',
      autocomplete: 'off',
      placeholder: '13h30',
      maxLength: 5,
      value: valeur ?? '',
      'aria-label': `${libelle} du ${nomJour.toLowerCase()}`,
    });
  const champDebut = champ('Heure de début', entree?.heureDebut);
  const champFin = champ('Heure de fin', entree?.heureFin);
  const duree = el('span', { class: 'jour-type-duree' });

  const statutChoisi = () => statuts.find((s) => s.id === Number(selectStatut.value));
  const lire = () => ({ heureDebut: analyserHeure(champDebut.value), heureFin: analyserHeure(champFin.value) });

  function majEtat() {
    const travaille = Boolean(statutChoisi()?.compteCommeTravail);
    champDebut.disabled = !travaille;
    champFin.disabled = !travaille;
    if (!travaille) {
      champDebut.value = '';
      champFin.value = '';
    }
    const { heureDebut, heureFin } = lire();
    duree.textContent = travaille && heureDebut && heureFin ? formatHeures(dureeHeures(heureDebut, heureFin)) : '';
    for (const c of [champDebut, champFin]) c.removeAttribute('aria-invalid');
  }
  selectStatut.addEventListener('change', () => {
    majEtat();
    if (!champDebut.disabled) champDebut.focus();
  });
  for (const c of [champDebut, champFin]) {
    c.addEventListener('input', majEtat);
    // À la sortie du champ, l'heure comprise est réécrite au format standard (« 1330 » → « 13:30 »).
    c.addEventListener('blur', () => {
      const comprise = analyserHeure(c.value);
      if (comprise) c.value = comprise;
    });
  }
  majEtat();

  return {
    element: el('div', { class: 'ligne-jour-type' }, el('span', { class: 'jour-type-nom', text: nomJour }), selectStatut, champDebut, champFin, duree),
    reinitialiser() {
      selectStatut.value = '';
      majEtat();
    },
    /** Un jour travaillé doit avoir deux heures valides et différentes. */
    valide() {
      if (!statutChoisi()?.compteCommeTravail) return true;
      const { heureDebut, heureFin } = lire();
      return Boolean(heureDebut && heureFin && heureDebut !== heureFin);
    },
    signaler() {
      const fautif = analyserHeure(champDebut.value) ? champFin : champDebut;
      fautif.setAttribute('aria-invalid', 'true');
      fautif.focus();
    },
    heures() {
      const { heureDebut, heureFin } = lire();
      return statutChoisi()?.compteCommeTravail && heureDebut && heureFin ? dureeHeures(heureDebut, heureFin) : 0;
    },
    valeur() {
      const statut = statutChoisi();
      if (!statut) return null;
      if (statut.compteCommeTravail) return { statutId: statut.id, ...lire() };
      return { statutId: statut.id, heureDebut: null, heureFin: null };
    },
  };
}
