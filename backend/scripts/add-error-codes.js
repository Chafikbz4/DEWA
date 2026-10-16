// Dev helper: node scripts/add-error-codes.js <json-file>
// JSON: { "CODE": [httpStatusName, "fr message", "ar message"], ... }
const fs = require('fs');
const codes = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tsFile = 'src/common/errors/error-codes.ts';
let ts = fs.readFileSync(tsFile, 'utf8');
const marker = '} as const satisfies Record<string, HttpStatus>;';
const lines = Object.entries(codes)
  .filter(([code]) => !ts.includes(`  ${code}:`))
  .map(([code, [status]]) => `  ${code}: HttpStatus.${status},`);
ts = ts.replace(marker, lines.join('\n') + '\n' + marker);
fs.writeFileSync(tsFile, ts);
for (const [lang, idx] of [['fr', 1], ['ar', 2]]) {
  const f = `src/i18n/${lang}.json`;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [code, v] of Object.entries(codes)) j.errors[code] = v[idx];
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
console.log(`added ${lines.length} codes`);
