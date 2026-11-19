// Editor state for VICE COVER LAB: one serialisable object, a history
// stack for undo/redo, and the defaults the app opens with.
//
// A panel slot is {photo, zoom, ox, oy}: photo is an index into the
// library, zoom multiplies the cover-fit scale, ox/oy pan the photo in
// fractions of the panel (-1..1). The layout's panel count decides how
// many slots exist; changing layout keeps the photos, cycling them.

import { panelCount } from './layouts.js';

/** The three export sizes, shown as 1080 x 1080 / 1080 x 1350 / 1920 x 1080. */
export const EXPORT_SIZES = [
  { id: 'square', label: '1080 x 1080', w: 1080, h: 1080 },
  { id: 'story', label: '1080 x 1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 x 1080', w: 1920, h: 1080 },
];

/** A fresh state: hero layout, sunset grade, four sample photos cycling. */
export function defaultState() {
  return {
    layout: 'hero3',
    grade: 'sunset',
    title: 'Neon Shore',
    subtitle: 'midnight on the boulevard',
    badge: 'Sunset Edition',
    grain: true,
    vignette: true,
    size: 'square',
    panels: [
      { photo: 0, zoom: 1, ox: 0, oy: 0 },
      { photo: 1, zoom: 1, ox: 0, oy: 0 },
      { photo: 2, zoom: 1, ox: 0, oy: 0 },
      { photo: 3, zoom: 1, ox: 0, oy: 0 },
    ],
  };
}

/** Resizes the panel slots to a layout, keeping photos by cycling them. */
export function panelsForLayout(state, layout) {
  const n = panelCount(layout);
  const old = state.panels;
  const next = [];
  for (let i = 0; i < n; i++) {
    const prev = old[i] ?? old[i % old.length] ?? { photo: i, zoom: 1, ox: 0, oy: 0 };
    next.push({ photo: prev.photo ?? i, zoom: prev.zoom ?? 1, ox: prev.ox ?? 0, oy: prev.oy ?? 0 });
  }
  return next;
}

/** A deep copy of a state, for the history stack. */
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Undo/redo over state snapshots. Push after each committed change. */
export class History {
  constructor(state) {
    this.past = [];
    this.future = [];
    this.current = cloneState(state);
  }

  push(state) {
    this.past.push(this.current);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    this.current = cloneState(state);
  }

  undo() {
    if (!this.past.length) return null;
    this.future.push(this.current);
    this.current = this.past.pop();
    return cloneState(this.current);
  }

  redo() {
    if (!this.future.length) return null;
    this.past.push(this.current);
    this.current = this.future.pop();
    return cloneState(this.current);
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
