// The cover renderer for VICE COVER LAB.
//
// renderCover(canvas, state, photos, W, H) draws one complete cover:
// graded photos in the layout's panels, the halftone title block with
// Anton poster lettering and a Pacifico neon subtitle, a badge ribbon,
// grain and vignette. Every dimension is derived from W and H, so the
// same state renders a 1080 x 1080 square, a 1080 x 1350 story or a
// 1920 x 1080 wide cover. Photos are graded through the gradient-map
// lookup tables in grades.js, one ImageData pass per panel, cached by
// photo + grade + size + crop.

import { GRADES, buildGradeLut, applyGrade } from './grades.js';
import { layoutGeometry } from './layouts.js';

const lutCache = new Map();
const panelCache = new Map();

/** The lookup table for one grade, baked once and reused. */
function lutFor(gradeId) {
  if (!lutCache.has(gradeId)) lutCache.set(gradeId, buildGradeLut(GRADES[gradeId] ?? GRADES.sunset));
  return lutCache.get(gradeId);
}

/** A 128 x 128 tile of monochrome noise, reused for the grain overlay. */
let noiseTile = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas');
  noiseTile.width = 128;
  noiseTile.height = 128;
  const nctx = noiseTile.getContext('2d');
  const img = nctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 256);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  return noiseTile;
}

/**
 * Draws one photo into a panel-sized canvas, cover-fit with the panel's
 * zoom and pan, then graded. Results are cached; the cache holds at most
 * 32 panels and clears when it grows past that.
 */
function gradedPanel(img, w, h, gradeId, zoom, ox, oy) {
  const pw = Math.max(2, Math.round(w));
  const ph = Math.max(2, Math.round(h));
  const key = `${img.src}|${gradeId}|${pw}x${ph}|${zoom.toFixed(3)}|${ox.toFixed(3)}|${oy.toFixed(3)}`;
  if (panelCache.has(key)) return panelCache.get(key);
  if (panelCache.size > 32) panelCache.clear();
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext('2d');
  const scale = Math.max(pw / img.naturalWidth, ph / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (pw - dw) / 2 + (ox * pw) / 2, (ph - dh) / 2 + (oy * ph) / 2, dw, dh);
  const grade = GRADES[gradeId] ?? GRADES.sunset;
  const imgData = ctx.getImageData(0, 0, pw, ph);
  applyGrade(imgData, lutFor(gradeId), grade);
  ctx.putImageData(imgData, 0, 0);
  panelCache.set(key, c);
  return c;
}

