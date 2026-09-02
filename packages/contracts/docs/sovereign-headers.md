# الـ Headers السيادية الموحدة — Sovereign Headers v0.1

المرجع: USDS-02 (LEX-ARCH-2026-ROOT) + وثيقة واجهات النظام + Fortress-700.

كل طلب API إلى LexOps Sovereign OS يجب أن يحمل الـ Headers التالية. غياب أي منها يرفضه
`ScopeGuard` فوراً (قبل الوصول لأي Module).

## 1. Headers إلزامية (Mandatory — يرفض الطلب عند غيابها)

| Header | مثال | الوصف |
| --- | --- | --- |
| `X-Entity-Id` | `700-1000001234` | هوية المنشأة السيادية (Fortress 700). إلزامي لكل الطلبات ما عدا `/auth/*` و `/health` |
| `X-Sovereign-Role` | `founder \| entity_admin \| employee \| freelancer \| field_inspector` | الرتبة السيادية المستخلصة من JWT Custom Claims |
| `X-User-Id` | `DVJIbJSLEbS9n53exTYUdAz1CjH3` | معرف المستخدم السيادي |
| `X-Request-Id` | `UUID v4` | معرف الطلب الفريد للتتبع (يدخل في غلاف الاستجابة الموحد) |
| `Authorization` | `Bearer <JWT>` | توكن الهوية السيادية (Firebase Auth / OAuth2) |

## 2. Headers سياقية (Contextual)

| Header | مثال | الوصف |
| --- | --- | --- |
| `X-Branch-Id` | `brn_001` | معرف الفرع (مطلوب لحضور/موقعيات الإحداثيات) |
| `X-Device-Id` | `dev_android_a1b2` | معرف الجهاز (لربط الهوية المادية والبصمة) |
| `X-Geo-Signature` | `ECDSA_P256:<hex>` | توقيع الإحداثيات من Secure Enclave / TEE (الطبقة المادية) |

## 3. غلاف الاستجابة الموحد (Unified Response Envelope)

المرجع: بروتوكول الاتساق — كل رد يجب أن يتبع الشكل:

```json
{
  "success": true,
  "message": "…",
  "data": {},
  "meta": {
    "requestId": "…",
    "c9Hash": "…",
    "c9EventId": "…"
  }
}
```

- `success`: boolean
- `message`: نص مختصر
- `data`: الحمولة الفعلية
- `meta.requestId`: مطابقة لـ `X-Request-Id`
- `meta.c9Hash` / `meta.c9EventId`: ختم الحدث في سجل C9 عند توثيق العملية

## 4. بنود التوقيع C9 الإلزامي (C9 Seal Requirements)

عند أي عملية تؤدي إلى **كتابة** (CREATE — لأن السجل Append-Only)، يجب أن تعود الاستجابة
بالختم:

- `c9EventId`: معرف الحدث
- `c9Hash`: HMAC-SHA256 للحدث
- `c9BlockIndex`: رقم الكتلة في السلسلة

## 5. رموز الأخطاء السيادية (Sovereign Error Codes)

| الكود | HTTP | المعنى |
| --- | --- | --- |
| `SOV_401` | 401 | هوية غير صالحة |
| `SOV_403` | 403 | تجاوز نطاق الصلاحية (Scope Guard) |
| `SOV_422` | 422 | مدخلات لا تفي بدستور النواة |
| `SOV_409` | 409 | تعارض حالة |
| `SOV_503` | 503 | Fail-soft (بروتوكول الاتساق) |
| `SOV_900` | 500 | حادثة سيادية (تم تسجيلها في C9) |
| `SOV_950` | 409 | Immutable Record — محاولة تعديل سجل غير قابل للتعديل |
