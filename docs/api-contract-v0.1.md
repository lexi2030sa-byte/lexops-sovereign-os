# عقد API السيادي v0.1 — Sovereign API Contract v0.1

**المرجع:** الأمر التنفيذي `LEXOPS-T6-API-CONTRACT-01`
**الحالة:** معتمد — البادئة الحاكمة `/api/v0.1`
**الملف الرسمي:** [`openapi/lexops-api-v0.1.yaml`](../openapi/lexops-api-v0.1.yaml)

---

## 1. المبدأ

يُثبَّت هذا العقد قبل أي واجهة مستخدم أو تكامل خارجي. الحاكمات:

- **Fortress 700**: عزل تام بين المنشآت — لا وصول متقاطع إطلاقاً.
- **غلاف الاستجابة الموحد** `SovereignEnvelope`: `{ success, message, data, meta }`.
- **الرؤوس السيادية الإلزامية** لكل مسار محمي (عبر ScopeGuard):
  `Authorization` (Bearer JWT)، `X-User-Id`، `X-Entity-Id`، `X-Request-Id`، `X-Sovereign-Role`.
- **لا اختراع صلاحيات**: كل دور مذكور هنا موثق في السجل الحالي (`identity.ts` / `scope.ts`).

---

## 2. جرد المسارات الموثقة

| # | الطريقة | المسار | الغرض السيادي | الأدوار المصرح بها |
|---|---------|--------|----------------|---------------------|
| 1 | POST | `/sade/triggers` | تدفق التوثيق الذاتي: تقييم قاعدة → مستند مختوم HMAC → كتلة C9 | founder, entity_admin, hr_manager, compliance_officer, field_inspector, legal_advisor, payroll_officer |
| 2 | POST | `/attendance/check-in` | تسجيل حضور عبر GeoGate (Haversine + كشف التزييف) | employee, freelancer |
| 3 | POST | `/attendance/check-out` | تسجيل انصراف عبر GeoGate | employee, freelancer |
| 4 | POST | `/hilap/freeze` | تجميد قرار دون عتبة LEXI (مسار تحكيم حصري) | founder, entity_admin, hr_manager, compliance_officer, field_inspector, legal_advisor, payroll_officer |
| 5 | POST | `/hilap/cases` | فتح قضية نقض حظر (المرحلة 1) | founder, entity_admin, hr_manager, compliance_officer, field_inspector, legal_advisor |
| 6 | POST | `/hilap/review` | مراجعة مرحلة لاحقة من التحكيم | founder, entity_admin, hr_manager, compliance_officer, field_inspector, legal_advisor |
| 7 | POST | `/zatca/seal` | ختم فاتورة إلكترونية (UBL 2.1 + هاش + QR-TLV) | founder, entity_admin, hr_manager, compliance_officer, payroll_officer |
| 8 | POST | `/zatca/verify` | التحقق من ختم فاتورة | founder, entity_admin, hr_manager, compliance_officer, field_inspector, legal_advisor, payroll_officer |
| 9 | GET | `/sovereign/pulse` | نبض النظام الشامل — **مؤسس حصراً** (مسار `/sovereign/`) | founder |
| 10 | GET | `/health` | فحص الصحة العامة — مسار عام (بلا هوية) | — |

---

## 3. رموز الأخطاء

### 3.1 الأخطاء السيادية (HTTP)

| الرمز | HTTP | المعنى |
|-------|------|--------|
| `SOV_401` | 401 | غياب/فساد الهوية السيادية (Authorization أو X-User-Id أو X-Request-Id) |
| `SOV_403` | 403 | تجاوز نطاق الصلاحية — Cross-tenant / دور غير مصرح / مسار `/sovereign/` لغير المؤسس |
| `SOV_422` | 422 | رتبة سيادية غير معروفة أو تعارض بين الـ Headers والتوكن (انتحال) |
| `SOV_409` | 409 | تعارض حالة (مثل حصانة C9) |
| `SOV_503` | 503 | خدمة غير متاحة |
| `SOV_900` | 500 | خطأ داخلي |
| `SOV_950` | 409 | Immutable Record — يحظر تعديل/حذف سجلات C9 |

