/**
 * النماذج الموحدة لمحرك القواعد السيادي — Canonical Rule Types
 *
 * المرجع: ملف "محرك الربط المنطقي – JSON Logic" (المخطط الرسمي)
 * + مخططات الاستخراج الثلاثة (مكتب العمل / التوطين / البلدية).
 *
 * المخطط الرسمي (legal_logic_rules.json):
 *   { metadata, rules: [{ id, name, category, inputs, outputs, logic }] }
 *
 * مخططات الاستخراج:
 *   - مكتب العمل:  { file_name, sections: [{ articles: [{ compliance_rules: [...] }] }] }
 *   - التوطين:     { document_type, operational_rules: [{ rule_id, activity, size, ...ranges }] }
 *   - البلدية:     { chapters/sections, compliance_rules: [{ rule_id, logic: "if ... then ..." }] }
 */

export type RulePriority = 'national' | 'local';

export type RuleSeverity = 'severe' | 'moderate' | 'minor';

export interface RuleSourceRef {
  documentId?: string;
  file?: string;
  section?: string;
  article?: string;
  chapter?: string;
}

/** عقد الإخراج المعياري لأي قاعدة */
export interface CanonicalOutputs {
  [key: string]: unknown;
}

/** شجرة القرار المبنية من قاعدة */
export interface DecisionNode {
  ruleId: string;
  name: string;
  category: string;
  priority: RulePriority;
  severity: RuleSeverity;
  /** الشروط القابلة للتقييم (JSON Logic) — فارغة = قاعدة وصفية تُسجَّل كتوعية */
  logic?: unknown;
  outputs?: CanonicalOutputs;
  source: RuleSourceRef;
  /** وصف نصي (الشرح النظامي) */
  descriptionAr?: string;
  penalty?: string;
}

/** قاعدة موحدة بعد التطبيع من أي مخطط */
export interface CanonicalRule {
  ruleId: string;
  name: string;
  category: string;
  priority: RulePriority;
  severity: RuleSeverity;
  logic?: unknown;
  outputs?: CanonicalOutputs;
  source: RuleSourceRef;
  descriptionAr?: string;
  penalty?: string;
  /** حقول الاستخراج الأصلية (للإبقاء على الاقتفاء) */
  raw?: Record<string, unknown>;
}

/** وثيقة قواعد موحدة بعد التطبيع */
export interface NormalizedRuleSet {
  version: string;
  jurisdiction: string;
  rules: CanonicalRule[];
  stats: {
    totalRules: number;
    executable: number;
    descriptive: number;
    sources: string[];
  };
}

/** نتيجة تقييم شجرة القرار */
export interface DecisionResult {
  ruleId: string;
  matched: boolean;
  /** قيمة منطق القاعدة إن نُفّذ */
  outputs?: CanonicalOutputs;
  /** السبب النظامي (لماذا اتُّخذ القرار) — يُشفَّر في كتلة C9 التالية */
  reasoning: string[];
  severity: RuleSeverity;
  priority: RulePriority;
}
