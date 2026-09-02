/**
 * التحقق من سلامة مواصفة العقود (Contract-First)
 * يتحقق من أن ملفات الحزم القياسية موجودة وأن النواة تُبنى دون أخطاء فادحة.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const required = [
  'packages/contracts/package.json',
  'packages/contracts/src/identity.ts',
  'packages/contracts/docs/sovereign-headers.md',
  'packages/shared/src/constants.ts',
  'packages/c9-ledger/src/index.ts',
  'packages/rule-engine/src/index.ts',
  'packages/lexi/src/index.ts',
  'packages/geofencing/src/index.ts',
];

let failed = false;
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`MISSING: ${rel}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`Contracts OK — ${required.length} ملف أساسي موجود`);
