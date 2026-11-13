import {
  obtenirSemaine,
  assurerSemaine,
  toggleArchiveeSemaine,
  listerSemainesRenseignees,
  enregistrerNotes,
  retirerEmployeSemaine,
  reintegrerEmployeSemaine,
  ajouterEmployeSemaine,
} from '../db/semaines.js';
import {
  listerCasesSemaine,
  enregistrerCase,
  enregistrerCases,
  supprimerCase,
  supprimerCasesEmploye,
  dupliquerSemaine,
  obtenirCompteurCreneaux,
} from '../db/cases.js';
import { listerEmployes } from '../db/employes.js';
import { listerStatuts } from '../db/statuts.js';
import { lireMeta, ecrireMeta } from '../db/meta.js';
import {
  NOMS_JOURS,
  semaineActuelle,
  semaineDepuisParams,
  joursDeSemaine,
  semaineVoisine,
  jourCivilUTC,
  formatJourCourt,
  formatDateCourte,
  formatPeriode,
} from '../utils/semaine.js';
import { analyserHeure, dureeHeures, formatHeures, estTravaillee } from '../utils/horaire.js';
import { effectifVisible } from '../utils/effectif.js';
import { creneauxSuggeres } from '../utils/creneaux.js';
import { creerSauvegardeDifferee } from '../utils/differe.js';
import { el, bouton } from '../ui/dom.js';
import { ouvrirDialogue, ligneActions, confirmer } from '../ui/dialogue.js';
import { ouvrirFlottant, fermerFlottant, ouvrirMenu, clicVientDeFermer } from '../ui/flottant.js';
import { notifier } from '../ui/toast.js';

/** Contenu de la dernière case copiée ; conservé d'une semaine à l'autre. */
let pressePapiers = null;

const cleCase = (employeId, jour) => `${employeId}-${jour}`;
const formatCreneau = (debut, fin) => `${debut}–${fin}`;
const lienSemaine = ({ annee, numero }) => `#/planning?annee=${annee}&semaine=${numero}`;
const nomComplet = (employe) => `${employe.prenom} ${employe.nom}`.trim();
/** Les statuts sont fixes ; le repos est le seul statut non travaillé qui n'est pas une absence. */
const estRepos = (statut) => statut.code === 'R';

export async function afficher(conteneur, params) {
  const { annee, numero } = semaineDepuisParams(params);
  await dessiner(conteneur, annee, numero);
}

/**
 * Charge la semaine et (re)construit tout l'écran. Réservé à la navigation et aux actions
 * qui touchent plusieurs lignes : la saisie d'une case, elle, ne repeint que la case, le
 * total de la ligne et le pied de grille (voir `ecrireCase`).
 */
async function dessiner(conteneur, annee, numero) {
  fermerFlottant();
  const semaineExistante = await obtenirSemaine(annee, numero);
  const [tousEmployes, statuts, listeCases, compteurCreneaux, pensebete] = await Promise.all([
    listerEmployes(),
    listerStatuts(),
    semaineExistante ? listerCasesSemaine(semaineExistante.id) : [],
    obtenirCompteurCreneaux(),
    lireMeta('pensebete'),
  ]);

  const effectif = effectifVisible(tousEmployes, annee, numero, semaineExistante, listeCases);
  const idsVisibles = new Set(effectif.map((e) => e.employe.id));
  const idsRetires = new Set(semaineExistante?.retires ?? []);

  const vue = {
    annee,
    numero,
    semaine: semaineExistante ?? { id: null, annee, numeroSemaine: numero, archivee: false, notes: '' },
    jours: joursDeSemaine(annee, numero),
    statuts,
    statutsParId: new Map(statuts.map((s) => [s.id, s])),
    statutTravail: statuts.find((s) => s.compteCommeTravail),
    compteurCreneaux,
    pensebete: pensebete ?? '',
    effectif,
    retires: tousEmployes.filter((e) => idsRetires.has(e.id)),
    candidatsAjout: tousEmployes.filter((e) => !idsVisibles.has(e.id) && !idsRetires.has(e.id)),
    // Seules les cases des personnes visibles comptent à l'écran (celles d'un employé retiré restent en base, masquées).
    cases: new Map(listeCases.filter((c) => idsVisibles.has(c.employeId)).map((c) => [cleCase(c.employeId, c.jour), c])),
    boutons: new Map(),
    totaux: new Map(),
    pied: null,
    rafraichir: () => dessiner(conteneur, annee, numero),
  };
  let promesseId = null;
  /** Crée la ligne « semaine » en base si elle n'existe pas encore. À appeler avant tout vrai écrit. */
  vue.assurerSemaineId = async () => {
    promesseId ??= vue.semaine.id != null ? Promise.resolve(vue.semaine.id) : assurerSemaine(annee, numero);
    vue.semaine.id = await promesseId;
    return vue.semaine.id;
  };

  const page = el(
    'div',
    { class: 'page-planning' },
    construireEntete(vue),
    vue.semaine.archivee && construireBandeauArchivee(vue),
    vue.cases.size === 0 && !vue.semaine.archivee && effectif.length > 0 && construireBandeauVide(vue),
    construireGrille(vue),
    construireBlocRetires(vue),
    construireNotes(vue)
  );
  conteneur.replaceChildren(page);
}

