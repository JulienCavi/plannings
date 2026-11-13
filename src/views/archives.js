import { listerSemainesArchivees, toggleArchiveeSemaine } from '../db/semaines.js';
import { listerCasesSemaine } from '../db/cases.js';
import { listerEmployes } from '../db/employes.js';
import { listerStatuts } from '../db/statuts.js';
import { joursDeSemaine, formatPeriode } from '../utils/semaine.js';
import { totalHeuresEmploye, formatHeures } from '../utils/horaire.js';
import { effectifVisible } from '../utils/effectif.js';
import { el } from '../ui/dom.js';

export async function afficher(conteneur) {
  const [semaines, tousEmployes, statuts] = await Promise.all([listerSemainesArchivees(), listerEmployes(), listerStatuts()]);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));
  const casesParSemaine = await Promise.all(semaines.map((s) => listerCasesSemaine(s.id)));

  const page = el('div', { class: 'page-archives' }, el('header', { class: 'entete-page' }, el('h1', { text: 'Archives' })));

  if (semaines.length === 0) {
    page.append(
      el(
        'div',
        { class: 'etat-vide' },
        el('p', { text: 'Aucune semaine archivée pour l’instant.' }),
        el('p', {
          class: 'etat-vide-sous-texte',
          text: 'Archiver une semaine terminée la passe en lecture seule. Cela se fait depuis le menu « ⋯ » de l’écran Planning.',
        })
      )
    );
    conteneur.replaceChildren(page);
    return;
  }

  const lignes = semaines.map((semaine, i) => {
    const cases = casesParSemaine[i];
    const jours = joursDeSemaine(semaine.annee, semaine.numeroSemaine);
    const idsAvecCases = new Set(cases.map((c) => c.employeId));
    // Effectif de la semaine = employés visibles ET ayant au moins une case cette semaine-là :
    // ni les employés en période sans case, ni les cases d'un employé retiré de la semaine.
    const effectif = effectifVisible(tousEmployes, semaine.annee, semaine.numeroSemaine, semaine, cases).filter(({ employe }) =>
      idsAvecCases.has(employe.id)
    );
    const totalHeures = effectif.reduce((total, { employe }) => total + totalHeuresEmploye(cases, employe.id, statutsParId), 0);
    const lien = `#/planning?annee=${semaine.annee}&semaine=${semaine.numeroSemaine}`;

    return el(
      'tr',
      {},
      el('td', {}, el('a', { class: 'lien-semaine', href: lien, text: `Semaine ${semaine.numeroSemaine}` })),
      el('td', { text: formatPeriode(jours[0], jours[6]) }),
      el('td', { class: 'nombre', text: String(effectif.length) }),
      el('td', { class: 'nombre', text: formatHeures(totalHeures) }),
      el(
        'td',
        { class: 'cellule-actions' },
        el('button', {
          type: 'button',
          class: 'bouton-texte',
          text: 'Désarchiver',
          on: {
            click: async () => {
              await toggleArchiveeSemaine(semaine.id, false);
              afficher(conteneur);
            },
          },
        })
      )
    );
  });

  page.append(
    el(
      'table',
      { class: 'table-liste table-archives' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { scope: 'col', text: 'Semaine' }),
          el('th', { scope: 'col', text: 'Dates' }),
          el('th', { scope: 'col', class: 'nombre', text: 'Personnes' }),
          el('th', { scope: 'col', class: 'nombre', text: 'Heures' }),
          el('th', { scope: 'col' })
        )
      ),
      el('tbody', {}, lignes)
    )
  );
  conteneur.replaceChildren(page);
}