/** Draws a photo (or a warm placeholder when none) into one panel rect. */
function drawPanel(ctx, panel, img, slot, state) {
  const { x, y, w, h, rot, border } = panel;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(Math.min(w, h) * 0.05);
  ctx.shadowOffsetY = Math.round(Math.min(w, h) * 0.015);
  const bw = border === 'polaroid' ? Math.round(Math.min(w, h) * 0.045) : 0;
  const bb = border === 'polaroid' ? Math.round(Math.min(w, h) * 0.11) : 0;
  if (border === 'polaroid') {
    ctx.fillStyle = '#f8f4ec';
    ctx.fillRect(-bw, -bw, w + 2 * bw, h + bw + bb);
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (img) {
    const graded = gradedPanel(img, w, h, state.grade, slot.zoom ?? 1, slot.ox ?? 0, slot.oy ?? 0);
    ctx.drawImage(graded, 0, 0, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ff7a3c');
    g.addColorStop(1, '#c2187a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (border === 'thin') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.008));
    ctx.strokeRect(0, 0, w, h);
  } else if (border === 'polaroid') {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw, -bw, w + 2 * bw, h + bw + bb);
  }
  ctx.restore();
}

/** A field of halftone dots, the radius breathing in a sine wave. */
function drawHalftone(ctx, x, y, w, h, color) {
  const step = Math.max(10, Math.round(w / 72));
  ctx.fillStyle = color;
  for (let py = y + step / 2; py < y + h; py += step) {
    for (let px = x + step / 2; px < x + w; px += step) {
      const r = step * 0.16 * (1 + 0.6 * Math.sin(px * 0.02) * Math.cos(py * 0.03));
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.6, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Fits one line of text to a width, shrinking from startSize to minSize. */
function fitFont(ctx, text, family, weight, maxWidth, startSize, minSize) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/** The title block: halftone band, Anton title, Pacifico neon subtitle. */
function drawTitleBlock(ctx, title, state, W, H, scrim) {
  const { x, y, w, h, align } = title;
  if (scrim) {
    const g = ctx.createLinearGradient(0, y - h * 0.4, 0, y + h);
    g.addColorStop(0, 'rgba(12, 4, 24, 0)');
    g.addColorStop(1, 'rgba(12, 4, 24, 0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h * 0.4, W, h * 1.4);
  } else {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#1c0b2e');
    g.addColorStop(1, '#2e0f3d');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    drawHalftone(ctx, x, y, w, h, 'rgba(255, 120, 80, 0.28)');
  }
  const pad = Math.round(w * 0.045);
  const cx = align === 'center' ? x + w / 2 : x + pad;
  const text = (state.title || 'UNTITLED').trim().toUpperCase();
  const titleSize = fitFont(ctx, text, 'Anton, sans-serif', '400', w - 2 * pad, Math.round(h * 0.52), 14);
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  const titleY = y + h * (state.subtitle ? 0.38 : 0.52);
  const grad = ctx.createLinearGradient(0, titleY - titleSize / 2, 0, titleY + titleSize / 2);
  grad.addColorStop(0, '#fff8e6');
  grad.addColorStop(1, '#ffb347');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = Math.max(2, titleSize * 0.07);
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.round(titleSize * 0.14);
  ctx.shadowOffsetY = Math.round(titleSize * 0.05);
  ctx.strokeText(text, cx, titleY);
  ctx.fillText(text, cx, titleY);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (state.subtitle) {
    const sub = state.subtitle.trim();
    const subSize = fitFont(ctx, sub, 'Pacifico, cursive', '400', w - 2 * pad, Math.round(h * 0.24), 12);
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.fillStyle = '#ff5da2';
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = Math.round(subSize * 0.55);
    ctx.fillText(sub, cx, y + h * 0.8);
    ctx.shadowBlur = 0;
  }
}

/** A small rotated ribbon with a Bebas Neue label, top-right. */
function drawBadge(ctx, badge, state, W, H) {
  const label = (state.badge || '').trim();
  if (!label) return;
  const size = Math.max(13, Math.round(W * 0.02));
  ctx.save();
  ctx.translate(badge.x + Math.round(W * 0.09), badge.y + Math.round(H * 0.035));
  ctx.rotate(-0.1);
  ctx.font = `${size}px "Bebas Neue", sans-serif`;
  const tw = ctx.measureText(label).width;
  const bw = tw + size * 1.6;
  const bh = size * 1.9;
  ctx.fillStyle = '#ff2e88';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 0, 1);
  ctx.restore();
}

/**
 * Draws one complete cover onto `canvas` at W x H.
 * `state` holds layout, grade, title, subtitle, badge, grain, vignette and
 * the per-panel photo/crop (state.panels[i] = {photo, zoom, ox, oy}).
 * `photos` is the library of loaded images; a panel's photo is its index.
 * The geometry is stored on the canvas for the editor's hit-testing.
 */
export function renderCover(canvas, state, photos, W, H) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const geo = layoutGeometry(state.layout, W, H);
  canvas.__geometry = { ...geo, W, H };
  ctx.fillStyle = '#0d0618';
  ctx.fillRect(0, 0, W, H);
  if (geo.bgPhoto) {
    const bg = photos[state.panels[0]?.photo ?? 0] ?? photos[0];
    if (bg) {
      const scale = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
      const dw = bg.naturalWidth * scale;
      const dh = bg.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(13, 6, 24, 0.25)');
      g.addColorStop(1, 'rgba(13, 6, 24, 0.75)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  geo.panels.forEach((panel, i) => {
    const slot = state.panels[i] ?? { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const img = photos[slot.photo] ?? photos[0] ?? null;
    drawPanel(ctx, panel, img, slot, state);
  });
  drawTitleBlock(ctx, geo.title, state, W, H, Boolean(geo.scrim));
  drawBadge(ctx, geo.badge, state, W, H);
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(getNoiseTile(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.vignette) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  return canvas;
}

/** Renders one cover at W x H on a fresh offscreen canvas (for exports). */
export function exportCover(state, photos, W, H) {
  return renderCover(document.createElement('canvas'), state, photos, W, H);
}
