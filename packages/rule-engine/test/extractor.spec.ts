import { describe, expect, it } from 'vitest';
import {
  joinMultilineStrings,
  fixTrailingCommas,
  repairJsonBlock,
  extractRuleObjectsByLine,
  parseRuleObject,
  ensureUniqueRuleIds,
  normalizeSourceFile,
} from '../scripts/extractor';

const MOL_LINES = [
  '"file_name": "اللائحة التنفيذية لنظام العمل وملحقاتها.pdf",',
  '',
  '"sections": [',
  '{',
  '',
  '"section_title": "التعريفات",',
  '',
  '"articles": [',
  '{',
  '',
  '"article_number": "1",',
  '',
  '"compliance_rules": [',
  '{',
  '',
  '"rule_id": "R1-1",',
  '',
  '"rule_type": "إلزامي",',
  '',
  '"description": "نص القاعدة الأولى",',
  '',
  '"penalty": "تطبيق أحكام نظام العمل كاملة",',
  '',
  '"priority": "عالية"',
  '',
  '},',
  '{',
  '',
  '"rule_id": "R1-2",',
  '',
  '"rule_type": "إلزامي",',
  '',
  '"description": "نص القاعدة الثانية مع استمرار',
  '',
  'النص في السطر التالي",',
  '',
  '"penalty": "غرامة",',
  '',
  '"priority": "متوسطة"',
  '',
  '}',
  ']',
  '}',
  ']',
  '}',
  ']',
];

describe('extractor — سطر-الـ key/value المتسامح', () => {
  it('يجمع السلاسل متعددة الأسطر إلى مسافة', () => {
    const joined = joinMultilineStrings('"a": "سطر أول\nسطر ثاني"');
    expect(joined).toBe('"a": "سطر أول سطر ثاني"');
  });

  it('يصلح الفواصل الزائدة قبل الإغلاق', () => {
    expect(fixTrailingCommas('"a": 1,\n"b": 2,\n}')).toBe('"a": 1,\n"b": 2}');
  });

  it('يصلح الفاصلة بعد قوس الإغلاق في نهاية السطر', () => {
    expect(fixTrailingCommas('"a": 1\n},')).toBe('"a": 1\n}');
  });

  it('repairJsonBlock يدمج و يصلح معاً', () => {
    const fixed = repairJsonBlock('{\n"x": "أ\nب",\n},');
    expect(fixed).toBe('{\n"x": "أ ب"}');
  });

  it('يستخرج كائنات القواعد من سطور MOL مع سياقها', () => {
    const rules = extractRuleObjectsByLine(MOL_LINES);
    expect(rules.length).toBe(2);
    expect(rules[0].context.file_name).toContain('اللائحة التنفيذية');
    expect(rules[0].context.section_title).toBe('التعريفات');
    expect(rules[0].context.article_number).toBe('1');
  });

  it('يحلل كائن القاعدة بعد الإصلاح', () => {
    const { rule } = parseRuleObject('{\n"rule_id": "R1-1",\n"priority": "عالية",\n}');
    expect(rule).toBeDefined();
    expect((rule as Record<string, unknown>).rule_id).toBe('R1-1');
  });

  it('يضمن فريديّة rule_id عند التكرار', () => {
    const out = ensureUniqueRuleIds([{ rule_id: 'A' }, { rule_id: 'A' }, { rule_id: 'B' }]);
    expect(out.map((r) => r.rule_id)).toEqual(['A', 'A#2', 'B']);
  });

  it('normalizeSourceFile يقرأ ملفاً واقعياً من مساره', () => {
    const dir = process.env.LEXOPS_WORKSPACE ?? '/workspace';
    const file = 'بصيغة JSON مكتب العمل 369ef68b731d802d9b3bcc25e383 394bba35e4eb815ca217e8b223a04bba.md';
    const { rules, stats } = normalizeSourceFile(`${dir}/${file}`);
    expect(stats.parsed).toBeGreaterThan(600);
    expect(rules.length).toBe(stats.parsed);
  });
});