/* ---------- En-tête ---------- */

function construireEntete(vue) {
  const { annee, numero, semaine, jours } = vue;
  const actuelle = semaineActuelle();
  const estActuelle = actuelle.annee === annee && actuelle.numero === numero;

  const titre = el(
    'div',
    { class: 'titre-semaine' },
    el('a', {
      class: 'bouton bouton-fleche',
      href: lienSemaine(semaineVoisine(annee, numero, -1)),
      text: '‹',
      title: 'Semaine précédente',
      'aria-label': 'Semaine précédente',
    }),
    el(
      'div',
      { class: 'titre-semaine-texte' },
      el('h1', {}, `Semaine ${numero}`, estActuelle && el('span', { class: 'pastille', text: 'en cours' })),
      el('p', { text: formatPeriode(jours[0], jours[6]) })
    ),
    el('a', {
      class: 'bouton bouton-fleche',
      href: lienSemaine(semaineVoisine(annee, numero, 1)),
      text: '›',
      title: 'Semaine suivante',
      'aria-label': 'Semaine suivante',
    }),
    !estActuelle && el('a', { class: 'bouton', href: lienSemaine(actuelle), text: 'Revenir à cette semaine' })
  );

  const boutonPlus = el('button', {
    type: 'button',
    class: 'bouton bouton-menu',
    text: '⋯',
    title: 'Autres actions',
    'aria-label': 'Autres actions sur la semaine',
    'aria-haspopup': 'menu',
  });
  boutonPlus.addEventListener('click', () =>
    ouvrirMenu(boutonPlus, [
      { libelle: 'Ajouter quelqu’un à cette semaine', action: () => ouvrirDialogueAjouter(vue), desactive: semaine.archivee },
      { libelle: semaine.archivee ? 'Désarchiver la semaine' : 'Archiver la semaine', action: () => basculerArchivage(vue) },
    ])
  );

  const actions = el(
    'div',
    { class: 'actions-semaine' },
    bouton('Semaines types', {
      disabled: semaine.archivee,
      title: 'Remplir la grille avec la semaine type de chacun',
      on: () => remplirAvecSemainesTypes(vue),
    }),
    bouton('Dupliquer…', { disabled: semaine.archivee, on: () => ouvrirDialogueDupliquer(vue) }),
    el('a', { class: 'bouton bouton-accent', href: `#/export?annee=${annee}&semaine=${numero}`, text: 'Aperçu équipe' }),
    boutonPlus
  );

  return el('header', { class: 'entete-planning' }, titre, actions);
}

async function basculerArchivage(vue) {
  const id = await vue.assurerSemaineId();
  await toggleArchiveeSemaine(id, !vue.semaine.archivee);
  vue.rafraichir();
}

function construireBandeauArchivee(vue) {
  return el(
    'div',
    { class: 'bandeau bandeau-archivee' },
    el('p', { text: 'Semaine archivée : la grille est en lecture seule.' }),
    bouton('Désarchiver', { on: () => basculerArchivage(vue) })
  );
}

function construireBandeauVide(vue) {
  const precedente = semaineVoisine(vue.annee, vue.numero, -1);
  const boutonPrecedente = bouton(`Dupliquer la semaine ${precedente.numero}`, { hidden: true });
  // Le raccourci n'apparaît que si la semaine précédente contient réellement des horaires.
  obtenirSemaine(precedente.annee, precedente.numero).then(async (source) => {
    if (!source || (await listerCasesSemaine(source.id)).length === 0) return;
    boutonPrecedente.hidden = false;
    boutonPrecedente.addEventListener('click', () => executerDuplication(vue, source.id, false));
  });
  return el(
    'div',
    { class: 'bandeau bandeau-vide' },
    el('p', { text: 'Cette semaine est vide.' }),
    el(
      'div',
      { class: 'bandeau-actions' },
      bouton('Remplir avec les semaines types', { variante: 'accent', on: () => remplirAvecSemainesTypes(vue) }),
      boutonPrecedente,
      bouton('Dupliquer une autre semaine…', { on: () => ouvrirDialogueDupliquer(vue) })
    )
  );
}

