/**
 * خدمة الحضور في الخلفية — Attendance Backend Service
 *
 * توفر GeoGate مع مخزن داخلي (يُستبدل بـ Firestore في الإنتاج).
 * مرجع: وثيقة "تطبيق الموظفين" + "الموظف التابع" + التحقق المكاني.
 */

import { Injectable } from '@nestjs/common';
import { C9Ledger, C9Storage, C9Block } from '@lexops/c9-ledger';
import {
  GeoGate,
  AttendanceStore,
  Person,
  AttendanceRecord,
  GateFence,
  GeoIncidentReporter,
} from '@lexops/attendance';

/** مخزن C9 مؤقت داخل الذاكرة — يُستبدل بـ Firestore في الإنتاج */
class MemC9Storage implements C9Storage {
  private blocks: Map<string, C9Block[]> = new Map();

  async getLatestBlock(entityId: string): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.length ? arr[arr.length - 1] : null;
  }

  async appendBlock(block: C9Block): Promise<void> {
    const arr = this.blocks.get(block.event.entityId) ?? [];
    arr.push(block);
    this.blocks.set(block.event.entityId, arr);
  }

  async getBlock(entityId: string, blockIndex: number): Promise<C9Block | null> {
    const arr = this.blocks.get(entityId) ?? [];
    return arr.find((b) => b.blockIndex === blockIndex) ?? null;
  }
}

/** مخزن مؤقت داخل الذاكرة — يُستبدل بـ Firestore (tenants/{tenantId}/staff + attendance) */
class MemAttendanceStore implements AttendanceStore {
  private people = new Map<string, Person>();
  private records = new Map<string, AttendanceRecord[]>();
  private fences = new Map<string, GateFence>();

  async getPerson(userId: string): Promise<Person | null> {
    return this.people.get(userId) ?? null;
  }

  async getTodayRecord(userId: string, entityId: string, date: string): Promise<AttendanceRecord | null> {
    const list = this.records.get(`${entityId}:${userId}`) ?? [];
    return list.find((r) => r.date === date) ?? null;
  }

  async saveRecord(record: AttendanceRecord): Promise<void> {
    const key = `${record.entityId}:${record.userId}`;
    const list = this.records.get(key) ?? [];
    const idx = list.findIndex((r) => r.date === record.date);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this.records.set(key, list);
  }

  async getGateFence(entityId: string): Promise<GateFence | null> {
    return this.fences.get(entityId) ?? null;
  }

  registerPerson(person: Person): void {
    this.people.set(person.userId, person);
  }

  registerFence(fence: GateFence): void {
    this.fences.set(fence.entityId, fence);
  }

  /** عدد الأشخاص المسجلين — لنبض النظام */
  countPeople(): number {
    return this.people.size;
  }
}

@Injectable()
export class AttendanceService {
  readonly geogate: GeoGate;
  readonly store: MemAttendanceStore;
  private readonly ledger: C9Ledger;

  constructor() {
    this.store = new MemAttendanceStore();
    const secret = process.env.C9_HMAC_SECRET ?? 'dev-insecure-fallback';
    this.ledger = new C9Ledger(new MemC9Storage(), secret);
    // ربط الشذوذ الجغرافي بسجل C9 (PH-N2) — كل حادثة تُسجل ككتلة سيادية
    const incidentReporter: GeoIncidentReporter = {
      report: async (incident) => {
        await this.ledger.appendEvent({
          entityId: incident.entityId,
          actorId: incident.userId,
          eventType: `geo_incident:${incident.type}`,
          payload: {
            type: incident.type,
            userId: incident.userId,
            reason: incident.reason,
            reading: incident.reading,
          },
          timestamp: incident.occurredAt,
          legalCode: 'SOV_GEO',
        });
      },
    };
    this.geogate = new GeoGate(this.store, incidentReporter);
  }

  registerPerson(person: Person): void {
    this.store.registerPerson(person);
  }

  registerFence(fence: GateFence): void {
    this.store.registerFence(fence);
  }

  /** عدد الأشخاص المسجلين في المخزن — لنبض النظام */
  get registeredPeople(): number {
    return this.store.countPeople();
  }
}
