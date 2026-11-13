import { db } from './database.js';

// Table clé/valeur `meta`. Outre `versionDonnees` (gérée par migrations.js), elle porte
// deux réglages qui ne font pas partie du format versionné des données :
//   - `pensebete`     : le pense-bête permanent, affiché sur toutes les semaines ;
//   - `dernierExport` : date ISO du dernier export manuel réussi (rappel de sauvegarde).

export async function lireMeta(cle) {
  return (await db.meta.get(cle))?.valeur;
}

export function ecrireMeta(cle, valeur) {
  return db.meta.put({ cle, valeur });
}
