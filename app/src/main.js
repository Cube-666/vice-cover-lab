// Wires VICE COVER LAB: the photo library, the editor controls, panel
// drag-and-zoom on the preview, undo/redo, and the three-size PNG
// export. A `?shot=` query sets up a fixed scene for a screenshot
// instead (./shots.js). Photos are read on this machine with FileReader
// and never leave it.
//
// The playtest hook window.__vice exposes the state, the library and the
// export, so an automated check can drive the app end to end.

import { renderCover, exportCover } from './cover.js';
import { GRADES } from './grades.js';
import { LAYOUTS, panelCount } from './layouts.js';
import { EXPORT_SIZES, defaultState, panelsForLayout, cloneState, History } from './state.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');

/** The photo library: samples first, then the person's own uploads. */
const photos = [];
const SAMPLES = [
  { name: 'boulevard', label: 'Boulevard' },
  { name: 'pier', label: 'Pier' },
  { name: 'neon', label: 'Neon Night' },
  { name: 'rooftop', label: 'Rooftop' },
];

let state = defaultState();
let history = new History(state);
let selected = 0;
let renderQueued = false;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** The preview size for the current export aspect, capped at 720 px. */
function previewSize() {
  const size = EXPORT_SIZES.find((s) => s.id === state.size) ?? EXPORT_SIZES[0];
  const scale = Math.min(1, 720 / Math.max(size.w, size.h));
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) };
}

function redraw() {
  if (document.body.classList.contains('shot-cover')) {
    renderCover(canvas, state, photos.map((p) => p.img), window.innerWidth, window.innerHeight);
  } else {
    const { w, h } = previewSize();
    renderCover(canvas, state, photos.map((p) => p.img), w, h);
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    redraw();
  });
}

/** Records a committed change for undo/redo and repaints. */
function commit() {
  history.push(state);
  syncUndoRedo();
  queueRender();
}

function syncUndoRedo() {
  document.getElementById('undo').disabled = !history.canUndo;
  document.getElementById('redo').disabled = !history.canRedo;
}

/** Rebuilds the sample chips and the panel photo picker. */
function syncLibraryUI() {
  const chips = document.getElementById('samples');
  chips.innerHTML = '';
  photos.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.label;
    b.title = `Use ${p.label} for the selected panel`;
    b.addEventListener('click', () => {
      state.panels[selected].photo = i;
      syncPanelUI();
      commit();
    });
    chips.appendChild(b);
  });
  const sel = document.getElementById('panelPhoto');
  sel.innerHTML = '';
  photos.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = p.label;
    sel.appendChild(o);
  });
  syncPanelUI();
}

/** Shows which panel is selected and its photo and zoom. */
function syncPanelUI() {
  const slot = state.panels[selected] ?? state.panels[0];
  document.getElementById('panelLabel').textContent = `Panel ${selected + 1} of ${state.panels.length}`;
  document.getElementById('panelPhoto').value = String(slot?.photo ?? 0);
  document.getElementById('zoom').value = String(Math.round((slot?.zoom ?? 1) * 100));
}

/** Builds the layout and grade buttons once. */
function buildOptionButtons() {
  const layoutBox = document.getElementById('layout');
  Object.entries(LAYOUTS).forEach(([id, def]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.dataset.layout = id;
    b.textContent = def.name;
    b.addEventListener('click', () => {
      if (state.layout === id) return;
      state.layout = id;
      state.panels = panelsForLayout(state, id);
      selected = 0;
      layoutBox.querySelectorAll('.opt').forEach((x) => x.classList.toggle('on', x.dataset.layout === id));
      syncPanelUI();
      commit();
    });
    if (id === state.layout) b.classList.add('on');
    layoutBox.appendChild(b);
  });
  const gradeBox = document.getElementById('grade');
  Object.entries(GRADES).forEach(([id, def]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.dataset.grade = id;
    b.textContent = def.name;
    b.addEventListener('click', () => {
      if (state.grade === id) return;
      state.grade = id;
      gradeBox.querySelectorAll('.opt').forEach((x) => x.classList.toggle('on', x.dataset.grade === id));
      commit();
    });
    if (id === state.grade) b.classList.add('on');
    gradeBox.appendChild(b);
  });
}

