// Mirrors functions/src/parking/parking.types.ts
export type BayTier = 'ALLOCATED' | 'FLEX_POOL';
export type BayAllocationStatus =
  | 'RESERVED_LOCKED'
  | 'OCCUPIED_OWNER'
  | 'RELEASED_AVAILABLE'
  | 'OCCUPIED_REALLOCATED'
  | 'FLEX_AVAILABLE'
  | 'OCCUPIED_FLEX'
  | 'UNAUTHORIZED_ALERT';
export type IoTSensorState = 'EMPTY' | 'VEHICLE_DETECTED_PENDING_AUTH' | 'OCCUPIED_VERIFIED' | 'OCCUPIED_UNAUTHORIZED';
export type ReleaseReason = 'BUSINESS_TRAVEL' | 'ANNUAL_LEAVE' | 'WORK_FROM_HOME' | 'SITE_VISIT';
export type AuthMethod = 'BLE_AUTO' | 'ACCESS_CARD_NFC' | 'PILLAR_QR';
export type PersonaKey = 'commuter' | 'owner' | 'management';
export type Level = 'B4' | 'B5';

export interface ParkingBay {
  id: string;
  level: Level;
  zone: string;
  tier: BayTier;
  status: BayAllocationStatus;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerDepartment: string | null;
  ownerPlate: string | null;
  releaseInfo: { releasedAt: string; startDate: string; endDate: string; reason: ReleaseReason; notes?: string } | null;
  currentOccupant: { email: string; name: string; department: string; plate: string; authMethod: AuthMethod; parkedAt: string } | null;
  iotSensor: { sensorId: string; state: IoTSensorState; batteryPct: number; rssiDbm: number; lastHeartbeat: string };
  photoCoords?: { xPct: number; yPct: number } | null;
  usage: { occupancy30dPct: number; releases30d: number } | null;
  /** Walking distance from this bay to the lift lobby in metres (mock survey figure). */
  liftDistanceM: number;
  updatedAt: string;
}

export interface ParkingEvent {
  id: number;
  at: string;
  bayId: string | null;
  type: string;
  message: string;
  actor: string;
}

export interface Summary {
  total: number;
  allocated: number;
  flex: number;
  occupied: number;
  availableNow: number;
  unusedAllocated: number;
  releasedAvailable: number;
  flexAvailable: number;
  reallocated: number;
  unlockedToday: number;
  pendingAuth: number;
  alerts: number;
  recoveredBayDays: number;
  leaseSavingsRm: number;
  leaseRatePerBayMonth: number;
  workingDaysPerMonth: number;
  breakdown: { occupiedOwner: number; reallocated: number; releasedOpen: number; unusedLocked: number; flexOccupied: number; flexAvailable: number; alerts: number };
  levels: Record<Level, { total: number; occupied: number; available: number }>;
}

export interface DepartmentRow {
  department: string;
  allocated: number;
  ownerParked: number;
  unused: number;
  released: number;
  demand: number;
}

export interface WatchRow {
  bayId: string;
  ownerName: string | null;
  ownerDepartment: string | null;
  occupancy30dPct: number;
  releases30d: number;
  status: BayAllocationStatus;
}

export interface Overview {
  initialized: boolean;
  version: number;
  unchanged?: true;
  today: string;
  bays: ParkingBay[];
  summary: Summary | null;
  departments: DepartmentRow[];
  watchlist: WatchRow[];
  events: ParkingEvent[];
  calendar: CalendarView;
  /** Free bays, nearest to the lift first. Every suggestion comes from this list. */
  freeRanking: FreeRank[];
  nearestByLevel: Record<Level, string | null>;
}

export interface FreeRank {
  bayId: string;
  level: Level;
  liftDistanceM: number;
  status: BayAllocationStatus;
}

export interface Persona {
  key: PersonaKey;
  email: string;
  name: string;
  title: string;
  department: string;
  plate: string | null;
  short: string;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  commuter: { key: 'commuter', email: 'sarah.lim@smartpark.demo', name: 'Sarah Lim', title: 'Senior Engineer, Digital & Infra', department: 'Digital', plate: 'VKL 8821', short: 'Commuter' },
  owner: { key: 'owner', email: 'alex.tan@smartpark.demo', name: 'Alex Tan', title: 'Project Director, Engineering', department: 'Engineering', plate: 'WXY 2024', short: 'Bay Owner' },
  management: { key: 'management', email: 'facilities@smartpark.demo', name: 'Facilities Management', title: 'ParkIQ Management & Admin', department: 'Facilities', plate: null, short: 'Admin' },
};

export const HERO_BAY = 'B5-024';

export type CalendarKind = ReleaseReason | 'IN_OFFICE';

export interface CalendarEvent {
  id: string;
  ownerEmail: string;
  title: string;
  kind: CalendarKind;
  outOfOffice: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  dismissed?: boolean;
  accepted?: boolean;
}

export interface ReleaseSuggestion {
  eventId: string;
  ownerEmail: string;
  ownerName: string | null;
  bayId: string;
  title: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: ReleaseReason;
}

export interface CalendarView {
  account: string;
  events: CalendarEvent[];
  suggestions: ReleaseSuggestion[];
}
