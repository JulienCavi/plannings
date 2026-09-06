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
import { listerCasesSemaine, enregistrerCase, supprimerCase, dupliquerSemaine } from '../db/cases.js';
import { listerEmployes } from '../db/employes.js';
import { listerStatuts } from '../db/statuts.js';
import {
  semaineActuelle,
  joursDeSemaine,
  semaineVoisine,
  formatJourCourt,
  formatDateCourte,
} from '../utils/semaine.js';
import { totalHeuresEmploye, formatHeures } from '../utils/horaire.js';
import { effectifVisible } from '../utils/effectif.js';

const CRENEAUX_RAPIDES = [
  { debut: '06:00', fin: '13:00' },
  { debut: '13:00', fin: '20:00' },
  { debut: '09:00', fin: '17:00' },
];

let popoverActuel = null;
let pressePapiers = null;

/** Résumé court du contenu du presse-papiers pour l'afficher sur le bouton Coller. */
function resumePressePapiers(contenu, statutsParId) {
  const statut = statutsParId.get(contenu.statutId);
  if (!statut) return '';
  if (statut.compteCommeTravail && contenu.heureDebut && contenu.heureFin) {
    return `${contenu.heureDebut}–${contenu.heureFin}`;
  }
  return statut.code;
}

export async function afficher(conteneur, params) {
  const { annee, numero } =
    params.annee && params.semaine
      ? { annee: Number(params.annee), numero: Number(params.semaine) }
      : semaineActuelle();
  await dessiner(conteneur, annee, numero);
}

async function dessiner(conteneur, annee, numero) {
  fermerPopover();
  const semaineExistante = await obtenirSemaine(annee, numero);
  const semaine = semaineExistante ?? { id: null, annee, numeroSemaine: numero, archivee: false, notes: '' };
  const [tousEmployes, statuts, cases] = await Promise.all([
    listerEmployes(),
    listerStatuts(),
    semaine.id ? listerCasesSemaine(semaine.id) : Promise.resolve([]),
  ]);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));
  const jours = joursDeSemaine(annee, numero);

  const effectif = effectifVisible(tousEmployes, annee, numero, semaineExistante, cases);
  const idsVisibles = new Set(effectif.map((e) => e.employe.id));
  const idsRetires = new Set(semaineExistante?.retires ?? []);
  const retiresAffiches = tousEmployes
    .filter((e) => idsRetires.has(e.id))
    .sort((a, b) => a.prenom.localeCompare(b.prenom));
  const candidatsAjout = tousEmployes
    .filter((e) => !idsVisibles.has(e.id) && !idsRetires.has(e.id))
    .sort((a, b) => a.prenom.localeCompare(b.prenom));

  const ctx = { conteneur, annee, numero, semaine, effectif, retiresAffiches, candidatsAjout, statuts, statutsParId, cases, jours };
  ctx.rafraichir = () => dessiner(conteneur, annee, numero);
  /** Crée la ligne "semaine" en base si elle n'existe pas encore. À appeler avant tout vrai écrit. */
  ctx.assurerSemaineId = async () => {
    if (semaine.id == null) {
      semaine.id = await assurerSemaine(annee, numero);
    }
    return semaine.id;
  };

  conteneur.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page-planning';
  page.appendChild(construireEntete(ctx));

  if (cases.length === 0 && !semaine.archivee) {
    page.appendChild(construireBanniereVide(ctx));
  }

  page.appendChild(construireGrille(ctx));
  page.appendChild(construireBlocRetires(ctx));
  page.appendChild(construireBlocNotes(ctx));
  conteneur.appendChild(page);
}

function construireBlocNotes(ctx) {
  const { semaine } = ctx;
  const bloc = document.createElement('div');
  bloc.className = 'bloc-notes';

  const titre = document.createElement('h3');
  titre.textContent = 'Notes';
  bloc.appendChild(titre);

  const zone = document.createElement('textarea');
  zone.className = 'notes-textarea';
  zone.placeholder = 'Notes libres pour cette semaine…';
  zone.value = semaine.notes || '';
  zone.addEventListener('blur', async () => {
    if (!zone.value && semaine.id == null) return;
    const id = await ctx.assurerSemaineId();
    await enregistrerNotes(id, zone.value);
  });
  bloc.appendChild(zone);

  return bloc;
}

