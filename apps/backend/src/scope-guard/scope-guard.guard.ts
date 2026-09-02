/**
 * ScopeGuard — جدار الحماية السيادي (Fortress 700)
 *
 * المرجع: USDS-02 (عقيدة الحصن 700) + وثيقة واجهات النظام + بروتوكول الاتساق
 * + مبدأ Zero-Trust (المصدر [768، 824] تفعيل Anti-Spoofing).
 *
 * المسؤولية:
 *  1) فرض الـ Headers السيادية الموحدة (v0.1) قبل وصول أي طلب للمحركات الفرعية.
 *  2) التحقق من هوية JWT (Custom Claims) — لا ثقة في Headers العميل.
 *  3) فرض عزل المنشآت (لا وصول متقاطع إطلاقاً — Fortress 700).
 *
 * أوامر الرفض المعتمدة:
 *  - SOV_401: غياب/فساد الهوية السيادية (Authorization أو X-User-Id أو X-Request-Id)
 *  - SOV_422: رتبة سيادية غير معروفة أو تعارض بين الـ Headers والتوكن (Spoofing)
 *  - SOV_403: تجاوز نطاق الصلاحية (Cross-tenant / دور غير مصرح)
 */

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  PUBLIC_PATHS,
  SOVEREIGN_ERROR_CODES,
  SovereignRole,
} from '@lexops/contracts';
import { TOKEN_VERIFIER, TokenVerifier } from './token.verifier';

export interface ScopeGuardContext {
  entityId?: string;
  role: SovereignRole;
  userId: string;
  requestId: string;
  verified: boolean;
}

const KNOWN_ROLES: readonly string[] = [
  'founder',
  'entity_admin',
  'hr_manager',
  'compliance_officer',
  'field_inspector',
  'legal_advisor',
  'payroll_officer',
  'employee',
  'freelancer',
] as const;

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(@Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const rawPath = req.path ?? req.url ?? '';
    // تطبيع المسار بإزالة البادئة العامة (Global Prefix) للمطابقة مع الثوابت
    const GLOBAL_PREFIX = '/api/v0.1';
    const path = rawPath.startsWith(GLOBAL_PREFIX)
      ? rawPath.slice(GLOBAL_PREFIX.length)
      : rawPath;

    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
      return true;
    }

    const headers = req.headers ?? {};
    const authorization = headers['authorization'] as string | undefined;
    const xUserId = headers['x-user-id'] as string | undefined;
    const xRequestId = headers['x-request-id'] as string | undefined;
    const xEntityId = headers['x-entity-id'] as string | undefined;
    const xRole = headers['x-sovereign-role'] as string | undefined;

    // 1) الهوية السيادية الأساسية
    if (!authorization || !xUserId || !xRequestId) {
      throw this.reject(
        SOVEREIGN_ERROR_CODES.SOV_401,
        'Missing sovereign identity headers',
        xRequestId,
      );
    }
    if (!authorization.startsWith('Bearer ')) {
      throw this.reject(
        SOVEREIGN_ERROR_CODES.SOV_401,
        'Malformed Authorization header',
        xRequestId,
      );
    }

    // 2) الرتبة السيادية الموثقة — لا نثق بدور يرسله العميل بلا مقابل
    if (!xRole || !KNOWN_ROLES.includes(xRole)) {
      throw this.reject(SOVEREIGN_ERROR_CODES.SOV_422, 'Unknown sovereign role', xRequestId);
    }
    const headerRole = xRole as SovereignRole;

    // 3) التحقق من التوكن — استخلاص الهوية الموثقة (Zero-Trust / Anti-Spoofing)
    let verified: { userId: string; entityId?: string; role: string };
    try {
      verified = await this.tokenVerifier.verify(authorization);
    } catch {
      throw this.reject(SOVEREIGN_ERROR_CODES.SOV_401, 'Invalid bearer token', xRequestId);
    }

    // 4) مطابقة الهوية الموثقة مع الـ Headers — أي تعارض = انتحال
    const spoofed =
      verified.userId !== xUserId ||
      (xEntityId !== undefined && verified.entityId !== undefined && verified.entityId !== xEntityId) ||
      verified.role !== headerRole;
    if (spoofed) {
      throw this.reject(
        SOVEREIGN_ERROR_CODES.SOV_422,
        'Identity mismatch between token claims and headers (spoofing attempt)',
        xRequestId,
      );
    }

    // 5) X-Entity-Id مطلوب لكل الطلبات المحمية — المؤسس في /sovereign فقط يستثنى
    if (!xEntityId && headerRole !== 'founder') {
      throw this.reject(SOVEREIGN_ERROR_CODES.SOV_403, 'Missing X-Entity-Id', xRequestId);
    }

    // 6) مسارات التجاوز السيادي — للمؤسس حصراً
    if (path.startsWith('/sovereign/') && headerRole !== 'founder') {
      throw this.reject(
        SOVEREIGN_ERROR_CODES.SOV_403,
        'Sovereign override requires founder role',
        xRequestId,
      );
    }

    // 7) حقن سياق النطاق المعتمد في الطلب للطبقات الأدنى
    req.scopeGuard = {
      entityId: xEntityId ?? verified.entityId,
      role: headerRole,
      userId: xUserId,
      requestId: xRequestId,
      verified: true,
    } satisfies ScopeGuardContext;

    return true;
  }

  private reject(code: number, message: string, requestId?: string): HttpException {
    return new HttpException(
      {
        success: false,
        message,
        data: null,
        meta: { requestId: requestId ?? 'unknown' },
      },
      code,
    );
  }
}
