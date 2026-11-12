import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { liftDistance } from './parking.layout';
import { addDays, buildBaseline, seedCalendar } from './parking.seed';
import {
  AUTH_METHODS,
  AuthMethod,
  BayAllocationStatus,
  CALENDAR_KINDS,
  CalendarEvent,
  CalendarKind,
  ReleaseSuggestion,
  DEPARTMENTS,
  IOT_EVENT_TYPES,
  IotEventType,
  LEASE_RATE_PER_BAY_MONTH,
  ParkingBay,
  ParkingState,
  Persona,
  PERSONAS,
  RELEASE_REASONS,
  ReleaseReason,
  WORKING_DAYS_PER_MONTH,
} from './parking.types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BAY_RE = /^B[45]-\d{3}$/;
const AUTH_LABEL: Record<AuthMethod, string> = { BLE_AUTO: 'BLE auto-pair', ACCESS_CARD_NFC: 'staff access card', PILLAR_QR: 'pillar QR' };

export interface ReleaseInput {
  startDate?: unknown;
  endDate?: unknown;
  durationDays?: unknown;
  reason?: unknown;
  notes?: unknown;
}
export interface CalendarInput {
  title?: unknown;
  kind?: unknown;
  startDate?: unknown;
  durationDays?: unknown;
}
const CALENDAR_ACCOUNT = 'Google Calendar (demo data, not a real Google account)';
const DEFAULT_TITLE: Record<CalendarKind, string> = {
  BUSINESS_TRAVEL: 'Out of office: business trip',
  ANNUAL_LEAVE: 'Out of office: annual leave',
  WORK_FROM_HOME: 'Working from home',
  SITE_VISIT: 'Out of office: site visit',
  IN_OFFICE: 'Meeting at the office',
};

export interface IotInput {
  type?: unknown;
  authMethod?: unknown;
  plate?: unknown;
}

/**
 * Single authority for parking state. In the original design this is Firestore;
 * for this standalone demo it is an in-memory document set persisted to a JSON file.
 */
@Injectable()
export class ParkingService {
  private readonly log = new Logger('ParkingService');
  private readonly file = path.resolve(process.env.DATA_DIR ?? './data', 'state.json');
  private state: ParkingState = { initialized: false, version: 0, nextEventId: 1, recoveredBayDays: 0, bays: {}, events: [] };
  private simCounter = 0;

  constructor() {
    try {
      if (fs.existsSync(this.file)) this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')) as ParkingState;
      // State files written before the lift ranking existed have no distances yet.
      for (const b of Object.values(this.state.bays ?? {})) b.liftDistanceM ??= liftDistance(Number(b.id.slice(3)));
    } catch (e) {
      this.log.error(`Could not read ${this.file}; starting uninitialised. ${(e as Error).message}`);
    }
  }

  // ---------- helpers ----------