function construireBlocRetires(ctx) {
  const { retiresAffiches, semaine } = ctx;
  if (retiresAffiches.length === 0) return document.createDocumentFragment();

  const bloc = document.createElement('div');
  bloc.className = 'bloc-retires';

  const titre = document.createElement('h3');
  titre.textContent = 'Retirés de cette semaine';
  bloc.appendChild(titre);

  const liste = document.createElement('ul');
  liste.className = 'liste-retires';
  retiresAffiches.forEach((employe) => {
    const item = document.createElement('li');
    const nom = document.createElement('span');
    nom.textContent = `${employe.prenom} ${employe.nom}`;
    item.appendChild(nom);

    if (!semaine.archivee) {
      const boutonReintegrer = document.createElement('button');
      boutonReintegrer.type = 'button';
      boutonReintegrer.className = 'bouton-lien';
      boutonReintegrer.textContent = 'Réintégrer';
      boutonReintegrer.addEventListener('click', async () => {
        await reintegrerEmployeSemaine(semaine.id, employe.id);
        ctx.rafraichir();
      });
      item.appendChild(boutonReintegrer);
    }

    liste.appendChild(item);
  });
  bloc.appendChild(liste);

  return bloc;
}

function construireEntete(ctx) {
  const { annee, numero, semaine, jours } = ctx;
  const entete = document.createElement('div');
  entete.className = 'entete-planning';

  const blocTitre = document.createElement('div');
  blocTitre.className = 'bloc-titre-semaine';
  blocTitre.innerHTML = `
    <h2>Semaine ${numero} — ${annee}</h2>
    <p>${formatDateCourte(jours[0])} – ${formatDateCourte(jours[6])}</p>
  `;
  entete.appendChild(blocTitre);

  const nav = document.createElement('div');
  nav.className = 'nav-semaine';
  const precedente = semaineVoisine(annee, numero, -1);
  const suivante = semaineVoisine(annee, numero, 1);
  const actuelle = semaineActuelle();
  nav.innerHTML = `
    <a class="bouton" href="#/planning?annee=${precedente.annee}&semaine=${precedente.numero}">◀ Précédente</a>
    <a class="bouton" href="#/planning?annee=${actuelle.annee}&semaine=${actuelle.numero}">Aujourd'hui</a>
    <a class="bouton" href="#/planning?annee=${suivante.annee}&semaine=${suivante.numero}">Suivante ▶</a>
  `;
  entete.appendChild(nav);

  const actions = document.createElement('div');
  actions.className = 'actions-semaine';

  const boutonAjouter = document.createElement('button');
  boutonAjouter.type = 'button';
  boutonAjouter.className = 'bouton';
  boutonAjouter.textContent = 'Ajouter à la semaine';
  boutonAjouter.disabled = semaine.archivee;
  boutonAjouter.addEventListener('click', () => ouvrirDialogueAjouter(ctx));
  actions.appendChild(boutonAjouter);

  const boutonDupliquer = document.createElement('button');
  boutonDupliquer.type = 'button';
  boutonDupliquer.className = 'bouton';
  boutonDupliquer.textContent = 'Dupliquer';
  boutonDupliquer.disabled = semaine.archivee;
  boutonDupliquer.addEventListener('click', () => ouvrirDialogueDupliquer(ctx));
  actions.appendChild(boutonDupliquer);

  const lienApercu = document.createElement('a');
  lienApercu.className = 'bouton';
  lienApercu.href = `#/export?annee=${annee}&semaine=${numero}`;
  lienApercu.textContent = 'Aperçu équipe';
  actions.appendChild(lienApercu);

  const boutonArchiver = document.createElement('button');
  boutonArchiver.type = 'button';
  boutonArchiver.className = 'bouton';
  boutonArchiver.textContent = semaine.archivee ? 'Désarchiver' : 'Archiver';
  boutonArchiver.addEventListener('click', async () => {
    const id = await ctx.assurerSemaineId();
    await toggleArchiveeSemaine(id, !semaine.archivee);
    ctx.rafraichir();
  });
  actions.appendChild(boutonArchiver);

  entete.appendChild(actions);

  const enteteConteneur = document.createElement('div');
  enteteConteneur.appendChild(entete);

  if (semaine.archivee) {
    const banniere = document.createElement('div');
    banniere.className = 'banniere-archivee';
    banniere.textContent = 'Semaine archivée — lecture seule';
    enteteConteneur.appendChild(banniere);
  }

  return enteteConteneur;
}