/* ---------- Grille ---------- */

function construireGrille(vue) {
  const { effectif, jours, semaine } = vue;

  if (effectif.length === 0) {
    return el(
      'div',
      { class: 'etat-vide' },
      el('p', { text: 'Personne ne figure sur cette semaine.' }),
      el('p', { class: 'etat-vide-sous-texte' }, el('a', { href: '#/employes', text: 'Ajouter des employés' }), ' pour commencer à planifier.')
    );
  }

  const aujourdhui = jourCivilUTC().getTime();
  const estAujourdhui = jours.map((j) => j.getTime() === aujourdhui);
  const classeJour = (jour) => (estAujourdhui[jour] ? 'col-jour col-aujourdhui' : 'col-jour');

  const entete = el(
    'tr',
    {},
    el('th', { class: 'col-employe', scope: 'col', text: 'Équipe' }),
    jours.map((date, jour) =>
      el('th', { class: classeJour(jour), scope: 'col' }, el('span', { class: 'jour-nom', text: formatJourCourt(date) }), el('span', { class: 'jour-date', text: formatDateCourte(date) }))
    ),
    el('th', { class: 'col-total', scope: 'col', text: 'Total' })
  );

  const corps = el('tbody');
  for (const { employe, motif } of effectif) {
    const cellules = [];
    for (let jour = 0; jour < 7; jour++) {
      const boutonCase = el('button', { type: 'button', class: 'case', disabled: semaine.archivee });
      boutonCase.addEventListener('click', () => ouvrirEditeur(vue, boutonCase, employe, jour));
      vue.boutons.set(cleCase(employe.id, jour), boutonCase);
      peindreCase(vue, employe, jour);
      cellules.push(el('td', { class: classeJour(jour) }, boutonCase));
    }
    const total = el('td', { class: 'col-total' });
    vue.totaux.set(employe.id, total);

    corps.append(
      el('tr', { class: motif === 'apres' ? 'ligne-partie' : '' }, construireCelluleEmploye(vue, employe, motif), cellules, total)
    );
    peindreTotalLigne(vue, employe.id);
  }

  vue.pied = {
    jours: Array.from({ length: 7 }, (_, jour) => el('td', { class: classeJour(jour) })),
    total: el('td', { class: 'col-total' }),
  };
  const pied = el('tfoot', {}, el('tr', {}, el('th', { class: 'col-employe', scope: 'row', text: 'Présents' }), vue.pied.jours, vue.pied.total));
  peindrePied(vue);

  return el('table', { class: 'grille' }, el('thead', {}, entete), corps, pied);
}

function construireCelluleEmploye(vue, employe, motif) {
  const contenu = el('div', { class: 'employe' }, el('span', { class: 'nom-employe', text: nomComplet(employe) }));
  const cellule = el('th', { class: 'col-employe', scope: 'row' }, contenu);
  if (motif === 'apres') {
    contenu.append(el('span', { class: 'pastille pastille-neutre', text: 'parti', title: 'Ne fait plus partie de l’équipe, affiché parce qu’il a des horaires cette semaine' }));
  } else if (motif === 'avant') {
    contenu.append(el('span', { class: 'pastille pastille-neutre', text: 'ajouté', title: 'Ajouté à cette semaine avant son arrivée dans l’équipe' }));
  }
  if (vue.semaine.archivee) return cellule;

  const aSemaineType = Array.isArray(employe.semaineType) && employe.semaineType.some(Boolean);
  const aDesCases = () => [0, 1, 2, 3, 4, 5, 6].some((jour) => vue.cases.has(cleCase(employe.id, jour)));
  const boutonMenu = el('button', {
    type: 'button',
    class: 'bouton-ligne',
    text: '⋯',
    title: `Actions pour ${employe.prenom}`,
    'aria-label': `Actions pour ${employe.prenom}`,
    'aria-haspopup': 'menu',
  });
  boutonMenu.addEventListener('click', () =>
    ouvrirMenu(boutonMenu, [
      { libelle: 'Appliquer sa semaine type', action: () => appliquerSemaineType(vue, employe), desactive: !aSemaineType },
      { libelle: 'Semaine entière en absence…', action: () => ouvrirDialogueAbsence(vue, employe) },
      { libelle: 'Vider sa semaine', action: () => viderSemaineEmploye(vue, employe), desactive: !aDesCases() },
      null,
      { libelle: 'Retirer de cette semaine', action: () => retirerDeLaSemaine(vue, employe) },
    ])
  );
  contenu.append(boutonMenu);
  return cellule;
}

