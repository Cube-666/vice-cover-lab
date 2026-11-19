// Fixed scenes for screenshots: ?shot=editor shows the editor with a
// sample photo loaded; ?shot=cover (or story/wide) shows the cover
// alone, full frame. Query parameters:
//   photo=a / photos=a,b,c — sample photos to fill the panels with
//   caption=… / title=… — the cover title
//   subtitle=… — the neon script line under the title
//   badge=… — the ribbon label (empty hides it)
//   layout=grid4|hero3|fullbleed|grid9|tilted
//   grade=sunset|neon|vice|noir|gold
//   size=square|story|wide — the export aspect the scene uses
//   grain=0 / vignette=0 — switch an effect off
// window.__shotReady is set once the scene has painted.

import { panelCount } from './layouts.js';

const SAMPLE_NAMES = ['boulevard', 'pier', 'neon', 'rooftop'];

export async function runShot(shot, query, ctx) {
  const { photos, loadImage, apply } = ctx;
  const byName = (name) => photos.findIndex((p) => p.name === name);
  let list = [];
  const photosParam = query.get('photos');
  if (photosParam) list = photosParam.split(',').map((s) => s.trim()).filter(Boolean);
  else if (query.get('photo')) list = [query.get('photo')];
  for (const name of list) {
    if (byName(name) < 0 && SAMPLE_NAMES.includes(name)) {
      try {
        photos.push({ name, label: name, img: await loadImage(`samples/${name}.jpg`) });
      } catch {
        // A missing sample is skipped; the scene still renders.
      }
    }
  }
  const indices = list.map((n) => byName(n)).filter((i) => i >= 0);
  const layout = query.get('layout') ?? 'hero3';
  const n = panelCount(layout);
  const panels = [];
  for (let i = 0; i < n; i++) {
    panels.push({
      photo: indices.length ? indices[i % indices.length] : i % Math.max(1, photos.length),
      zoom: 1,
      ox: 0,
      oy: 0,
    });
  }
  let size = query.get('size') ?? 'square';
  if (shot === 'story') size = 'story';
  if (shot === 'wide') size = 'wide';
  const next = {
    layout,
    grade: query.get('grade') ?? 'sunset',
    title: query.get('caption') ?? query.get('title') ?? 'Neon Shore',
    subtitle: query.get('subtitle') ?? 'midnight on the boulevard',
    badge: query.get('badge') ?? 'Sunset Edition',
    size,
    panels,
    grain: query.get('grain') !== '0',
    vignette: query.get('vignette') !== '0',
  };
  if (shot === 'cover' || shot === 'story' || shot === 'wide') document.body.classList.add('shot-cover');
  await apply(next);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