/** Which panel (if any) sits under a point in the preview's bitmap space. */
function hitPanel(bx, by) {
  const geo = canvas.__geometry;
  if (!geo) return -1;
  for (let i = geo.panels.length - 1; i >= 0; i--) {
    const p = geo.panels[i];
    if (bx >= p.x && bx <= p.x + p.w && by >= p.y && by <= p.y + p.h) return i;
  }
  return -1;
}

/** Pointer position in the preview canvas's bitmap pixels. */
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const p = canvasPoint(e);
  const i = hitPanel(p.x, p.y);
  if (i < 0) return;
  selected = i;
  syncPanelUI();
  const slot = state.panels[i];
  drag = { x: p.x, y: p.y, ox: slot.ox ?? 0, oy: slot.oy ?? 0, moved: false };
  canvas.setPointerCapture(e.pointerId);
  queueRender();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  const geo = canvas.__geometry;
  const panel = geo?.panels[selected];
  if (!panel) return;
  const slot = state.panels[selected];
  slot.ox = Math.max(-1, Math.min(1, drag.ox + ((p.x - drag.x) / panel.w) * 2));
  slot.oy = Math.max(-1, Math.min(1, drag.oy + ((p.y - drag.y) / panel.h) * 2));
  if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 2) drag.moved = true;
  queueRender();
});
canvas.addEventListener('pointerup', () => {
  if (drag?.moved) commit();
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const slot = state.panels[selected];
  if (!slot) return;
  slot.zoom = Math.max(1, Math.min(3, (slot.zoom ?? 1) * (e.deltaY < 0 ? 1.1 : 0.9)));
  document.getElementById('zoom').value = String(Math.round(slot.zoom * 100));
  commit();
}, { passive: false });

document.getElementById('photo').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    try {
      const img = await loadImage(URL.createObjectURL(file));
      photos.push({ name: file.name.replace(/\.[^.]+$/, ''), label: file.name.replace(/\.[^.]+$/, '').slice(0, 18), img });
    } catch {
      statusEl.textContent = `Could not read ${file.name}`;
    }
  }
  if (files.length) {
    state.panels[selected].photo = photos.length - 1;
    syncLibraryUI();
    commit();
    statusEl.textContent = `${files.length} photo${files.length > 1 ? 's' : ''} added — your photos stay on this machine.`;
  }
  e.target.value = '';
});

document.getElementById('title').addEventListener('input', (e) => {
  state.title = e.target.value;
  queueRender();
});
document.getElementById('title').addEventListener('change', commit);
document.getElementById('subtitle').addEventListener('input', (e) => {
  state.subtitle = e.target.value;
  queueRender();
});
document.getElementById('subtitle').addEventListener('change', commit);
document.getElementById('badge').addEventListener('input', (e) => {
  state.badge = e.target.value;
  queueRender();
});
document.getElementById('badge').addEventListener('change', commit);

