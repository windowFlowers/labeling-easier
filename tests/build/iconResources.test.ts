import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('application icon resources', () => {
  it('uses a transparent PNG source for app icons', () => {
    const png = readFileSync('resources/icon.png');

    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1254);
    expect(png.readUInt32BE(20)).toBe(1254);
    expect(png[25]).toBe(6);
  });

  it('packages the Windows ICO with common shortcut and taskbar sizes', () => {
    const ico = readFileSync('resources/icon.ico');
    const imageCount = ico.readUInt16LE(4);
    const sizes = new Set<number>();

    for (let index = 0; index < imageCount; index += 1) {
      const offset = 6 + index * 16;
      const widthByte = ico[offset];
      const heightByte = ico[offset + 1];
      const width = widthByte === 0 ? 256 : widthByte;
      const height = heightByte === 0 ? 256 : heightByte;
      if (width === height) sizes.add(width);
    }

    expect([...sizes].sort((a, b) => a - b)).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
