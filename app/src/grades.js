// Gradient-map colour grades for VICE COVER LAB.
//
// Each grade maps a pixel's luminance through a shadow -> midtone -> highlight
// ramp (a true gradient map), then mixes the mapped colour back with the
// original and finishes with saturation and contrast. The ramp is baked into
// a 256-entry lookup table, so a whole panel grades in one ImageData pass.

/** Every grade the editor offers: ramp stops, mix strength, saturation, contrast. */
export const GRADES = {
  sunset: {
    name: 'Sunset',
    shadow: [28, 10, 48],
    mid: [255, 110, 60],
    high: [255, 216, 132],
    strength: 0.55,
    sat: 1.15,
    contrast: 1.06,
  },
  neon: {
    name: 'Neon Night',
    shadow: [6, 8, 32],
    mid: [255, 45, 150],
    high: [96, 240, 255],
    strength: 0.6,
    sat: 1.25,
    contrast: 1.08,
  },
  vice: {
    name: 'Vice',
    shadow: [22, 4, 42],
    mid: [196, 40, 182],
    high: [255, 172, 92],
    strength: 0.55,
    sat: 1.2,
    contrast: 1.06,
  },
  noir: {
    name: 'Noir',
    shadow: [0, 0, 0],
    mid: [122, 122, 122],
    high: [255, 244, 224],
    strength: 0.85,
    sat: 0.0,
    contrast: 1.12,
  },
  gold: {
    name: 'Golden Hour',
    shadow: [42, 22, 8],
    mid: [255, 172, 62],
    high: [255, 242, 192],
    strength: 0.5,
    sat: 1.1,
    contrast: 1.05,
  },
};

/** Linear interpolation between two RGB stops. */
function lerpStop(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Bakes a grade into three 256-entry lookup tables (one per channel). */
export function buildGradeLut(grade) {
  const lut = { r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256) };
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const c = t < 0.5 ? lerpStop(grade.shadow, grade.mid, t * 2) : lerpStop(grade.mid, grade.high, (t - 0.5) * 2);
    lut.r[i] = c[0];
    lut.g[i] = c[1];
    lut.b[i] = c[2];
  }
  return lut;
}

/**
 * Grades an ImageData in place: luminance indexes the ramp, the mapped
 * colour mixes with the original by `strength`, then saturation and
 * contrast are applied around the pixel's grey value.
 */
export function applyGrade(data, lut, grade) {
  const { strength, sat, contrast } = grade;
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = (r * 77 + g * 150 + b * 29) >> 8;
    let nr = r + (lut.r[lum] - r) * strength;
    let ng = g + (lut.g[lum] - g) * strength;
    let nb = b + (lut.b[lum] - b) * strength;
    const grey = (nr * 77 + ng * 150 + nb * 29) >> 8;
    nr = grey + (nr - grey) * sat;
    ng = grey + (ng - grey) * sat;
    nb = grey + (nb - grey) * sat;
    nr = 128 + (nr - 128) * contrast;
    ng = 128 + (ng - 128) * contrast;
    nb = 128 + (nb - 128) * contrast;
    d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
    d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
    d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
  }
}
