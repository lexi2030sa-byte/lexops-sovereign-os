/**
 * مولّد المستندات — SADE Document Builder
 *
 * يملأ قالب المستند ببيانات الزناد (Metadata + Dynamic Content) ويحسب
 * بصمة HMAC-SHA256 وفق الختم السيادي (المخطط الحاكم: HMAC-SHA256 + prevHash).
 */

import { createHmac, createHash, randomUUID } from 'crypto';
import {
  SadeDocument,
  SadeGenerationContext,
  SadeTemplate,
  TRIGGER_TO_DOCUMENT_TYPE,
} from './types';

/** تحويل بصمة HMAC إلى نص PDF افتراضي (ختم التوقيع) */
function toHex(bytes: Buffer): string {
  return bytes.toString('hex');
}

export class DocumentBuilder {
  constructor(private readonly hmacSecret: string) {}

  /** توسيط مواضع {{placeholder}} من السياق */
  fillTemplate(template: SadeTemplate, ctx: SadeGenerationContext): string {
    let body = template.body;
    for (const ph of template.placeholders) {
      const value =
        ph === 'entityId'
          ? ctx.entityId
          : ph === 'actorId'
            ? ctx.actorId
            : ph === 'event'
              ? ctx.event
              : ph === 'ruleId'
                ? (ctx.verdict.ruleId ?? '-')
                : ph === 'severity'
                  ? (ctx.verdict.severity ?? '-')
                  : ph === 'confidence'
                    ? String(ctx.verdict.confidence ?? '-')
                    : ph === 'sovereignReasoning'
                      ? (ctx.verdict.sovereignReasoning ?? '-')
                      : ph === 'registerAllowed'
                        ? String(ctx.verdict.registerAllowed ?? '-')
                        : ph in ctx.metadata
                          ? String(ctx.metadata[ph] ?? '')
                          : '';
      body = body.split(`{{${ph}}}`).join(value);
    }
    return body;
  }

  /**
   * بناء مستند موقّع — ينتج المحتوى النهائي ويحسب بصمته.
   * البصمة HMAC-SHA256 على المحتوى + السياق تُجهّز كتلة C9 المرتبطة.
   */
  build(ctx: SadeGenerationContext): SadeDocument {
    const type = TRIGGER_TO_DOCUMENT_TYPE[ctx.event];
    const content = this.renderContent(ctx, type);
    const hash = this.signContent(content, ctx);

    return {
      id: randomUUID(),
      type,
      title: `${type} — ${ctx.entityId}`,
      status: 'SIGNED',
      createdAt: new Date().toISOString(),
      createdBy: ctx.actorId,
      content,
      hash,
      metadata: {
        entityId: ctx.entityId,
        event: ctx.event,
        verdict: ctx.verdict,
        ...ctx.metadata,
      },
    };
  }

  /** بناء محتوى المستند بصيغة PDF افتراضية مختومة */
  private renderContent(ctx: SadeGenerationContext, type: SadeDocument['type']): string {
    const lines: string[] = [
      '%PDF-1.4',
      `% Sovereign Auto-Documentation Engine (SADE)`,
      `%%DOC_TYPE: ${type}`,
      `%%DOC_ID: ${randomUUID()}`,
      `%%ENTITY: ${ctx.entityId}`,
      `%%ACTOR: ${ctx.actorId}`,
      `%%EVENT: ${ctx.event}`,
      `%%CREATED_AT: ${new Date().toISOString()}`,
      '1 0 obj',
      '<< /Type /Catalog /Pages 2 0 R >>',
      'endobj',
      '2 0 obj',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      'endobj',
      '3 0 obj',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
      'endobj',
      '4 0 obj',
      '<< /Length 0 >>',
      'stream',
      `BT /F1 12 Tf 72 720 Td (SADE ${type} - ${ctx.entityId}) Tj ET`,
      'endstream',
      'endobj',
      'trailer',
      '<< /Root 1 0 R >>',
      '%%EOF',
    ];
    return lines.join('\n');
  }

  /** ختم المحتوى ببصمة HMAC-SHA256 (المخطط الحاكم C9) */
  private signContent(content: string, ctx: SadeGenerationContext): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return toHex(
      createHmac('sha256', this.hmacSecret).update(`${hash}|${ctx.entityId}|${ctx.event}`).digest(),
    );
  }
}
