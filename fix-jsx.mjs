import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function getAllFiles(dir) {
  const files = [];
  for (const file of readdirSync(dir)) {
    const full = join(dir, file);
    if (statSync(full).isDirectory() && file !== 'node_modules') {
      files.push(...getAllFiles(full));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const files = getAllFiles('./src');
let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Fix HTML-escaped operators
  content = content.replace(/\s*===""\s*/g, ' === ');
  content = content.replace(/\s*=="\s*/g, ' == ');
  content = content.replace(/\s*!="\s*/g, ' != ');
  content = content.replace(/\s*!=="\s*/g, ' !== ');
  content = content.replace(/\s*\|=""\s*/g, ' | ');
  content = content.replace(/\s*&=""\s*/g, ' & ');
  content = content.replace(/\s*\?=""\s*/g, ' ? ');
  content = content.replace(/\s*:=""\s*/g, ' : ');
  content = content.replace(/\s*>=""\s*/g, ' >= ');
  content = content.replace(/\s*<=""\s*/g, ' <= ');
  content = content.replace(/="">/g, '>');
  content = content.replace(/=""\s*\/>/g, ' />');
  content = content.replace(/=""\s*{/g, ' {');
  content = content.replace(/}=""\s*/g, '} ');

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log('Fixed:', file);
    totalFixed++;
  }
}

console.log(`\nDone! Fixed ${totalFixed} files.`);
