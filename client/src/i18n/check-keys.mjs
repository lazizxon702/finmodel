// i18n tekshiruvi: uch tilda (uz/ru/en) kalitlar to'plami bir xilligini tasdiqlaydi.
// Ishga tushirish (client papkasidan):   node src/i18n/check-keys.mjs
// Tekshiradi:
//   1) har bir modulda uz/ru/en kalitlari aynan bir xil;
//   2) bitta kalit ikki modulda takrorlanmagan;
//   3) {o'zgaruvchi} nomlari uch tilda bir xil;
//   4) bo'sh tarjima yo'q.
// Xato bo'lsa — chiqish kodi 1.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const here = dirname(fileURLToPath(import.meta.url));
const modulesDir = join(here, 'modules');
const LANGS = ['uz', 'ru', 'en'];

function loadModule(file) {
  const source = readFileSync(join(modulesDir, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  // Modullar faqat '../types' dan defineModule ni import qiladi — uni soddalashtirib beramiz
  const fakeRequire = () => ({ defineModule: (m) => m });
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, fakeRequire);
  return mod.exports.default;
}

const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const errors = [];
const owner = new Map();
const totals = { uz: 0, ru: 0, en: 0 };
const rows = [];

for (const file of readdirSync(modulesDir).filter((f) => f.endsWith('.ts')).sort()) {
  const dict = loadModule(file);
  if (!dict) {
    errors.push(`${file}: default eksport yo'q`);
    continue;
  }
  const counts = {};
  for (const lang of LANGS) {
    if (!dict[lang]) {
      errors.push(`${file}: "${lang}" tili yo'q`);
      dict[lang] = {};
    }
    counts[lang] = Object.keys(dict[lang]).length;
    totals[lang] += counts[lang];
  }
  rows.push({ modul: file.replace(/\.ts$/, ''), ...counts });

  const allKeys = new Set(LANGS.flatMap((l) => Object.keys(dict[l])));
  for (const key of allKeys) {
    for (const lang of LANGS) {
      const value = dict[lang][key];
      if (value === undefined) errors.push(`${file}: "${key}" — ${lang} tilida yo'q`);
      else if (String(value).trim() === '') errors.push(`${file}: "${key}" — ${lang} tilida bo'sh`);
    }
    const shapes = new Set(LANGS.filter((l) => dict[l][key] !== undefined).map((l) => vars(dict[l][key])));
    if (shapes.size > 1) errors.push(`${file}: "${key}" — {o'zgaruvchilar} tillarda farq qiladi`);

    if (owner.has(key) && owner.get(key) !== file) {
      errors.push(`"${key}" ikki modulda takrorlangan: ${owner.get(key)} va ${file}`);
    }
    owner.set(key, file);
  }
}

console.table(rows);
console.log(`Jami kalitlar — uz: ${totals.uz}, ru: ${totals.ru}, en: ${totals.en}`);

if (errors.length) {
  console.error(`\nXATOLAR (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log("OK: uch tilda kalitlar to'plami bir xil.");
