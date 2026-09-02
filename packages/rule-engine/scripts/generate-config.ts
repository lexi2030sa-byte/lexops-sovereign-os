/**
 * مولّد الإعداد الحاكم — Sovereign Config Generator
 *
 * يقرأ الملفات المصدريّة الثلاثة عبر extractor.ts وينتج:
 *  1) packages/rule-engine/data/legal_engine_config.json — NormalizedRuleSet جاهز للتحميل
 *  2) packages/rule-engine/data/legal_engine_config.report.json — نبض النظام
 *
 * كل قاعدة تُسند ruleId فريد، مع source يحفظ الاقتفاء (file/section/article/activity/size).
 */

import * as fs from 'fs';
import * as path from 'path';
import { scanKnowledgeDocs } from './extractor';
import { parseIfThenElse } from '../src/pseudocode';

const WORKSPACE = process.env.LEXOPS_WORKSPACE ?? path.resolve(__dirname, '..', '..', '..');
const SOURCE_FILES = [
  'بصيغة JSON مكتب العمل 369ef68b731d802d9b3bcc25e383 394bba35e4eb815ca217e8b223a04bba.md',
  'التوطين و نطاقات 2 بصيغة JSON 369ef68b731d80679d23 394bba35e4eb816bb50ae7c50eee172a.md',
  'JSON منفصل وكامل البلدية 369ef68b731d80909ff8d251e 394bba35e4eb81b684f1ddf1d4d3f159.md',
];

/** مصدر إضافي مُكتشف خارج نطاق المؤسس الثلاثي — يُدرج في التقرير فقط */
const DETECTED_SOURCES = [
  'الزكاه والضريبة 369ef68b731d80d4918dc9cc08cfbff6 394bba35e4eb811c8e40f5dd17a5047d.md',
];

/** تصنيف القاعدة حسب مصدرها (الملف الحاكم يتغلب على الحقول) */
function categorize(raw: Record<string, unknown>): string {
  const srcFile = String(raw.source_file ?? '');
  if (srcFile.includes('التوطين')) return 'localization';
  if (srcFile.includes('البلدي')) return 'municipality';
  if (srcFile.includes('الزكاه') || srcFile.includes('الزكاة')) return 'tax';
  return 'labor';
}

/** تحويل شدة القاعدة إلى التصنيف السيادي */
function severityOf(raw: Record<string, unknown>): 'severe' | 'moderate' | 'minor' {
  const p = String(raw.priority ?? '');
  const id = String(raw.rule_id ?? '');
  if (p === 'عالية' || p === 'severe') return 'severe';
  if (String(raw.logic ?? '').includes('serious')) return 'severe';
  if (p === 'منخفضة' || p === 'minor' || id.startsWith('NISAB')) return 'minor';
  return 'moderate';
}

/** تحويل NISAB إلى كائن logic قابل للتقييم */
function nisabLogic(raw: Record<string, unknown>): unknown {
  if (!raw.activity && !raw.size) return undefined;
  return {
    nisab_assignment: {
      rule_id: raw.rule_id,
      activity: raw.activity,
      size: raw.size,
      ranges: {
        red: raw.red_range,
        low_green: { min: raw.low_green_min, max: raw.low_green_max },
        medium_green: { min: raw.medium_green_min, max: raw.medium_green_max },
        high_green: { min: raw.high_green_min, max: raw.high_green_max },
        platinum: { min: raw.platinum_min, max: raw.platinum_max },
      },
    },
  };
}

/** تحويل logic نصي (البلدية) إلى JSON Logic عبر المحلل */
function textLogic(raw: Record<string, unknown>): unknown {
  const logicStr = raw.logic as string | undefined;
  if (!logicStr) return undefined;
  const parsed = parseIfThenElse(logicStr);
  return parsed ? { parsed } : { raw_logic: logicStr };
}

export function buildConfig(): {
  config: Record<string, unknown>;
  report: Record<string, unknown>;
} {
  const scanned = scanKnowledgeDocs(WORKSPACE);

  const rules = scanned.rules
    .filter((r) => SOURCE_FILES.includes(String(r.source_file ?? '')))
    .map((raw) => {
      const ruleId = String(raw.rule_id ?? '');
      const category = categorize(raw);
      const logic =
        category === 'localization'
          ? nisabLogic(raw)
          : category === 'municipality'
            ? textLogic(raw)
            : category === 'tax'
              ? textLogic(raw)
              : undefined;

      return {
        ruleId,
        name: String(
          raw.description ?? (raw.activity ? `نطاق توطين: ${raw.activity} — ${raw.size}` : ruleId),
        ),
        category,
        priority: raw.priority === 'محلية' ? 'local' : 'national',
        severity: severityOf(raw),
        logic,
        source: {
          file: String(raw.file_name ?? ''),
          section: String(raw.section_title ?? ''),
          article: String(raw.article_number ?? ''),
          activity: String(raw.activity ?? ''),
          size: String(raw.size ?? ''),
        },
        descriptionAr: (raw.description as string) ?? undefined,
        penalty: (raw.penalty as string) ?? undefined,
        raw,
      };
    });

  const byCategory = rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  const bySeverity = rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.severity] = (acc[r.severity] ?? 0) + 1;
    return acc;
  }, {});
  const executable = rules.filter((r) => r.logic !== undefined).length;

  const config = {
    metadata: {
      version: 'v1.0.0',
      jurisdiction: 'Saudi Arabia',
      generatedAt: new Date().toISOString(),
      generator: 'lexops-34k-extractor',
      sourceFiles: SOURCE_FILES,
    },
    rules,
    stats: {
      totalRules: rules.length,
      executable,
      descriptive: rules.length - executable,
      byCategory,
      bySeverity,
      sources: SOURCE_FILES,
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    perFile: scanned.stats.filter((s) => SOURCE_FILES.includes(s.file)),
    errors: scanned.errors.filter((e) => SOURCE_FILES.includes(e.file)),
    totalErrors: scanned.errors.filter((e) => SOURCE_FILES.includes(e.file)).length,
    configStats: config.stats,
    /** مصادر إضافية مكتشفة (خارج القرار الثلاثي) — بانتظار حسم المؤسس */
    detectedSources: scanned.stats
      .filter((s) => DETECTED_SOURCES.includes(s.file))
      .map((s) => ({ file: s.file, captured: s.captured, parsed: s.parsed })),
  };

  return { config, report };
}

// التنفيذ عند التشغيل المباشر
if (require.main === module) {
  const dataDir = path.resolve(WORKSPACE, 'packages', 'rule-engine', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const { config, report } = buildConfig();
  fs.writeFileSync(
    path.join(dataDir, 'legal_engine_config.json'),
    JSON.stringify(config, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dataDir, 'legal_engine_config.report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  const stats = config.stats as { totalRules: number; executable: number };
  // eslint-disable-next-line no-console
  console.log(
    `legal_engine_config.json: ${stats.totalRules} rules (executable=${stats.executable})`,
  );
  // eslint-disable-next-line no-console
  console.log(`legal_engine_config.report.json: ${report.totalErrors} errors`);
}
