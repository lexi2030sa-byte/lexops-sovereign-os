/**
 * SADE — Sovereign Auto-Documentation Engine
 *
 * المرجع: وثيقة "الآلية السيادية للتوثيق الذاتي داخل المنصة" + USDS-02.
 *
 * المكوّنات:
 *  - SadeOrchestrator: ربط زنادات محرك القواعد بـ Document Builder وختم C9
 *  - DocumentBuilder: توليد مستند PDF افتراضي مختوم HMAC-SHA256
 *  - القوالب والأنواع: STEP_RECORD / PHASE_REPORT / GOV_LETTER / PILOT_SUMMARY / CONTRACT_DRAFT
 */

export { SadeOrchestrator } from './orchestrator';
export type { SadeEngine, SadeOutcome, SadeRunInput } from './orchestrator';
export { DocumentBuilder } from './document-builder';
export * from './types';
import { SadeTemplate } from './types';

/** قالب افتراضي جاهز للمستندات السيادية */
export function defaultTemplate(): SadeTemplate {
  return {
    id: 'STEP_RECORD_V1_AR',
    type: 'STEP_RECORD',
    name: 'سجل الخطوة السيادية',
    version: 1,
    language: 'AR',
    body: [
      'سجل خطوة سيادي — Sovereign Step Record',
      'المنشأة: {{entityId}}',
      'الحدث: {{event}}',
      'القاعدة: {{ruleId}}',
      'الشدة: {{severity}}',
      'اليقين: {{confidence}}',
      'التسبيب: {{sovereignReasoning}}',
      'التسجيل: {{registerAllowed}}',
    ].join('\n'),
    placeholders: [
      'entityId',
      'event',
      'ruleId',
      'severity',
      'confidence',
      'sovereignReasoning',
      'registerAllowed',
    ],
  };
}
