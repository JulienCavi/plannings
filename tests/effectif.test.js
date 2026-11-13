import test from 'node:test';
import assert from 'node:assert/strict';
import { effectifVisible } from '../src/utils/effectif.js';
import { compterCreneaux, creneauxSuggeres } from '../src/utils/creneaux.js';

const employes = [
  { id: 1, prenom: 'Zoé', debutCle: null, finCle: null },
  { id: 2, prenom: 'Alban', debutCle: 202646, finCle: null }, // arrive en semaine 46
  { id: 3, prenom: 'Marc', debutCle: null, finCle: 202640 }, // parti après la semaine 40
  { id: 4, prenom: 'Élise' }, // champs absents = sans borne
];
const prenoms = (liste) => liste.map((e) => e.employe.prenom);

test('période de présence par défaut', () => {
  assert.deepEqual(prenoms(effectifVisible(employes, 2026, 47, null, [])), ['Alban', 'Élise', 'Zoé']);
  assert.deepEqual(prenoms(effectifVisible(employes, 2026, 45, null, undefined)), ['Élise', 'Zoé']);
  assert.deepEqual(prenoms(effectifVisible(employes, 2026, 40, null, [])), ['Élise', 'Marc', 'Zoé']);
});

test('une case ou un ajout explicite rend visible hors période, avec le bon motif', () => {
  const semaine = { retires: [], ajoutes: [2] };
  const resultat = effectifVisible(employes, 2026, 43, semaine, [{ employeId: 3 }]);
  assert.deepEqual(prenoms(resultat), ['Alban', 'Élise', 'Zoé', 'Marc']); // les partis en fin de liste
  const parId = new Map(resultat.map((r) => [r.employe.id, r]));
  assert.deepEqual([parId.get(2).horsEffectif, parId.get(2).motif], [true, 'avant']);
  assert.deepEqual([parId.get(3).horsEffectif, parId.get(3).motif], [true, 'apres']);
  assert.deepEqual([parId.get(1).horsEffectif, parId.get(1).motif], [false, null]);
});

test('« retirés » l’emporte sur tout, et les ids orphelins sont ignorés', () => {
  const semaine = { retires: [1, 2, 999], ajoutes: [2, 999] };
  assert.deepEqual(prenoms(effectifVisible(employes, 2026, 47, semaine, [{ employeId: 1 }])), ['Élise']);
});

test('créneaux suggérés : l’habituel d’abord, puis les plus fréquents sans doublon', () => {
  const compteur = compterCreneaux([
    { heureDebut: '12:30', heureFin: '20:00' }, { heureDebut: '12:30', heureFin: '20:00' }, { heureDebut: '12:30', heureFin: '20:00' },
    { heureDebut: '13:30', heureFin: '21:00' }, { heureDebut: '13:30', heureFin: '21:00' },
    { heureDebut: '09:30', heureFin: '12:45' },
    { heureDebut: null, heureFin: null },
  ]);
  assert.deepEqual(creneauxSuggeres(compteur, null).map((c) => `${c.debut}-${c.fin}`), ['12:30-20:00', '13:30-21:00', '09:30-12:45']);
  const avecHabituel = creneauxSuggeres(compteur, { statutId: 1, heureDebut: '13:30', heureFin: '21:00' }, 2);
  assert.deepEqual(avecHabituel, [
    { debut: '13:30', fin: '21:00', habituel: true },
    { debut: '12:30', fin: '20:00', habituel: false },
  ]);
  assert.deepEqual(creneauxSuggeres(new Map(), { statutId: 2, heureDebut: null, heureFin: null }), []);
});
