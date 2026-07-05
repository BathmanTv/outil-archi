// outil-archi/js/app.js
import {
  loadProjects, createProject, upsertProject, deleteProject,
  exportProjectJson, importProjectJson,
} from './storage.js';
import { createPlanEditor } from './planEditor.js';
import { setupAmbiance } from './ambiance.js';
import { exportPlanPdf, exportPlanPng, exportProjectPdf } from './exportPdf.js';
import { analyzeLayout, suggestAgencement } from './checks.js';

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
  if (name === 'assistant') mountAssistant();
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
// Debounced: sliders/drags fire notify dozens of times per second and each
// save serializes ALL projects (base64 backgrounds included) synchronously.
let saveTimer = null;
function saveNow() {
  if (!currentProject) return;
  try { upsertProject(currentProject); }
  catch (e) { if (e.code === 'QUOTA') handleQuota(); else throw e; }
}
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); try { saveNow(); } catch (e) { /* best effort */ } });

function renderChecks() {
  const list = $('checksList');
  if (!currentProject) return;
  const commercial = $('commercialToggle') ? $('commercialToggle').checked : true;
  const effectif = $('erpEffectif') ? +$('erpEffectif').value || 0 : 0;
  const issues = analyzeLayout(currentProject, { commercial, effectif });
  list.innerHTML = '';
  if (!issues.length) {
    list.innerHTML = '<li class="ok">Aucun point de vigilance.</li>';
    return;
  }
  issues.forEach((it) => {
    const li = document.createElement('li');
    li.className = it.level === 'warn' ? 'warn' : 'info';
    li.textContent = it.message;
    if (it.roomId) {
      li.classList.add('clickable');
      li.title = 'Voir la pièce concernée';
      li.addEventListener('click', () => editor && editor.selectRoom(it.roomId));
    }
    list.appendChild(li);
  });
}

function mountPlan() {
  ensureProject();
  $('planProjectName').textContent = currentProject.nom;
  // (re)create editor bound to current project — destroy the previous stage
  // first (was leaking one Konva stage + keyboard listeners per tab switch).
  if (editor && editor.destroy) editor.destroy();
  $('planCanvas').innerHTML = '';
  editor = createPlanEditor('planCanvas', currentProject, {
    onChange: (proj, total) => { $('totalArea').textContent = total; autosave(); renderChecks(); },
  });
  // Re-apply drawing toggles to the freshly created editor instance.
  editor.setOrtho($('orthoToggle').checked);
  editor.setSnap($('snapToggle').checked);
  // Reflect any existing background-plan state in the controls.
  const fond = currentProject.fond;
  $('fondLock').checked = !!(fond && fond.locked);
  $('fondOpacity').value = fond && fond.opacity != null ? fond.opacity : 0.6;
  $('fondStatus').textContent = fond && fond.image
    ? 'Fond de plan chargé.'
    : 'Importez un plan scanné/PDF (en image), puis « Caler l’échelle ».';
  $('totalArea').textContent = editor.getTotal();
  renderChecks();
}

$('btnAddRoom').addEventListener('click', () => {
  if (!editor) return;
  editor.addRoom({
    nom: $('rNom').value, type: $('rType').value,
    w: $('rW').value, h: $('rH').value,
  });
  $('rNom').value = '';
});
document.querySelectorAll('.cbtn').forEach((b) =>
  b.addEventListener('click', () => editor && editor.addConstraint(b.dataset.kind)));

// AutoCAD-style precise drawing + scaled columns + layers
// blur(): otherwise the button keeps focus and the Enter that closes the
// polygon re-clicks it, restarting draw mode in a loop.
$('btnDrawRoom').addEventListener('click', (e) => { e.currentTarget.blur(); editor && editor.startDrawRoom(); });
$('btnDrawCeil').addEventListener('click', (e) => { e.currentTarget.blur(); editor && editor.startDrawFauxPlafond(); });
$('btnAddPoteau').addEventListener('click', () => {
  if (!editor) return;
  editor.addPoteau({ forme: $('poteauForme').value, taille: (+$('poteauTaille').value || 20) / 100 });
});
$('orthoToggle').addEventListener('change', (e) => editor && editor.setOrtho(e.target.checked));
$('snapToggle').addEventListener('change', (e) => editor && editor.setSnap(e.target.checked));
[['layRooms', 'rooms'], ['layPoteaux', 'poteaux'], ['layCeil', 'fauxplafond']].forEach(([id, name]) =>
  $(id).addEventListener('change', (e) => editor && editor.setLayerVisible(name, e.target.checked)));

