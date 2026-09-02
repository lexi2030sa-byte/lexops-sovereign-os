import { describe, expect, it } from 'vitest';
import { LexiEngine, PathVerdict } from '../src/index';

function path(conf: number, verdict: PathVerdict['verdict'] = 'compliant'): PathVerdict {
  return { path: 'textual', confidence: conf, verdict, reasons: ['test'] };
}

describe('LEXI dynamic confidence (قرار المؤسس: 80–90%)', () => {
  const engine = new LexiEngine();

  it('قرار اعتيادي عند ثقة 80% يُمرَّر آلياً', () => {
    const d = engine.combine([path(0.8)], 'routine');
    expect(d.status).toBe('auto');
  });

  it('قرار جسيم عند ثقة 85% لا يُمرَّر آلياً (يتطلب 90%)', () => {
    const d = engine.combine([path(0.85)], 'severe');
    expect(d.status).toBe('frozen');
  });

  it('قرار جسيم عند ثقة 90% يُمرَّر آلياً', () => {
    const d = engine.combine([path(0.9)], 'severe');
    expect(d.status).toBe('auto');
  });

  it('قرار اعتيادي عند ثقة 85% يُمرَّر آلياً (فوق 80%)', () => {
    const d = engine.combine([path(0.85)], 'routine');
    expect(d.status).toBe('auto');
  });

  it('مسار محجوب حتى عند ثقة 95% يُحال للنقض البشري الحاكم (HILAP)', () => {
    const d = engine.combine([path(0.95, 'blocked')], 'routine');
    expect(d.status).toBe('human_review');
  });

  it('دون العتبة الأدنى (79%) يُجمَّد', () => {
    const d = engine.combine([path(0.79)], 'routine');
    expect(d.status).toBe('frozen');
  });

  it('مسار محجوب يُحال للبشر فوراً', () => {
    const d = engine.combine([path(0.95, 'blocked')]);
    expect(d.status).toBe('human_review');
  });

  it('المسار النصي: مطابقة قاعدة مع فلتر ملكي مستوفى = مخالفة نصية', () => {
    const p = engine.textualPathVerdict({
      ruleMatched: true,
      confidence: 0.9,
      severity: 'moderate',
      reasoning: 'القاعدة R-LABOR-007 تحققت',
      royalFilterAllowed: true,
    });
    expect(p.path).toBe('textual');
    expect(p.verdict).toBe('violation');
  });

  it('المسار الإجرائي: فلتر 11438 يمنع التسجيل دون إنذار مسبق = محجوب', () => {
    const p = engine.textualPathVerdict({
      ruleMatched: true,
      confidence: 0.88,
      severity: 'minor',
      reasoning: 'القاعدة تحققت',
      royalFilterAllowed: false,
    });
    expect(p.path).toBe('procedural');
    expect(p.verdict).toBe('blocked');
    expect(p.reasons.join()).toContain('11438');
  });
});
