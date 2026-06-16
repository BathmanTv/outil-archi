// outil-archi/js/prompt.js
const STYLE_EN = {
  scandinave: 'Scandinavian style', moderne: 'modern style',
  industriel: 'industrial style', boheme: 'bohemian style',
  contemporain: 'contemporary style', minimaliste: 'minimalist style',
  classique: 'classic style',
};
const ROOM_EN = {
  salon: 'living room', cuisine: 'kitchen', chambre: 'bedroom',
  'salle de bain': 'bathroom', bureau: 'home office',
  'salle a manger': 'dining room', entree: 'entrance hall',
};

export function buildPrompt({ roomType = '', style = '', colors = [], materials = [], extra = '' } = {}) {
  const room = ROOM_EN[roomType.toLowerCase()] || roomType;
  const sty = STYLE_EN[style.toLowerCase()] || style;
  const parts = ['interior design photo of a', sty, room];
  if (colors.length) parts.push(`with ${colors.join(', ')} color palette`);
  if (materials.length) parts.push(`using ${materials.join(', ')}`);
  if (extra && extra.trim()) parts.push(extra.trim());
  parts.push('photorealistic, natural light, high detail, wide angle, no text, no watermark');
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function pollinationsUrl(prompt, { width = 1024, height = 768, seed } = {}) {
  const enc = encodeURIComponent(prompt);
  const params = new URLSearchParams({ width: String(width), height: String(height), nologo: 'true' });
  if (seed != null) params.set('seed', String(seed));
  return `https://image.pollinations.ai/prompt/${enc}?${params.toString()}`;
}