function construireBanniereVide(ctx) {
  const banniere = document.createElement('div');
  banniere.className = 'banniere-vide';
  const texte = document.createElement('p');
  texte.textContent = 'Cette semaine est vide.';
  banniere.appendChild(texte);

  const actions = document.createElement('div');
  actions.className = 'dialogue-actions';

  const boutonDupliquer = document.createElement('button');
  boutonDupliquer.type = 'button';
  boutonDupliquer.className = 'bouton bouton-accent';
  boutonDupliquer.textContent = 'Dupliquer la semaine précédente';
  boutonDupliquer.addEventListener('click', () => ouvrirDialogueDupliquer(ctx));
  actions.appendChild(boutonDupliquer);

  const boutonVierge = document.createElement('button');
  boutonVierge.type = 'button';
  boutonVierge.className = 'bouton';
  boutonVierge.textContent = 'Grille vierge';
  boutonVierge.addEventListener('click', () => banniere.remove());
  actions.appendChild(boutonVierge);

  banniere.appendChild(actions);
  return banniere;
}

function construireGrille(ctx) {
  const { effectif, jours, semaine, cases, statutsParId } = ctx;

  if (effectif.length === 0) {
    const vide = document.createElement('div');
    vide.className = 'etat-vide';
    vide.innerHTML = `
      <p>Aucun employé visible sur cette semaine.</p>
      <p class="etat-vide-sous-texte"><a href="#/employes">Ajoutez des employés</a> pour commencer à planifier.</p>
    `;
    return vide;
  }

  const casesParCle = new Map(cases.map((c) => [`${c.employeId}-${c.jour}`, c]));

  const table = document.createElement('table');
  table.className = 'grille-planning';

  const thead = document.createElement('thead');
  const trEntete = document.createElement('tr');
  const thEmploye = document.createElement('th');
  thEmploye.className = 'colonne-employe';
  thEmploye.textContent = 'Employé';
  trEntete.appendChild(thEmploye);
  jours.forEach((jour) => {
    const th = document.createElement('th');
    th.innerHTML = `${formatJourCourt(jour)}<br />${formatDateCourte(jour)}`;
    trEntete.appendChild(th);
  });
  const thTotal = document.createElement('th');
  thTotal.className = 'colonne-total';
  thTotal.textContent = 'Total';
  trEntete.appendChild(thTotal);
  thead.appendChild(trEntete);
  table.appendChild(thead);

  const corps = document.createElement('tbody');
  effectif.forEach(({ employe, horsEffectif }) => {
    const ligne = document.createElement('tr');
    if (horsEffectif) ligne.classList.add('ligne-hors-effectif');

    const tdEmploye = document.createElement('td');
    tdEmploye.className = 'colonne-employe';

    const nomEmploye = document.createElement('span');
    nomEmploye.className = 'nom-employe';
    nomEmploye.textContent = `${employe.prenom} ${employe.nom}`;
    tdEmploye.appendChild(nomEmploye);

    if (horsEffectif) {
      const mention = document.createElement('span');
      mention.className = 'mention-hors-effectif';
      mention.textContent = 'parti';
      tdEmploye.appendChild(mention);
    }

    if (!semaine.archivee) {
      const aSemaineType = Array.isArray(employe.semaineType) && employe.semaineType.some(Boolean);
      if (aSemaineType) {
        const boutonSemaineType = document.createElement('button');
        boutonSemaineType.type = 'button';
        boutonSemaineType.className = 'bouton-lien bouton-semaine-type';
        boutonSemaineType.textContent = 'Semaine type';
        boutonSemaineType.addEventListener('click', () => appliquerSemaineType(ctx, employe));
        tdEmploye.appendChild(boutonSemaineType);
      }

      const boutonRetirer = document.createElement('button');
      boutonRetirer.type = 'button';
      boutonRetirer.className = 'bouton-lien bouton-retirer';
      boutonRetirer.textContent = 'Retirer de cette semaine';
      boutonRetirer.addEventListener('click', () => retirerDeLaSemaine(ctx, employe));
      tdEmploye.appendChild(boutonRetirer);
    }

    ligne.appendChild(tdEmploye);

    for (let jour = 0; jour < 7; jour++) {
      ligne.appendChild(
        construireCelluleJour(ctx, employe, jour, casesParCle.get(`${employe.id}-${jour}`))
      );
    }

    const tdTotal = document.createElement('td');
    tdTotal.className = 'colonne-total chiffre';
    tdTotal.textContent = formatHeures(totalHeuresEmploye(cases, employe.id, statutsParId));
    ligne.appendChild(tdTotal);

    corps.appendChild(ligne);
  });
  table.appendChild(corps);

  return table;
}

