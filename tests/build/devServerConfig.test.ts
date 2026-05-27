import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Electron dev server wiring', () => {
  it('keeps Vite on the same port that Electron loads', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(manifest.scripts.dev).toContain('vite --host 127.0.0.1 --strictPort');
    expect(manifest.scripts.dev).toContain('VITE_DEV_SERVER_URL=http://127.0.0.1:5173');
  });
});
