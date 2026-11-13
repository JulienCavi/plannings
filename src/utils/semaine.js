// Semaine "commerciale" : dimanche → samedi. Le numéro de semaine reste le
// numéro ISO 8601 (lundi → dimanche) de la portion lundi→samedi qu'elle contient ;
// seule la date de départ affichée est décalée d'un jour plus tôt (le dimanche).
// Toutes les dates manipulées ici sont des minuits UTC : aucun calcul ne dépend du
// fuseau de l'ordinateur, à l'exception de la lecture de « maintenant ».
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Minuit UTC du jour civil local de `date` (par défaut : aujourd'hui). */
export function jourCivilUTC(date = new Date()) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Numéro de semaine ISO 8601 et année associée d'un minuit UTC. */
function semaineISOUTC(dateUTC) {
  const d = new Date(dateUTC);
  const jourSemaine = d.getUTCDay() || 7; // lundi=1 ... dimanche=7
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
  const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1);
  const numero = Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
  return { annee: d.getUTCFullYear(), numero };
}

/** Numéro de semaine ISO 8601 et année associée pour une date locale (référence lundi→dimanche). */
export function semaineISO(date) {
  return semaineISOUTC(jourCivilUTC(date));
}

/**
 * Numéro de semaine "commerciale" (dimanche→samedi) pour une date locale : un
 * dimanche appartient à la semaine qui commence ce jour-là, donc on se cale sur
 * le lundi qui suit pour retrouver le bon numéro ISO.
 */
export function semaineCommerciale(date) {
  const jour = jourCivilUTC(date);
  if (jour.getUTCDay() === 0) jour.setUTCDate(jour.getUTCDate() + 1);
  return semaineISOUTC(jour);
}

export function semaineActuelle() {
  return semaineCommerciale(new Date());
}

/** Date (minuit UTC) du lundi ISO de la semaine donnée. */
export function lundiDeSemaine(annee, numero) {
  const janvier4 = new Date(Date.UTC(annee, 0, 4));
  const jourSemaine = janvier4.getUTCDay() || 7;
  return new Date(Date.UTC(annee, 0, 4 - jourSemaine + 1 + (numero - 1) * 7));
}

/** Date du dimanche (premier jour de la semaine commerciale) pour le numéro ISO donné. */
export function dimancheDeSemaine(annee, numero) {
  const dimanche = lundiDeSemaine(annee, numero);
  dimanche.setUTCDate(dimanche.getUTCDate() - 1);
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
  return semaineISOUTC(lundi);
}

/** Vrai si (annee, numero) désigne une semaine ISO qui existe réellement (pas de semaine 0, 54 ou 99). */
export function semaineValide(annee, numero) {
  if (!Number.isInteger(annee) || !Number.isInteger(numero)) return false;
  if (annee < 2000 || annee > 2200 || numero < 1 || numero > 53) return false;
  const relue = semaineISOUTC(lundiDeSemaine(annee, numero));
  return relue.annee === annee && relue.numero === numero;
}

/**
 * Lit `{ annee, semaine }` dans les paramètres d'URL ; retombe sur la semaine en cours
 * si l'un des deux est absent ou ne désigne pas une vraie semaine.
 */
export function semaineDepuisParams(params) {
  const annee = Number(params?.annee);
  const numero = Number(params?.semaine);
  return semaineValide(annee, numero) ? { annee, numero } : semaineActuelle();
}

export function formatJourCourt(date) {
  return JOURS_COURTS[date.getUTCDay()];
}

export function formatDateCourte(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/** « du 15 au 21 novembre 2026 », ou « du 29 novembre au 5 décembre 2026 » à cheval sur deux mois. */
export function formatPeriode(debut, fin) {
  const jour = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'UTC' });
  const jourMois = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const complet = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (debut.getUTCFullYear() !== fin.getUTCFullYear()) return `du ${complet(debut)} au ${complet(fin)}`;
  if (debut.getUTCMonth() !== fin.getUTCMonth()) return `du ${jourMois(debut)} au ${complet(fin)}`;
  return `du ${jour(debut)} au ${complet(fin)}`;
}

/** Clé numérique triable d'une semaine : 2026 s12 → 202612. Le numéro ISO ne dépasse pas 53. */
export function cleSemaine(annee, numero) {
  return annee * 100 + numero;
}

/**
 * Décompose une clé de semaine en `{ annee, numero }`. À n'appeler que sur une clé strictement
 * positive : `0` est une sentinelle signifiant « aucune semaine réelle », pas une semaine 0.
 */
export function depuisCleSemaine(cle) {
  return { annee: Math.floor(cle / 100), numero: cle % 100 };
}