function construireCelluleJour(ctx, employe, jour, caseActuelle) {
  const { statutsParId, semaine } = ctx;
  const td = document.createElement('td');
  td.className = 'cellule-jour';

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'cellule-bouton';

  const statut = caseActuelle && statutsParId.get(caseActuelle.statutId);
  if (statut && statut.compteCommeTravail && caseActuelle.heureDebut && caseActuelle.heureFin) {
    const horaire = document.createElement('span');
    horaire.className = 'cellule-horaire';
    horaire.textContent = `${caseActuelle.heureDebut}–${caseActuelle.heureFin}`;
    bouton.appendChild(horaire);
    bouton.style.backgroundColor = `${statut.couleur}22`;
  } else if (statut) {
    bouton.textContent = statut.code;
    bouton.style.backgroundColor = `${statut.couleur}33`;
    bouton.style.color = statut.couleur;
  } else {
    bouton.textContent = '—';
    bouton.classList.add('cellule-vide');
  }

  if (semaine.archivee) {
    bouton.disabled = true;
  } else {
    bouton.addEventListener('click', () => ouvrirPopover(bouton, ctx, employe, jour, caseActuelle));
  }

  td.appendChild(bouton);
  return td;
}

/** Retire l'employé de l'effectif de la semaine affichée. Confirme si des horaires seraient masqués. */
async function retirerDeLaSemaine(ctx, employe) {
  const executer = async () => {
    const id = await ctx.assurerSemaineId();
    await retirerEmployeSemaine(id, employe.id);
    ctx.rafraichir();
  };
  const aDesCasesCetteSemaine = ctx.cases.some((c) => c.employeId === employe.id);
  if (aDesCasesCetteSemaine) {
    ouvrirDialogueConfirmationRetrait(employe, executer);
  } else {
    await executer();
  }
}

function ouvrirDialogueConfirmationRetrait(employe, executer) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  const p = document.createElement('div');
  p.className = 'formulaire';
  const titre = document.createElement('h3');
  titre.textContent = `Retirer ${employe.prenom} de cette semaine ?`;
  const texte = document.createElement('p');
  texte.textContent =
    'Ses horaires déjà saisis cette semaine sont conservés, pas supprimés : ils réapparaîtront si vous le réintégrez.';
  const actions = document.createElement('div');
  actions.className = 'dialogue-actions';
  const boutonAnnuler = document.createElement('button');
  boutonAnnuler.type = 'button';
  boutonAnnuler.className = 'bouton';
  boutonAnnuler.textContent = 'Annuler';
  boutonAnnuler.addEventListener('click', () => dialogue.close());
  const boutonConfirmer = document.createElement('button');
  boutonConfirmer.type = 'button';
  boutonConfirmer.className = 'bouton bouton-danger';
  boutonConfirmer.textContent = 'Retirer';
  boutonConfirmer.addEventListener('click', async () => {
    dialogue.close();
    await executer();
  });
  actions.append(boutonAnnuler, boutonConfirmer);
  p.append(titre, texte, actions);
  dialogue.appendChild(p);
  document.body.appendChild(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.showModal();
}

/** Applique la semaine type de l'employé aux jours définis de la semaine affichée. */
async function appliquerSemaineType(ctx, employe) {
  const executer = async () => {
    const id = await ctx.assurerSemaineId();
    for (let jour = 0; jour < 7; jour++) {
      const entree = employe.semaineType[jour];
      if (!entree) continue;
      await enregistrerCase(id, employe.id, jour, { ...entree });
    }
    ctx.rafraichir();
  };
  const aDejaDesCases = ctx.cases.some((c) => c.employeId === employe.id);
  if (aDejaDesCases) {
    ouvrirDialogueConfirmationSemaineType(employe, executer);
  } else {
    await executer();
  }
}

