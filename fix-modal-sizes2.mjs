import { readFileSync, writeFileSync } from 'fs';

const files = [
  { path: 'src/pages/Expenses.tsx', size: 'md' },
  { path: 'src/pages/Payments.tsx', size: 'md' },
  { path: 'src/pages/Salaries.tsx', size: 'md' },
  { path: 'src/pages/AccountTransfers.tsx', size: 'md' },
  { path: 'src/pages/CarLoading.tsx', size: 'md' },
  { path: 'src/pages/CustomerDetail.tsx', size: 'md' },
  { path: 'src/pages/Inventory.tsx', size: 'md' },
  { path: 'src/pages/GeneralTransfers.tsx', size: 'lg' },
];

for (const { path: filePath, size } of files) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;

  // Fix Pattern A: single-line arrow function broken
  // BROKEN:  onClose={() = size="X"> setX(null)} title={t('...')}>
  // FIXED:   onClose={() => setX(null)} title={t('...')} size="X">
  //
  // Strategy: replace `() = size="X">` with `() =>` (restoring the arrow),
  // then add size="X" before the last `>` of that line.
  content = content.replace(
    new RegExp(`\\(\\) = size="${size}">([ ][^\\n]+)>`, 'g'),
    `() =>$1 size="${size}">`
  );

  // Fix Pattern B: multi-line arrow function broken
  // BROKEN:  onClose={() = size="X"> {
  // FIXED:   onClose={() => {
  // (size will be added in Pattern C step)
  content = content.replace(
    new RegExp(`= size="${size}"> \\{`, 'g'),
    `=> {`
  );

  // Fix Pattern C: after Pattern B, find Modal tags whose onClose was multi-line
  // and had size stripped. These modals end with:
  //   title={...}
  // >
  // We need to add size="X" before the closing >
  // Specifically, the pattern is a line containing only whitespace + ">" that
  // follows a "title={...}" prop line inside a Modal open tag.
  // Use a regex that matches `title={...\n      >` → `title={...\n      size="X"\n      >`
  content = content.replace(
    /(\s+title=\{[^\n]+\}\n)(\s+)>/g,
    (match, titleLine, indent) => {
      // Only add size if not already present in previous few chars
      if (match.includes(`size="`)) return match;
      return `${titleLine}${indent}size="${size}"\n${indent}>`;
    }
  );

  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed: ${filePath}`);
  } else {
    console.log(`  No changes: ${filePath}`);
  }
}

console.log('\nDone.');
