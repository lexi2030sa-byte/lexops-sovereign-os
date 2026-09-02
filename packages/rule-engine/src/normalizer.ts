/**
 * مُطبِّع المستندات — Normalizer
 *
 * يحوّل أي مستند قواعد (من المخططات الأربعة) إلى مجموعة موحدة (NormalizedRuleSet):
 *  1) المخطط الرسمي: { metadata, rules }
 *  2) مكتب العمل:   { sections: [{ articles: [{ compliance_rules }] }] }
 *  3) التوطين:      { operational_rules } (نطاقات التوطين التفاضلية)
 *  4) البلدية:      { compliance_rules } مع logic نصي
 *
 * كل قاعدة تنتج CanonicalRule مع مصدر (source) للاقتفاء النظامي.
 */

import { CanonicalRule, NormalizedRuleSet, RulePriority, RuleSeverity, RuleSourceRef } from './types';
import { FormalLogic, parseIfThenElse } from './pseudocode';

type RawDoc = Record<string, unknown>;

export class RuleNormalizer {
  /** التطبيع الرئيسي — يتعرّف على المخطط تلقائياً */
  normalize(doc: RawDoc): NormalizedRuleSet {
    const rules: CanonicalRule[] = [];
    const sources = new Set<string>();

    if (Array.isArray(doc.rules)) {
      this.normalizeOfficial(doc, rules, sources);
    } else if (Array.isArray(doc.operational_rules)) {
      this.normalizeLocalization(doc, rules, sources);
    } else if (Array.isArray(doc.sections) && this.hasArticleCompliance(doc)) {
      this.normalizeMol(doc, rules, sources);
    } else if (Array.isArray(doc.compliance_rules)) {
      this.normalizeMunicipality(doc, rules, sources);
    } else if (Array.isArray(doc.document) && Array.isArray((doc.document as unknown as RawDoc).compliance_rules)) {
      this.normalizeMunicipality(doc.document as unknown as RawDoc, rules, sources);
    }

    const executable = rules.filter((r) => r.logic !== undefined).length;
    return {
      version: (doc.metadata as RawDoc | undefined)?.version as string ?? '1.0.0',
      jurisdiction: (doc.metadata as RawDoc | undefined)?.jurisdiction as string ?? 'Saudi Arabia',
      rules,
      stats: {
        totalRules: rules.length,
        executable,
        descriptive: rules.length - executable,
        sources: [...sources],
      },
    };
  }

  /** المخطط الرسمي legal_logic_rules.json */
  private normalizeOfficial(doc: RawDoc, out: CanonicalRule[], sources: Set<string>): void {
    const meta = doc.metadata as RawDoc | undefined;
    const srcList = Array.isArray(meta?.source) ? (meta!.source as string[]) : [];
    srcList.forEach((s) => sources.add(s));
    const rules = doc.rules as Array<Record<string, unknown>>;
    for (const r of rules) {
      out.push({
        ruleId: String(r.id),
        name: String(r.name ?? r.id),
        category: String(r.category ?? 'general'),
        priority: this.priorityOf(r.priority),
        severity: this.severityOf(r.severity),
        logic: this.formalLogicToJsonLogic((r.logic as FormalLogic | undefined) ?? undefined),
        outputs: (r.outputs as Record<string, unknown> | undefined) ?? undefined,
        source: { documentId: String(meta?.file_id ?? '') || undefined },
        descriptionAr: r.description_ar as string | undefined,
        raw: r,
      });
    }
  }

  /** مكتب العمل: sections[].articles[].compliance_rules[] */
  private normalizeMol(doc: RawDoc, out: CanonicalRule[], sources: Set<string>): void {
    sources.add(String(doc.file_name ?? ''));
    const sections = doc.sections as Array<Record<string, unknown>>;
    for (const sec of sections) {
      const articles = sec.articles as Array<Record<string, unknown>> | undefined;
      if (!articles) continue;
      for (const art of articles) {
        const compliance = art.compliance_rules as Array<Record<string, unknown>> | undefined;
        if (!compliance) continue;
        for (const rule of compliance) {
          out.push({
            ruleId: String(rule.rule_id ?? rule.id ?? ''),
            name: String(rule.description ?? rule.rule_id ?? ''),
            category: 'labor',
            priority: this.priorityOf(rule.priority),
            severity: this.severityOf(rule.severity ?? this.severityFromPriority(rule.priority)),
            source: {
              file: String(doc.file_name ?? ''),
              section: String(sec.section_number ?? sec.section_title ?? ''),
              article: String(art.article_number ?? art.article_title ?? ''),
            },
            descriptionAr: rule.description as string | undefined,
            penalty: rule.penalty as string | undefined,
            raw: rule,
          });
        }
      }
    }
  }

