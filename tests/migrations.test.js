import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VERSION_COURANTE, migrerDonnees, migrer1vers2, migrer2vers3, migrer3vers4 } from '../src/db/migrations.js';

const STATUTS = [
  { id: 1, nom: 'Travaillé', code: 'TR', couleur: '#2f6f4f', compteCommeTravail: true },
  { id: 2, nom: 'Repos', code: 'R', couleur: '#9ca3af', compteCommeTravail: false },
];

/** Sauvegarde ancienne (v1) : jour 0 = lundi, cases avec `rayon`, employés avec `contrat` et `actif`. */
function exportV1() {
  const travail = (debut, fin) => ({ statutId: 1, heureDebut: debut, heureFin: fin, rayon: 'PGC' });
  return {
    employes: [
      { id: 1, nom: 'A', prenom: 'Abbes', contrat: 35, actif: true,
        semaineType: [travail('13:30', '21:00'), null, null, null, null, travail('12:30', '20:00'), travail('09:30', '12:45')] },
      { id: 2, nom: 'B', prenom: 'Bachir', contrat: 20, actif: false, semaineType: Array(7).fill(null) },
    ],
    statuts: STATUTS,
    semaines: [
      { id: 1, annee: 2026, numeroSemaine: 30, archivee: false },
      { id: 2, annee: 2026, numeroSemaine: 31, archivee: true, notes: 'note' },
      { id: 3, annee: 2026, numeroSemaine: 20, archivee: false }, // vide : doit disparaître
    ],
    cases: [
      { id: 1, semaineId: 1, employeId: 1, jour: 0, statutId: 1, heureDebut: '13:30', heureFin: '21:00', rayon: 'PGC' }, // lundi s30
      { id: 2, semaineId: 1, employeId: 1, jour: 5, statutId: 1, heureDebut: '12:30', heureFin: '20:00', rayon: 'PGC' }, // samedi s30
      { id: 3, semaineId: 1, employeId: 1, jour: 6, statutId: 1, heureDebut: '09:30', heureFin: '12:45', rayon: 'PGC' }, // dimanche fin s30
      { id: 4, semaineId: 2, employeId: 1, jour: 6, statutId: 2, heureDebut: null, heureFin: null, rayon: null }, // dimanche fin s31
      { id: 5, semaineId: 1, employeId: 2, jour: 2, statutId: 1, heureDebut: '18:00', heureFin: '21:00', rayon: 'PGC' }, // mercredi s30
    ],
  };
}

test('une sauvegarde v1 arrive intacte en version courante, sans décalage de jour', () => {
  const source = exportV1();
  const copie = structuredClone(source);
  const d = migrerDonnees(source, 1);
  assert.deepEqual(source, copie, 'les migrations ne modifient pas le jeu de données reçu');

  const semaine = (numero) => d.semaines.find((s) => s.numeroSemaine === numero);
  const caseDe = (id) => d.cases.find((c) => c.id === id);
  // lundi → jour 1, samedi → jour 6 de la même semaine ; l'ancien dimanche ouvre la semaine suivante.
  assert.deepEqual([caseDe(1).semaineId, caseDe(1).jour], [semaine(30).id, 1]);
  assert.deepEqual([caseDe(2).semaineId, caseDe(2).jour], [semaine(30).id, 6]);
  assert.deepEqual([caseDe(3).semaineId, caseDe(3).jour], [semaine(31).id, 0]);
  assert.deepEqual([caseDe(4).semaineId, caseDe(4).jour], [semaine(32).id, 0]); // semaine 32 créée à la volée
  assert.equal(caseDe(5).jour, 3);
  assert.equal(d.cases.length, 5);
  assert.ok(d.cases.every((c) => !('rayon' in c)));

  assert.equal(semaine(20), undefined, 'les semaines vides héritées sont nettoyées');
  assert.ok(d.semaines.every((s) => Array.isArray(s.retires) && Array.isArray(s.ajoutes)));
  assert.equal(semaine(31).notes, 'note');
  assert.equal(semaine(31).archivee, true);

  const [abbes, bachir] = d.employes;
  assert.ok(!('contrat' in abbes) && !('actif' in abbes));
  assert.deepEqual([abbes.debutCle, abbes.finCle], [null, null]);
  assert.deepEqual([bachir.debutCle, bachir.finCle], [null, 202630]); // dernière semaine où il a une case
  // semaine type : l'ancien dimanche (dernière position) passe en tête, sans `rayon`
  assert.deepEqual(abbes.semaineType[0], { statutId: 1, heureDebut: '09:30', heureFin: '12:45' });
  assert.deepEqual(abbes.semaineType[1], { statutId: 1, heureDebut: '13:30', heureFin: '21:00' });
  assert.deepEqual(abbes.semaineType[6], { statutId: 1, heureDebut: '12:30', heureFin: '20:00' });

  // Pas de collision sur l'index unique [semaineId+employeId+jour].
  const cles = d.cases.map((c) => `${c.semaineId}-${c.employeId}-${c.jour}`);
  assert.equal(new Set(cles).size, cles.length);
});

test('chaque étape donne le même résultat que la chaîne complète', () => {
  const pasAPas = migrer3vers4(migrer2vers3(migrer1vers2(exportV1())));
  assert.deepEqual(pasAPas, migrerDonnees(exportV1(), 1));
  assert.deepEqual(migrerDonnees(migrer1vers2(exportV1()), 2), pasAPas);
  assert.deepEqual(migrerDonnees(migrer2vers3(migrer1vers2(exportV1())), 3), pasAPas);
});

test('un employé inactif sans aucune case reçoit la sentinelle finCle = 0', () => {
  const d = migrer3vers4({ employes: [{ id: 9, nom: 'X', prenom: 'Y', actif: false }], statuts: STATUTS, semaines: [], cases: [] });
  assert.deepEqual([d.employes[0].debutCle, d.employes[0].finCle], [null, 0]);
});

test('une sauvegarde déjà en version courante n’est pas transformée', () => {
  const v4 = migrerDonnees(exportV1(), 1);
  assert.equal(migrerDonnees(v4, VERSION_COURANTE), v4);
});

// Vérification sur un vrai export, s'il est fourni : EXPORT_REEL=chemin/vers/export.json npm test
const cheminReel = process.env.EXPORT_REEL;
test('export réel : cohérent et inchangé par la chaîne de migration', { skip: !cheminReel || !existsSync(cheminReel) }, () => {
  const d = JSON.parse(readFileSync(cheminReel, 'utf8'));
  assert.equal(d.versionDonnees, VERSION_COURANTE);
  assert.equal(migrerDonnees(d, d.versionDonnees), d);
  const semaines = new Set(d.semaines.map((s) => s.id));
  const employes = new Set(d.employes.map((e) => e.id));
  const cles = new Set();
  for (const c of d.cases) {
    assert.ok(semaines.has(c.semaineId) && employes.has(c.employeId), `case ${c.id} rattachée`);
    assert.ok(c.jour >= 0 && c.jour <= 6);
    cles.add(`${c.semaineId}-${c.employeId}-${c.jour}`);
  }
  assert.equal(cles.size, d.cases.length, 'aucun doublon employé/jour');
});
