/**
 * @lexops/attendance — جداول PEOPLE/ATTENDANCE + GeoGate
 *
 * المرجع: وثيقة "تطبيق الموظفين" + "الموظف التابع" + التحقق المكاني.
 *
 * المكوّنات:
 *  - GeoGate: بوابة الحضور الجغرافية (Haversine + كشف التزييف + تضارب الزمن)
 *  - AttendanceStore: واجهة التخزين (تُوفّرها Firestore في الإنتاج)
 *  - دوال الحالة: on_time / late / absent + سماحية النطاق 30–50م
 */

export { GeoGate, isLate, statusFor, clampRadius } from './geogate';
export type { AttendanceStore } from './geogate';
export type { GeoIncidentReporter } from './types';
export * from './types';