document.getElementById('panelPhoto').addEventListener('change', (e) => {
  state.panels[selected].photo = Number(e.target.value);
  commit();
});
document.getElementById('zoom').addEventListener('input', (e) => {
  state.panels[selected].zoom = Number(e.target.value) / 100;
  queueRender();
});
document.getElementById('zoom').addEventListener('change', commit);
document.getElementById('fillAll').addEventListener('click', () => {
  const photo = state.panels[selected].photo;
  state.panels.forEach((p) => { p.photo = photo; });
  commit();
  statusEl.textContent = 'Every panel now shows the same photo.';
});
document.getElementById('grain').addEventListener('change', (e) => {
  state.grain = e.target.checked;
  commit();
});
document.getElementById('vignette').addEventListener('change', (e) => {
  state.vignette = e.target.checked;
  commit();
});
document.querySelectorAll('input[name=size]').forEach((box) => {
  box.addEventListener('change', (e) => {
    state.size = e.target.value;
    queueRender();
  });
});
document.getElementById('undo').addEventListener('click', () => {
  const prev = history.undo();
  if (prev) {
    state = prev;
    syncPanelUI();
    syncUndoRedo();
    queueRender();
  }
});
document.getElementById('redo').addEventListener('click', () => {
  const next = history.redo();
  if (next) {
    state = next;
    syncPanelUI();
    syncUndoRedo();
    queueRender();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('undo').click();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    document.getElementById('redo').click();
  }
});

/** Renders one size to a PNG data URL (also validates the export path). */
async function exportSize(size) {
  const c = exportCover(state, photos.map((p) => p.img), size.w, size.h);
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { name: `vice-cover-${size.w}x${size.h}.png`, width: size.w, height: size.h, bytes: blob.size, dataUrl };
}

/** Exports every checked size, downloads each PNG, and returns the list. */
async function exportAll() {
  const picked = EXPORT_SIZES.filter((s) => document.querySelector(`input[name=size][value=${s.id}]`).checked);
  const sizes = picked.length ? picked : EXPORT_SIZES;
  const out = [];
  for (const size of sizes) {
    const one = await exportSize(size);
    out.push(one);
    const a = document.createElement('a');
    a.href = one.dataUrl;
    a.download = one.name;
    a.click();
  }
  statusEl.textContent = `Saved ${out.map((o) => o.name).join(', ')}`;
  return out;
}

document.getElementById('export').addEventListener('click', async () => {
  statusEl.textContent = 'Exporting…';
  try {
    await exportAll();
  } catch (err) {
    statusEl.textContent = `Export failed: ${err.message}`;
  }
});

/** Loads the bundled fonts, then paints the first cover. */
async function boot() {
  buildOptionButtons();
  for (const s of SAMPLES) {
    try {
      photos.push({ name: s.name, label: s.label, img: await loadImage(`samples/${s.name}.jpg`) });
    } catch {
      // A missing sample leaves the library shorter; the app still works.
    }
  }
  syncLibraryUI();
  syncUndoRedo();
  try {
    await Promise.all([
      document.fonts.load('80px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.load('30px "Bebas Neue"'),
    ]);
    await document.fonts.ready;
  } catch {
    // System fonts stand in if a bundled font fails to load.
  }
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), {
      photos,
      loadImage,
      apply: async (next) => {
        state = { ...defaultState(), ...next };
        if (next.panels) state.panels = next.panels;
        else if (next.layout) state.panels = panelsForLayout(state, next.layout);
        history = new History(state);
        selected = 0;
        document.getElementById('title').value = state.title;
        document.getElementById('subtitle').value = state.subtitle;
        document.getElementById('badge').value = state.badge;
        document.getElementById('grain').checked = state.grain;
        document.getElementById('vignette').checked = state.vignette;
        document.querySelectorAll('.opt[data-layout]').forEach((x) => x.classList.toggle('on', x.dataset.layout === state.layout));
        document.querySelectorAll('.opt[data-grade]').forEach((x) => x.classList.toggle('on', x.dataset.grade === state.grade));
        document.querySelector(`input[name=size][value=${state.size}]`).checked = true;
        syncPanelUI();
        syncUndoRedo();
        redraw();
      },
    });
  }
  redraw();
  window.__vice = {
    getState: () => cloneState(state),
    setState: (next) => {
      state = { ...cloneState(state), ...next };
      if (next.layout) state.panels = panelsForLayout(state, next.layout);
      commit();
    },
    photos: () => photos.map((p) => p.name),
    exportAll,
    exportSize,
    ready: true,
  };
}

boot();
