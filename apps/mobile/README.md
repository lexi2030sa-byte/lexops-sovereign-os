# LexOps Mobile — Flutter Field Ops

تطبيق العمليات الميدانية (Field Ops) — الحضور، التوقيع المكاني، التقاط الأدلة، الربط بـ C9.
يُطوَّر لاحقاً وفق بروتوكول Geo و Anti-Spoofing (Secure Enclave / TEE).

الهيكل (يُستكمل عند بدء التطوير):

```
apps/mobile/
  lib/
    main.dart
    features/
      attendance/
      evidence/
      geofence/
    services/
      api_client.dart
  pubspec.yaml
```

ملاحظة: Flutter غير مُثبَّت في بيئة التهيئة الحالية؛ البناء والتحقق يتمان عند جاهزية الأداة.