  /** التوطين: operational_rules[] — نطاقات نسب التوطين */
  private normalizeLocalization(doc: RawDoc, out: CanonicalRule[], sources: Set<string>): void {
    sources.add(String(doc.file_name ?? 'جدول نسب التوطين'));
    const ops = doc.operational_rules as Array<Record<string, unknown>>;
    for (const op of ops) {
      out.push({
        ruleId: String(op.rule_id ?? ''),
        name: `نطاق توطين: ${String(op.activity ?? '')} — ${String(op.size ?? '')}`,
        category: 'localization',
        priority: 'national',
        severity: 'moderate',
        logic: this.nisabToJsonLogic(op),
        source: { documentId: String(doc.file_id ?? '') || undefined },
        raw: op,
      });
    }
  }

  /** البلدية: compliance_rules[] مع logic نصي */
  private normalizeMunicipality(doc: RawDoc, out: CanonicalRule[], sources: Set<string>): void {
    const chapters = Array.isArray(doc.chapters) ? (doc.chapters as Array<Record<string, unknown>>) : [];
    const secs = Array.isArray(doc.sections) ? (doc.sections as Array<Record<string, unknown>>) : [];
    const rules = doc.compliance_rules as Array<Record<string, unknown>> | undefined;
    if (!rules) return;

    for (const rule of rules) {
      const logicStr = rule.logic as string | undefined;
      let logic: unknown;
      if (logicStr) {
        const parsed = parseIfThenElse(logicStr);
        logic = parsed ? { parsed } : undefined;
      }
      const chapter = chapters.find((c) => c.chapter_number !== undefined && String(c.chapter_number) === String(rule.chapter_number));
      out.push({
        ruleId: String(rule.rule_id ?? ''),
        name: String(rule.description ?? rule.rule_id ?? ''),
        category: 'municipality',
        priority: 'national',
        severity: this.severityOf(rule.severity ?? (logicStr?.includes("serious") ? 'severe' : 'moderate')),
        logic,
        source: {
          documentId: String(doc.file_id ?? '') || undefined,
          article: rule.source_article ? `مادة ${rule.source_article}` : undefined,
          chapter: chapter ? String(chapter.title ?? chapter.chapter_number) : undefined,
        },
        descriptionAr: rule.description as string | undefined,
        raw: rule,
      });
    }
    void secs;
  }

  /** NISAB: نسبة التوطين التفاضلية → قاعدة تعيّن النطاق */
  private nisabToJsonLogic(op: Record<string, unknown>): unknown {
    // تحويل إلى JSON Logic قابلة للتنفيذ مع متغيرات النطاق
    return {
      nisab_assignment: {
        rule_id: op.rule_id,
        activity: op.activity,
        size: op.size,
        ranges: {
          red: op.red_range,
          low_green: { min: op.low_green_min, max: op.low_green_max },
          medium_green: { min: op.medium_green_min, max: op.medium_green_max },
          high_green: { min: op.high_green_min, max: op.high_green_max },
          platinum: { min: op.platinum_min, max: op.platinum_max },
        },
      },
    };
  }

  /** تحويل الصيغة الرسمية operation/conditions إلى JSON Logic أو كائن تعريف */
  private formalLogicToJsonLogic(logic?: FormalLogic): unknown {
    if (!logic) return undefined;
    return logic as unknown;
  }

  private hasArticleCompliance(doc: RawDoc): boolean {
    const sections = doc.sections as Array<Record<string, unknown>> | undefined;
    if (!sections) return false;
    return sections.some((s) => {
      const articles = s.articles as Array<Record<string, unknown>> | undefined;
      return articles?.some((a) => Array.isArray(a.compliance_rules) && a.compliance_rules.length > 0);
    });
  }

  private priorityOf(value: unknown): RulePriority {
    return value === 'local' || value === 'محلية' ? 'local' : 'national';
  }

  private severityOf(value: unknown): RuleSeverity {
    switch (String(value)) {
      case 'severe':
      case 'جسيم':
      case 'عالية':
        return 'severe';
      case 'minor':
      case 'خفيفة':
        return 'minor';
      default:
        return 'moderate';
    }
  }

  private severityFromPriority(value: unknown): RuleSeverity {
    return value === 'عالية' ? 'severe' : 'moderate';
  }
}
