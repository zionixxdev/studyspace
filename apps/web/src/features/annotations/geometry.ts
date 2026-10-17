/**
 * Annotation geometry is stored in NORMALISED coordinates (0..1 relative to the
 * page/image), so the same annotation lines up at any zoom level, screen size or
 * device. Conversion to pixels happens only at render time.
 */
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FreehandGeometry {
  points: Point[];
}
export interface NoteGeometry {
  x: number;
  y: number;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Client coordinates -> normalised coordinates for a given content rect. */
export function toNormalised(clientX: number, clientY: number, rect: DOMRect): Point {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

/** Normalised coordinates -> pixels within a content rect. */
export function toPixels(p: Point, rect: { width: number; height: number }): Point {
  return { x: p.x * rect.width, y: p.y * rect.height };
}

export function boxFromPoints(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function boxToPixels(box: Box, rect: { width: number; height: number }) {
  return {
    x: box.x * rect.width,
    y: box.y * rect.height,
    w: box.w * rect.width,
    h: box.h * rect.height,
  };
}

export function pointsToPath(points: Point[], rect: { width: number; height: number }): string {
  if (!points.length) return '';
  return points
    .map((p, i) => {
      const px = toPixels(p, rect);
      return `${i === 0 ? 'M' : 'L'} ${px.x.toFixed(1)} ${px.y.toFixed(1)}`;
    })
    .join(' ');
}
