import { listerSemainesArchivees, toggleArchiveeSemaine } from '../db/semaines.js';
import { listerCasesSemaine } from '../db/cases.js';
import { listerStatuts } from '../db/statuts.js';
import { joursDeSemaine, formatDateCourte } from '../utils/semaine.js';
import { totalHeuresEmploye, formatHeures } from '../utils/horaire.js';

export async function afficher(conteneur) {
  const [semaines, statuts] = await Promise.all([listerSemainesArchivees(), listerStatuts()]);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));

  const page = document.createElement('div');
  page.className = 'page-archives';
  page.innerHTML = '<div class="entete-page"><h2>Archives</h2></div>';

  if (semaines.length === 0) {
    const vide = document.createElement('div');
    vide.className = 'etat-vide';
    vide.innerHTML = `
      <p>Aucune semaine archivée pour l'instant.</p>
      <p class="etat-vide-sous-texte">Archivez une semaine terminée depuis l'écran Planning pour la retrouver ici.</p>
    `;
    page.appendChild(vide);
    conteneur.appendChild(page);
    return;
  }

  const table = document.createElement('table');
  table.className = 'table-archives';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Semaine</th>
        <th>Dates</th>
        <th>Effectif</th>
        <th>Total heures</th>
        <th></th>
      </tr>
    </thead>
  `;
  const corps = document.createElement('tbody');

  for (const semaine of semaines) {
    const cases = await listerCasesSemaine(semaine.id);
    const jours = joursDeSemaine(semaine.annee, semaine.numeroSemaine);
    const employeIds = [...new Set(cases.map((c) => c.employeId))];
    const totalHeures = employeIds.reduce(
      (total, id) => total + totalHeuresEmploye(cases, id, statutsParId),
      0
    );

    const ligne = document.createElement('tr');
    ligne.className = 'ligne-cliquable';

    const tdSemaine = document.createElement('td');
    tdSemaine.textContent = `Semaine ${semaine.numeroSemaine} — ${semaine.annee}`;
    ligne.appendChild(tdSemaine);

    const tdDates = document.createElement('td');
    tdDates.textContent = `${formatDateCourte(jours[0])} – ${formatDateCourte(jours[6])}`;
    ligne.appendChild(tdDates);

    const tdEffectif = document.createElement('td');
    tdEffectif.textContent = String(employeIds.length);
    ligne.appendChild(tdEffectif);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'chiffre';
    tdTotal.textContent = formatHeures(totalHeures);
    ligne.appendChild(tdTotal);

    const tdActions = document.createElement('td');
    tdActions.className = 'cellule-actions';
    const boutonDesarchiver = document.createElement('button');
    boutonDesarchiver.type = 'button';
    boutonDesarchiver.className = 'bouton-icone';
    boutonDesarchiver.textContent = 'Désarchiver';
    boutonDesarchiver.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      await toggleArchiveeSemaine(semaine.id, false);
      conteneur.innerHTML = '';
      afficher(conteneur);
    });
    tdActions.appendChild(boutonDesarchiver);
    ligne.appendChild(tdActions);

    ligne.addEventListener('click', () => {
      location.hash = `#/planning?annee=${semaine.annee}&semaine=${semaine.numeroSemaine}`;
    });

    corps.appendChild(ligne);
  }

  table.appendChild(corps);
  page.appendChild(table);
  conteneur.appendChild(page);
}