/** Met à jour l'apparence d'une case d'après `vue.cases`. */
function peindreCase(vue, employe, jour) {
  const boutonCase = vue.boutons.get(cleCase(employe.id, jour));
  if (!boutonCase) return;
  const c = vue.cases.get(cleCase(employe.id, jour));
  const statut = c && vue.statutsParId.get(c.statutId);
  let texte = '';
  let classe = 'case case-vide';
  if (estTravaillee(c, vue.statutsParId)) {
    texte = formatCreneau(c.heureDebut, c.heureFin);
    classe = 'case case-travail';
  } else if (statut) {
    texte = statut.nom;
    classe = 'case case-statut';
  }
  boutonCase.className = classe;
  boutonCase.textContent = texte;
  boutonCase.style.setProperty('--teinte', statut?.couleur ?? 'transparent');
  boutonCase.setAttribute('aria-label', `${employe.prenom}, ${NOMS_JOURS[jour].toLowerCase()} : ${texte || 'vide'}`);
}

function peindreTotalLigne(vue, employeId) {
  let total = 0;
  for (let jour = 0; jour < 7; jour++) {
    const c = vue.cases.get(cleCase(employeId, jour));
    if (estTravaillee(c, vue.statutsParId)) total += dureeHeures(c.heureDebut, c.heureFin);
  }
  const cellule = vue.totaux.get(employeId);
  cellule.textContent = total > 0 ? formatHeures(total) : '';
}

/** Pied de grille : nombre de personnes qui travaillent chaque jour, et total d'heures de l'équipe. */
function peindrePied(vue) {
  if (!vue.pied) return;
  const presents = Array(7).fill(0);
  let heures = 0;
  for (const c of vue.cases.values()) {
    if (!estTravaillee(c, vue.statutsParId)) continue;
    presents[c.jour] += 1;
    heures += dureeHeures(c.heureDebut, c.heureFin);
  }
  vue.pied.jours.forEach((cellule, jour) => {
    cellule.textContent = presents[jour] > 0 ? String(presents[jour]) : '';
  });
  vue.pied.total.textContent = heures > 0 ? formatHeures(heures) : '';
}

/**
 * Enregistre (ou efface, si `contenu` est `null`) la case d'un employé, puis ne repeint que
 * ce qui a changé. L'écran entier n'est reconstruit que si la semaine vient de passer de
 * vide à renseignée (ou l'inverse), ou si la ligne d'une personne hors période n'a plus de
 * raison d'être affichée.
 */
async function ecrireCase(vue, employe, jour, contenu) {
  const id = await vue.assurerSemaineId();
  const cle = cleCase(employe.id, jour);
  const etaitVide = vue.cases.size === 0;
  if (contenu) {
    await enregistrerCase(id, employe.id, jour, contenu);
    vue.cases.set(cle, { semaineId: id, employeId: employe.id, jour, ...contenu });
  } else {
    await supprimerCase(id, employe.id, jour);
    vue.cases.delete(cle);
  }
  const horsPeriode = vue.effectif.find((e) => e.employe.id === employe.id)?.horsEffectif;
  if (etaitVide !== (vue.cases.size === 0) || (!contenu && horsPeriode)) {
    await vue.rafraichir();
    return;
  }
  peindreCase(vue, employe, jour);
  peindreTotalLigne(vue, employe.id);
  peindrePied(vue);
}

/* ---------- Bulle de saisie d'une case ---------- */

/**
 * Ouvre la bulle de saisie d'une case. Les créneaux en un clic et les statuts enregistrent
 * immédiatement ; les deux champs d'heure ne sont enregistrés qu'à la validation (Entrée,
 * bouton OK, ou clic en dehors si les deux heures sont valides). Échap annule.
 */
