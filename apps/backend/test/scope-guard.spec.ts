import { describe, expect, it } from 'vitest';
import { ScopeGuard } from '../src/scope-guard/scope-guard.guard';
import { DevTokenVerifier } from '../src/scope-guard/token.verifier';

function buildReq(overrides: Record<string, unknown> = {}) {
  const req: Record<string, unknown> = {
    headers: {},
    path: '/api/v0.1/entities/1000001234/staff',
    ...overrides,
  };
  return req;
}

function makeCtx(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

/** توكن تجريبي بترتيب: userId.role.entityId */
const TOKEN_EMPLOYEE = 'Bearer user1.employee.700-1000001234';
const TOKEN_ADMIN = 'Bearer admin1.entity_admin.700-1000001234';
const TOKEN_FOUNDER = 'Bearer founder1.founder';

async function run(guard: ScopeGuard, req: Record<string, unknown>) {
  try {
    await guard.canActivate(makeCtx(req));
    return { ok: true, code: 0 };
  } catch (e) {
    const err = e as { status?: number; response?: { meta?: { requestId?: string } } };
    return { ok: false, code: err.status ?? 500, requestId: err.response?.meta?.requestId };
  }
}

function headers(req: Record<string, unknown>, h: Record<string, string>) {
  req.headers = h;
  return req;
}

describe('ScopeGuard — جدار الحماية السيادي (Fortress 700)', () => {
  const guard = new ScopeGuard(new DevTokenVerifier());

  it('يرفض الطلب عند غياب الـ Headers السيادية (SOV_401)', async () => {
    const r = await run(guard, buildReq({ headers: {} }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe(401);
  });

  it('يرفض التوكن غير المطابق لـ X-User-Id (انتحال — SOV_422)', async () => {
    const req = headers(buildReq(), {
      authorization: TOKEN_EMPLOYEE,
      'x-user-id': 'intruder',
      'x-request-id': 'req-1',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'employee',
    });
    const r = await run(guard, req);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
  });

  it('يرفض رتبة سيادية غير معروفة (SOV_422)', async () => {
    const req = headers(buildReq(), {
      authorization: TOKEN_ADMIN,
      'x-user-id': 'admin1',
      'x-request-id': 'req-2',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'root',
    });
    const r = await run(guard, req);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
  });

  it('يمرر طلباً سليماً لمدير المنشأة', async () => {
    const req = headers(buildReq(), {
      authorization: TOKEN_ADMIN,
      'x-user-id': 'admin1',
      'x-request-id': 'req-3',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'entity_admin',
    });
    const r = await run(guard, req);
    expect(r.ok).toBe(true);
    expect(req.scopeGuard).toMatchObject({ entityId: '700-1000001234', role: 'entity_admin', verified: true });
  });

  it('يمنع وصول مستخدم من منشأة أخرى إلى منشأة غريبة (Cross-tenant)', async () => {
    const req = headers(buildReq(), {
      authorization: 'Bearer admin1.entity_admin.700-9999999999',
      'x-user-id': 'admin1',
      'x-request-id': 'req-4',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'entity_admin',
    });
    const r = await run(guard, req);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422); // تعارض بين التوكن و الـ Header = انتحال
  });

  it('يمرر موظفاً إلى مساراته الذاتية فقط', async () => {
    const req = headers(buildReq({ path: '/api/v0.1/self' }), {
      authorization: TOKEN_EMPLOYEE,
      'x-user-id': 'user1',
      'x-request-id': 'req-5',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'employee',
    });
    const r = await run(guard, req);
    expect(r.ok).toBe(true);
  });

  it('المؤسس فقط يمر عبر /sovereign (التجاوز السيادي المشروع)', async () => {
    const founderReq = headers(buildReq({ path: '/api/v0.1/sovereign/diagnose' }), {
      authorization: TOKEN_FOUNDER,
      'x-user-id': 'founder1',
      'x-request-id': 'req-6',
      'x-sovereign-role': 'founder',
    });
    const r1 = await run(guard, founderReq);
    expect(r1.ok).toBe(true);

    const employeeReq = headers(buildReq({ path: '/api/v0.1/sovereign/diagnose' }), {
      authorization: TOKEN_EMPLOYEE,
      'x-user-id': 'user1',
      'x-request-id': 'req-7',
      'x-entity-id': '700-1000001234',
      'x-sovereign-role': 'employee',
    });
    const r2 = await run(guard, employeeReq);
    expect(r2.ok).toBe(false);
    expect(r2.code).toBe(403);
  });

  it('المسارات العامة معفاة من فحص الهوية', async () => {
    const req = buildReq({ path: '/api/v0.1/health', headers: {} });
    const r = await run(guard, req);
    expect(r.ok).toBe(true);
  });
});
