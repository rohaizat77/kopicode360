import { liftDistance } from './parking.layout';
import {
  AUTH_METHODS,
  BayAllocationStatus,
  CalendarEvent,
  DEPARTMENTS,
  HERO_BAY,
  ParkingBay,
  ParkingState,
  PERSONAS,
  RELEASE_REASONS,
} from './parking.types';

/** Small deterministic PRNG so the demo baseline is identical after every reset. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional people only. No real employee names.
const FIRST = ['Aiman', 'Farah', 'Wei Jie', 'Mei Ling', 'Arjun', 'Priya', 'Daniel', 'Nurul', 'Hafiz', 'Siti', 'Kumar', 'Li Na', 'Marcus', 'Aisyah', 'Jason', 'Kavitha', 'Zul', 'Hui Min', 'Ravi', 'Amira'];
const LAST = ['Rahman', 'Lee', 'Wong', 'Nair', 'Ismail', 'Chong', 'Pillai', 'Yusof', 'Goh', 'Singh', 'Hassan', 'Ng', 'Omar', 'Teo', 'Bakar'];
const PLATE_PREFIX = ['VKL', 'WXY', 'BQA', 'VDM', 'WCE', 'JSK', 'PNG', 'VFE', 'BRT', 'WA'];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 70 bays: 35 per level.
 * Allocated owner bays: 006-010, 016-018, 024-026, 032-035.
 * Open parking bays: 001-005, 011-015, 019-023, 027-031.
 */
export const BAYS_PER_LEVEL = 35;
export const ALLOCATED_BAY_NUMS = new Set([6, 7, 8, 9, 10, 16, 17, 18, 24, 25, 26, 32, 33, 34, 35]);

