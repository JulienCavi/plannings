import { exporterDonnees, importerDonnees, baseContientDesDonnees } from '../db/backup.js';
import { lireMeta, ecrireMeta } from '../db/meta.js';
import { telechargerJSON, horodatageFichier } from '../utils/telechargement.js';
import { el, bouton } from '../ui/dom.js';
import { confirmer } from '../ui/dialogue.js';

/** « aujourd'hui à 16:47 », « hier », « il y a 12 jours (le 01/11/2026) ». */
function formatAnciennete(dateISO) {
  const date = new Date(dateISO);
  const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((minuit(new Date()) - minuit(date)) / 86400000);
  if (jours <= 0) return `aujourd’hui à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours (le ${date.toLocaleDateString('fr-FR')})`;
}

export async function afficher(conteneur) {
  const [dernierExport, protege] = await Promise.all([lireMeta('dernierExport'), navigator.storage?.persisted?.() ?? false]);

  const etatExport = el('p', { class: 'aide' });
  const majEtatExport = (dateISO) => {
    etatExport.textContent = dateISO
      ? `Dernier export depuis ce navigateur : ${formatAnciennete(dateISO)}.`
      : 'Aucun export enregistré depuis ce navigateur.';
  };
  majEtatExport(dernierExport);

  const message = el('p', { class: 'message-statut', role: 'status' });
  const afficherMessage = (texte, estErreur = false) => {
    message.textContent = texte;
    message.classList.toggle('message-statut-erreur', estErreur);
  };

  const champFichier = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });

  async function exporter() {
    const donnees = await exporterDonnees();
    telechargerJSON(`planning-manager-${horodatageFichier()}.json`, donnees);
    await ecrireMeta('dernierExport', donnees.exporteLe);
    majEtatExport(donnees.exporteLe);
    document.dispatchEvent(new CustomEvent('etat-sauvegarde-change'));
    afficherMessage('Export téléchargé. Rangez le fichier hors du dossier du site.');
  }

  async function importer(fichier) {
    let donnees;
    try {
      donnees = JSON.parse(await fichier.text());
    } catch {
      afficherMessage('Échec de l’import : ce fichier n’est pas un export JSON lisible.', true);
      return;
    }
    const aDesDonnees = await baseContientDesDonnees();
    const ok = await confirmer({
      titre: 'Remplacer toutes les données ?',
      texte: aDesDonnees
        ? `L’import de « ${fichier.name} » remplace intégralement les données actuelles (employés, semaines, planning). Une copie de l’état actuel est d’abord téléchargée, par sécurité.`
        : `Importer « ${fichier.name} » dans l’application ?`,
      libelle: aDesDonnees ? 'Sauvegarder puis remplacer' : 'Importer',
      danger: aDesDonnees,
    });
    if (!ok) return;
    try {
      if (aDesDonnees) telechargerJSON(`planning-manager-avant-import-${horodatageFichier()}.json`, await exporterDonnees());
      await importerDonnees(donnees);
      document.dispatchEvent(new CustomEvent('etat-sauvegarde-change'));
      afficherMessage('Import réussi. Les données ont été remplacées.');
    } catch (erreur) {
      afficherMessage(`Échec de l’import : ${erreur.message} Les données actuelles n’ont pas été modifiées.`, true);
    }
  }

  champFichier.addEventListener('change', () => {
    const fichier = champFichier.files[0];
    if (fichier) importer(fichier);
  });

  conteneur.replaceChildren(
    el(
      'div',
      { class: 'page-reglages' },
      el('header', { class: 'entete-page' }, el('h1', { text: 'Réglages' })),
      el(
        'section',
        { class: 'bloc bloc-sauvegarde' },
        el('h2', { text: 'Sauvegarde' }),
        el('p', {
          text: 'Toutes les données (employés, semaines, planning) vivent uniquement dans ce navigateur, sur cet ordinateur. Le fichier d’export est votre seule sauvegarde : exportez régulièrement.',
        }),
        etatExport,
        el(
          'div',
          { class: 'rangee-boutons' },
          bouton('Exporter les données', { variante: 'accent', on: exporter }),
          bouton('Importer un fichier…', {
            on: () => {
              champFichier.value = '';
              champFichier.click();
            },
          }),
          champFichier
        ),
        message,
        el('p', {
          class: 'aide',
          text: protege
            ? 'Le navigateur protège ces données contre son nettoyage automatique.'
            : 'Le navigateur peut effacer ces données s’il manque de place ou si vous videz les données de navigation : raison de plus pour exporter.',
        })
      )
    )
  );
}
