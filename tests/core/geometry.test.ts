import { describe, expect, it } from 'vitest';
import {
  clampBbox,
  denormalizeYoloBox,
  normalizeYoloBox,
  validateBbox
} from '../../src/shared/geometry';

describe('bbox geometry', () => {
  it('normalizes and denormalizes bbox values for YOLO format', () => {
    const bbox = { x: 10, y: 20, width: 40, height: 30 };

    const normalized = normalizeYoloBox(bbox, 100, 200);
    const denormalized = denormalizeYoloBox(normalized, 100, 200);

    expect(normalized).toEqual({
      centerX: 0.3,
      centerY: 0.175,
      width: 0.4,
      height: 0.15
    });
    expect(denormalized).toEqual(bbox);
  });

  it('clamps boxes to image bounds', () => {
    expect(clampBbox({ x: -5, y: 10, width: 120, height: 80 }, 100, 50)).toEqual({
      x: 0,
      y: 10,
      width: 100,
      height: 40
    });
  });

  it('rejects empty and out-of-bounds boxes', () => {
    expect(validateBbox({ x: 1, y: 1, width: 0, height: 10 }, 100, 100).valid).toBe(false);
    expect(validateBbox({ x: 90, y: 90, width: 20, height: 20 }, 100, 100).valid).toBe(false);
    expect(validateBbox({ x: 10, y: 10, width: 20, height: 20 }, 100, 100).valid).toBe(true);
  });
});
