/**
 * إصلاح JSON التساهلي — Tolerant JSON Repair
 *
 * يعالج عيوب مخرجات الاستخراج LLM:
 *  - سلاسل متعددة الأسطر: يدمج السطر التالي داخل السلسلة (يحول السطر الجديد لمسافة)
 *  - فواصل زائدة قبل } و ]
 *  - أسطر العناوين/الفواصل بين المستندات
 */

/** دمج السلاسل متعددة الأسطر وتحويل الأسطر الجديدة داخل السلسلة إلى مسافات */
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
        // سطر جديد داخل سلسلة → مسافة
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

/** إصلاح الفواصل الزائدة: ",\n}" → "\n}" و ",\n]" → "\n]" */
export function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/** إصلاح شامل: دمج السلاسل ثم الفواصل الزائدة */
export function repairJson(text: string): string {
  return fixTrailingCommas(joinMultilineStrings(text));
}

/** محاولة التحليل بعد الإصلاحات المتسلسلة */
export function parseRepaired(block: string): { doc?: unknown; error?: string } {
  const candidates = [
    block,
    joinMultilineStrings(block),
    fixTrailingCommas(joinMultilineStrings(block)),
  ];
  for (const c of candidates) {
    try {
      return { doc: JSON.parse(c) };
    } catch {
      /* جرّب التالية */
    }
  }
  return { error: block.slice(0, 300) };
}
