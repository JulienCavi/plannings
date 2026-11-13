const cle = (debut, fin) => `${debut}|${fin}`;

/**
 * Compte les créneaux horaires des cases fournies. Rend une Map « debut|fin » → nombre
 * d'occurrences ; les cases sans horaires (repos, absences) sont ignorées.
 */
export function compterCreneaux(cases) {
  const compteur = new Map();
  for (const c of cases) ajouterCreneau(compteur, c.heureDebut, c.heureFin);
  return compteur;
}

/** Incrémente le compteur pour un créneau (sans effet si l'un des deux horaires manque). */
export function ajouterCreneau(compteur, debut, fin) {
  if (!debut || !fin) return;
  compteur.set(cle(debut, fin), (compteur.get(cle(debut, fin)) ?? 0) + 1);
}

/**
 * Créneaux à proposer en un clic pour une case : d'abord le créneau habituel de la
 * personne ce jour-là (`entreeType`, tiré de sa semaine type), puis les créneaux les plus
 * fréquents du compteur, sans doublon, dans la limite de `max`.
 * @returns {{debut: string, fin: string, habituel: boolean}[]}
 */
export function creneauxSuggeres(compteur, entreeType, max = 6) {
  const resultat = [];
  const vus = new Set();
  if (entreeType?.heureDebut && entreeType?.heureFin) {
    resultat.push({ debut: entreeType.heureDebut, fin: entreeType.heureFin, habituel: true });
    vus.add(cle(entreeType.heureDebut, entreeType.heureFin));
  }
  const frequents = [...compteur.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [c] of frequents) {
    if (resultat.length >= max) break;
    if (vus.has(c)) continue;
    const [debut, fin] = c.split('|');
    resultat.push({ debut, fin, habituel: false });
  }
  return resultat;
}
