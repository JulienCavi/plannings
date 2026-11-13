/** Convertit "HH:MM" en minutes depuis minuit, ou null si invalide. */
export function heureVersMinutes(heure) {
  if (!heure || !/^\d{2}:\d{2}$/.test(heure)) return null;
  const [h, m] = heure.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Lit une heure tapée librement et la rend au format de stockage "HH:MM", ou null si
 * elle n'est pas comprise. Acceptés : « 13 », « 13h », « 13h30 », « 13:30 », « 13.30 »,
 * « 1330 », « 930 », « 9 ». Les minutes, quand elles sont séparées de l'heure, s'écrivent
 * toujours sur deux chiffres (« 9h5 » est refusé plutôt que deviné).
 */
export function analyserHeure(texte) {
  const brut = String(texte ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!brut) return null;
  let h;
  let m;
  let correspondance;
  if ((correspondance = /^(\d{1,2})(?:h|:|\.|,)(\d{2})?$/.exec(brut))) {
    h = Number(correspondance[1]);
    m = Number(correspondance[2] ?? 0);
  } else if ((correspondance = /^(\d{1,2})$/.exec(brut))) {
    h = Number(correspondance[1]);
    m = 0;
  } else if ((correspondance = /^(\d{1,2})(\d{2})$/.exec(brut))) {
    h = Number(correspondance[1]);
    m = Number(correspondance[2]);
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Durée en heures entre deux horaires "HH:MM". Fin égale au début → 0 (évite qu'une
 * faute de frappe soit lue comme 24h). Fin avant début → créneau de nuit, on ajoute 24h.
 */
export function dureeHeures(debut, fin) {
  const m1 = heureVersMinutes(debut);
  const m2 = heureVersMinutes(fin);
  if (m1 === null || m2 === null || m1 === m2) return 0;
  const diff = m2 > m1 ? m2 - m1 : m2 + 1440 - m1;
  return diff / 60;
}

/** Formate un nombre d'heures décimal en "7h" ou "7h30". */
export function formatHeures(heures) {
  const totalMinutes = Math.round(heures * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Vrai si la case est une journée travaillée complète (statut « travail » + deux horaires). */
export function estTravaillee(c, statutsParId) {
  return Boolean(c && statutsParId.get(c.statutId)?.compteCommeTravail && c.heureDebut && c.heureFin);
}

/** Total d'heures travaillées par un employé sur un ensemble de cases. */
export function totalHeuresEmploye(cases, employeId, statutsParId) {
  let total = 0;
  for (const c of cases) {
    if (c.employeId === employeId && estTravaillee(c, statutsParId)) {
      total += dureeHeures(c.heureDebut, c.heureFin);
    }
  }
  return total;
}
