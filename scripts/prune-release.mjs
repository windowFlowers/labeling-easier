import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const releaseDir = path.join(process.cwd(), 'release');
const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'));
const installerName = `Labeling Easier Setup ${manifest.version}.exe`;
const installerPath = path.join(releaseDir, installerName);

try {
  const installer = await stat(installerPath);
  if (!installer.isFile()) throw new Error(`${installerName} is not a file`);
} catch (error) {
  throw new Error(`Expected installer was not produced: ${installerPath}`, { cause: error });
}

const entries = await readdir(releaseDir);
for (const entry of entries) {
  if (entry === installerName) continue;
  await rm(path.join(releaseDir, entry), { recursive: true, force: true });
  console.log(`removed release/${entry}`);
}

console.log(`kept release/${installerName}`);

for (const dir of ['dist', 'dist-electron']) {
  await rm(path.join(process.cwd(), dir), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  console.log(`removed ${dir}`);
}
