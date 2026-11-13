import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semaineISO, semaineCommerciale, lundiDeSemaine, dimancheDeSemaine, joursDeSemaine, semaineVoisine,
  semaineValide, semaineDepuisParams, cleSemaine, depuisCleSemaine, formatPeriode, formatDateCourte,
} from '../src/utils/semaine.js';

const iso = (d) => d.toISOString().slice(0, 10);

test('la semaine commerciale va du dimanche au samedi', () => {
  const jours = joursDeSemaine(2026, 47);
  assert.equal(iso(jours[0]), '2026-11-15');
  assert.equal(iso(jours[6]), '2026-11-21');
  assert.equal(jours[0].getUTCDay(), 0);
  assert.equal(iso(lundiDeSemaine(2026, 47)), '2026-11-16');
  assert.equal(iso(dimancheDeSemaine(2026, 47)), '2026-11-15');
});

test('un dimanche appartient à la semaine qui commence ce jour-là', () => {
  assert.deepEqual(semaineCommerciale(new Date(2026, 10, 15)), { annee: 2026, numero: 47 }); // dimanche
  assert.deepEqual(semaineCommerciale(new Date(2026, 10, 14)), { annee: 2026, numero: 46 }); // samedi
  assert.deepEqual(semaineCommerciale(new Date(2026, 10, 13)), { annee: 2026, numero: 46 }); // vendredi
  assert.deepEqual(semaineISO(new Date(2026, 10, 15)), { annee: 2026, numero: 46 }); // ISO pur : dimanche = fin de semaine
});

test('passages d’année', () => {
  assert.deepEqual(semaineVoisine(2026, 53, 1), { annee: 2027, numero: 1 });
  assert.deepEqual(semaineVoisine(2027, 1, -1), { annee: 2026, numero: 53 });
  assert.deepEqual(semaineVoisine(2025, 52, 1), { annee: 2026, numero: 1 });
  assert.deepEqual(semaineCommerciale(new Date(2027, 0, 1)), { annee: 2026, numero: 53 });
  assert.deepEqual(semaineCommerciale(new Date(2027, 0, 3)), { annee: 2027, numero: 1 }); // dimanche 3 janvier
});

test('semaineVoisine est cohérente sur 300 semaines dans les deux sens', () => {
  let s = { annee: 2024, numero: 1 };
  for (let i = 0; i < 300; i++) {
    const suivante = semaineVoisine(s.annee, s.numero, 1);
    assert.deepEqual(semaineVoisine(suivante.annee, suivante.numero, -1), s);
    assert.equal(joursDeSemaine(suivante.annee, suivante.numero)[0] - joursDeSemaine(s.annee, s.numero)[0], 7 * 86400000);
    assert.ok(semaineValide(suivante.annee, suivante.numero));
    s = suivante;
  }
});

test('semaineValide et semaineDepuisParams écartent les adresses fantaisistes', () => {
  assert.ok(semaineValide(2026, 47));
  assert.ok(semaineValide(2026, 53));
  assert.ok(!semaineValide(2025, 53));
  assert.ok(!semaineValide(2026, 99));
  assert.ok(!semaineValide(2026, 0));
  assert.ok(!semaineValide(NaN, 3));
  assert.ok(!semaineValide(2026, 3.5));
  assert.deepEqual(semaineDepuisParams({ annee: '2026', semaine: '47' }), { annee: 2026, numero: 47 });
  const actuelle = semaineCommerciale(new Date());
  for (const params of [{}, { annee: 'abc', semaine: 'x' }, { annee: '2026', semaine: '99' }, { annee: '2026' }, undefined]) {
    assert.deepEqual(semaineDepuisParams(params), actuelle);
  }
});

test('clés de semaine', () => {
  assert.equal(cleSemaine(2026, 7), 202607);
  assert.deepEqual(depuisCleSemaine(202607), { annee: 2026, numero: 7 });
  assert.ok(cleSemaine(2027, 1) > cleSemaine(2026, 53));
});

test('formats de dates', () => {
  const j = joursDeSemaine(2026, 47);
  assert.equal(formatDateCourte(j[0]), '15/11');
  assert.equal(formatPeriode(j[0], j[6]), 'du 15 au 21 novembre 2026');
  const k = joursDeSemaine(2026, 49);
  assert.equal(formatPeriode(k[0], k[6]), 'du 29 novembre au 5 décembre 2026');
  const l = joursDeSemaine(2026, 53);
  assert.equal(formatPeriode(l[0], l[6]), 'du 27 décembre 2026 au 2 janvier 2027');
});
