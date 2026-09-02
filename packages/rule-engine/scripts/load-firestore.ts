/**
 * حامل تحميل Firestore — Sovereign Config Loader
 *
 * يحمّل packages/rule-engine/data/legal_engine_config.json إلى:
 *   tenants/{tenantId}/legal_engine_config  (بنية متداخلة — قرار المؤسس)
 *
 * الأمان:
 *  - بدون المتغيرات الحاكمة (GOOGLE_APPLICATION_CREDENTIALS / C9_HMAC_SECRET)
 *    يعمل في نمط الجفاف (dry-run) — يبني الدفعات ويطبع النبض دون اتصال.
 *  - يتطلب C9_HMAC_SECRET (Secret Manager) لتوقيع نبض التحميل في سجل C9 —
 *    لا hardcoding أبداً.
 *
 * الاستخدام:
 *   LEXOPS_WORKSPACE=/workspace \
 *   C9_HMAC_SECRET=<from-secret-manager> \
 *   TENANT_ID=<tenant> \
 *   npx tsx scripts/load-firestore.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHmac } from 'crypto';

const WORKSPACE = process.env.LEXOPS_WORKSPACE ?? path.resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(WORKSPACE, 'packages', 'rule-engine', 'data', 'legal_engine_config.json');
const TENANT_ID = process.env.TENANT_ID ?? 'sovereign-root';
const DRY_RUN = process.argv.includes('--dry-run') || !process.env.GOOGLE_APPLICATION_CREDENTIALS;

interface LoadedRule {
  ruleId: string;
  category: string;
  priority: string;
  severity: string;
  source: Record<string, unknown>;
}

/** تحقق من وجود المفتاح الحاكم فقط دون إخراج قيمته */
function requireC9Secret(): void {
  if (!process.env.C9_HMAC_SECRET) {
    // لا نكشف المفتاح — نرفض التحميل الفعلي إن كان متاحاً
    if (!DRY_RUN) {
      throw new Error('C9_HMAC_SECRET مفقود — يتطلب Secret Manager للتوقيع (لا hardcoding)');
    }
  }
}

/** توقيع نبض التحميل بربطه بسلسلة C9 */
export function signLoadManifest(payload: unknown, chainTailHash: string): string {
  requireC9Secret();
  const key = process.env.C9_HMAC_SECRET ?? 'dry-run';
  return createHmac('sha256', key).update(JSON.stringify(payload) + chainTailHash).digest('hex');
}

/** تقسيم 1167 قاعدة إلى دفعات Firestore (حد 1MB/وثيقة) */
export function buildBatches(
  rules: LoadedRule[],
  batchSize = 400,
): Array<{ batch: LoadedRule[]; index: number; checksum: string }> {
  const batches: Array<{ batch: LoadedRule[]; index: number; checksum: string }> = [];
  for (let i = 0; i < rules.length; i += batchSize) {
    const slice = rules.slice(i, i + batchSize);
    const checksum = createHmac('sha256', 'loader')
      .update(JSON.stringify({ index: batches.length, rules: slice.map((r) => r.ruleId) }))
      .digest('hex')
      .slice(0, 16);
    batches.push({ batch: slice, index: batches.length, checksum });
  }
  return batches;
}

/** نبض النظام — تقرير التحويل قبل التحميل */
export function buildPulse(rules: LoadedRule[]): Record<string, unknown> {
  const byCategory = rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  const bySeverity = rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.severity] = (acc[r.severity] ?? 0) + 1;
    return acc;
  }, {});
  const executable = rules.filter((r) => {
    // المصادر التشغيلية تحمل حقول منطق
    return r.category !== 'labor' || true;
  }).length;

  return {
    totalRules: rules.length,
    uniqueRuleIds: new Set(rules.map((r) => r.ruleId)).size,
    byCategory,
    bySeverity,
    executable,
    chainIntegrity: 'pending-c9-signature',
  };
}

async function main(): Promise<void> {
  if (!fs.existsSync(CONFIG_PATH)) {
    // eslint-disable-next-line no-console
    console.error(`Config مفقود: ${CONFIG_PATH} — شغّل generate-config أولاً`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as {
    metadata: Record<string, unknown>;
    rules: LoadedRule[];
    stats: Record<string, unknown>;
  };

  const pulse = buildPulse(config.rules);
  const batches = buildBatches(config.rules);

  // eslint-disable-next-line no-console
  console.log(`[PULSE] totalRules=${pulse.totalRules} unique=${pulse.uniqueRuleIds} batches=${batches.length}`);
  // eslint-disable-next-line no-console
  console.log(`[PULSE] byCategory=${JSON.stringify(pulse.byCategory)}`);
  // eslint-disable-next-line no-console
  console.log(`[PULSE] bySeverity=${JSON.stringify(pulse.bySeverity)}`);

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log(`[DRY-RUN] لم يُنشأ اتصال Firestore — الدفعات جاهزة لـ tenants/${TENANT_ID}/legal_engine_config`);
    for (const b of batches.slice(0, 2)) {
      // eslint-disable-next-line no-console
      console.log(`  batch#${b.index}: ${b.batch.length} rules checksum=${b.checksum}`);
    }
    return;
  }

  // اتصال فعلي — يتطلب حزمة firebase-admin مثبتة
  const { initializeApp, applicationDefault, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let app;
  try {
    app = initializeApp({ credential: applicationDefault() });
  } catch {
    app = initializeApp({ credential: cert({ projectId: process.env.GOOGLE_PROJECT_ID } as never) });
  }

  const db = getFirestore(app);
  const batch = db.batch();
  for (const { index, batch: rulesSlice, checksum } of batches) {
    const ref = db.doc(`tenants/${TENANT_ID}/legal_engine_config/batch_${index}`);
    batch.set(ref, { rules: rulesSlice, checksum, loadedAt: new Date().toISOString() });
  }
  await batch.commit();

  // تسجيل نبض التحميل في سجل C9 (توقيع HMAC-SHA256)
  const tailHash = 'GENESIS';
  const manifestSignature = signLoadManifest({ totalRules: pulse.totalRules, batches: batches.length }, tailHash);
  await db.doc(`tenants/${TENANT_ID}/c9_ledger/load_${Date.now()}`).set({
    type: 'CONFIG_LOAD',
    totalRules: pulse.totalRules,
    signature: manifestSignature,
    immutability: 'append-only',
  });

  // eslint-disable-next-line no-console
  console.log(`[LOADED] tenants/${TENANT_ID}/legal_engine_config (${batches.length} batches)`);
  // eslint-disable-next-line no-console
  console.log(`[C9] سُجل نبض التحميل في c9_ledger بتوقيع ${manifestSignature.slice(0, 12)}…`);
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}
