/**
 * @lexops/persistence — طبقة الاستمرارية الحية (PH-N1)
 *
 * المرجع: PH-Next PH-N1 (Firestore حي) — مجموعات Firestore الأساسية الثماني
 * + قواعد الحماية + مخازن تطبق واجهات C9/Attendance/HILAP.
 *
 * المكوّنات:
 *  - FIRESTORE_GROUPS + دوال المسارات المتداخلة (tenants/{tenantId})
 *  - FirestoreC9Storage / FirestoreAttendanceStore / FirestoreHilapStore
 *  - PersistenceFactory + createLiveDb (Service Account / VPC)
 *  - قواعد الحماية: packages/persistence/firestore/rules.firestore
 */

export * from './collections';
export { FirestoreC9Storage } from './firestore-c9';
export { FirestoreAttendanceStore } from './firestore-attendance';
export { FirestoreHilapStore } from './firestore-hilap';
export { createPersistence, createLiveDb } from './factory';
export type { PersistenceBundle } from './factory';
