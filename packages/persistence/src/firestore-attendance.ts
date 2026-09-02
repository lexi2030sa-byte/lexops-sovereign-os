/**
 * مخزن الحضور عبر Firestore — FirestoreAttendanceStore
 *
 * يطبق AttendanceStore (من @lexops/attendance) على المجموعات:
 *   tenants/{tenantId}/employees/{userId}       — سجل الشخص
 *   tenants/{tenantId}/attendance/{userId:date} — سجل الحضور اليومي
 *   tenants/{tenantId}/branches/{branchId}      — بوابة الفرع الجغرافي
 */

import { AttendanceStore, Person, AttendanceRecord, GateFence } from '@lexops/attendance';
import type { Firestore } from 'firebase-admin/firestore';
import { tenantGroupPath } from './collections';

export class FirestoreAttendanceStore implements AttendanceStore {
  constructor(
    private readonly db: Firestore,
    private readonly tenantId: string,
  ) {}

  async getPerson(userId: string): Promise<Person | null> {
    const snap = await this.db.doc(`${tenantGroupPath(this.tenantId, 'employees')}/${userId}`).get();
    return snap.exists ? (snap.data() as Person) : null;
  }

  async getTodayRecord(userId: string, entityId: string, date: string): Promise<AttendanceRecord | null> {
    const snap = await this.db
      .doc(`${tenantGroupPath(this.tenantId, 'attendance')}/${userId}:${date}`)
      .get();
    return snap.exists ? (snap.data() as AttendanceRecord) : null;
  }

  async saveRecord(record: AttendanceRecord): Promise<void> {
    await this.db
      .doc(`${tenantGroupPath(this.tenantId, 'attendance')}/${record.userId}:${record.date}`)
      .set(record);
  }

  async getGateFence(entityId: string, branchId?: string): Promise<GateFence | null> {
    const id = branchId ?? 'default';
    const snap = await this.db.doc(`${tenantGroupPath(this.tenantId, 'branches')}/${id}`).get();
    return snap.exists ? (snap.data() as GateFence) : null;
  }
}