function ouvrirDialogueConfirmationSemaineType(employe, executer) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  const p = document.createElement('div');
  p.className = 'formulaire';
  const titre = document.createElement('h3');
  titre.textContent = `Appliquer la semaine type de ${employe.prenom} ?`;
  const texte = document.createElement('p');
  texte.textContent =
    'Les jours définis dans sa semaine type vont remplacer les cases déjà saisies cette semaine pour cet employé.';
  const actions = document.createElement('div');
  actions.className = 'dialogue-actions';
  const boutonAnnuler = document.createElement('button');
  boutonAnnuler.type = 'button';
  boutonAnnuler.className = 'bouton';
  boutonAnnuler.textContent = 'Annuler';
  boutonAnnuler.addEventListener('click', () => dialogue.close());
  const boutonConfirmer = document.createElement('button');
  boutonConfirmer.type = 'button';
  boutonConfirmer.className = 'bouton bouton-accent';
  boutonConfirmer.textContent = 'Appliquer';
  boutonConfirmer.addEventListener('click', async () => {
    dialogue.close();
    await executer();
  });
  actions.append(boutonAnnuler, boutonConfirmer);
  p.append(titre, texte, actions);
  dialogue.appendChild(p);
  document.body.appendChild(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.showModal();
}

function fermerPopover() {
  if (popoverActuel) {
    popoverActuel.remove();
    document.removeEventListener('click', gestionClicExterieur, true);
    document.removeEventListener('keydown', gestionEchap);
    popoverActuel = null;
  }
}

function gestionClicExterieur(evt) {
  if (popoverActuel && !popoverActuel.contains(evt.target)) fermerPopover();
}

function gestionEchap(evt) {
  if (evt.key === 'Escape') fermerPopover();
}

function positionnerPopover(popover, bouton) {
  const rect = bouton.getBoundingClientRect();
  const largeurEstimee = 260;
  let gauche = rect.left + window.scrollX;
  if (gauche + largeurEstimee > window.scrollX + document.documentElement.clientWidth) {
    gauche = window.scrollX + document.documentElement.clientWidth - largeurEstimee - 8;
  }
  popover.style.left = `${Math.max(8, gauche)}px`;
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
}