function ouvrirEditeur(vue, boutonCase, employe, jour) {
  if (clicVientDeFermer(boutonCase)) return;
  const actuelle = vue.cases.get(cleCase(employe.id, jour));
  const estTravail = estTravaillee(actuelle, vue.statutsParId);
  let termine = false;

  const enregistrer = async (contenu) => {
    termine = true;
    fermerFlottant('action');
    await ecrireCase(vue, employe, jour, contenu);
    vue.boutons.get(cleCase(employe.id, jour))?.focus();
  };

  // Créneaux en un clic : l'habituel de la personne ce jour-là, puis les plus fréquents.
  const suggestions = creneauxSuggeres(vue.compteurCreneaux, employe.semaineType?.[jour]);
  const rapides = el(
    'div',
    { class: 'editeur-rapides' },
    suggestions.map(({ debut, fin, habituel }) =>
      el('button', {
        type: 'button',
        class: habituel ? 'creneau-rapide creneau-habituel' : 'creneau-rapide',
        text: formatCreneau(debut, fin),
        title: habituel ? `Créneau habituel de ${employe.prenom} le ${NOMS_JOURS[jour].toLowerCase()}` : null,
        'aria-pressed': String(estTravail && actuelle.heureDebut === debut && actuelle.heureFin === fin),
        on: { click: () => enregistrer({ statutId: vue.statutTravail.id, heureDebut: debut, heureFin: fin }) },
      })
    )
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
      'aria-label': libelle,
    });
  const champDebut = champ('Heure de début', estTravail ? actuelle.heureDebut : '');
  const champFin = champ('Heure de fin', estTravail ? actuelle.heureFin : '');
  const duree = el('span', { class: 'editeur-duree', 'aria-live': 'polite' });

  /** Rend le créneau saisi s'il est complet et valide, sinon `null`. */
  const lireCreneau = () => {
    const heureDebut = analyserHeure(champDebut.value);
    const heureFin = analyserHeure(champFin.value);
    return heureDebut && heureFin && heureDebut !== heureFin ? { heureDebut, heureFin } : null;
  };
  const majDuree = () => {
    const creneau = lireCreneau();
    duree.textContent = creneau ? formatHeures(dureeHeures(creneau.heureDebut, creneau.heureFin)) : '';
    for (const c of [champDebut, champFin]) c.removeAttribute('aria-invalid');
  };
  const valider = () => {
    const creneau = lireCreneau();
    if (creneau) return enregistrer({ statutId: vue.statutTravail.id, ...creneau });
    const debutValide = analyserHeure(champDebut.value);
    const fautif = !debutValide ? champDebut : champFin;
    fautif.setAttribute('aria-invalid', 'true');
    fautif.focus();
    fautif.select();
  };

  champDebut.addEventListener('input', (evt) => {
    majDuree();
    // Heure de début complète (« 1330 », « 13h30 ») : on passe seul au champ de fin.
    if (evt.inputType?.startsWith('insert') && /^(\d{4}|\d{1,2}[h:.,]\d{2})$/.test(champDebut.value.trim())) {
      champFin.focus();
      champFin.select();
    }
  });
  champFin.addEventListener('input', majDuree);
  for (const c of [champDebut, champFin]) {
    c.addEventListener('focus', () => c.select());
    c.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        valider();
      }
    });
  }

  const horaire = el(
    'div',
    { class: 'editeur-horaire' },
    champDebut,
    el('span', { class: 'editeur-tiret', text: '–' }),
    champFin,
    duree,
    el('button', { type: 'button', class: 'bouton bouton-accent bouton-ok', text: 'OK', on: { click: valider } })
  );

  const statuts = el(
    'div',
    { class: 'editeur-statuts' },
    vue.statuts
      .filter((s) => !s.compteCommeTravail)
      .map((statut) =>
        el('button', {
          type: 'button',
          class: 'puce-statut',
          text: statut.nom,
          style: { '--teinte': statut.couleur },
          'aria-pressed': String(!estTravail && actuelle?.statutId === statut.id),
          on: { click: () => enregistrer({ statutId: statut.id, heureDebut: null, heureFin: null }) },
        })
      )
  );

  const contenuPressePapiers =
    pressePapiers &&
    (pressePapiers.heureDebut ? formatCreneau(pressePapiers.heureDebut, pressePapiers.heureFin) : vue.statutsParId.get(pressePapiers.statutId)?.nom);
  const actions = el(
    'div',
    { class: 'editeur-actions' },
    el('button', { type: 'button', class: 'bouton-texte', text: 'Vider', disabled: !actuelle, on: { click: () => enregistrer(null) } }),
    el('button', {
      type: 'button',
      class: 'bouton-texte',
      text: 'Copier',
      disabled: !actuelle,
      on: {
        click: () => {
          pressePapiers = { statutId: actuelle.statutId, heureDebut: actuelle.heureDebut, heureFin: actuelle.heureFin };
          termine = true;
          fermerFlottant('action');
          notifier('Case copiée.');
        },
      },
    }),
    el('button', {
      type: 'button',
      class: 'bouton-texte',
      text: contenuPressePapiers ? `Coller ${contenuPressePapiers}` : 'Coller',
      disabled: !contenuPressePapiers,
      on: { click: () => enregistrer({ ...pressePapiers }) },
    })
  );

  const bulle = el(
    'div',
    { class: 'editeur', role: 'dialog', 'aria-label': `${employe.prenom}, ${NOMS_JOURS[jour].toLowerCase()}` },
    el('p', { class: 'editeur-titre', text: `${employe.prenom} · ${NOMS_JOURS[jour].toLowerCase()} ${formatDateCourte(vue.jours[jour])}` }),
    suggestions.length > 0 && rapides,
    horaire,
    statuts,
    actions
  );

  ouvrirFlottant(boutonCase, bulle, {
    onFermer: (raison) => {
      // Clic en dehors avec deux heures valides et modifiées : on enregistre plutôt que de perdre la saisie.
      if (termine || raison !== 'exterieur') return;
      const creneau = lireCreneau();
      const inchange = estTravail && creneau?.heureDebut === actuelle.heureDebut && creneau?.heureFin === actuelle.heureFin;
      if (creneau && !inchange) ecrireCase(vue, employe, jour, { statutId: vue.statutTravail.id, ...creneau });
    },
  });
  majDuree();
  champDebut.focus();
}

