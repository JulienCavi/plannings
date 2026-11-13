/**
 * Crée un élément. `props` : `class`, `text`, `on` ({ evenement: gestionnaire }), `data`
 * ({ cle: valeur }), `style` ({ '--variable': valeur }) ; toute autre clé est posée comme
 * propriété DOM si elle existe sur l'élément, sinon comme attribut. Les enfants `null` ou
 * `false` sont ignorés, les chaînes deviennent des nœuds texte (jamais du HTML).
 */
export function el(balise, props = {}, ...enfants) {
  const element = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(props)) {
    if (valeur == null || valeur === false) continue;
    if (cle === 'class') element.className = valeur;
    else if (cle === 'text') element.textContent = valeur;
    else if (cle === 'on') for (const [evt, fn] of Object.entries(valeur)) element.addEventListener(evt, fn);
    else if (cle === 'data') Object.assign(element.dataset, valeur);
    else if (cle === 'style') for (const [p, v] of Object.entries(valeur)) element.style.setProperty(p, v);
    else if (cle in element) element[cle] = valeur;
    else element.setAttribute(cle, valeur);
  }
  element.append(...enfants.flat().filter((e) => e != null && e !== false));
  return element;
}

/** Bouton d'action standard. `variante` : '', 'accent', 'danger', 'discret'. */
export function bouton(libelle, { variante = '', type = 'button', on, ...reste } = {}) {
  return el('button', {
    type,
    class: ['bouton', variante && `bouton-${variante}`].filter(Boolean).join(' '),
    text: libelle,
    on: typeof on === 'function' ? { click: on } : on,
    ...reste,
  });
}
