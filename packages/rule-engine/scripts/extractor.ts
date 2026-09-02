/**
 * مستخرج القواعد الكبرى — The 34K Matrix Extractor (v2)
 *
 * نهج السطر-الـ key/value الموثوق:
 *  المستندات المصدّرة (MOL / Localization / Municipality) مفككة بنحو LLM-artifact:
 *   كل سطر "key": value, مفصول بأسطر فارغة، وبعض القيم سلاسل متعددة الأسطر،
 *   وحدود المستندات مكسورة (أقواس غير متوازنة).
 *
 * الحل: مسح سطريّ يلتقط عند كل "rule_id" كائن القاعدة { ... } بدءاً من سطر "{" السابق
 *  مع تتبع عمق الأقواس والسلاسل، ثم إصلاح الفواصل الزائدة ودمج السلاسل متعددة الأسطر.
 *  يُرفق بكل قاعدة سياقها (file_name / section / article / activity / size) عبر تتبع
 *  مؤشرات التواجد المتسلسلة — فيُنتج NormalizedRuleSet جاهزاً للتحميل في Firestore.
 */

import * as fs from 'fs';
import * as path from 'path';

/** دمج السلاسل متعددة الأسطر: تحويل سطر جديد داخل السلسلة إلى مسافة */
export function joinMultilineStrings(text: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        out += ch;
        escape = false;
      } else if (ch === '\\') {
        out += ch;
        escape = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') {
        out += ' ';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

/** إصلاح الفواصل الزائدة قبل الإغلاق وبعده */
export function fixTrailingCommas(block: string): string {
  return block
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/}\s*,\s*$/m, '}');
}

/** إصلاح شامل للمقطع */
export function repairJsonBlock(block: string): string {
  return fixTrailingCommas(joinMultilineStrings(block));
}

/** إزالة السطر الأول إن لم يكن قوساً مفتوحاً (مخلفات LLM قبل الكائن) */
function stripLeadingJunk(block: string): string {
  const lines = block.trim().split('\n');
  while (lines.length > 0 && !lines[0].trim().startsWith('{')) lines.shift();
  return lines.join('\n');
}

/**
 * استخراج كل كائنات القواعد من نص ملف سطري.
 * يعيد قائمة كائنات أولية غير منظّمة مع سياقها.
 */
export function extractRuleObjectsByLine(lines: string[]): Array<{
  raw: string;
  lineNo: number;
  context: Record<string, string>;
}> {
  const rules: Array<{ raw: string; lineNo: number; context: Record<string, string> }> = [];

  // مؤشرات السياق المتسلسلة
  let ctxFile = '';
  let ctxSection = '';
  let ctxArticleNumber = '';
  let ctxArticleTitle = '';
  let ctxActivity = '';
  let ctxSize = '';

  const readStringValue = (line: string): string => {
    const m = /:\s*"([^"]*)"/.exec(line);
    return m ? m[1] : '';
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    if (t.startsWith('"file_name"')) ctxFile = readStringValue(t);
    else if (t.startsWith('"section_title"')) ctxSection = readStringValue(t);
    else if (t.startsWith('"section_number"')) ctxSection = readStringValue(t) || ctxSection;
    else if (t.startsWith('"article_number"')) ctxArticleNumber = readStringValue(t);
    else if (t.startsWith('"article_title"')) ctxArticleTitle = readStringValue(t);
    else if (t.startsWith('"activity"')) ctxActivity = readStringValue(t);
    else if (t.startsWith('"size"')) ctxSize = readStringValue(t);

    if (!t.startsWith('"rule_id"')) continue;

    // حدد بداية الكائن: سطر "{" قبل هذا السطر
    let start = i;
    while (start > 0 && lines[start].trim() !== '{') start--;

    let buf = '';
    let depth = 0;
    let inString = false;
    let escape = false;
    let started = false;
    let done = false;

    for (let k = start; k < lines.length && !done; k++) {
      const seg = lines[k].trim();
      if (seg === '') {
        if (started) buf += '\n';
        continue;
      }
      buf += (buf ? '\n' : '') + seg;
      for (let c = 0; c < seg.length; c++) {
        const ch = seg[c];
        if (inString) {
          if (escape) escape = false;
          else if (ch === '\\') escape = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === '{') {
          depth += 1;
          started = true;
        } else if (ch === '}') {
          depth -= 1;
          if (depth <= 0) {
            done = true;
            break;
          }
        }
      }
    }

    rules.push({
      raw: stripLeadingJunk(buf),
      lineNo: i + 1,
      context: {
        file_name: ctxFile,
        section_title: ctxSection,
        article_number: ctxArticleNumber,
        article_title: ctxArticleTitle,
        activity: ctxActivity,
        size: ctxSize,
      },
    });
  }
  return rules;
}

/** تحليل كائن القاعدة الخام بعد الإصلاحات المتتالية */
export function parseRuleObject(
  raw: string,
): { rule?: Record<string, unknown>; error?: string } {
  const cleaned = repairJsonBlock(raw);
  const attempts = [cleaned];
  try {
    return { rule: JSON.parse(attempts[0]) as Record<string, unknown> };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * تطبيع ملف مصدري إلى قائمة قواعد بسياقها.
 */
export function normalizeSourceFile(filePath: string): {
  rules: Array<Record<string, unknown>>;
  errors: Array<{ lineNo: number; error: string; snippet: string }>;
  stats: { captured: number; parsed: number };
} {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const extracted = extractRuleObjectsByLine(lines);

  const rules: Array<Record<string, unknown>> = [];
  const errors: Array<{ lineNo: number; error: string; snippet: string }> = [];

  for (const item of extracted) {
    const { rule, error } = parseRuleObject(item.raw);
    if (error || !rule) {
      errors.push({ lineNo: item.lineNo, error: error ?? 'unparsed', snippet: item.raw.slice(0, 120) });
      continue;
    }
    rules.push({ ...rule, ...item.context, _sourceLine: item.lineNo });
  }

  return { rules, errors, stats: { captured: extracted.length, parsed: rules.length } };
}

/** توليد معرف قاعدة فريد عالمياً */
export function ensureUniqueRuleIds(
  rules: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Map<string, number>();
  return rules.map((r) => {
    const base = String(r.rule_id ?? 'unknown');
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...r, rule_id: count > 1 ? `${base}#${count}` : base };
  });
}

/** مسح كل الملفات المصدريّة وتوحيدها في NormalizedRuleSet واحد */
export function scanKnowledgeDocs(dir: string): {
  files: string[];
  rules: Array<Record<string, unknown>>;
  errors: Array<{ file: string; lineNo: number; error: string; snippet: string }>;
  stats: Array<{ file: string; captured: number; parsed: number; unique: number }>;
} {
  const files = fs.readdirSync(dir).filter((f) => f.includes('.md'));
  const all: Array<Record<string, unknown>> = [];
  const errors: Array<{ file: string; lineNo: number; error: string; snippet: string }> = [];
  const stats: Array<{ file: string; captured: number; parsed: number; unique: number }> = [];

  for (const name of files) {
    const full = path.join(dir, name);
    const { rules, errors: fileErrors, stats: fileStats } = normalizeSourceFile(full);
    for (const r of rules) all.push({ ...r, source_file: name });
    for (const e of fileErrors) errors.push({ file: name, ...e });
    stats.push({ file: name, captured: fileStats.captured, parsed: fileStats.parsed, unique: rules.length });
  }

  return {
    files,
    rules: ensureUniqueRuleIds(all),
    errors,
    stats,
  };
}
