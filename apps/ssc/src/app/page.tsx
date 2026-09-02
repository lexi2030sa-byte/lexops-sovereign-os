import { REGULATORY_DEADLINES } from '@lexops/shared';

/** وحدات المنشأة الظاهرة في الشريط الجانبي (Corporate Workspace) */
const MODULES = [
  { id: 'operations', label: 'العمليات', href: '#operations' },
  { id: 'employees', label: 'الموظفون', href: '/employees' },
  { id: 'attendance', label: 'الحضور', href: '#attendance' },
  { id: 'compliance', label: 'الامتثال', href: '#compliance' },
  { id: 'payroll', label: 'الرواتب', href: '#payroll' },
  { id: 'contracts', label: 'العقود', href: '#contracts' },
];

/** نسب الجهات السيادية (S8 Radar) — قيم تشغيلية افتراضية قابلة للتعديل عبر النبض */
const AGENCY_SCORES = [
  { agency: 'التأمينات الاجتماعية', score: 100 },
  { agency: 'البلدية', score: 100 },
  { agency: 'مكتب العمل', score: 92 },
  { agency: 'الزكاة والضريبة', score: 96 },
  { agency: 'قوى', score: 100 },
];

/** خلاصة LEXI الاستباقية — مهام عاجلة مستخرجة آلياً */
const URGENT_TASKS = [
  {
    tag: 'حرج',
    tagClass: 'critical',
    text: 'تجديد رخصة المنشأة تنتهي خلال 10 أيام — ربط برادار الامتثال.',
  },
  {
    tag: 'إنذار',
    tagClass: 'warning',
    text: `موظف في اليوم ${REGULATORY_DEADLINES.probationMaxDays - 10} من فترة التجربة (${REGULATORY_DEADLINES.probationMaxDays} يوماً).`,
  },
  {
    tag: 'إنذار',
    tagClass: 'warning',
    text: 'شهادة صحية لموظفين (2) تنتهي هذا الشهر — ربط برادار اليقين الصحي.',
  },
];

export default function TenantOwnerDashboard() {
  // متوسط الامتثال العام (S8 Score)
  const avgScore = Math.round(
    AGENCY_SCORES.reduce((acc, a) => acc + a.score, 0) / AGENCY_SCORES.length,
  );

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <h1>غرفة عمليات المنشأة</h1>
        <nav>
          {MODULES.map((m) => (
            <a key={m.id} href={m.href}>
              {m.label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="content">
        <h1>مرحباً، مدير المنشأة</h1>
        <p className="hint">المنشأة: 700-1000001234 — الدمام (Fortress 700)</p>

        <div className="grid">
          <section className="card">
            <h2>رادار الامتثال اللحظي (S8 Score)</h2>
            <div className="score-big">{avgScore}%</div>
            <p className="hint">معدل الامتثال العام للمنشأة</p>
            {AGENCY_SCORES.map((a) => (
              <div key={a.agency} className="agency">
                <span>{a.agency}</span>
                <span className={a.score === 100 ? 'ok' : 'bad'}>{a.score}%</span>
              </div>
            ))}
          </section>

          <section className="card">
            <h2>خلاصة LEXI الاستباقية — المهام العاجلة</h2>
            {URGENT_TASKS.map((t, i) => (
              <div key={i} className="task">
                <span className={`tag ${t.tagClass}`}>{t.tag}</span>
                {t.text}
              </div>
            ))}
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              مستخرجة آلياً من محرك LEXI — المسار النصي + الفلتر الملكي 11438.
            </p>
          </section>
        </div>

        <div className="card">
          <h2>إجراءات سريعة</h2>
          <a className="btn" href="/employees/new" style={{ marginLeft: '0.75rem' }}>
            إضافة موظف جديد (RECRUITER 1.5)
          </a>
          <a className="btn secondary" href="/sovereign/pulse">
            نبض النظام (C9)
          </a>
        </div>
      </main>
    </div>
  );
}
