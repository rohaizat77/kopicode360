export type BayTier = 'ALLOCATED' | 'FLEX_POOL';

export type BayAllocationStatus =
  | 'RESERVED_LOCKED' // Reserved/Dedicated bay; off-limits unless owner releases it
  | 'OCCUPIED_OWNER' // Dedicated owner's car is currently parked here
  | 'RELEASED_AVAILABLE' // Owner released it; temporarily open for all today
  | 'OCCUPIED_REALLOCATED' // Released bay currently occupied by a staff commuter
  | 'FLEX_AVAILABLE' // Level B5 open-for-all FCFS bay available now
  | 'OCCUPIED_FLEX' // Level B5 open-for-all FCFS bay occupied now
  | 'UNAUTHORIZED_ALERT'; // Sensor detected a car in a locked bay without valid auth

export type IoTSensorState = 'EMPTY' | 'VEHICLE_DETECTED_PENDING_AUTH' | 'OCCUPIED_VERIFIED' | 'OCCUPIED_UNAUTHORIZED';

export type ReleaseReason = 'BUSINESS_TRAVEL' | 'ANNUAL_LEAVE' | 'WORK_FROM_HOME' | 'SITE_VISIT';
export type AuthMethod = 'BLE_AUTO' | 'ACCESS_CARD_NFC' | 'PILLAR_QR';
export type IotEventType = 'VEHICLE_ARRIVED' | 'LINK_IDENTITY' | 'VEHICLE_DEPARTED' | 'AUTH_FAILED';

export const RELEASE_REASONS: ReleaseReason[] = ['BUSINESS_TRAVEL', 'ANNUAL_LEAVE', 'WORK_FROM_HOME', 'SITE_VISIT'];
export const AUTH_METHODS: AuthMethod[] = ['BLE_AUTO', 'ACCESS_CARD_NFC', 'PILLAR_QR'];
export const IOT_EVENT_TYPES: IotEventType[] = ['VEHICLE_ARRIVED', 'LINK_IDENTITY', 'VEHICLE_DEPARTED', 'AUTH_FAILED'];

export interface ParkingBay {
  id: string; // e.g. 'B5-024'
  level: 'B4' | 'B5';
  zone: string;
  tier: BayTier;
  status: BayAllocationStatus;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerDepartment: string | null;
  ownerPlate: string | null;
  releaseInfo: {
    releasedAt: string;
    startDate: string;
    endDate: string;
    reason: ReleaseReason;
    notes?: string;
  } | null;
  currentOccupant: {
    email: string;
    name: string;
    department: string;
    plate: string;
    authMethod: AuthMethod;
    parkedAt: string;
  } | null;
  iotSensor: {
    sensorId: string;
    state: IoTSensorState;
    batteryPct: number;
    rssiDbm: number;
    lastHeartbeat: string;
  };
  photoCoords?: { xPct: number; yPct: number } | null;
  /** Mock 30-day history used by the ParkIQ chronic-idle watchlist (allocated bays only). */
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

export type PersonaKey = 'owner' | 'commuter' | 'management';

export interface Persona {
  key: PersonaKey;
  email: string;
  name: string;
  title: string;
  department: string;
  plate: string | null;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  owner: { key: 'owner', email: 'alex.tan@smartpark.demo', name: 'Alex Tan', title: 'Project Director, Engineering', department: 'Engineering', plate: 'WXY 2024' },
  commuter: { key: 'commuter', email: 'sarah.lim@smartpark.demo', name: 'Sarah Lim', title: 'Senior Engineer, Digital & Infra', department: 'Digital', plate: 'VKL 8821' },
  management: { key: 'management', email: 'facilities@smartpark.demo', name: 'Facilities & Workplace Planning', title: 'ParkIQ management view', department: 'Facilities', plate: null },
};

export const HERO_BAY = 'B5-024';
export const DEPARTMENTS = ['Engineering', 'Contracts', 'Finance', 'Digital', 'Project Delivery'];
export const LEASE_RATE_PER_BAY_MONTH = 220;
export const WORKING_DAYS_PER_MONTH = 22;

export interface ParkingState {
  initialized: boolean;
  version: number;
  nextEventId: number;
  recoveredBayDays: number;
  bays: Record<string, ParkingBay>;
  events: ParkingEvent[];
  /** Mock Google Calendar entries. Absent in state files written before this feature. */
  calendar?: CalendarEvent[];
}

export type CalendarKind = ReleaseReason | 'IN_OFFICE';
export const CALENDAR_KINDS: CalendarKind[] = ['BUSINESS_TRAVEL', 'ANNUAL_LEAVE', 'WORK_FROM_HOME', 'SITE_VISIT', 'IN_OFFICE'];

/** One entry from the (mock) Google Calendar of a member of staff. */
export interface CalendarEvent {
  id: string;
  ownerEmail: string;
  title: string;
  kind: CalendarKind;
  /** True when the entry means the person is not coming to the office. */
  outOfOffice: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  /** The owner answered "keep my bay" to the release prompt. */
  dismissed?: boolean;
  /** The owner accepted the prompt and the bay was released. */
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
