import Dexie from 'dexie';

export const db = new Dexie('planning_manager');

db.version(1).stores({
  employes: '++id',
  statuts: '++id',
  semaines: '++id, &[annee+numeroSemaine]',
  cases: '++id, semaineId, employeId, &[semaineId+employeId+jour]',
});

// Ajoute la table `meta` (clé/valeur), qui porte notamment `versionDonnees` — le
// versionnement du contenu, distinct du versionnement du schéma Dexie ci-dessus.
db.version(2).stores({
  employes: '++id',
  statuts: '++id',
  semaines: '++id, &[annee+numeroSemaine]',
  cases: '++id, semaineId, employeId, &[semaineId+employeId+jour]',
  meta: '&cle',
});

const STATUTS_INITIAUX = [
  { nom: 'Travaillé', code: 'TR', couleur: '#2f6f4f', compteCommeTravail: true },
  { nom: 'Repos', code: 'R', couleur: '#9ca3af', compteCommeTravail: false },
  { nom: 'CP', code: 'CP', couleur: '#3b82f6', compteCommeTravail: false },
  { nom: 'Maladie', code: 'M', couleur: '#ef4444', compteCommeTravail: false },
  { nom: 'Formation', code: 'F', couleur: '#8b5cf6', compteCommeTravail: false },
  { nom: 'Férié', code: 'FE', couleur: '#f59e0b', compteCommeTravail: false },
];

db.on('populate', () => {
  db.statuts.bulkAdd(STATUTS_INITIAUX);
});
