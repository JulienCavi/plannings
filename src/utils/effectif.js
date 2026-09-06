import { cleSemaine } from './semaine.js';

/**
 * Calcule l'effectif visible d'une semaine (annee, numero) : la liste des employés qui doivent
 * apparaître sur son planning, avec l'information de savoir s'ils sont hors de leur période de
 * présence par défaut. C'est la seule règle d'effectif de l'application ; toutes les vues
 * doivent passer par elle plutôt que de refaire ce calcul.
 *
 * Règle : un employé est visible si et seulement si il n'est **pas** dans `semaine.retires`, et
 * qu'au moins une de ces trois conditions est vraie :
 *   1. il a au moins une case dans `cases` (vérité historique) ;
 *   2. il est dans `semaine.ajoutes` ;
 *   3. il est dans sa période de présence par défaut :
 *      `(debutCle == null || cleW >= debutCle) && (finCle == null || cleW <= finCle)`.
 * `retires` l'emporte sur tout le reste, y compris sur l'existence de cases : c'est ce qui
 * permet de masquer quelqu'un sans supprimer ses horaires.
 *
 * `horsEffectif` (sur chaque résultat) est vrai quand l'employé n'est visible que par la
 * condition 1 ou 2, c'est-à-dire en dehors de sa période de présence (typiquement : un
 * collaborateur parti, consulté sur une semaine où il travaillait encore).
 *
 * Tolère toute donnée absente ou incomplète : `semaine` peut être `null`/`undefined` (semaine
 * jamais écrite en base — aucun appelant n'a besoin de construire un objet de substitution) ;
 * `semaine.retires`/`semaine.ajoutes` peuvent être absents (traités comme `[]`) ; `cases` peut
 * être `undefined` (traité comme `[]`) ; `employe.debutCle`/`employe.finCle` peuvent être
 * absents (traités comme `null`). Un id présent dans `retires`/`ajoutes` mais ne correspondant
 * à aucun employé de `employes` (ex. employé supprimé entre-temps) est silencieusement ignoré :
 * la fonction itère sur `employes`, jamais sur les tableaux d'exceptions — ne pas « corriger »
 * ce comportement en supposant qu'un id orphelin doit lever une erreur ou être nettoyé ici.
 *
 * @param {Array<object>} employes
 * @param {number} annee
 * @param {number} numero
 * @param {{retires?: number[], ajoutes?: number[]}|null|undefined} semaine
 * @param {Array<{employeId: number}>|undefined} cases
 * @returns {{employe: object, horsEffectif: boolean}[]} triés : d'abord ceux dans leur période
 *   (par prénom), puis les `horsEffectif` (par prénom).
 */
export function effectifVisible(employes, annee, numero, semaine, cases) {
  const cleW = cleSemaine(annee, numero);
  const retires = new Set(semaine?.retires ?? []);
  const ajoutes = new Set(semaine?.ajoutes ?? []);
  const idsAvecCase = new Set((cases ?? []).map((c) => c.employeId));

  const resultat = [];
  for (const employe of employes) {
    if (retires.has(employe.id)) continue;

    const debutCle = employe.debutCle ?? null;
    const finCle = employe.finCle ?? null;
    const dansPeriode = (debutCle == null || cleW >= debutCle) && (finCle == null || cleW <= finCle);
    const estAjoute = ajoutes.has(employe.id);
    const aCase = idsAvecCase.has(employe.id);

    if (!dansPeriode && !estAjoute && !aCase) continue;

    resultat.push({ employe, horsEffectif: !dansPeriode });
  }

  resultat.sort((a, b) => {
    if (a.horsEffectif !== b.horsEffectif) return a.horsEffectif ? 1 : -1;
    return a.employe.prenom.localeCompare(b.employe.prenom);
  });

  return resultat;
}
