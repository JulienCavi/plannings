// Semaine "commerciale" : dimanche → samedi. Le numéro de semaine reste le
// numéro ISO 8601 (lundi → dimanche) de la portion lundi→samedi qu'elle contient ;
// seule la date de départ affichée est décalée d'un jour plus tôt (le dimanche).
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Numéro de semaine ISO 8601 et année associée pour une date donnée (référence lundi→dimanche). */
export function semaineISO(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jourSemaine = d.getUTCDay() || 7; // lundi=1 ... dimanche=7
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
  return { annee: d.getUTCFullYear(), numero };
}

/**
 * Numéro de semaine "commerciale" (dimanche→samedi) pour une date donnée : un
 * dimanche appartient à la semaine qui commence ce jour-là, donc on se cale sur
 * le lundi qui suit pour retrouver le bon numéro ISO.
 */
export function semaineCommerciale(date) {
  const ajustee = new Date(date);
  if (ajustee.getDay() === 0) {
    ajustee.setDate(ajustee.getDate() + 1);
  }
  return semaineISO(ajustee);
}

export function semaineActuelle() {
  return semaineCommerciale(new Date());
}

/** Date du lundi ISO (lundi→dimanche) de la semaine donnée. */
export function lundiDeSemaine(annee, numero) {
  const janvier4 = new Date(Date.UTC(annee, 0, 4));
  const jourSemaine = janvier4.getUTCDay() || 7;
  const lundiSemaine1 = new Date(janvier4);
  lundiSemaine1.setUTCDate(janvier4.getUTCDate() - jourSemaine + 1);
  const lundi = new Date(lundiSemaine1);
  lundi.setUTCDate(lundiSemaine1.getUTCDate() + (numero - 1) * 7);
  return lundi;
}

/** Date du dimanche (premier jour de la semaine commerciale) pour le numéro ISO donné. */
export function dimancheDeSemaine(annee, numero) {
  const lundi = lundiDeSemaine(annee, numero);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() - 1);
  return dimanche;
}

/** Les 7 dates (dimanche → samedi) de la semaine commerciale donnée. */
export function joursDeSemaine(annee, numero) {
  const dimanche = dimancheDeSemaine(annee, numero);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dimanche);
    d.setUTCDate(dimanche.getUTCDate() + i);
    return d;
  });
}

/** Semaine décalée de `delta` semaines (négatif = précédente). */
export function semaineVoisine(annee, numero, delta) {
  const lundi = lundiDeSemaine(annee, numero);
  lundi.setUTCDate(lundi.getUTCDate() + delta * 7);
  return semaineISO(lundi);
}

export function formatJourCourt(date) {
  return JOURS_COURTS[date.getUTCDay()];
}

export function formatDateCourte(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}