/* ---------- Actions sur une ligne ---------- */

/** Cases de la semaine type d'un employé, sous la forme attendue par `enregistrerCases`. */
function casesDeSemaineType(employe) {
  return (employe.semaineType ?? [])
    .map((entree, jour) => entree && { employeId: employe.id, jour, ...entree })
    .filter(Boolean);
}

/** Applique la semaine type de l'employé aux jours qu'elle définit ; les autres jours ne bougent pas. */
async function appliquerSemaineType(vue, employe) {
  const aDejaDesCases = [0, 1, 2, 3, 4, 5, 6].some((jour) => vue.cases.has(cleCase(employe.id, jour)));
  if (aDejaDesCases) {
    const ok = await confirmer({
      titre: `Appliquer la semaine type de ${employe.prenom} ?`,
      texte: 'Les jours définis dans sa semaine type remplacent ce qui est déjà saisi pour lui cette semaine. Les autres jours ne changent pas.',
      libelle: 'Appliquer',
    });
    if (!ok) return;
  }
  const id = await vue.assurerSemaineId();
  await enregistrerCases(id, casesDeSemaineType(employe));
  vue.rafraichir();
}

/** Boîte « Semaine entière en absence » : un statut, des jours cochés, une seule validation. */
async function ouvrirDialogueAbsence(vue, employe) {
  const absences = vue.statuts.filter((s) => !s.compteCommeTravail && !estRepos(s));
  const choix = await ouvrirDialogue(`Absence de ${employe.prenom} sur la semaine ${vue.numero}`, (fermer) => {
    const selectStatut = el('select', { name: 'statut' }, absences.map((s) => el('option', { value: String(s.id), text: s.nom })));
    const cases = NOMS_JOURS.map((nom, jour) => ({
      jour,
      champ: el('input', { type: 'checkbox', checked: true }),
      libelle: `${nom.slice(0, 3).toLowerCase()}. ${formatDateCourte(vue.jours[jour])}`,
    }));
    return el(
      'form',
      {
        method: 'dialog',
        class: 'formulaire',
        on: {
          submit: (evt) => {
            evt.preventDefault();
            fermer({ statutId: Number(selectStatut.value), jours: cases.filter((c) => c.champ.checked).map((c) => c.jour) });
          },
        },
      },
      el('label', {}, 'Motif', selectStatut),
      el('fieldset', { class: 'jours-a-cocher' }, el('legend', { text: 'Jours concernés' }), cases.map((c) => el('label', { class: 'coche' }, c.champ, c.libelle))),
      el('p', { class: 'aide', text: 'Les jours cochés remplacent ce qui est déjà saisi pour ces jours-là.' }),
      ligneActions(bouton('Annuler', { on: () => fermer() }), bouton('Appliquer', { variante: 'accent', type: 'submit' }))
    );
  });
  if (!choix || choix.jours.length === 0) return;
  const id = await vue.assurerSemaineId();
  await enregistrerCases(id, choix.jours.map((jour) => ({ employeId: employe.id, jour, statutId: choix.statutId, heureDebut: null, heureFin: null })));
  vue.rafraichir();
}

async function viderSemaineEmploye(vue, employe) {
  const ok = await confirmer({
    titre: `Vider la semaine de ${employe.prenom} ?`,
    texte: 'Toutes ses cases de cette semaine sont effacées.',
    libelle: 'Vider',
    danger: true,
  });
  if (!ok) return;
  await supprimerCasesEmploye(await vue.assurerSemaineId(), employe.id);
  vue.rafraichir();
}

