import { notifications } from '@mantine/notifications';
import type { AuthMethod, ParkingBay, ReleaseReason } from '../types';

export type Visual = ParkingBay['status'] | 'PENDING';
export type MapFilter = 'ALL' | 'AVAILABLE' | 'RELEASED' | 'UNUSED' | 'ATTENTION';

export const visualOf = (bay: ParkingBay): Visual => (bay.iotSensor.state === 'VEHICLE_DETECTED_PENDING_AUTH' ? 'PENDING' : bay.status);

export const STATUS_META: Record<Visual, { label: string; short: string; color: string; swatch: string }> = {
  RESERVED_LOCKED: { label: 'Reserved · locked (empty)', short: 'LOCKED', color: 'red', swatch: '#e03131' },
  OCCUPIED_OWNER: { label: 'Owner parked', short: 'OWNER', color: 'dark', swatch: '#495057' },
  RELEASED_AVAILABLE: { label: 'Released · open for FCFS', short: 'OPEN', color: 'teal', swatch: '#10b981' },
  OCCUPIED_REALLOCATED: { label: 'Released · reallocated', short: 'SHARED', color: 'indigo', swatch: '#4263eb' },
  FLEX_AVAILABLE: { label: 'Open FCFS bay · free', short: 'FREE', color: 'green', swatch: '#8ce99a' },
  OCCUPIED_FLEX: { label: 'Open FCFS bay · occupied', short: 'TAKEN', color: 'gray', swatch: '#868e96' },
  UNAUTHORIZED_ALERT: { label: 'Unauthorized vehicle alert', short: 'ALERT', color: 'orange', swatch: '#f76707' },
  PENDING: { label: 'Vehicle detected · awaiting ID link', short: 'ID?', color: 'yellow', swatch: '#fab005' },
};

export const SENSOR_LABEL: Record<ParkingBay['iotSensor']['state'], string> = {
  EMPTY: 'Empty',
  VEHICLE_DETECTED_PENDING_AUTH: 'Vehicle detected · pending auth',
  OCCUPIED_VERIFIED: 'Occupied · verified',
  OCCUPIED_UNAUTHORIZED: 'Occupied · unauthorized',
};

export const REASON_LABEL: Record<ReleaseReason, string> = {
  BUSINESS_TRAVEL: 'Business travel',
  ANNUAL_LEAVE: 'Annual leave',
  WORK_FROM_HOME: 'Work from home',
  SITE_VISIT: 'Site visit',
};

export const AUTH_LABEL: Record<AuthMethod, string> = {
  BLE_AUTO: 'BLE auto-pair',
  ACCESS_CARD_NFC: 'Staff access card (NFC)',
  PILLAR_QR: 'Pillar QR scan',
};

export const isAvailable = (b: ParkingBay) => b.iotSensor.state === 'EMPTY' && (b.status === 'RELEASED_AVAILABLE' || b.status === 'FLEX_AVAILABLE');

export function matchesFilter(bay: ParkingBay | undefined, query: string, filter: MapFilter): boolean {
  if (!bay) return true;
  if (filter === 'AVAILABLE' && !isAvailable(bay)) return false;
  if (filter === 'RELEASED' && !bay.releaseInfo) return false;
  if (filter === 'UNUSED' && !(bay.status === 'RESERVED_LOCKED' && bay.iotSensor.state === 'EMPTY')) return false;
  if (filter === 'ATTENTION' && !(bay.status === 'UNAUTHORIZED_ALERT' || bay.iotSensor.state === 'VEHICLE_DETECTED_PENDING_AUTH')) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [bay.id, bay.ownerName, bay.ownerPlate, bay.ownerDepartment, bay.currentOccupant?.name, bay.currentOccupant?.plate].some((v) => v?.toLowerCase().includes(q));
}

const KL = 'Asia/Kuala_Lumpur';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: KL, hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d: string) => new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-GB', { timeZone: KL, weekday: 'short', day: 'numeric', month: 'short' });
export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Runs an action and reports the outcome as a toast. Returns true on success. */
export async function run(action: () => Promise<unknown>, success?: string | ((result: any) => string | undefined)): Promise<boolean> {
  try {
    const result = await action();
    const message = typeof success === 'function' ? success(result) : success;
    if (message) notifications.show({ color: 'teal', message });
    return true;
  } catch (e) {
    notifications.show({ color: 'red', title: 'That did not work', message: e instanceof Error ? e.message : 'Something went wrong.' });
    return false;
  }
}
