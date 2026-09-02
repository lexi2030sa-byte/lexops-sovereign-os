/**
 * مصنع الاستمرارية — PersistenceFactory
 *
 * يبني مخازن Firestore الحية عند توفر الاعتمادات، ويعيد null للتراجع الآمن
 * نحو الذاكرة (لا تكسر التطوير بلا بيئة حية).
 *
 * المرجع: PH-N1 (ربط Firestore الحقيقي) — Service Account داخل VPC في الإنتاج.
 */

import { Firestore } from 'firebase-admin/firestore';
import { hasLiveCredentials } from './collections';
import { FirestoreC9Storage } from './firestore-c9';
import { FirestoreAttendanceStore } from './firestore-attendance';
import { FirestoreHilapStore } from './firestore-hilap';

export interface PersistenceBundle {
  db: Firestore | null;
  tenantId: string;
  live: boolean;
  c9: FirestoreC9Storage | null;
  attendance: FirestoreAttendanceStore | null;
  hilap: FirestoreHilapStore | null;
}

/**
 * تهيئة الحزمة الحية أو التراجع.
 * في الإنتاج: GOOGLE_APPLICATION_CREDENTIALS عبر Secret Manager (VPC).
 */
export function createPersistence(
  db: Firestore | null,
  tenantId: string,
): PersistenceBundle {
  const live = db !== null && hasLiveCredentials();
  return {
    db,
    tenantId,
    live,
    c9: db ? new FirestoreC9Storage(db, tenantId) : null,
    attendance: db ? new FirestoreAttendanceStore(db, tenantId) : null,
    hilap: db ? new FirestoreHilapStore(db, tenantId) : null,
  };
}

/** تهيئة Firestore من الاعتمادات الافتراضية (Service Account) — تعيد null عند غيابها */
export async function createLiveDb(): Promise<Firestore | null> {
  if (!hasLiveCredentials()) return null;
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ credential: applicationDefault() }, 'lexops-live');
  return getFirestore(app);
}
