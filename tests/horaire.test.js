import test from 'node:test';
import assert from 'node:assert/strict';
import { analyserHeure, dureeHeures, formatHeures, heureVersMinutes, totalHeuresEmploye } from '../src/utils/horaire.js';

test('dureeHeures : les quatre cas de référence', () => {
  assert.equal(dureeHeures('08:00', '16:00'), 8);
  assert.equal(dureeHeures('08:00', '08:00'), 0);
  assert.equal(dureeHeures('22:00', '06:00'), 8);
  assert.equal(dureeHeures('', '16:00'), 0);
  assert.equal(dureeHeures('25:00', '16:00'), 0);
  assert.equal(dureeHeures(null, null), 0);
});

test('heureVersMinutes refuse tout ce qui n’est pas HH:MM', () => {
  assert.equal(heureVersMinutes('13:30'), 810);
  assert.equal(heureVersMinutes('9:30'), null);
  assert.equal(heureVersMinutes('24:00'), null);
  assert.equal(heureVersMinutes('12:60'), null);
});

test('analyserHeure comprend les écritures courantes', () => {
  const cas = {
    13: '13:00', '13h': '13:00', '13h30': '13:30', '13H30': '13:30', '13:30': '13:30', '13.30': '13:30', '13,30': '13:30',
    1330: '13:30', 930: '09:30', 9: '09:00', '9h': '09:00', '09h05': '09:05', ' 8h20 ': '08:20', '0': '00:00', '0000': '00:00', '2359': '23:59',
  };
  for (const [saisie, attendu] of Object.entries(cas)) assert.equal(analyserHeure(saisie), attendu, `saisie « ${saisie} »`);
});

test('analyserHeure refuse ce qui est ambigu ou impossible', () => {
  for (const saisie of ['', '  ', 'abc', '24', '2400', '1260', '9h5', '13h3', '12345', '13h30m', '-1', null, undefined]) {
    assert.equal(analyserHeure(saisie), null, `saisie « ${saisie} »`);
  }
});

test('ce que rend analyserHeure est toujours relisible par heureVersMinutes', () => {
  for (const saisie of ['9', '930', '13h30', '2359', '0']) assert.notEqual(heureVersMinutes(analyserHeure(saisie)), null);
});

test('formatHeures', () => {
  assert.equal(formatHeures(7), '7h');
  assert.equal(formatHeures(7.5), '7h30');
  assert.equal(formatHeures(37.5), '37h30');
  assert.equal(formatHeures(4 + 25 / 60), '4h25');
  assert.equal(formatHeures(0), '0h');
});

test('totalHeuresEmploye ne compte que les journées travaillées complètes de la personne', () => {
  const statuts = new Map([[1, { compteCommeTravail: true }], [3, { compteCommeTravail: false }]]);
  const cases = [
    { employeId: 1, statutId: 1, heureDebut: '12:30', heureFin: '20:00' },
    { employeId: 1, statutId: 1, heureDebut: '13:30', heureFin: '21:00' },
    { employeId: 1, statutId: 3, heureDebut: null, heureFin: null },
    { employeId: 1, statutId: 1, heureDebut: '13:30', heureFin: null },
    { employeId: 2, statutId: 1, heureDebut: '09:00', heureFin: '17:00' },
  ];
  assert.equal(totalHeuresEmploye(cases, 1, statuts), 15);
});
