import { obtenirSemaine } from '../db/semaines.js';
import { listerCasesSemaine } from '../db/cases.js';
import { listerEmployes } from '../db/employes.js';
import { listerStatuts } from '../db/statuts.js';
import { joursDeSemaine, formatJourCourt, formatDateCourte, semaineDepuisParams } from '../utils/semaine.js';
import { estTravaillee } from '../utils/horaire.js';
import { effectifVisible } from '../utils/effectif.js';
import { el, bouton } from '../ui/dom.js';

/** Hauteur de ligne imprimée par défaut, et hauteur totale disponible pour les lignes sur une page A4 paysage (mm). */
const HAUTEUR_LIGNE_MM = 9.2;
const HAUTEUR_UTILE_MM = 138;

export async function afficher(conteneur, params) {
  const { annee, numero } = semaineDepuisParams(params);

  const [semaineExistante, tousEmployes, statuts] = await Promise.all([obtenirSemaine(annee, numero), listerEmployes(), listerStatuts()]);
  const cases = semaineExistante ? await listerCasesSemaine(semaineExistante.id) : [];
  const effectif = effectifVisible(tousEmployes, annee, numero, semaineExistante, cases);
  const statutsParId = new Map(statuts.map((s) => [s.id, s]));
  const jours = joursDeSemaine(annee, numero);
  const casesParCle = new Map(cases.map((c) => [`${c.employeId}-${c.jour}`, c]));

  const lignes = effectif.map(({ employe }) =>
    el(
      'tr',
      {},
      el('td', { class: 'nom-export', text: employe.prenom }),
      jours.map((_, jour) => {
        const c = casesParCle.get(`${employe.id}-${jour}`);
        const statut = c && statutsParId.get(c.statutId);
        if (estTravaillee(c, statutsParId)) return el('td', {}, construireBadge(`${c.heureDebut}–${c.heureFin}`, statut, true));
        if (statut) return el('td', {}, construireBadge(statut.nom, statut, false));
        return el('td', { class: 'case-aucune', text: '—' });
      })
    )
  );

  // À l'impression, la hauteur des lignes (et le corps de texte avec elle) se resserre
  // quand l'équipe est nombreuse, pour que tout tienne sur une seule page.
  const hauteurLigne = Math.min(HAUTEUR_LIGNE_MM, HAUTEUR_UTILE_MM / Math.max(lignes.length, 1));
  const corpsTexte = Math.max(6.5, Math.min(10.5, hauteurLigne * 1.15));

  const feuille = el(
    'div',
    { class: 'feuille-export', style: { '--hauteur-ligne': `${hauteurLigne.toFixed(2)}mm`, '--corps-impression': `${corpsTexte.toFixed(2)}pt` } },
    el(
      'div',
      { class: 'entete-export' },
      el('h1', { text: `Semaine ${numero} · ${annee}` }),
      el('p', { class: 'entete-export-dates', text: `${formatDateCourte(jours[0])} – ${formatDateCourte(jours[6])}` })
    ),
    el(
      'table',
      { class: 'table-export' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th'),
          jours.map((jour) => el('th', {}, formatJourCourt(jour), el('span', { class: 'jour-date', text: formatDateCourte(jour) })))
        )
      ),
      el('tbody', {}, lignes)
    ),
    el('p', { class: 'pied-export no-print', text: `Généré le ${new Date().toLocaleDateString('fr-FR')}` })
  );

  conteneur.replaceChildren(
    el(
      'div',
      { class: 'page-export' },
      el(
        'div',
        { class: 'barre-actions-export no-print' },
        el('a', { class: 'bouton', href: `#/planning?annee=${annee}&semaine=${numero}`, text: 'Retour au planning' }),
        el('p', { class: 'aide', text: 'Format A4 paysage, sur une seule page.' }),
        bouton('Imprimer', { variante: 'accent', on: () => window.print() })
      ),
      feuille
    )
  );
}

function construireBadge(texte, statut, estTravail) {
  return el('span', {
    class: estTravail ? 'badge-export badge-travail' : 'badge-export',
    text: texte,
    style: { '--teinte': statut.couleur },
  });
}