export function buildBaseline(today: string, nowIso: string): ParkingState {
  const rnd = mulberry32(20261112);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const people = shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)));
  let personIdx = 0;
  const usedPlates = new Set<string>(['WXY 2024', 'VKL 8821']);
  const person = () => {
    const name = people[personIdx++];
    let plate = '';
    do plate = `${pick(PLATE_PREFIX)} ${int(1000, 9999)}`;
    while (usedPlates.has(plate));
    usedPlates.add(plate);
    return { name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@smartpark.demo`, department: pick(DEPARTMENTS), plate };
  };
  const minutesAgo = (m: number) => new Date(Date.parse(nowIso) - m * 60_000).toISOString();

  const ids: string[] = [];
  for (const level of ['B4', 'B5'] as const) for (let n = 1; n <= BAYS_PER_LEVEL; n++) ids.push(`${level}-${String(n).padStart(3, '0')}`);
  const isAllocated = (id: string) => ALLOCATED_BAY_NUMS.has(Number(id.slice(3)));

  // Allocated bays (15 per level: 006-010, 016-018, 024-026, 032-035)
  const allocated = shuffle(ids.filter((id) => isAllocated(id) && id !== HERO_BAY));
  const statusOf = new Map<string, BayAllocationStatus>([[HERO_BAY, 'RESERVED_LOCKED']]);
  allocated.forEach((id, i) =>
    statusOf.set(
      id,
      i < 6
        ? 'RESERVED_LOCKED'
        : i < 9
          ? 'RELEASED_AVAILABLE'
          : i < 11
            ? 'OCCUPIED_REALLOCATED'
            : 'OCCUPIED_OWNER',
    ),
  );

  // Flex bays (20 per level: 001-005, 011-015, 019-023, 027-031)
  const flex = shuffle(ids.filter((id) => !isAllocated(id) && id !== 'B5-027'));
  statusOf.set('B5-027', 'OCCUPIED_FLEX');
  flex.forEach((id, i) => statusOf.set(id, i < 27 ? 'OCCUPIED_FLEX' : 'FLEX_AVAILABLE'));

  // Ensure 009, 016, 022, 023 are explicitly occupied in dummy data
  statusOf.set('B5-009', 'OCCUPIED_OWNER');
  statusOf.set('B5-016', 'OCCUPIED_OWNER');
  statusOf.set('B5-022', 'OCCUPIED_FLEX');
  statusOf.set('B5-023', 'OCCUPIED_FLEX');

  const chronicIdle = new Set(allocated.slice(0, 4));

  const bays: Record<string, ParkingBay> = {};
  for (const id of ids) {
    const level = id.slice(0, 2) as 'B4' | 'B5';
    const alloc = isAllocated(id);
    const status = statusOf.get(id)!;
    const owner = !alloc ? null : id === HERO_BAY ? PERSONAS.owner : person();
    const occupied = status.startsWith('OCCUPIED');
    const released = status === 'RELEASED_AVAILABLE' || status === 'OCCUPIED_REALLOCATED';

    let currentOccupant: ParkingBay['currentOccupant'] = null;
    if (status === 'OCCUPIED_OWNER' && owner) {
      currentOccupant = { email: owner.email, name: owner.name, department: owner.department, plate: owner.plate!, authMethod: 'BLE_AUTO', parkedAt: minutesAgo(int(30, 240)) };
    } else if (occupied) {
      const p = person();
      currentOccupant = { email: p.email, name: p.name, department: p.department, plate: p.plate, authMethod: pick(AUTH_METHODS), parkedAt: minutesAgo(int(20, 200)) };
    }

    let usage: ParkingBay['usage'] = null;
    if (alloc) {
      if (id === HERO_BAY) usage = { occupancy30dPct: 64, releases30d: 2 };
      else if (chronicIdle.has(id)) usage = { occupancy30dPct: int(6, 34), releases30d: 0 };
      else if (released) usage = { occupancy30dPct: int(45, 75), releases30d: int(1, 4) };
      else if (status === 'RESERVED_LOCKED') usage = { occupancy30dPct: int(42, 68), releases30d: int(0, 1) };
      else usage = { occupancy30dPct: int(70, 98), releases30d: int(0, 2) };
    }

    bays[id] = {
      id,
      level,
      zone: level === 'B4' ? 'Level B4 — HoD & Reserved' : alloc ? 'Level B5 — Designated Bays' : 'Level B5 — Open Parking',
      tier: alloc ? 'ALLOCATED' : 'FLEX_POOL',
      status,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
      ownerDepartment: owner?.department ?? null,
      ownerPlate: owner?.plate ?? null,
      releaseInfo: released
        ? { releasedAt: minutesAgo(int(120, 900)), startDate: today, endDate: addDays(today, int(0, 3)), reason: pick(RELEASE_REASONS) }
        : null,
      currentOccupant,
      iotSensor: {
        sensorId: `PUCK-${id}`,
        state: occupied ? 'OCCUPIED_VERIFIED' : 'EMPTY',
        batteryPct: id === HERO_BAY ? 98 : int(71, 100),
        rssiDbm: id === HERO_BAY ? -68 : -int(58, 92),
        lastHeartbeat: minutesAgo(int(0, 4)),
      },
      photoCoords: null,
      usage,
      liftDistanceM: liftDistance(Number(id.slice(3))),
      updatedAt: nowIso,
    };
  }

  // Three pins that line up with the bundled sample carpark image.
  bays['B5-023'].photoCoords = { xPct: 24, yPct: 70 };
  bays['B5-024'].photoCoords = { xPct: 50, yPct: 70 };
  bays['B5-025'].photoCoords = { xPct: 76, yPct: 70 };

  return {
    initialized: true,
    version: 1,
    nextEventId: 2,
    recoveredBayDays: 46, // mock month-to-date history before the live demo starts
    bays,
    calendar: seedCalendar(today, nowIso),
    events: [{ id: 1, at: nowIso, bayId: null, type: 'DEMO_RESET', message: 'Demo baseline loaded: 70 bays, 13 unused allocated bays, B5-024 ready.', actor: 'System' }],
  };
}

/** Ordinary in-office meetings for Alex, so the calendar is not empty before the demo adds an out-of-office entry. */
export function seedCalendar(today: string, nowIso: string): CalendarEvent[] {
  const mk = (n: number, title: string, offset: number): CalendarEvent => ({
    id: `cal-seed-${n}`,
    ownerEmail: PERSONAS.owner.email,
    title,
    kind: 'IN_OFFICE',
    outOfOffice: false,
    startDate: addDays(today, offset),
    endDate: addDays(today, offset),
    createdAt: nowIso,
  });
  return [mk(1, 'Weekly project sync (HQ, Level 12)', 0), mk(2, 'Design review with Contracts', 1), mk(3, 'Client workshop (HQ boardroom)', 6)];
}
