import { describe, expect, it } from 'vitest';
import { boxFromPoints, boxToPixels, clamp01, pointsToPath, toNormalised, toPixels } from './geometry';

describe('normalised annotation coordinates', () => {
  it('clamps to the unit square', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it('converts client coords to 0..1 within a rect', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;
    expect(toNormalised(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 });
    // Outside the rect is clamped, never negative or > 1.
    expect(toNormalised(0, 0, rect)).toEqual({ x: 0, y: 0 });
  });

  it('round-trips pixels and normalised coords', () => {
    const size = { width: 400, height: 200 };
    expect(toPixels({ x: 0.5, y: 0.25 }, size)).toEqual({ x: 200, y: 50 });
  });

  it('builds a normalised box regardless of drag direction', () => {
    const a = { x: 0.8, y: 0.9 };
    const b = { x: 0.2, y: 0.3 };
    const box = boxFromPoints(a, b);
    expect(box.x).toBeCloseTo(0.2, 10);
    expect(box.y).toBeCloseTo(0.3, 10);
    // Use a tolerance: 0.8 - 0.2 is 0.6000000000000001 in IEEE-754.
    expect(box.w).toBeCloseTo(0.6, 10);
    expect(box.h).toBeCloseTo(0.6, 10);
  });

  it('scales a box to pixels', () => {
    expect(boxToPixels({ x: 0.5, y: 0.5, w: 0.25, h: 0.25 }, { width: 400, height: 400 })).toEqual({
      x: 200,
      y: 200,
      w: 100,
      h: 100,
    });
  });

  it('renders a freehand path', () => {
    const d = pointsToPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      { width: 10, height: 10 },
    );
    expect(d).toBe('M 0.0 0.0 L 10.0 10.0');
  });
});