### 3.2 الأخطاء الدلالية (ضمن `message` / الحالة)

| الرمز | المسارات المتوقعة | المعنى |
|-------|-------------------|--------|
| `VALIDATION_ERROR` | attendance، hilap، zatca | حقل مفقود أو غير صالح |
| `MISSING_RULE` | sade | القاعدة غير موجودة في محرك القواعد |
| `UNCERTAIN_DECISION` | sade، hilap | الثقة دون عتبة القرار الآلي |
| `FROZEN_DECISION` | sade، hilap | القرار مجمّد بانتظار تحكيم بشري |
| `HMAC_INVALID` | zatca | ختم/هاش الفاتورة غير متطابق |
| `C9_LEDGER_MISSING` | sade، attendance، hilap | غياب سجل/كتلة C9 المرجعية |

---

## 4. الرؤوس السيادية (ScopeGuard)

```text
Authorization:  Bearer <JWT Custom Claims>
X-User-Id:      <userId>
X-Entity-Id:    <الرقم الموحد 700>      # إلزامي لكل مسار محمي (عدا المؤسس)
X-Request-Id:   <uuid>
X-Sovereign-Role: <founder|entity_admin|hr_manager|compliance_officer|field_inspector|legal_advisor|payroll_officer|employee|freelancer>
```

**SOV_403 يبقى ثابتاً**: لا يُغيَّر سلوكه في هذا العقد — أي مسار خارج نطاق دور الطالب يُرفض.

---

## 5. ملاحظات على المسارات

- **`/sovereign/pulse`**: مؤكد كمسار مؤسس فقط — ScopeGuard يرفض أي دور آخر بـ `SOV_403` (تحقّق حي في الاختبارات).
- **`/attendance/*`**: عند رفض GeoGate، تستجيب بـ `success: false` (داخل الغلاف) و`data.reason` من: `mock_spoofed | abnormal_speed | outside_fence | clock_skew | absent`.
- **`/hilap/review`**: تسلسل المراحل إلزامي (تجاوز المرحلة = رفض)، والأدوار مقيدة بمصفوفة المرحلة.

---

## 6. الأنواع المشتركة

الأنواع المشتركة للعقد في `packages/contracts/src/api/v0_1.ts` (مُصدَّرة من `@lexops/contracts`):

- `ApiEndpoint` — تعريف مسار (method/path/الأدوار/الأخطاء)
- `API_CONTRACT_V0_1_ENDPOINTS` — جرد المسارات الموثقة
- `SovereignErrorCode`, `ApiSemanticError` — رموز الأخطاء
- `ApiErrorEnvelope` — غلاف الخطأ

---

## 7. الفجوات المسجلة (GAPs)

> تُوثَّق الفروقات بين الكود الحالي والعقد **دون إصلاح جذري** — لا كسر للاختبارات.

1. **التحقق من الرؤوس في OpenAPI**: العقد يفرض الرؤوس سيادياً عبر `securitySchemes`، لكن التنفيذ الفعلي يتم في ScopeGuard وليس في وثيقة OpenAPI (طبيعة كل من الأداتين). لا GAP تشغيلي.
2. **`C9_LEDGER_MISSING` / `HMAC_INVALID`**: الأخطاء الدلالية معرّفة في العقد لكن التنفيذ الحالي يلقي `HttpException(400)` بنص حر. **GAP:** موحّدة الرموز الدلالية في `message` لم تُطبَّق بعد — تُسجَّل وتُؤجل لمرحلة لاحقة.
3. **`/hilap/freeze` لا يتطلب `X-Entity-Id`** في التنفيذ (لا قراءة entityId فيه) — العقد يعكس ذلك (`requiresEntityId: false`). متسق، لا GAP.

---

## 8. الملفات

| الملف | الوصف |
|-------|-------|
| `openapi/lexops-api-v0.1.yaml` | مواصفة OpenAPI 3.0.3 الرسمية |
| `docs/api-contract-v0.1.md` | هذا التوثيق البشري |
| `packages/contracts/src/api/v0_1.ts` | الأنواع المشتركة للعقد |
| `packages/contracts/test/api-contract.spec.ts` | اختبارات العقد |
