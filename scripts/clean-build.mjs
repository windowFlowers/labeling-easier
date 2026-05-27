import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDirs = ['dist', 'dist-electron', 'release'];

for (const dir of outputDirs) {
  const target = path.join(root, dir);
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  console.log(`removed ${dir}`);
}
