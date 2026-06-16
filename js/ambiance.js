// outil-archi/js/ambiance.js
import { buildPrompt, pollinationsUrl } from './prompt.js';
import { newId } from './storage.js';

function splitList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// els: { roomSel, styleSel, colors, materials, extra, image, status }
export function setupAmbiance(els, project, { onSave } = {}) {
  let current = null; // { prompt, params, url }

  function readParams() {
    return {
      roomType: els.roomSel.value,
      style: els.styleSel.value,
      colors: splitList(els.colors.value),
      materials: splitList(els.materials.value),
      extra: els.extra.value,
    };
  }

  function generate(seed) {
    const params = readParams();
    const prompt = buildPrompt(params);
    const url = pollinationsUrl(prompt, { seed });
    current = { prompt, params, url };
    els.status.textContent = 'Génération…';
    els.image.src = url;
    els.image.onload = () => { els.status.textContent = ''; };
    els.image.onerror = () => { els.status.textContent = 'Erreur ou connexion requise. Réessayer.'; };
    return current;
  }

  function regenerate() {
    const seed = Math.floor(Math.random() * 1e6);
    return generate(seed);
  }

  function save() {
    if (!current) { els.status.textContent = `Génère une image d'abord.`; return null; }
    const amb = { id: newId(), prompt: current.prompt, params: current.params, image: current.url };
    project.ambiances.push(amb);
    if (onSave) onSave(project);
    els.status.textContent = 'Ambiance ajoutée au projet.';
    return amb;
  }

  function renderGallery(galleryEl, onPick) {
    galleryEl.innerHTML = '';
    project.ambiances.forEach((a) => {
      const img = document.createElement('img');
      img.src = a.image;
      img.alt = 'ambiance';
      img.addEventListener('click', () => { els.image.src = a.image; if (onPick) onPick(a); });
      galleryEl.appendChild(img);
    });
  }

  return { generate, regenerate, save, renderGallery, getCurrent: () => current };
}
