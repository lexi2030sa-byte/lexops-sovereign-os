import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import {
  API_CONTRACT_V0_1_ENDPOINTS,
  API_V0_1_PREFIX,
  ApiEndpoint,
  SEMANTIC_ERRORS_BY_ENDPOINT,
} from '../src/api/v0_1';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** فحص وجود ملف OpenAPI والتوثيق البشري */
describe('عقد API v0.1 — ملفات المخرجات', () => {
  it('يوجد ملف OpenAPI الرسمي', () => {
    expect(existsSync(path.join(ROOT, 'openapi', 'lexops-api-v0.1.yaml'))).toBe(true);
  });

  it('يوجد التوثيق البشري', () => {
    expect(existsSync(path.join(ROOT, 'docs', 'api-contract-v0.1.md'))).toBe(true);
  });

  it('يبدأ OpenAPI بإصدار 3.0.x ويفتح قسم paths', () => {
    const yaml = readFileSync(path.join(ROOT, 'openapi', 'lexops-api-v0.1.yaml'), 'utf8');
    expect(yaml).toMatch(/^openapi:\s*3\.0\.\d+$/m);
    expect(yaml).toContain('paths:');
    expect(yaml).toContain('components:');
  });
});

/** التحقق من جرد المسارات */
describe('عقد API v0.1 — جرد المسارات الأساسية', () => {
  const paths = API_CONTRACT_V0_1_ENDPOINTS.map((e) => `${e.method} ${e.path}`);

  it('يغطي المسارات الخمسة الحاكمة (SADE/Attendance/HILAP/ZATCA/Pulse)', () => {
    expect(paths).toContain('POST /sade/triggers');
    expect(paths).toContain('POST /attendance/check-in');
    expect(paths).toContain('POST /attendance/check-out');
    expect(paths).toContain('POST /hilap/freeze');
    expect(paths).toContain('POST /hilap/cases');
    expect(paths).toContain('POST /hilap/review');
    expect(paths).toContain('POST /zatca/seal');
    expect(paths).toContain('POST /zatca/verify');
    expect(paths).toContain('GET /sovereign/pulse');
  });

  it('كل مسار له أخطاء سيادية محددة (مع health العام)', () => {
    for (const e of API_CONTRACT_V0_1_ENDPOINTS) {
      if (e.path === '/health') continue;
      expect(e.errors.length).toBeGreaterThan(0);
      expect(e.errors.every((c) => c.startsWith('SOV_'))).toBe(true);
    }
  });

  it('كل مسار له أخطاء دلالية معرّفة أو لا', () => {
    for (const e of API_CONTRACT_V0_1_ENDPOINTS) {
      expect(SEMANTIC_ERRORS_BY_ENDPOINT[e.path]).toBeDefined();
    }
  });

  it('البادئة الحاكمة /api/v0.1', () => {
    expect(API_V0_1_PREFIX).toBe('/api/v0.1');
  });
});

/** التحقق من مخططات الأخطاء */
describe('عقد API v0.1 — مخططات الأخطاء', () => {
  it('يحتوي OpenAPI على رموز SOV_401/403/422 وVALIZATION', () => {
    const yaml = readFileSync(path.join(ROOT, 'openapi', 'lexops-api-v0.1.yaml'), 'utf8');
    expect(yaml).toContain('SOV_401');
    expect(yaml).toContain('SOV_403');
    expect(yaml).toContain('SOV_422');
    expect(yaml).toContain('ApiError');
    expect(yaml).toContain('VALIDATION_ERROR');
  });
});

/** /sovereign/pulse للمؤسس حصراً */
describe('عقد API v0.1 — /sovereign/pulse خاص بالمؤسس', () => {
  it('مسار نبض النظام مخصص للمؤسس فقط في العقد', () => {
    const pulse = API_CONTRACT_V0_1_ENDPOINTS.find((e) => e.path === '/sovereign/pulse');
    expect(pulse).toBeDefined();
    expect(pulse!.allowedRoles).toEqual(['founder']);
    expect(pulse!.method).toBe('GET');
  });

  it('مكتوب في OpenAPI ضمن قسم sovereign', () => {
    const yaml = readFileSync(path.join(ROOT, 'openapi', 'lexops-api-v0.1.yaml'), 'utf8');
    const section = yaml.split('/sovereign/pulse:')[1] ?? '';
    expect(section).toContain('get:');
    expect(section).toContain('مؤسس');
  });
});

/** سلامة أنواع العقد */
describe('عقد API v0.1 — تكامل الأنواع', () => {
  it('كل تعريف مسار يستوفي واجهة ApiEndpoint', () => {
    for (const e of API_CONTRACT_V0_1_ENDPOINTS) {
      const typed: ApiEndpoint = e;
      expect(typeof typed.method).toBe('string');
      expect(typeof typed.path).toBe('string');
      expect(Array.isArray(typed.allowedRoles)).toBe(true);
      expect(Array.isArray(typed.errors)).toBe(true);
    }
  });
});
