import { rcedit } from 'rcedit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'));
const exePath = path.join(process.cwd(), 'release', 'win-unpacked', `${manifest.build.productName}.exe`);
const iconPath = path.join(process.cwd(), 'resources', 'icon.ico');

await rcedit(exePath, {
  icon: iconPath,
  'version-string': {
    CompanyName: manifest.author ?? manifest.build.productName,
    FileDescription: manifest.description ?? manifest.build.productName,
    ProductName: manifest.build.productName,
    InternalName: manifest.build.productName,
    OriginalFilename: `${manifest.build.productName}.exe`
  },
  'file-version': manifest.version,
  'product-version': manifest.version,
  'requested-execution-level': 'asInvoker'
});

console.log(`patched ${path.relative(process.cwd(), exePath)} with ${path.relative(process.cwd(), iconPath)}`);