function ouvrirPopover(bouton, ctx, employe, jour, caseActuelle) {
  fermerPopover();
  const { statuts } = ctx;

  const popover = document.createElement('div');
  popover.className = 'popover-statut';

  const puces = document.createElement('div');
  puces.className = 'popover-puces';
  statuts.forEach((statut) => {
    const puce = document.createElement('button');
    puce.type = 'button';
    puce.className = 'puce-statut';
    puce.textContent = statut.nom;
    puce.style.setProperty('--couleur-statut', statut.couleur);
    if (caseActuelle?.statutId === statut.id) puce.classList.add('actif');
    puce.addEventListener('click', async () => {
      if (statut.compteCommeTravail) {
        afficherFormulaireHoraire(statut);
      } else {
        const id = await ctx.assurerSemaineId();
        await enregistrerCase(id, employe.id, jour, {
          statutId: statut.id,
          heureDebut: null,
          heureFin: null,
        });
        fermerPopover();
        ctx.rafraichir();
      }
    });
    puces.appendChild(puce);
  });
  popover.appendChild(puces);

  const ligneClipboard = document.createElement('div');
  ligneClipboard.className = 'popover-actions-case';

  const boutonVider = document.createElement('button');
  boutonVider.type = 'button';
  boutonVider.className = 'bouton-lien';
  boutonVider.textContent = 'Vider';
  boutonVider.disabled = !caseActuelle;
  boutonVider.addEventListener('click', async () => {
    const id = await ctx.assurerSemaineId();
    await supprimerCase(id, employe.id, jour);
    fermerPopover();
    ctx.rafraichir();
  });
  ligneClipboard.appendChild(boutonVider);

  const boutonCopier = document.createElement('button');
  boutonCopier.type = 'button';
  boutonCopier.className = 'bouton-lien';
  boutonCopier.textContent = 'Copier';
  boutonCopier.disabled = !caseActuelle;
  boutonCopier.addEventListener('click', () => {
    pressePapiers = {
      statutId: caseActuelle.statutId,
      heureDebut: caseActuelle.heureDebut,
      heureFin: caseActuelle.heureFin,
    };
    fermerPopover();
  });
  ligneClipboard.appendChild(boutonCopier);

  const boutonColler = document.createElement('button');
  boutonColler.type = 'button';
  boutonColler.className = 'bouton-lien';
  boutonColler.textContent = pressePapiers
    ? `Coller (${resumePressePapiers(pressePapiers, ctx.statutsParId)})`
    : 'Coller';
  boutonColler.disabled = !pressePapiers;
  boutonColler.addEventListener('click', async () => {
    const id = await ctx.assurerSemaineId();
    await enregistrerCase(id, employe.id, jour, { ...pressePapiers });
    fermerPopover();
    ctx.rafraichir();
  });
  ligneClipboard.appendChild(boutonColler);

  popover.appendChild(ligneClipboard);

  document.body.appendChild(popover);
  positionnerPopover(popover, bouton);
  popoverActuel = popover;
  setTimeout(() => {
    document.addEventListener('click', gestionClicExterieur, true);
    document.addEventListener('keydown', gestionEchap);
  }, 0);

  const statutActuel = caseActuelle && statuts.find((s) => s.id === caseActuelle.statutId);
  if (statutActuel?.compteCommeTravail) {
    afficherFormulaireHoraire(statutActuel);
  }

  function afficherFormulaireHoraire(statut) {
    const ancien = popover.querySelector('.popover-horaire');
    if (ancien) ancien.remove();

    const form = document.createElement('div');
    form.className = 'popover-horaire';

    const champs = document.createElement('div');
    champs.className = 'popover-champs';
    const champDebut = document.createElement('input');
    champDebut.type = 'time';
    champDebut.value = caseActuelle?.heureDebut || '';
    const separateur = document.createTextNode('–');
    const champFin = document.createElement('input');
    champFin.type = 'time';
    champFin.value = caseActuelle?.heureFin || '';
    champs.append(champDebut, separateur, champFin);
    form.appendChild(champs);

    const rapides = document.createElement('div');
    rapides.className = 'popover-rapides';
    CRENEAUX_RAPIDES.forEach((creneau) => {
      const boutonRapide = document.createElement('button');
      boutonRapide.type = 'button';
      boutonRapide.textContent = `${creneau.debut}–${creneau.fin}`;
      boutonRapide.addEventListener('click', async () => {
        champDebut.value = creneau.debut;
        champFin.value = creneau.fin;
        await sauvegarder();
      });
      rapides.appendChild(boutonRapide);
    });
    form.appendChild(rapides);

    async function sauvegarder() {
      if (!champDebut.value || !champFin.value) return;
      const id = await ctx.assurerSemaineId();
      await enregistrerCase(id, employe.id, jour, {
        statutId: statut.id,
        heureDebut: champDebut.value,
        heureFin: champFin.value,
      });
      ctx.rafraichir();
    }

    champDebut.addEventListener('change', sauvegarder);
    champFin.addEventListener('change', sauvegarder);

    popover.insertBefore(form, ligneClipboard);
  }
}

