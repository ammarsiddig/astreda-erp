import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const srcDir = './src';
const pagesDir = join(srcDir, 'pages');
const componentsDir = join(srcDir, 'components');

const files = [
  ...readdirSync(pagesDir).filter(f => f.endsWith('.tsx')).map(f => join(pagesDir, f)),
  ...readdirSync(componentsDir).filter(f => f.endsWith('.tsx')).map(f => join(componentsDir, f)),
];

const replacements = [
  // --- Table headers: light → dark navy ---
  [
    /text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-200/g,
    'text-xs text-white uppercase bg-[#1E293B]'
  ],
  [
    /text-xs text-slate-700 uppercase bg-slate-100 border-b border-slate-100/g,
    'text-xs text-white uppercase bg-[#1E293B]'
  ],
  [
    /text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-100/g,
    'text-xs text-white uppercase bg-[#1E293B]'
  ],
  [
    /text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200/g,
    'text-xs text-white uppercase bg-[#1E293B]'
  ],
  // --- Row hover: /50 variant → solid ---
  [/hover:bg-teal-50\/50/g, 'hover:bg-teal-50'],
  // --- tfoot styling ---
  [
    /bg-slate-50 border-t border-slate-200 font-bold text-slate-900/g,
    'bg-slate-100 font-semibold border-t-2 border-slate-300 text-slate-900'
  ],
  [
    /bg-slate-50 font-bold border-t border-slate-200/g,
    'bg-slate-100 font-semibold border-t-2 border-slate-300'
  ],
  // --- Cancel buttons ---
  [
    /px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors/g,
    'px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors'
  ],
  // --- Primary submit buttons ---
  [
    /px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors/g,
    'px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold shadow-sm transition-colors'
  ],
  // --- Delete/danger buttons ---
  [
    /px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors/g,
    'px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors'
  ],
  // --- Page titles: text-2xl → text-xl ---
  [/<h1 className="text-2xl font-bold text-slate-800">/g, '<h1 className="text-xl font-bold text-slate-800">'],
  // --- Filter bar containers ---
  [
    /className="bg-white rounded-xl border border-slate-200 p-4 flex/g,
    'className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex'
  ],
  [
    /className="bg-white rounded-xl border border-slate-200 p-4 grid/g,
    'className="bg-white rounded-xl border border-slate-200 px-4 py-3 grid'
  ],
  // --- Form input padding ---
  [
    /px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none/g,
    'px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none'
  ],
];

let totalChanges = 0;

for (const filePath of files) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;

  for (const [pattern, replacement] of replacements) {
    content = content.replaceAll ? content.replace(pattern, replacement) : content.replace(pattern, replacement);
  }

  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated: ${filePath}`);
    totalChanges++;
  }
}

console.log(`\nDone. Updated ${totalChanges} files.`);
