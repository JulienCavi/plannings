import { obtenirSemaine } from '../db/semaines.js';
import { listerCasesSemaine } from '../db/cases.js';
import { listerEmployes } from '../db/employes.js';
import { listerStatuts } from '../db/statuts.js';
import { joursDeSemaine, formatJourCourt, formatDateCourte, semaineActuelle } from '../utils/semaine.js';
import { effectifVisible } from '../utils/effectif.js';

export async function afficher(conteneur, params) {
  const { annee, numero } =
    params.annee && params.semaine
      ? { annee: Number(params.annee), numero: Number(params.semaine) }
      : semaineActuelle();

  const [semaineExistante, tousEmployes, statuts] = await Promise.all([
    obtenirSemaine(annee, numero),
    listerEmployes(),
    listerStatuts(),
  ]);
  const cases = semaineExistante ? await listerCasesSemaine(semaineExistante.id) : [];
  const effectif = effectifVisible(tousEmployes, annee, numero, semaineExistante, cases);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));
  const jours = joursDeSemaine(annee, numero);

  const page = document.createElement('div');
  page.className = 'page-export';

  const barreActions = document.createElement('div');
  barreActions.className = 'barre-actions-export no-print';
  const boutonRetour = document.createElement('a');
  boutonRetour.className = 'bouton';
  boutonRetour.href = `#/planning?annee=${annee}&semaine=${numero}`;
  boutonRetour.textContent = '← Retour au planning';
  const boutonImprimer = document.createElement('button');
  boutonImprimer.type = 'button';
  boutonImprimer.className = 'bouton bouton-accent';
  boutonImprimer.textContent = 'Imprimer';
  boutonImprimer.addEventListener('click', () => window.print());
  barreActions.append(boutonRetour, boutonImprimer);
  page.appendChild(barreActions);

  const astuce = document.createElement('p');
  astuce.className = 'astuce-impression no-print';
  astuce.textContent =
    "Astuce : dans la fenêtre d'impression, choisissez le format Paysage (A4) pour que tout tienne sur une page.";
  page.appendChild(astuce);

  const feuille = document.createElement('div');
  feuille.className = 'feuille-export';

  const entete = document.createElement('div');
  entete.className = 'entete-export';
  entete.innerHTML = `
    <p class="entete-export-kicker no-print">Planning de la semaine</p>
    <h2>Semaine ${numero} · ${annee}</h2>
    <p class="entete-export-dates">${formatDateCourte(jours[0])} – ${formatDateCourte(jours[6])}</p>
  `;
  feuille.appendChild(entete);

  const table = document.createElement('table');
  table.className = 'table-export';
  const thead = document.createElement('thead');
  const trEntete = document.createElement('tr');
  trEntete.innerHTML = '<th></th>';
  jours.forEach((jour) => {
    const th = document.createElement('th');
    th.innerHTML = `${formatJourCourt(jour)}<span class="jour-date">${formatDateCourte(jour)}</span>`;
    trEntete.appendChild(th);
  });
  thead.appendChild(trEntete);
  table.appendChild(thead);

  const casesParCle = new Map(cases.map((c) => [`${c.employeId}-${c.jour}`, c]));
  const corps = document.createElement('tbody');
  effectif.forEach(({ employe }) => {
    const ligne = document.createElement('tr');
    const tdNom = document.createElement('td');
    tdNom.className = 'nom-export';
    tdNom.textContent = employe.prenom;
    ligne.appendChild(tdNom);

    for (let jour = 0; jour < 7; jour++) {
      const td = document.createElement('td');
      const c = casesParCle.get(`${employe.id}-${jour}`);
      const statut = c && statutsParId.get(c.statutId);
      if (statut?.compteCommeTravail && c.heureDebut && c.heureFin) {
        td.appendChild(construireBadge(`${c.heureDebut}–${c.heureFin}`, statut, true));
      } else if (statut) {
        td.appendChild(construireBadge(statut.nom, statut, false));
      } else {
        td.className = 'case-aucune';
        td.textContent = '—';
      }
      ligne.appendChild(td);
    }
    corps.appendChild(ligne);
  });
  table.appendChild(corps);
  feuille.appendChild(table);

  const pied = document.createElement('p');
  pied.className = 'pied-export no-print';
  pied.textContent = `Généré le ${new Date().toLocaleDateString('fr-FR')}`;
  feuille.appendChild(pied);

  page.appendChild(feuille);
  conteneur.appendChild(page);
}

function construireBadge(texte, statut, estTravail) {
  const badge = document.createElement('span');
  badge.className = estTravail ? 'badge-export badge-travail' : 'badge-export';
  badge.textContent = texte;
  badge.style.backgroundColor = `${statut.couleur}1f`;
  badge.style.color = statut.couleur;
  badge.style.borderColor = `${statut.couleur}55`;
  return badge;
}
