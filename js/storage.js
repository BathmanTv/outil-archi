// outil-archi/js/storage.js
const KEY = 'outil_archi_projets_v1';

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
}

export function loadProjects() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

export function saveProjects(projects) {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
  } catch (e) {
    const err = new Error('Stockage du navigateur plein.');
    err.code = 'QUOTA';
    throw err;
  }
}

export function createProject(nom = 'Nouveau projet', client = '') {
  return {
    id: newId(), nom, client,
    date: new Date().toISOString().slice(0, 10),
    logo: '', pieces: [], ouvertures: [], contraintes: [], ambiances: [],
  };
}

export function upsertProject(project) {
  const projects = loadProjects();
  const i = projects.findIndex(p => p.id === project.id);
  if (i >= 0) projects[i] = project; else projects.push(project);
  saveProjects(projects);
  return project;
}

export function deleteProject(id) {
  saveProjects(loadProjects().filter(p => p.id !== id));
}

export function exportProjectJson(project) {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json) {
  const p = JSON.parse(json);
  if (!p || typeof p !== 'object' || !Array.isArray(p.pieces)) {
    throw new Error('Fichier projet invalide');
  }
  p.id = newId();
  p.ouvertures = p.ouvertures || [];
  p.contraintes = p.contraintes || [];
  p.ambiances = p.ambiances || [];
  return p;
}