/** Retire l'employé de l'effectif de la semaine affichée. Confirme si des horaires seraient masqués. */
async function retirerDeLaSemaine(vue, employe) {
  const aDesCases = [0, 1, 2, 3, 4, 5, 6].some((jour) => vue.cases.has(cleCase(employe.id, jour)));
  if (aDesCases) {
    const ok = await confirmer({
      titre: `Retirer ${employe.prenom} de cette semaine ?`,
      texte: 'Ses horaires déjà saisis cette semaine sont conservés, pas supprimés : ils réapparaissent si vous le réintégrez.',
      libelle: 'Retirer',
      danger: true,
    });
    if (!ok) return;
  }
  await retirerEmployeSemaine(await vue.assurerSemaineId(), employe.id);
  vue.rafraichir();
}

function construireBlocRetires(vue) {
  if (vue.retires.length === 0) return null;
  return el(
    'section',
    { class: 'bloc bloc-retires' },
    el('h2', { text: 'Retirés de cette semaine' }),
    el(
      'ul',
      {},
      vue.retires.map((employe) =>
        el(
          'li',
          {},
          nomComplet(employe),
          !vue.semaine.archivee &&
            el('button', {
              type: 'button',
              class: 'bouton-texte',
              text: 'Réintégrer',
              on: {
                click: async () => {
                  await reintegrerEmployeSemaine(vue.semaine.id, employe.id);
                  vue.rafraichir();
                },
              },
            })
        )
      )
    )
  );
}

/* ---------- Actions sur la semaine ---------- */

/**
 * Remplit la grille avec la semaine type de chaque personne de l'effectif. Sur une semaine
 * déjà entamée, demande s'il faut seulement compléter les cases vides ou tout remplacer.
 */
async function remplirAvecSemainesTypes(vue) {
  // Les personnes parties (affichées seulement pour leur historique) ne sont pas concernées.
  const concernes = vue.effectif.filter((e) => e.motif !== 'apres').map((e) => e.employe);
  const liste = concernes.flatMap(casesDeSemaineType);
  if (liste.length === 0) {
    notifier('Personne n’a encore de semaine type. Elles se définissent dans l’onglet Employés.');
    return;
  }
  let seulementVides = false;
  if (vue.cases.size > 0) {
    const choix = await ouvrirDialogue('Remplir avec les semaines types', (fermer) => [
      el('p', { text: 'Cette semaine contient déjà des horaires. Que faire des cases déjà saisies ?' }),
      ligneActions(
        bouton('Annuler', { on: () => fermer() }),
        bouton('Remplacer par les semaines types', { variante: 'danger', on: () => fermer('remplacer') }),
        bouton('Compléter les cases vides', { variante: 'accent', autofocus: true, on: () => fermer('completer') })
      ),
    ]);
    if (!choix) return;
    seulementVides = choix === 'completer';
  }
  const id = await vue.assurerSemaineId();
  const ecrites = await enregistrerCases(id, liste, { seulementVides });
  await vue.rafraichir();
  notifier(ecrites === 0 ? 'Aucune case à compléter.' : `${ecrites} case${ecrites > 1 ? 's' : ''} remplie${ecrites > 1 ? 's' : ''} depuis les semaines types.`);
}

/** Copie une semaine source vers la semaine affichée, pour les personnes visibles. */
async function executerDuplication(vue, sourceId, avecAbsences) {
  const statutIds = avecAbsences
    ? null
    : vue.statuts.filter((s) => s.compteCommeTravail || estRepos(s)).map((s) => s.id);
  const cibleId = await vue.assurerSemaineId();
  const copiees = await dupliquerSemaine(sourceId, cibleId, vue.effectif.map((e) => e.employe.id), { statutIds });
  await vue.rafraichir();
  notifier(`${copiees} case${copiees > 1 ? 's' : ''} copiée${copiees > 1 ? 's' : ''}.`);
}

