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

// Order matters: most specific (with suffixes) before generic
const replacements = [
  // Primary #1B4F8A → teal (specific first)
  ['hover:bg-[#1B4F8A]/90',   'hover:bg-teal-700'],
  ['bg-[#1B4F8A]/90',         'bg-teal-700'],
  ['bg-[#1B4F8A]/10',         'bg-teal-50'],
  ['border-[#1B4F8A]/20',     'border-teal-100'],
  ['bg-[#1B4F8A]',            'bg-teal-600'],
  ['hover:bg-[#1B4F8A]',      'hover:bg-teal-600'],
  ['text-[#1B4F8A]',          'text-teal-600'],
  ['hover:text-[#1B4F8A]',    'hover:text-teal-600'],
  ['focus:ring-[#1B4F8A]',    'focus:ring-teal-500'],
  ['border-[#1B4F8A]',        'border-teal-600'],

  // Rose → red (danger/debt colors)
  ['hover:bg-rose-700',        'hover:bg-red-700'],
  ['hover:bg-rose-600',        'hover:bg-red-600'],
  ['bg-rose-600',              'bg-red-600'],
  ['hover:text-rose-600',      'hover:text-red-600'],
  ['text-rose-600',            'text-red-600'],
  ['hover:bg-rose-50',         'hover:bg-red-50'],
  ['bg-rose-50',               'bg-red-50'],
  ['text-rose-500',            'text-red-500'],
  ['border-rose-',             'border-red-'],

  // Table row hover
  ['hover:bg-slate-50/50',     'hover:bg-teal-50/50'],

  // Sidebar menu item hover (desktop + mobile)
  ['hover:bg-white/5 hover:text-white', 'hover:bg-[#1a3a5c] hover:text-white'],

  // Table header bg
  ['uppercase bg-slate-50 border-b border-slate-200', 'uppercase bg-slate-100 border-b border-slate-200'],

  // Sidebar nav item: tighter padding + pill style
  ["'flex items-center px-4 py-3 rounded-xl transition-colors duration-200'",
   "'flex items-center px-3 py-2.5 rounded-lg transition-colors duration-150'"],

  // Logo amber
  ['text-amber-500', 'text-amber-400'],
];

const files = getAllFiles('./src');
let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const original = content;
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to);
  }
  if (content !== original) {
    writeFileSync(file, content, 'utf8');
    console.log('Fixed:', file);
    totalFixed++;
  }
}

console.log(`\nDone! Fixed ${totalFixed} files.`);
