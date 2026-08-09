import { db } from './database.js';

export function listerStatuts() {
  return db.statuts.toArray();
}