$('commercialToggle').addEventListener('change', renderChecks);
$('erpEffectif').addEventListener('change', renderChecks);

// Background floor-plan import + scale calibration (ERP study)
$('fondInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f || !editor) return;
  const reader = new FileReader();
  reader.onload = () => { editor.setFond(reader.result); $('fondStatus').textContent = 'Fond importé. Cliquez « Caler l’échelle » pour le mettre à la bonne taille.'; };
  reader.readAsDataURL(f);
  e.target.value = '';
});
$('btnCalibrate').addEventListener('click', () => {
  if (!editor) return;
  if (!editor.hasFond()) { $('fondStatus').textContent = 'Importez d’abord un fond de plan.'; return; }
  const started = editor.startCalibrate((ok) => {
    $('fondStatus').textContent = ok ? 'Échelle calée. Vous pouvez dessiner par-dessus.' : 'Calage annulé.';
  });
  if (started) $('fondStatus').textContent = 'Cliquez 2 points de distance connue sur le plan…';
});
$('btnRemoveFond').addEventListener('click', () => { if (editor) { editor.removeFond(); $('fondStatus').textContent = 'Fond retiré.'; } });
$('fondLock').addEventListener('change', (e) => editor && editor.setFondLocked(e.target.checked));
$('fondOpacity').addEventListener('input', (e) => editor && editor.setFondOpacity(e.target.value));
$('btnDelRoom').addEventListener('click', () => editor && editor.deleteSelected());
$('btnZoomIn').addEventListener('click', () => editor && editor.zoom(1.2));
$('btnZoomOut').addEventListener('click', () => editor && editor.zoom(1 / 1.2));
$('btnFit').addEventListener('click', () => editor && editor.fitToContent());
$('btnUndo').addEventListener('click', () => editor && editor.undo());
$('btnRedo').addEventListener('click', () => editor && editor.redo());
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

// ---------- assistant view ----------
function mountAssistant() {
  const sel = $('asgProject');
  const projects = loadProjects();
  sel.innerHTML = '';
  if (!projects.length) {
    sel.innerHTML = '<option value="">(aucun projet)</option>';
  } else {
    projects.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.nom} — ${p.pieces.length} pièce(s)`;
      sel.appendChild(o);
    });
    if (currentProject) sel.value = currentProject.id;
  }
}

function renderAgencement(result) {
  const out = $('asgOutput');
  out.innerHTML = '';
  const sum = document.createElement('p');
  sum.className = 'asg-summary';
  sum.textContent = result.summary;
  out.appendChild(sum);

  result.recommendations.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'asg-card';
    const h = document.createElement('span');
    h.className = 'asg-theme';
    h.textContent = r.theme;
    const p = document.createElement('p');
    p.textContent = r.text;
    card.appendChild(h);
    card.appendChild(p);
    out.appendChild(card);
  });

  if (result.issues.length) {
    const t = document.createElement('p');
    t.className = 'asg-subtitle';
    t.textContent = 'Points de vigilance';
    out.appendChild(t);
    result.issues.forEach((it) => {
      const li = document.createElement('div');
      li.className = `asg-issue ${it.level === 'warn' ? 'warn' : 'info'}`;
      li.textContent = it.message;
      out.appendChild(li);
    });
  }
}

$('asgRun').addEventListener('click', () => {
  const id = $('asgProject').value;
  const project = loadProjects().find((p) => p.id === id) || currentProject;
  if (!project) { $('asgOutput').innerHTML = '<p class="muted">Aucun projet à analyser.</p>'; return; }
  const result = suggestAgencement(project, {
    commercial: $('asgCommercial').checked,
    program: $('asgProgram').value,
  });
  renderAgencement(result);
});

$('asgImage').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { const img = $('asgRef'); img.src = reader.result; img.hidden = false; };
  reader.readAsDataURL(f);
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
