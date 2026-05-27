import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('packaged renderer asset paths', () => {
  it('uses relative asset URLs so Electron file:// builds can load React bundles', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("base: './'");
  });
});

describe('Electron preload bundle', () => {
  it('builds preload as CommonJS and loads that path from the main process', () => {
    const preloadConfig = readFileSync('vite.preload.config.ts', 'utf8');
    const mainProcess = readFileSync('src/main/main.ts', 'utf8');

    expect(preloadConfig).toContain("formats: ['cjs']");
    expect(preloadConfig).toContain("'preload.cjs'");
    expect(mainProcess).toContain("../preload/preload.cjs");
  });
});
