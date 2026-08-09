import { exporterDonnees, importerDonnees } from '../db/backup.js';

export async function afficher(conteneur) {
  const page = document.createElement('div');
  page.className = 'page-reglages';
  page.innerHTML = `
    <div class="entete-page"><h2>Réglages</h2></div>
    <section class="bloc-sauvegarde">
      <h3>Sauvegarde</h3>
      <p>L'ensemble des données (employés, semaines, planning) est stocké uniquement sur cet
      ordinateur. Exportez régulièrement un fichier de sauvegarde.</p>
      <div class="dialogue-actions">
        <button type="button" class="bouton bouton-accent" data-exporter>Exporter les données</button>
        <button type="button" class="bouton" data-importer>Importer un fichier</button>
        <input type="file" accept="application/json" data-fichier hidden />
      </div>
      <p class="message-statut" data-message></p>
    </section>
  `;
  conteneur.appendChild(page);

  const message = page.querySelector('[data-message]');
  const champFichier = page.querySelector('[data-fichier]');

  page.querySelector('[data-exporter]').addEventListener('click', async () => {
    const donnees = await exporterDonnees();
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    const horodatage = new Date().toISOString().slice(0, 10);
    lien.href = url;
    lien.download = `planning-manager-${horodatage}.json`;
    lien.click();
    URL.revokeObjectURL(url);
    afficherMessage('Export téléchargé.', false);
  });

  page.querySelector('[data-importer]').addEventListener('click', () => {
    champFichier.value = '';
    champFichier.click();
  });

  champFichier.addEventListener('change', () => {
    const fichier = champFichier.files[0];
    if (!fichier) return;
    ouvrirDialogueConfirmationImport(fichier);
  });

  function ouvrirDialogueConfirmationImport(fichier) {
    const dialogue = document.createElement('dialog');
    dialogue.className = 'dialogue';
    dialogue.innerHTML = `
      <div class="formulaire">
        <h3>Remplacer toutes les données ?</h3>
        <p>L'import de « <span data-nom-fichier></span> » va effacer et remplacer intégralement
        les données actuelles (employés, semaines, planning). Cette action est irréversible.</p>
        <div class="dialogue-actions">
          <button type="button" class="bouton" data-annuler>Annuler</button>
          <button type="button" class="bouton bouton-danger" data-confirmer>Remplacer</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialogue);
    dialogue.querySelector('[data-nom-fichier]').textContent = fichier.name;
    dialogue.querySelector('[data-annuler]').addEventListener('click', () => dialogue.close());
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.querySelector('[data-confirmer]').addEventListener('click', async () => {
      dialogue.close();
      try {
        const texte = await fichier.text();
        const donnees = JSON.parse(texte);
        await importerDonnees(donnees);
        afficherMessage('Import réussi. Les données ont été remplacées.', false);
      } catch (erreur) {
        afficherMessage(`Échec de l'import : ${erreur.message}`, true);
      }
    });
    dialogue.showModal();
  }

  function afficherMessage(texte, estErreur) {
    message.textContent = texte;
    message.classList.toggle('message-erreur', estErreur);
  }
}
