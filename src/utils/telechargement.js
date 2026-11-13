/** Fait télécharger `objet` sous forme de fichier JSON indenté. */
export function telechargerJSON(nomFichier, objet) {
  const blob = new Blob([JSON.stringify(objet, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Horodatage local « 2026-11-13-1647 » pour nommer les fichiers sans collision le même jour. */
export function horodatageFichier(date = new Date()) {
  const deux = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}-${deux(date.getHours())}${deux(date.getMinutes())}`;
}
