/**
 * محلل توكن الهوية السيادية (JWT) — Zero-Trust
 *
 * المرجع: USDS-02 (طبقة الهوية + Zero-Trust) + وثيقة واجهات النظام.
 *
 * المبدأ: لا نثق بالـ Headers القادمة من العميل، بل بالهوية المستخلصة من
 * التوكن الموقّع (Firebase Auth Custom Claims). أي تعارض بين الـ Header
 * المُرسَل والـ Claims الموثقة يُعتبر انتحالاً (Spoofing) ويُرفض.
 */

import { Injectable } from '@nestjs/common';

export interface VerifiedIdentity {
  userId: string;
  entityId?: string;
  role: string;
}

export interface TokenVerifier {
  verify(bearerToken: string): Promise<VerifiedIdentity> | VerifiedIdentity;
}

/** رمز حقن موفّر التحقق — يسمح بتبديل DevTokenVerifier بمحقق Firebase في الإنتاج */
export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

/**
 * محقق توكن افتراضي — يُستبدل بمحقق Firebase Admin في الإنتاج.
 * (يُستخدم في الاختبارات والتطوير فقط؛ لا يُعتمد عليه في الإنتاج السيادي)
 */
@Injectable()
export class DevTokenVerifier implements TokenVerifier {
  verify(bearerToken: string): VerifiedIdentity {
    const token = bearerToken.replace(/^Bearer\s+/i, '');
    // تنسيق تجريبي: <userId>.<role>.<entityId?>
    const [userId, role, entityId] = token.split('.');
    return { userId, role, entityId: entityId || undefined };
  }
}