async function ouvrirDialogueDupliquer(ctx) {
  const { semaine, annee, numero, effectif } = ctx;
  const semainesRenseignees = (await listerSemainesRenseignees()).filter((s) => s.id !== semaine.id);
  const precedente = semaineVoisine(annee, numero, -1);
  const idParDefaut =
    semainesRenseignees.find((s) => s.annee === precedente.annee && s.numeroSemaine === precedente.numero)?.id ??
    semainesRenseignees[0]?.id;

  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';

  if (semainesRenseignees.length === 0) {
    dialogue.innerHTML = `
      <div class="formulaire">
        <h3>Dupliquer une semaine</h3>
        <p>Aucune semaine renseignée à dupliquer pour l'instant.</p>
        <div class="dialogue-actions">
          <button type="button" class="bouton" data-fermer>Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialogue);
    dialogue.querySelector('[data-fermer]').addEventListener('click', () => dialogue.close());
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.showModal();
    return;
  }

  const options = semainesRenseignees
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === idParDefaut ? 'selected' : ''}>Semaine ${s.numeroSemaine} — ${s.annee}</option>`
    )
    .join('');

  dialogue.innerHTML = `
    <form method="dialog" class="formulaire">
      <h3>Dupliquer vers la semaine ${numero} — ${annee}</h3>
      <label>Semaine source
        <select name="source">${options}</select>
      </label>
      <div class="dialogue-actions">
        <button type="button" class="bouton" data-annuler>Annuler</button>
        <button type="submit" class="bouton bouton-accent">Dupliquer</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialogue);
  dialogue.querySelector('[data-annuler]').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.querySelector('form').addEventListener('submit', async (evt) => {
    const sourceId = Number(new FormData(evt.target).get('source'));
    const employeIds = effectif.map((e) => e.employe.id);
    if (ctx.cases.length > 0) {
      dialogue.close();
      ouvrirDialogueConfirmationEcrasement(ctx, sourceId, employeIds);
    } else {
      const cibleId = await ctx.assurerSemaineId();
      await dupliquerSemaine(sourceId, cibleId, employeIds);
      dialogue.close();
      ctx.rafraichir();
    }
  });
  dialogue.showModal();
}

function ouvrirDialogueConfirmationEcrasement(ctx, sourceId, employeIds) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  dialogue.innerHTML = `
    <div class="formulaire">
      <h3>Écraser la semaine actuelle ?</h3>
      <p>Cette semaine contient déjà des données. Les cases existantes des employés de cette
      semaine seront supprimées puis remplacées par celles de la semaine source. Continuer ?</p>
      <div class="dialogue-actions">
        <button type="button" class="bouton" data-annuler>Annuler</button>
        <button type="button" class="bouton bouton-danger" data-confirmer>Écraser et dupliquer</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialogue);
  dialogue.querySelector('[data-annuler]').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.querySelector('[data-confirmer]').addEventListener('click', async () => {
    const cibleId = await ctx.assurerSemaineId();
    await dupliquerSemaine(sourceId, cibleId, employeIds);
    dialogue.close();
    ctx.rafraichir();
  });
  dialogue.showModal();
}

/** Dialogue de rattrapage rétroactif : ajoute un employé non visible (nouvelle recrue, parti oublié) à la semaine affichée. */
async function ouvrirDialogueAjouter(ctx) {
  const { candidatsAjout, annee, numero } = ctx;
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  const bloc = document.createElement('div');
  bloc.className = 'formulaire';

  const titre = document.createElement('h3');
  titre.textContent = `Ajouter un employé à la semaine ${numero} — ${annee}`;
  bloc.appendChild(titre);

  if (candidatsAjout.length === 0) {
    const texte = document.createElement('p');
    texte.textContent = 'Tout le monde figure déjà sur cette semaine.';
    bloc.appendChild(texte);

    const actions = document.createElement('div');
    actions.className = 'dialogue-actions';
    const boutonFermer = document.createElement('button');
    boutonFermer.type = 'button';
    boutonFermer.className = 'bouton';
    boutonFermer.textContent = 'Fermer';
    boutonFermer.addEventListener('click', () => dialogue.close());
    actions.appendChild(boutonFermer);
    bloc.appendChild(actions);

    dialogue.appendChild(bloc);
    document.body.appendChild(dialogue);
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.showModal();
    return;
  }

  const form = document.createElement('form');
  form.method = 'dialog';

  const label = document.createElement('label');
  label.textContent = 'Employé';
  const select = document.createElement('select');
  select.name = 'employeId';
  candidatsAjout.forEach((e) => {
    const option = document.createElement('option');
    option.value = String(e.id);
    option.textContent = `${e.prenom} ${e.nom}`;
    select.appendChild(option);
  });
  label.appendChild(select);
  form.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'dialogue-actions';
  const boutonAnnuler = document.createElement('button');
  boutonAnnuler.type = 'button';
  boutonAnnuler.className = 'bouton';
  boutonAnnuler.textContent = 'Annuler';
  boutonAnnuler.addEventListener('click', () => dialogue.close());
  const boutonConfirmer = document.createElement('button');
  boutonConfirmer.type = 'submit';
  boutonConfirmer.className = 'bouton bouton-accent';
  boutonConfirmer.textContent = 'Ajouter';
  actions.append(boutonAnnuler, boutonConfirmer);
  form.appendChild(actions);
  bloc.appendChild(form);

  dialogue.appendChild(bloc);
  document.body.appendChild(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  form.addEventListener('submit', async (evt) => {
    const employeId = Number(new FormData(evt.target).get('employeId'));
    const id = await ctx.assurerSemaineId();
    await ajouterEmployeSemaine(id, employeId);
    dialogue.close();
    ctx.rafraichir();
  });
  dialogue.showModal();
}
