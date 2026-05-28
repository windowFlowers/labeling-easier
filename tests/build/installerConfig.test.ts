import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Windows installer upgrade behavior', () => {
  it('uses a stable app identity and a fixed per-user install location', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(manifest.build.appId).toBe('com.labelingeasier.app');
    expect(manifest.build.productName).toBe('Labeling Easier');
    expect(manifest.build.nsis.oneClick).toBe(false);
    expect(manifest.build.nsis.perMachine).toBe(false);
    expect(manifest.build.nsis.createDesktopShortcut).toBe('always');
    expect(manifest.build.nsis.createStartMenuShortcut).toBe(true);
    expect(manifest.build.nsis.shortcutName).toBe('Labeling Easier');
    expect(manifest.build.nsis.installerIcon).toBe('resources/icon.ico');
    expect(manifest.build.nsis.uninstallerIcon).toBe('resources/icon.ico');
    expect(manifest.build.nsis.installerHeaderIcon).toBe('resources/icon.ico');
    expect(manifest.build.nsis.allowToChangeInstallationDirectory).toBe(false);
    expect(manifest.build.nsis.deleteAppDataOnUninstall).toBe(false);
  });

  it('cleans old build outputs before packaging and prunes release artifacts', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const pruneScript = readFileSync('scripts/prune-release.mjs', 'utf8');

    expect(manifest.version).toBe('0.1.9');
    expect(manifest.scripts.clean).toBe('node scripts/clean-build.mjs');
    expect(manifest.scripts.package).toContain('npm run clean');
    expect(manifest.scripts.package).toContain('node scripts/prune-release.mjs');
    expect(pruneScript).toContain("'dist', 'dist-electron'");
  });

  it('uses a custom app icon and removes Electron default menus', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const mainSource = readFileSync('src/main/main.ts', 'utf8');

    expect(manifest.build.win.icon).toBe('resources/icon.ico');
    expect(manifest.build.win.signAndEditExecutable).not.toBe(false);
    expect(mainSource).toContain("app.setAppUserModelId('com.labelingeasier.app')");
    expect(mainSource).toContain('Menu.setApplicationMenu(null)');
    expect(mainSource).toContain('autoHideMenuBar: true');
    expect(mainSource).toContain("icon: path.join(app.getAppPath(), 'resources', 'icon.ico')");
    const icon = readFileSync('resources/icon.ico');
    const count = icon.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_item, index) => {
      const offset = 6 + index * 16;
      return icon[offset] || 256;
    });
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 64, 128, 256]));
  });
});
