// outil-archi/js/exportPdf.js
import { totalAreaM2 } from './geometry.js';

function safeName(s) { return (s || 'export').replace(/\s+/g, '_'); }

function titleBlock(doc, project, pageW) {
  doc.setFontSize(14);
  doc.text(project.nom || 'Projet', 10, 12);
  doc.setFontSize(10);
  doc.text(
    `Client: ${project.client || '-'}   Date: ${project.date}   Surface totale: ${totalAreaM2(project.pieces)} m²`,
    10, 18,
  );
  if (project.logo) {
    try { doc.addImage(project.logo, 'PNG', pageW - 42, 6, 32, 14); } catch (_) { /* logo invalide, ignore */ }
  }
}

export function exportPlanPdf(project, stage, { format = 'a4' } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  titleBlock(doc, project, pageW);
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  doc.addImage(dataUrl, 'PNG', 10, 24, pageW - 20, pageH - 34);
  doc.save(`${safeName(project.nom)}_plan.pdf`);
}

export function exportPlanPng(project, stage) {
  const dataUrl = stage.toDataURL({ pixelRatio: 2 });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${safeName(project.nom)}_plan.png`;
  a.click();
}

// Load a (possibly remote) image into a data URL via canvas so jsPDF can embed
// it. Resolves null if the image can't be fetched/decoded (e.g. CORS-tainted).
function loadImageDataUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight });
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Combined PDF: page 1 = plan, then one page per saved ambiance.
// Remote ambiance images are preloaded to data URLs; any that fail to embed
// fall back to their URL printed as text (no silent blank pages).
export async function exportProjectPdf(project, stage) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - 20;
  const maxH = pageH - 34;

  titleBlock(doc, project, pageW);
  if (stage) {
    doc.addImage(stage.toDataURL({ pixelRatio: 2 }), 'PNG', 10, 24, maxW, maxH);
  }

  for (const a of project.ambiances) {
    const loaded = await loadImageDataUrl(a.image);
    doc.addPage();
    titleBlock(doc, project, pageW);
    if (loaded) {
      let w = maxW;
      let h = (loaded.h / loaded.w) * w;
      if (h > maxH) { h = maxH; w = (loaded.w / loaded.h) * h; }
      doc.addImage(loaded.dataUrl, 'JPEG', 10, 24, w, h);
    } else {
      doc.setFontSize(10);
      doc.text('Image non intégrable (générée en ligne) :', 10, 30);
      doc.text(a.image, 10, 36, { maxWidth: maxW });
    }
  }

  doc.save(`${safeName(project.nom)}_projet.pdf`);
}
