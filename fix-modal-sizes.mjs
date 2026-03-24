import { readFileSync, writeFileSync } from 'fs';

// Files where ALL modals should be size="md" (simple forms)
const simpleMd = [
  'src/pages/Expenses.tsx',
  'src/pages/Payments.tsx',
  'src/pages/Salaries.tsx',
  'src/pages/AccountTransfers.tsx',
  'src/pages/CarLoading.tsx',
  'src/pages/CustomerDetail.tsx',
];

// Files where edit/view/delete confirm modals should be size="md",
// but main add/transfer modals stay at default lg
const inventorySmall = [
  'src/pages/Inventory.tsx',
];

// GeneralTransfers: already defaults to lg — add explicit size="lg"
const generalLg = [
  'src/pages/GeneralTransfers.tsx',
];

function addSizeToAllModals(content, size) {
  // Add size to <Modal ... > tags that don't already have a size= prop
  return content.replace(/<Modal\s([^>]*?)>/g, (match, attrs) => {
    if (/\bsize=/.test(attrs)) return match; // already has size
    return `<Modal ${attrs} size="${size}">`;
  });
}

// Process simple md files
for (const file of simpleMd) {
  let content = readFileSync(file, 'utf8');
  const original = content;
  content = addSizeToAllModals(content, 'md');
  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`✓ size="md" added: ${file}`);
  }
}

// Process Inventory: add size="md" to small modals only
for (const file of inventorySmall) {
  let content = readFileSync(file, 'utf8');
  const original = content;

  // Modals for edit, view, delete confirm get size="md"
  content = content
    .replace(/(<Modal isOpen=\{!!showEditModal\}[^>]*?)>/g, (m, p) => /\bsize=/.test(p) ? m : `${p} size="md">`)
    .replace(/(<Modal isOpen=\{!!showViewModal\}[^>]*?)>/g, (m, p) => /\bsize=/.test(p) ? m : `${p} size="md">`)
    .replace(/(<Modal isOpen=\{!!showDeleteConfirm\}[^>]*?)>/g, (m, p) => /\bsize=/.test(p) ? m : `${p} size="md">`);

  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`✓ size="md" on small modals: ${file}`);
  }
}

// Process GeneralTransfers: add explicit size="lg" to all modals
for (const file of generalLg) {
  let content = readFileSync(file, 'utf8');
  const original = content;
  content = addSizeToAllModals(content, 'lg');
  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log(`✓ size="lg" added: ${file}`);
  }
}

console.log('\nDone.');