async function ouvrirDialogueDupliquer(vue) {
  const { annee, numero } = vue;
  const sources = (await listerSemainesRenseignees()).filter((s) => s.id !== vue.semaine.id);
  if (sources.length === 0) {
    notifier('Aucune autre semaine renseignée à dupliquer pour l’instant.');
    return;
  }
  const precedente = semaineVoisine(annee, numero, -1);
  const parDefaut = sources.find((s) => s.annee === precedente.annee && s.numeroSemaine === precedente.numero) ?? sources[0];
  const cibleRenseignee = vue.cases.size > 0;

  const choix = await ouvrirDialogue(`Dupliquer vers la semaine ${numero}`, (fermer) => {
    const selectSource = el(
      'select',
      { name: 'source' },
      sources.map((s) => {
        const jours = joursDeSemaine(s.annee, s.numeroSemaine);
        return el('option', {
          value: String(s.id),
          selected: s.id === parDefaut.id,
          text: `Semaine ${s.numeroSemaine} (${formatPeriode(jours[0], jours[6])})`,
        });
      })
    );
    const cocheAbsences = el('input', { type: 'checkbox' });
    return el(
      'form',
      {
        method: 'dialog',
        class: 'formulaire',
        on: {
          submit: (evt) => {
            evt.preventDefault();
            fermer({ sourceId: Number(selectSource.value), avecAbsences: cocheAbsences.checked });
          },
        },
      },
      el('label', {}, 'Semaine à copier', selectSource),
      el('label', { class: 'coche' }, cocheAbsences, 'Copier aussi les absences (CP, maladie, formation, férié)'),
      el('p', { class: 'aide', text: 'Sans cette option, seuls les jours travaillés et les repos sont copiés.' }),
      cibleRenseignee &&
        el('p', {
          class: 'avertissement',
          text: 'Cette semaine contient déjà des horaires : ils seront supprimés puis remplacés par ceux de la semaine copiée.',
        }),
      ligneActions(
        bouton('Annuler', { on: () => fermer() }),
        bouton(cibleRenseignee ? 'Remplacer et dupliquer' : 'Dupliquer', { variante: cibleRenseignee ? 'danger' : 'accent', type: 'submit' })
      )
    );
  });
  if (choix) await executerDuplication(vue, choix.sourceId, choix.avecAbsences);
}

/** Rattrapage : ajoute à la semaine affichée une personne qui n'y figure pas (nouvelle recrue, parti oublié). */
async function ouvrirDialogueAjouter(vue) {
  if (vue.candidatsAjout.length === 0) {
    notifier('Tout le monde figure déjà sur cette semaine.');
    return;
  }
  const employeId = await ouvrirDialogue(`Ajouter quelqu’un à la semaine ${vue.numero}`, (fermer) => {
    const select = el('select', { name: 'employeId' }, vue.candidatsAjout.map((e) => el('option', { value: String(e.id), text: nomComplet(e) })));
    return el(
      'form',
      {
        method: 'dialog',
        class: 'formulaire',
        on: {
          submit: (evt) => {
            evt.preventDefault();
            fermer(Number(select.value));
          },
        },
      },
      el('label', {}, 'Personne', select),
      ligneActions(bouton('Annuler', { on: () => fermer() }), bouton('Ajouter', { variante: 'accent', type: 'submit' }))
    );
  });
  if (employeId == null) return;
  await ajouterEmployeSemaine(await vue.assurerSemaineId(), employeId);
  vue.rafraichir();
}

/* ---------- Notes ---------- */

/** Zone de texte enregistrée seule pendant la frappe, avec une mention discrète une fois écrite. */
function zoneDeNotes({ titre, aide, valeur, placeholder, enregistrer }) {
  const etat = el('span', { class: 'notes-etat', 'aria-live': 'polite' });
  const zone = el('textarea', { class: 'notes-zone', placeholder, value: valeur, 'aria-label': titre });
  const tache = creerSauvegardeDifferee(async () => {
    await enregistrer(zone.value);
    etat.textContent = 'Enregistré';
  });
  zone.addEventListener('input', () => {
    etat.textContent = '';
    tache.planifier();
  });
  zone.addEventListener('blur', () => tache.vider());
  return el('section', { class: 'bloc bloc-notes' }, el('div', { class: 'notes-entete' }, el('h2', { text: titre }), etat), aide && el('p', { class: 'aide', text: aide }), zone);
}

function construireNotes(vue) {
  return el(
    'div',
    { class: 'notes' },
    zoneDeNotes({
      titre: `Notes de la semaine ${vue.numero}`,
      valeur: vue.semaine.notes || '',
      placeholder: 'Demandes, rappels, changements propres à cette semaine…',
      enregistrer: async (texte) => {
        if (!texte && vue.semaine.id == null) return;
        await enregistrerNotes(await vue.assurerSemaineId(), texte);
      },
    }),
    zoneDeNotes({
      titre: 'Pense-bête',
      aide: 'Reste affiché sur toutes les semaines.',
      valeur: vue.pensebete,
      placeholder: 'Ce qui doit rester sous les yeux d’une semaine à l’autre…',
      enregistrer: (texte) => ecrireMeta('pensebete', texte),
    })
  );
}
