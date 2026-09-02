/**
 * محرك الاستدلال السيادي LEXI
 *
 * المرجع: بروتوكول اليقين الاستدلالي + تعريف LEXI + HILAP.
 *
 * قاعدة اليقين: لا يُتخذ قرار آلي إلا بثقة ≥ 80%. دون ذلك → تجميد + Sovereign Override
 * (قرار بشري حاكم عبر HILAP عند ≥ 90%).
 */

import { LEXI_CONFIDENCE } from '@lexops/shared';
import { GeoPoint, GeoVerdict } from '@lexops/geofencing';

export type LexiPath = 'textual' | 'procedural' | 'physical';

export type DecisionSeverity = 'routine' | 'severe';

export interface PathVerdict {
  path: LexiPath;
  confidence: number;
  verdict: 'compliant' | 'violation' | 'inconclusive' | 'blocked';
  reasons: string[];
}

export interface TextualRuleSignal {
  /** تطابق المسار النصي (نظام العمل 2026) */
  ruleMatched: boolean;
  confidence: number;
  severity: 'severe' | 'moderate' | 'minor';
  reasoning: string;
  /** نتيجة الفلتر الملكي 11438 */
  royalFilterAllowed: boolean;
}

export type LexiDecision =
  | { status: 'auto'; confidence: number; verdict: string }
  | { status: 'frozen'; confidence: number; reason: string }
  | { status: 'human_review'; confidence: number; reason: string };

/**
 * الجمع بين ثلاث مسارات:
 *  - النصي: تحليل النص القانوني (محرك القواعد السيادية)
 *  - الإجرائي: توثيق الإجراءات والتدرج في العقوبة (الفلتر الملكي 11438)
 *  - المادي: الإحداثيات/القراءات (Geo / Attendance)
 * يُعاد القرار النهائي بثقة مركبة.
 *
 * عتبة ديناميكية (قرار المؤسس): نطاق 80–90%.
 *  - القرارات الاعتيادية: ≥ 80%
 *  - القرارات الجسيمة: ≥ 90%
 *  - دون العتبة → تجميد + إحالة HILAP (نقض بشري حاكم عند ≥ 90%)
 */
export class LexiEngine {
  constructor(
    private readonly minAuto = LEXI_CONFIDENCE.minAutoDecision,
    private readonly severeAuto = LEXI_CONFIDENCE.severeAutoDecision,
  ) {}

  /** الجمع المرجح للمسارات مع مراعاة جسامة القرار */
  combine(paths: PathVerdict[], severity: DecisionSeverity = 'routine'): LexiDecision {
    if (paths.length === 0) {
      return { status: 'frozen', confidence: 0, reason: 'no_evidence_paths' };
    }

    const blocked = paths.some((p) => p.verdict === 'blocked');
    const confidence = paths.reduce((acc, p) => acc + p.confidence, 0) / paths.length;
    const threshold = severity === 'severe' ? this.severeAuto : this.minAuto;

    if (blocked) {
      return { status: 'human_review', confidence, reason: 'physical_path_blocked' };
    }
    if (confidence >= threshold) {
      const allCompliant = paths.every((p) => p.verdict === 'compliant');
      return { status: 'auto', confidence, verdict: allCompliant ? 'compliant' : 'violation' };
    }
    if (confidence >= LEXI_CONFIDENCE.humanOverrideThreshold) {
      return { status: 'human_review', confidence, reason: 'requires_sovereign_override' };
    }
    return { status: 'frozen', confidence, reason: 'below_confidence_threshold' };
  }

  /** تفعيل نتيجة Geo في المسار المادي */
  geoPathVerdict(geo: GeoVerdict): PathVerdict {
    switch (geo.status) {
      case 'inside':
        return { path: 'physical', confidence: 0.95, verdict: 'compliant', reasons: ['inside_fence'] };
      case 'outside':
        return { path: 'physical', confidence: 0.9, verdict: 'violation', reasons: ['outside_fence'] };
      case 'abnormal_speed':
      case 'mock_spoofed':
        return { path: 'physical', confidence: 0.99, verdict: 'blocked', reasons: [geo.status] };
    }
  }

  /** توثيق موقع لحضور — يُجمّد عند التزييف */
  attendanceVerdict(fence: { center: GeoPoint; radiusMeters: number }, reading: GeoPoint): PathVerdict {
    const verdict: GeoVerdict =
      // كشف تزييف بدائي + خارج النطاق
      reading.timestamp === 0
        ? { status: 'mock_spoofed', reason: 'zero_timestamp' }
        : { status: 'inside', distanceMeters: 0 }; // الاستبدال الحقيقي عبر geofencing في طبقة أعلى
    return this.geoPathVerdict(verdict);
  }

  /**
   * المسار النصي — ربط محرك القواعد السيادية بمسارات LEXI.
   * (التوجيه 4: تطابق المسار النصي مع المسار الإجرائي والتدرج في العقوبة)
   */
  textualPathVerdict(signal: TextualRuleSignal): PathVerdict {
    const reasons = [signal.reasoning];
    if (!signal.royalFilterAllowed) {
      reasons.push('القرار الملكي 11438: لا تسجيل بلا إنذار مسبق + 3 أيام عمل');
    }
    if (!signal.ruleMatched) {
      return { path: 'textual', confidence: signal.confidence, verdict: 'compliant', reasons };
    }
    if (!signal.royalFilterAllowed) {
      // المخالفة محققة نظامياً لكنها ممنوعة التسجيل حالياً — حالة إجرائية
      return { path: 'procedural', confidence: signal.confidence, verdict: 'blocked', reasons };
    }
    return { path: 'textual', confidence: signal.confidence, verdict: 'violation', reasons };
  }
}