  today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  }

  private persist() {
    this.state.version++;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      this.log.error(`Persist failed: ${(e as Error).message}`);
    }
  }

  private logEvent(bayId: string | null, type: string, message: string, actor: string) {
    this.state.events.unshift({ id: this.state.nextEventId++, at: new Date().toISOString(), bayId, type, message, actor });
    if (this.state.events.length > 200) this.state.events.length = 200;
  }

  private requireBay(bayId: string): ParkingBay {
    if (!this.state.initialized) throw new ConflictException('Demo dataset is not initialised yet. Use "Reset Demo Scenario" first.');
    const id = String(bayId).toUpperCase();
    const bay = BAY_RE.test(id) ? this.state.bays[id] : undefined;
    if (!bay) throw new NotFoundException(`Bay ${bayId} does not exist. Bays run from B4-001 to B4-035 and B5-001 to B5-035.`);
    return bay;
  }

  private releaseActive(bay: ParkingBay, today: string): boolean {
    return !!bay.releaseInfo && bay.releaseInfo.startDate <= today && today <= bay.releaseInfo.endDate;
  }

  /** The status this bay has when no vehicle is on it. */
  private baseStatus(bay: ParkingBay, today: string): BayAllocationStatus {
    if (bay.tier === 'FLEX_POOL') return 'FLEX_AVAILABLE';
    return this.releaseActive(bay, today) ? 'RELEASED_AVAILABLE' : 'RESERVED_LOCKED';
  }

  private touch(bay: ParkingBay) {
    const now = new Date().toISOString();
    bay.updatedAt = now;
    bay.iotSensor.lastHeartbeat = now;
  }

  /** Expire finished release windows and activate ones that start today. */
  private applyReleaseWindows(): boolean {
    const today = this.today();
    let changed = false;
    for (const bay of Object.values(this.state.bays)) {
      if (bay.tier !== 'ALLOCATED') continue;
      if (bay.releaseInfo && today > bay.releaseInfo.endDate) {
        bay.releaseInfo = null;
        this.logEvent(bay.id, 'RELEASE_ENDED', `${bay.id} release window ended. Bay returns to ${bay.ownerName}.`, 'System');
        bay.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (bay.iotSensor.state === 'EMPTY') {
        const base = this.baseStatus(bay, today);
        if (bay.status !== base) {
          bay.status = base;
          bay.updatedAt = new Date().toISOString();
          changed = true;
        }
      }
    }
    return changed;
  }

  private canManage(bay: ParkingBay, actor: Persona): boolean {
    return actor.key === 'management' || (!!bay.ownerEmail && bay.ownerEmail === actor.email);
  }

  // ---------- reads ----------

  getBay(bayId: string): ParkingBay {
    if (this.applyReleaseWindows()) this.persist();
    return this.requireBay(bayId);
  }

  findBayOwnedBy(email: string): ParkingBay | undefined {
    return Object.values(this.state.bays).find((b) => b.ownerEmail === email);
  }

  listBays(): ParkingBay[] {
    return Object.values(this.state.bays);
  }

  /**
   * Free bays, nearest to the lift first. This single ranking drives every parking
   * suggestion (web, mobile and Odin); nothing is special-cased for a demo bay.
   * Ties go to Level B5 (open for all), then to the lower bay number.
   */
  freeRanking(level?: 'B4' | 'B5'): ParkingBay[] {
    return this.listBays()
      .filter((b) => b.iotSensor.state === 'EMPTY' && (b.status === 'RELEASED_AVAILABLE' || b.status === 'FLEX_AVAILABLE') && (!level || b.level === level))
      .sort((a, b) => a.liftDistanceM - b.liftDistanceM || b.level.localeCompare(a.level) || a.id.localeCompare(b.id));
  }

  summary() {
    const bays = this.listBays();
    const n = (f: (b: ParkingBay) => boolean) => bays.filter(f).length;
    const by = (s: BayAllocationStatus) => n((b) => b.status === s);
    const empty = (b: ParkingBay) => b.iotSensor.state === 'EMPTY';
    const releasedAvailable = n((b) => b.status === 'RELEASED_AVAILABLE' && empty(b));
    const flexAvailable = n((b) => b.status === 'FLEX_AVAILABLE' && empty(b));
    const reallocated = by('OCCUPIED_REALLOCATED');
    const level = (lv: 'B4' | 'B5') => {
      const l = bays.filter((b) => b.level === lv);
      return {
        total: l.length,
        occupied: l.filter((b) => !empty(b)).length,
        available: l.filter((b) => empty(b) && (b.status === 'RELEASED_AVAILABLE' || b.status === 'FLEX_AVAILABLE')).length,
      };
    };
    const ratePerBayDay = LEASE_RATE_PER_BAY_MONTH / WORKING_DAYS_PER_MONTH;
    return {
      total: bays.length,
      allocated: n((b) => b.tier === 'ALLOCATED'),
      flex: n((b) => b.tier === 'FLEX_POOL'),
      occupied: n((b) => !empty(b)),
      availableNow: releasedAvailable + flexAvailable,
      unusedAllocated: n((b) => b.status === 'RESERVED_LOCKED' && empty(b)),
      releasedAvailable,
      flexAvailable,
      reallocated,
      unlockedToday: by('RELEASED_AVAILABLE') + reallocated,
      pendingAuth: n((b) => b.iotSensor.state === 'VEHICLE_DETECTED_PENDING_AUTH'),
      alerts: by('UNAUTHORIZED_ALERT'),
      recoveredBayDays: this.state.recoveredBayDays,
      leaseSavingsRm: Math.round(this.state.recoveredBayDays * ratePerBayDay),
      leaseRatePerBayMonth: LEASE_RATE_PER_BAY_MONTH,
      workingDaysPerMonth: WORKING_DAYS_PER_MONTH,
      breakdown: {
        occupiedOwner: by('OCCUPIED_OWNER'),
        reallocated,
        releasedOpen: by('RELEASED_AVAILABLE'),
        unusedLocked: by('RESERVED_LOCKED'),
        flexOccupied: by('OCCUPIED_FLEX'),
        flexAvailable: by('FLEX_AVAILABLE'),
        alerts: by('UNAUTHORIZED_ALERT'),
      },
      levels: { B4: level('B4'), B5: level('B5') },
    };
  }

  overview(since?: number) {
    if (this.state.initialized && this.applyReleaseWindows()) this.persist();
    const { initialized, version } = this.state;
    if (since !== undefined && since === version) return { initialized, version, unchanged: true as const };
    if (!initialized) return { initialized, version, today: this.today(), bays: [], summary: null, departments: [], watchlist: [], events: [], calendar: { account: CALENDAR_ACCOUNT, events: [], suggestions: [] }, freeRanking: [], nearestByLevel: { B4: null, B5: null } };

    const bays = this.listBays();
    const departments = DEPARTMENTS.map((department) => {
      const owned = bays.filter((b) => b.ownerDepartment === department);
      return {
        department,
        allocated: owned.length,
        ownerParked: owned.filter((b) => b.status === 'OCCUPIED_OWNER').length,
        unused: owned.filter((b) => b.status === 'RESERVED_LOCKED' && b.iotSensor.state === 'EMPTY').length,
        released: owned.filter((b) => !!b.releaseInfo).length,
        demand: bays.filter((b) => b.currentOccupant?.department === department && (b.status === 'OCCUPIED_REALLOCATED' || b.status === 'OCCUPIED_FLEX')).length,
      };
    });
    const watchlist = bays
      .filter((b) => b.tier === 'ALLOCATED' && b.usage && b.usage.releases30d === 0 && b.usage.occupancy30dPct < 40 && !b.releaseInfo)
      .sort((a, b) => a.usage!.occupancy30dPct - b.usage!.occupancy30dPct)
      .slice(0, 10)
      .map((b) => ({ bayId: b.id, ownerName: b.ownerName, ownerDepartment: b.ownerDepartment, occupancy30dPct: b.usage!.occupancy30dPct, releases30d: b.usage!.releases30d, status: b.status }));

    return { initialized, version, today: this.today(), bays, summary: this.summary(), departments, watchlist, events: this.state.events.slice(0, 40), calendar: this.calendarView(), freeRanking: this.freeRanking().map((b) => ({ bayId: b.id, level: b.level, liftDistanceM: b.liftDistanceM, status: b.status })), nearestByLevel: { B4: this.freeRanking('B4')[0]?.id ?? null, B5: this.freeRanking('B5')[0]?.id ?? null } };
  }

  // ---------- mutations ----------

  /** Validates a release request and returns the normalised window without changing anything. */
  planRelease(bayId: string, actor: Persona, input: ReleaseInput) {
    const bay = this.requireBay(bayId);
    const today = this.today();
    if (bay.tier !== 'ALLOCATED') throw new BadRequestException(`${bay.id} is an open FCFS bay. Only allocated bays can be released.`);
    if (!this.canManage(bay, actor)) throw new ForbiddenException(`Only ${bay.ownerName} (the bay owner) or Facilities can release ${bay.id}.`);
    if (bay.releaseInfo) throw new ConflictException(`${bay.id} is already released until ${bay.releaseInfo.endDate}.`);
    if (bay.status !== 'RESERVED_LOCKED' && bay.status !== 'OCCUPIED_OWNER') throw new ConflictException(`${bay.id} cannot be released while its status is ${bay.status}.`);

    const reason = (input.reason ?? 'BUSINESS_TRAVEL') as ReleaseReason;
    if (!RELEASE_REASONS.includes(reason)) throw new BadRequestException(`reason must be one of ${RELEASE_REASONS.join(', ')}.`);
    const startDate = input.startDate === undefined || input.startDate === null || input.startDate === '' ? today : String(input.startDate);
    if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) throw new BadRequestException('startDate must be a date in YYYY-MM-DD format.');
    let endDate: string;
    if (input.endDate !== undefined && input.endDate !== null && input.endDate !== '') {
      endDate = String(input.endDate);
      if (!DATE_RE.test(endDate) || Number.isNaN(Date.parse(endDate))) throw new BadRequestException('endDate must be a date in YYYY-MM-DD format.');
    } else {
      const days = input.durationDays === undefined || input.durationDays === null ? 1 : Number(input.durationDays);
      if (!Number.isInteger(days) || days < 1) throw new BadRequestException('durationDays must be a whole number of at least 1.');
      endDate = addDays(startDate, days - 1);
    }
    if (startDate < today) throw new BadRequestException('The release cannot start in the past.');
    if (endDate < startDate) throw new BadRequestException('The end date must be on or after the start date.');
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    if (days > 30) throw new BadRequestException('A release can cover at most 30 days.');
    const notes = input.notes === undefined || input.notes === null ? '' : String(input.notes).trim();
    if (notes.length > 280) throw new BadRequestException('Notes can be at most 280 characters.');
    return { bay, startDate, endDate, days, reason, notes };
  }

  release(bayId: string, actor: Persona, input: ReleaseInput) {
    const { bay, startDate, endDate, days, reason, notes } = this.planRelease(bayId, actor, input);
    bay.releaseInfo = { releasedAt: new Date().toISOString(), startDate, endDate, reason, ...(notes ? { notes } : {}) };
    if (bay.iotSensor.state === 'EMPTY') bay.status = this.baseStatus(bay, this.today());
    this.state.recoveredBayDays += days;
    this.touch(bay);
    this.logEvent(bay.id, 'BAY_RELEASED', `${bay.id} released by ${actor.name} for ${days} day${days === 1 ? '' : 's'} (${reason.replace(/_/g, ' ').toLowerCase()}), ${startDate} to ${endDate}.`, actor.name);
    this.persist();
    return { bay, daysReleased: days };
  }

  reclaim(bayId: string, actor: Persona) {
    const bay = this.requireBay(bayId);
    const today = this.today();
    if (!this.canManage(bay, actor)) throw new ForbiddenException(`Only ${bay.ownerName ?? 'the bay owner'} or Facilities can reclaim ${bay.id}.`);
    if (!bay.releaseInfo) throw new ConflictException(`${bay.id} is not currently released.`);

    const occupiedByOther = bay.status === 'OCCUPIED_REALLOCATED' && bay.currentOccupant;
    const from = occupiedByOther ? addDays(today, 1) : today > bay.releaseInfo.startDate ? today : bay.releaseInfo.startDate;
    const unused = Math.max(0, Math.round((Date.parse(bay.releaseInfo.endDate) - Date.parse(from)) / 86_400_000) + 1);
    this.state.recoveredBayDays = Math.max(0, this.state.recoveredBayDays - unused);
    bay.releaseInfo = null;
    if (bay.iotSensor.state === 'EMPTY') bay.status = 'RESERVED_LOCKED';
    this.touch(bay);
    let notification: string | null = null;
    if (occupiedByOther) {
      notification = `${bay.currentOccupant!.name} (${bay.currentOccupant!.plate}) has been notified to move to another open bay. ${bay.id} locks as soon as the car leaves.`;
      this.logEvent(bay.id, 'RECLAIM_NOTICE', notification, 'System');
    }
    this.logEvent(bay.id, 'BAY_RECLAIMED', `${bay.id} reclaimed by ${actor.name}.`, actor.name);
    this.persist();
    return { bay, notification };
  }

  iotEvent(bayId: string, actor: Persona, input: IotInput) {
    const bay = this.requireBay(bayId);
    const today = this.today();
    const type = input.type as IotEventType;
    if (!IOT_EVENT_TYPES.includes(type)) throw new BadRequestException(`type must be one of ${IOT_EVENT_TYPES.join(', ')}.`);
    const authMethod = input.authMethod === undefined || input.authMethod === null ? undefined : (input.authMethod as AuthMethod);
    if (authMethod !== undefined && !AUTH_METHODS.includes(authMethod)) throw new BadRequestException(`authMethod must be one of ${AUTH_METHODS.join(', ')}.`);
    const sensor = bay.iotSensor;
    const base = this.baseStatus(bay, today);

    const arrive = () => {
      sensor.state = 'VEHICLE_DETECTED_PENDING_AUTH';
      this.logEvent(bay.id, 'VEHICLE_ARRIVED', `${sensor.sensorId} detected a vehicle chassis on ${bay.id}. Waiting for identity link.`, sensor.sensorId);
    };

    const link = (method: AuthMethod) => {
      const who = this.resolveOccupant(actor, input.plate);
      const elsewhere = this.listBays().find((b) => b.id !== bay.id && b.currentOccupant?.email === who.email);
      if (elsewhere) throw new ConflictException(`${who.name} is already parked in ${elsewhere.id}. Drive out of that bay first.`);
      if (sensor.state === 'EMPTY') arrive();
      bay.currentOccupant = { ...who, authMethod: method, parkedAt: new Date().toISOString() };
      const isOwner = !!bay.ownerEmail && bay.ownerEmail === who.email;
      if (base === 'FLEX_AVAILABLE') bay.status = 'OCCUPIED_FLEX';
      else if (isOwner) bay.status = 'OCCUPIED_OWNER';
      else if (base === 'RELEASED_AVAILABLE') bay.status = 'OCCUPIED_REALLOCATED';
      else {
        bay.status = 'UNAUTHORIZED_ALERT';
        sensor.state = 'OCCUPIED_UNAUTHORIZED';
        this.logEvent(bay.id, 'UNAUTHORIZED_ALERT', `${who.name} (${who.plate}) parked on locked bay ${bay.id}. Facilities and ${bay.ownerName} alerted.`, sensor.sensorId);
        return;
      }
      sensor.state = 'OCCUPIED_VERIFIED';
      this.logEvent(bay.id, 'IDENTITY_LINKED', `${who.name} (${who.plate}) linked to ${bay.id} via ${AUTH_LABEL[method]}.`, who.name);
    };

    switch (type) {
      case 'VEHICLE_ARRIVED':
        if (sensor.state !== 'EMPTY') throw new ConflictException(`${bay.id} already has a vehicle on it.`);
        if (authMethod === 'BLE_AUTO') link('BLE_AUTO');
        else arrive();
        break;
      case 'LINK_IDENTITY':
        if (sensor.state === 'OCCUPIED_VERIFIED') throw new ConflictException(`${bay.id} is already linked to ${bay.currentOccupant?.name ?? 'a driver'}.`);
        link(authMethod ?? 'ACCESS_CARD_NFC');
        break;
      case 'AUTH_FAILED':
        if (base !== 'RESERVED_LOCKED') throw new ConflictException(`${bay.id} is open to all staff right now, so there is nothing to alert on.`);
        if (sensor.state === 'OCCUPIED_VERIFIED' || sensor.state === 'OCCUPIED_UNAUTHORIZED') throw new ConflictException(`${bay.id} already has a parked vehicle.`);
        sensor.state = 'OCCUPIED_UNAUTHORIZED';
        bay.status = 'UNAUTHORIZED_ALERT';
        bay.currentOccupant = null;
        this.logEvent(bay.id, 'UNAUTHORIZED_ALERT', `Unknown vehicle on locked bay ${bay.id} with no valid credentials. Facilities and ${bay.ownerName} alerted.`, sensor.sensorId);
        break;
      case 'VEHICLE_DEPARTED': {
        if (sensor.state === 'EMPTY') throw new ConflictException(`There is no vehicle on ${bay.id}.`);
        const who = bay.currentOccupant;
        bay.currentOccupant = null;
        sensor.state = 'EMPTY';
        bay.status = base;
        this.logEvent(bay.id, 'AUTO_MOVE_OUT', `${sensor.sensorId} detected ${who ? `${who.plate} leaving` : 'the vehicle leaving'}. ${bay.id} auto-cleared to ${base.replace(/_/g, ' ')} with zero clicks.`, sensor.sensorId);
        break;
      }
    }
    this.touch(bay);
    this.persist();
    return { bay };
  }

  private resolveOccupant(actor: Persona, plateInput: unknown) {
    let plate = plateInput === undefined || plateInput === null || plateInput === '' ? null : String(plateInput).trim().toUpperCase();
    if (plate !== null && !/^[A-Z0-9 ]{2,12}$/.test(plate)) throw new BadRequestException('plate must be 2 to 12 letters, digits or spaces.');
    if (actor.key === 'management') {
      // Facilities has no car of its own: simulate a fresh walk-in staff vehicle each time.
      const n = ++this.simCounter;
      plate ??= `SIM ${1000 + (n % 9000)}`;
      return { email: `sim.driver.${Date.now()}.${n}@smartpark.demo`, name: 'Simulated staff vehicle', department: 'Project Delivery', plate };
    }
    return { email: actor.email, name: actor.name, department: actor.department, plate: plate ?? actor.plate ?? 'UNKNOWN' };
  }

  // ---------- calendar (mock Google Calendar) ----------

  private cal(): CalendarEvent[] {
    if (!this.state.calendar) this.state.calendar = this.state.initialized ? seedCalendar(this.today(), new Date().toISOString()) : [];
    return this.state.calendar;
  }

  /** The release prompt for one calendar entry, or null when there is nothing to ask. */
  private suggestionFor(ev: CalendarEvent): ReleaseSuggestion | null {
    if (!ev.outOfOffice || ev.kind === 'IN_OFFICE' || ev.dismissed || ev.accepted) return null;
    const today = this.today();
    if (ev.endDate < today) return null;
    const bay = this.findBayOwnedBy(ev.ownerEmail);
    if (!bay || bay.releaseInfo || (bay.status !== 'RESERVED_LOCKED' && bay.status !== 'OCCUPIED_OWNER')) return null;
    const startDate = ev.startDate < today ? today : ev.startDate;
    const days = Math.round((Date.parse(ev.endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    return { eventId: ev.id, ownerEmail: ev.ownerEmail, ownerName: bay.ownerName, bayId: bay.id, title: ev.title, startDate, endDate: ev.endDate, days, reason: ev.kind };
  }

  calendarView() {
    const today = this.today();
    const events = this.cal()
      .filter((e) => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    const suggestions = events.map((e) => this.suggestionFor(e)).filter((s): s is ReleaseSuggestion => s !== null);
    return { account: CALENDAR_ACCOUNT, events, suggestions };
  }

  /** Simulates the person adding an entry to their Google Calendar. */
  addCalendarEvent(actor: Persona, input: CalendarInput) {
    if (!this.state.initialized) throw new ConflictException('Demo dataset is not initialised yet. Use "Reset Demo Scenario" first.');
    if (actor.key === 'management') throw new BadRequestException('Facilities is a shared role and has no personal calendar. Switch to Alex or Sarah.');
    const today = this.today();
    const kind = (input.kind ?? 'BUSINESS_TRAVEL') as CalendarKind;
    if (!CALENDAR_KINDS.includes(kind)) throw new BadRequestException(`kind must be one of ${CALENDAR_KINDS.join(', ')}.`);
    const startDate = input.startDate === undefined || input.startDate === null || input.startDate === '' ? today : String(input.startDate);
    if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) throw new BadRequestException('startDate must be a date in YYYY-MM-DD format.');
    if (startDate < today) throw new BadRequestException('The calendar entry cannot start in the past.');
    const days = input.durationDays === undefined || input.durationDays === null ? 1 : Number(input.durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new BadRequestException('durationDays must be a whole number from 1 to 30.');
    const title = (input.title === undefined || input.title === null || String(input.title).trim() === '' ? DEFAULT_TITLE[kind] : String(input.title).trim()).slice(0, 80);
    const cal = this.cal();
    if (cal.length >= 60) cal.splice(0, cal.length - 59);
    const ev: CalendarEvent = { id: `cal-${this.state.nextEventId++}`, ownerEmail: actor.email, title, kind, outOfOffice: kind !== 'IN_OFFICE', startDate, endDate: addDays(startDate, days - 1), createdAt: new Date().toISOString() };
    cal.push(ev);
    const suggestion = this.suggestionFor(ev);
    if (ev.outOfOffice) {
      this.logEvent(
        suggestion?.bayId ?? null,
        'CALENDAR_OOO',
        `Calendar: ${actor.name} is out of office ${ev.startDate} to ${ev.endDate} (\u201c${title}\u201d).${suggestion ? ` Asked whether to release ${suggestion.bayId}.` : ''}`,
        'Google Calendar (demo)',
      );
    }
    this.persist();
    return { event: ev, suggestion };
  }

  removeCalendarEvent(eventId: string, actor: Persona) {
    const cal = this.cal();
    const i = cal.findIndex((e) => e.id === eventId);
    if (i < 0) throw new NotFoundException('That calendar entry no longer exists.');
    if (actor.key !== 'management' && cal[i].ownerEmail !== actor.email) throw new ForbiddenException('You can only remove entries from your own calendar.');
    cal.splice(i, 1);
    this.persist();
    return { ok: true };
  }

  /** The owner's answer to "your calendar says you are away, release your bay?". */
  respondToSuggestion(eventId: string, actor: Persona, accept: boolean) {
    const ev = this.cal().find((e) => e.id === eventId);
    if (!ev) throw new NotFoundException('That calendar entry no longer exists.');
    if (actor.key !== 'management' && ev.ownerEmail !== actor.email) throw new ForbiddenException('Only the bay owner can answer this prompt.');
    const s = this.suggestionFor(ev);
    if (!s) throw new ConflictException('There is nothing to decide for this calendar entry any more.');
    if (!accept) {
      ev.dismissed = true;
      this.logEvent(s.bayId, 'CALENDAR_DECLINED', `${actor.name} chose to keep ${s.bayId} during \u201c${ev.title}\u201d.`, actor.name);
      this.persist();
      return { released: false, bay: this.requireBay(s.bayId) };
    }
    const r = this.release(s.bayId, actor, { startDate: s.startDate, endDate: s.endDate, reason: s.reason, notes: `From calendar: ${ev.title}`.slice(0, 280) });
    ev.accepted = true;
    this.persist();
    return { released: true, bay: r.bay, daysReleased: r.daysReleased };
  }

  setPhotoCoords(bayId: string, body: { xPct?: unknown; yPct?: unknown; clear?: unknown }) {
    const bay = this.requireBay(bayId);
    if (body?.clear === true) bay.photoCoords = null;
    else {
      const x = Number(body?.xPct);
      const y = Number(body?.yPct);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) throw new BadRequestException('xPct and yPct must be numbers between 0 and 100.');
      bay.photoCoords = { xPct: Math.round(x * 10) / 10, yPct: Math.round(y * 10) / 10 };
    }
    bay.updatedAt = new Date().toISOString();
    this.persist();
    return { bay };
  }

  reset(actor: Persona) {
    const version = this.state.version;
    this.state = buildBaseline(this.today(), new Date().toISOString());
    this.state.version = version;
    this.state.events[0].actor = actor.name;
    this.persist();
    return { ok: true, summary: this.summary() };
  }
}

export { PERSONAS };
