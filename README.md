# LexOps Sovereign OS — نظام التشغيل القانوني السيادي

بنية سيادية موحدة لحوسبة الأنظمة السعودية (قوى / مكتب العمل / التأمينات / ZATCA / البلدية)
وفق المرجع **USDS-02 (LEX-ARCH-2026-ROOT)**.

## البنية (Monorepo — pnpm workspaces)

```
lexops-sovereign-os/
├── apps/
│   ├── backend/    # NestJS Modular Monolith (API v0.1 + ScopeGuard)
│   ├── ssc/        # Next.js 14 — Sovereign State Console
│   ├── console/    # Founder Console (تجاوز سيادي مشروع)
│   └── mobile/     # Flutter — Field Ops (لاحقاً)
├── packages/
│   ├── contracts/  # مواصفة API v0.1 + الـ Headers السيادية (Contract-First)
│   ├── shared/     # دوستور النواة — الثوابت والعتبات
│   ├── c9-ledger/  # نخاع C9 — سجل Append-Only بسلاسل هاشات
│   ├── rule-engine/# محرك قواعد الامتثال (JSON Logic)
│   ├── lexi/       # محرك الاستدلال LEXI — Triple-Path
│   ├── geofencing/ # محرك Geo — Haversine + كشف التزييف
│   └── govlink/    # بوابة الربط الحكومي (تُبنى الآن، تُفعَّل بعد الموافقة)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## الأوامر

```bash
pnpm install
pnpm build
pnpm contracts:validate
```

## ملاحظة سيادية

قبل أي كود سيادي تنفيذي (ربط حكومي، توطين إلزامي) تُرفع الاستفسارات التقنية للمؤسس
(سياسة Zero-Assumption) — راجع `packages/contracts/docs/sovereign-headers.md` والملاحظات
المضمّنة في كل حزمة.
