import { el } from './dom.js';

let zone = null;

/**
 * Affiche un message bref en bas de l'écran. Les erreurs restent plus longtemps et sont
 * annoncées immédiatement aux lecteurs d'écran.
 */
export function notifier(texte, { erreur = false } = {}) {
  if (!zone) {
    zone = el('div', { class: 'zone-messages no-print', 'aria-live': 'polite' });
    document.body.append(zone);
  }
  const message = el('div', {
    class: erreur ? 'message message-erreur' : 'message',
    role: erreur ? 'alert' : 'status',
    text: texte,
  });
  zone.append(message);
  setTimeout(() => message.remove(), erreur ? 9000 : 3500);
}
