// outil-archi/js/geometry.js
export const PX_PER_M = 50;   // 50 px = 1 m at scale 1
export const GRID_M = 0.5;    // snap step in meters

export function snapToGrid(value, grid = GRID_M) {
  return Math.round(value / grid) * grid;
}

export function roomAreaM2(room) {
  return +(room.w * room.h).toFixed(2);
}

export function totalAreaM2(rooms) {
  return +rooms.reduce((sum, r) => sum + r.w * r.h, 0).toFixed(2);
}

export function metersToPixels(m, scale = 1) {
  return m * PX_PER_M * scale;
}

export function pixelsToMeters(px, scale = 1) {
  return px / (PX_PER_M * scale);
}
