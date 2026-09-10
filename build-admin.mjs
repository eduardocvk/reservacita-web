import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const templatePath = join(root, 'Index_Admin.html');
const outputPath = join(root, 'frontend', 'admin.html');
const includePattern = /<\?!=\s*include\(['"]([^'"]+)['"]\);?\s*\?>/g;

let output = await readFile(templatePath, 'utf8');
const includes = [...output.matchAll(includePattern)].map(match => match[1]);

for (const name of includes) {
  const partial = await readFile(join(root, `${name}.html`), 'utf8');
  output = output.replaceAll(
    new RegExp(`<\\?!=\\s*include\\(['"]${name}['"]\\);?\\s*\\?>`, 'g'),
    partial
  );
}

output = output.replace(/[ \t]+$/gm, '');
await writeFile(outputPath, output, 'utf8');
console.log(`Generated ${outputPath}`);
