// outil-archi/js/app.js
import {
  loadProjects, createProject, upsertProject, deleteProject,
  exportProjectJson, importProjectJson,
} from './storage.js';
import { createPlanEditor } from './planEditor.js';
import { setupAmbiance } from './ambiance.js';
import { exportPlanPdf, exportPlanPng, exportProjectPdf } from './exportPdf.js';

const $ = (id) => document.getElementById(id);

let currentProject = null;
let editor = null;       // plan editor instance
let amb = null;          // ambiance controller

// ---------- routing ----------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $(`view-${name}`).classList.add('active');
  if (name === 'accueil') renderProjects();
  if (name === 'plan') mountPlan();
  if (name === 'ambiance') mountAmbiance();
}
document.querySelectorAll('.navbtn').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- accueil ----------
function renderProjects() {
  const list = $('projectList');
  const projects = loadProjects();
  list.innerHTML = '';
  if (!projects.length) { list.innerHTML = '<p>Aucun projet. Créez-en un.</p>'; return; }
  projects.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h4></h4>
      <div class="meta"></div>
      <div class="actions">
        <button class="open primary">Ouvrir</button>
        <button class="dup">Dupliquer</button>
        <button class="exp">Export .json</button>
        <button class="del danger">Suppr.</button>
      </div>`;
    card.querySelector('h4').textContent = p.nom;
    card.querySelector('.meta').textContent =
      `${p.client || 'sans client'} · ${p.date} · ${p.pieces.length} pièce(s)`;
    card.querySelector('.open').addEventListener('click', () => { currentProject = p; showView('plan'); });
    card.querySelector('.dup').addEventListener('click', () => {
      const copy = importProjectJson(exportProjectJson(p));
      copy.nom = p.nom + ' (copie)';
      try { upsertProject(copy); } catch (e) { if (e.code === 'QUOTA') { handleQuota(); return; } throw e; }
      renderProjects();
    });
    card.querySelector('.exp').addEventListener('click', () => downloadJson(p));
    card.querySelector('.del').addEventListener('click', () => {
      if (confirm(`Supprimer "${p.nom}" ?`)) { deleteProject(p.id); renderProjects(); }
    });
    list.appendChild(card);
  });
}

$('btnNew').addEventListener('click', () => {
  const nom = prompt('Nom du projet ?', 'Nouveau projet');
  if (nom === null) return;
  const client = prompt('Nom du client ?', '') || '';
  try {
    currentProject = upsertProject(createProject(nom || 'Nouveau projet', client));
  } catch (e) { if (e.code === 'QUOTA') { handleQuota(); return; } throw e; }
  showView('plan');
});

$('importJson').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const p = importProjectJson(text);
    upsertProject(p);
    renderProjects();
    alert('Projet importé.');
  } catch (err) {
    alert('Import impossible : ' + err.message);
  }
  e.target.value = '';
});

function downloadJson(project) {
  const blob = new Blob([exportProjectJson(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(project.nom || 'projet').replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- plan view ----------
function ensureProject() {
  if (!currentProject) {
    currentProject = upsertProject(createProject());
  }
}

function handleQuota() {
  alert('Stockage du navigateur plein. Téléchargez vos projets en .json pour les '
    + 'sauvegarder, puis supprimez les anciens pour libérer de la place.');
  if (currentProject) downloadJson(currentProject);
}

// Persist the current project; on quota error never let it throw into a
// Konva event handler — surface a clear message + offer a .json export.
function autosave() {
  if (!currentProject) return;
  try { upsertProject(currentProject); }
  catch (e) { if (e.code === 'QUOTA') handleQuota(); else throw e; }
}

function mountPlan() {
  ensureProject();
  $('planProjectName').textContent = currentProject.nom;
  // (re)create editor bound to current project
  $('planCanvas').innerHTML = '';
  editor = createPlanEditor('planCanvas', currentProject, {
    onChange: (proj, total) => { $('totalArea').textContent = total; autosave(); },
  });
  $('totalArea').textContent = editor.getTotal();
}

$('btnAddRoom').addEventListener('click', () => {
  if (!editor) return;
  editor.addRoom({
    nom: $('rNom').value, type: $('rType').value,
    w: $('rW').value, h: $('rH').value,
  });
  $('rNom').value = '';
});
$('btnDelRoom').addEventListener('click', () => editor && editor.deleteSelected());
$('btnZoomIn').addEventListener('click', () => editor && editor.zoom(1.2));
$('btnZoomOut').addEventListener('click', () => editor && editor.zoom(1 / 1.2));
$('btnExportPlan').addEventListener('click', () => {
  if (editor && currentProject) exportPlanPdf(currentProject, editor.getStage());
});
$('btnExportPng').addEventListener('click', () => {
  if (editor && currentProject) exportPlanPng(currentProject, editor.getStage());
});
$('btnExportProject').addEventListener('click', async (e) => {
  if (!editor || !currentProject) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Génération du PDF…';
  try {
    await exportProjectPdf(currentProject, editor.getStage());
  } catch (err) {
    alert('Export du projet impossible : ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// ---------- ambiance view ----------
function mountAmbiance() {
  ensureProject();
  $('ambImage').removeAttribute('src'); // don't carry a previous project's preview
  $('ambStatus').textContent = '';
  amb = setupAmbiance({
    roomSel: $('aRoom'), styleSel: $('aStyle'),
    colors: $('aColors'), materials: $('aMaterials'), extra: $('aExtra'),
    image: $('ambImage'), status: $('ambStatus'),
  }, currentProject, { onSave: () => { autosave(); amb.renderGallery($('ambGallery')); } });
  amb.renderGallery($('ambGallery'));
}

$('btnGenerate').addEventListener('click', () => amb && amb.generate());
$('btnRegen').addEventListener('click', () => amb && amb.regenerate());
$('btnSaveAmb').addEventListener('click', () => amb && amb.save());

// ---------- logo branding (stored on project) ----------
// Optional quick logo set: double-click brand logo to upload
document.querySelector('.brand').addEventListener('dblclick', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('brandLogo').src = reader.result;
      if (currentProject) { currentProject.logo = reader.result; autosave(); }
      localStorage.setItem('outil_archi_logo', reader.result);
    };
    reader.readAsDataURL(f);
  };
  input.click();
});

// restore global logo
const savedLogo = localStorage.getItem('outil_archi_logo');
if (savedLogo) $('brandLogo').src = savedLogo;

// ---------- boot ----------
showView('accueil');
