// Panel layouts for VICE COVER LAB.
//
// Every layout is pure geometry: given the cover's width and height it
// returns the photo panels (rect + rotation + border style), the title
// block, the badge spot and whether the background is a dimmed full-bleed
// photo. All coordinates are pixels in the cover's own space, so any
// export size (1080 x 1080, 1080 x 1350, 1920 x 1080) lays out the same.

/** The five layouts, in the order the editor lists them. */
export const LAYOUTS = {
  grid4: { name: 'Four Panel', panels: 4 },
  hero3: { name: 'Hero + Three', panels: 4 },
  fullbleed: { name: 'Full Bleed', panels: 1 },
  grid9: { name: 'Nine Panel', panels: 9 },
  tilted: { name: 'Tilted Snaps', panels: 3 },
};

/** How many photo slots a layout has. */
export function panelCount(layout) {
  return LAYOUTS[layout]?.panels ?? 4;
}

/**
 * Geometry for one layout at width W and height H.
 * Panels are {x, y, w, h, rot (radians), border: 'thin' | 'polaroid'}.
 * Title is {x, y, w, h, align: 'left' | 'center'}.
 * bgPhoto is true when the layout wants a dimmed photo behind everything.
 */
export function layoutGeometry(layout, W, H) {
  const g = Math.round(Math.min(W, H) * 0.014); // gutter between panels
  const titleH = Math.round(H * 0.2);
  const titleY = H - titleH;
  switch (layout) {
    case 'hero3': {
      const heroW = Math.round(W * 0.62);
      const colX = heroW + g;
      const colW = W - colX;
      const cellH = Math.round((titleY - 2 * g) / 3);
      return {
        panels: [
          { x: 0, y: 0, w: heroW, h: titleY, rot: 0, border: 'thin' },
          { x: colX, y: 0, w: colW, h: cellH, rot: 0, border: 'thin' },
          { x: colX, y: cellH + g, w: colW, h: cellH, rot: 0, border: 'thin' },
          { x: colX, y: 2 * (cellH + g), w: colW, h: cellH, rot: 0, border: 'thin' },
        ],
        title: { x: 0, y: titleY, w: W, h: titleH, align: 'left' },
        badge: { x: W - Math.round(W * 0.2), y: Math.round(H * 0.03) },
        bgPhoto: false,
      };
    }
    case 'fullbleed': {
      return {
        panels: [{ x: 0, y: 0, w: W, h: H, rot: 0, border: 'none' }],
        title: { x: 0, y: Math.round(H * 0.66), w: W, h: H - Math.round(H * 0.66), align: 'left' },
        badge: { x: W - Math.round(W * 0.2), y: Math.round(H * 0.03) },
        bgPhoto: false,
        scrim: true,
      };
    }
    case 'grid9': {
      const areaH = Math.round(H * 0.78);
      const cellW = Math.round((W - 2 * g) / 3);
      const cellH = Math.round((areaH - 2 * g) / 3);
      const panels = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          panels.push({ x: c * (cellW + g), y: r * (cellH + g), w: cellW, h: cellH, rot: 0, border: 'thin' });
        }
      }
      return {
        panels,
        title: { x: 0, y: areaH, w: W, h: H - areaH, align: 'center' },
        badge: { x: W - Math.round(W * 0.2), y: Math.round(H * 0.03) },
        bgPhoto: false,
      };
    }
    case 'tilted': {
      const snapW = Math.round(W * 0.44);
      const snapH = Math.round(H * 0.52);
      const topY = Math.round(H * 0.2);
      return {
        panels: [
          { x: Math.round(W * 0.04), y: topY, w: snapW, h: snapH, rot: -0.1, border: 'polaroid' },
          { x: Math.round(W * 0.3), y: topY + Math.round(H * 0.05), w: snapW, h: snapH, rot: 0.045, border: 'polaroid' },
          { x: Math.round(W * 0.54), y: topY - Math.round(H * 0.02), w: snapW, h: snapH, rot: -0.035, border: 'polaroid' },
        ],
        title: { x: 0, y: 0, w: W, h: Math.round(H * 0.17), align: 'center' },
        badge: { x: W - Math.round(W * 0.2), y: Math.round(H * 0.03) },
        bgPhoto: true,
      };
    }
    case 'grid4':
    default: {
      const areaH = titleY;
      const cellW = Math.round((W - g) / 2);
      const cellH = Math.round((areaH - g) / 2);
      return {
        panels: [
          { x: 0, y: 0, w: cellW, h: cellH, rot: 0, border: 'thin' },
          { x: cellW + g, y: 0, w: cellW, h: cellH, rot: 0, border: 'thin' },
          { x: 0, y: cellH + g, w: cellW, h: cellH, rot: 0, border: 'thin' },
          { x: cellW + g, y: cellH + g, w: cellW, h: cellH, rot: 0, border: 'thin' },
        ],
        title: { x: 0, y: titleY, w: W, h: titleH, align: 'left' },
        badge: { x: W - Math.round(W * 0.2), y: Math.round(H * 0.03) },
        bgPhoto: false,
      };
    }
  }
}
