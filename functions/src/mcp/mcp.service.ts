import { HttpException, Injectable } from '@nestjs/common';
import { ParkingService } from '../parking/parking.service';
import { ParkingBay, Persona, RELEASE_REASONS } from '../parking/parking.types';

type Json = Record<string, unknown>;
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Json;
  isError?: boolean;
}

export const READ_ONLY_TOOLS = ['get_parking_summary', 'list_unlocked_bays', 'get_bay_status'];

const bayIdProp = { type: 'string', description: "Bay code such as 'B5-024'. Defaults to the caller's own allocated bay.", pattern: '^[Bb][45]-\\d{3}$' };
const confirmedProp = { type: 'boolean', description: 'Human-in-the-loop gate. Omit to get a preview; set true only after the user explicitly confirms.' };

const TOOLS = [
  {
    name: 'get_parking_summary',
    description: 'Live carpark capacity across Level B4 (HoD & reserved) and Level B5 (open for all): occupancy, unlocked bays, unused dedicated bays and recovered capacity.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_unlocked_bays',
    description: 'Lists bays a commuter can park in right now, nearest to the lift first: released reserved bays plus open FCFS bays. The first one is the recommendation. Optionally filter by level.',
    inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['B4', 'B5'] } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_bay_status',
    description: 'Inspects one bay: owner, release window, current occupant and IoT floor puck telemetry.',
    inputSchema: { type: 'object', properties: { bay_id: { ...bayIdProp, description: "Bay code such as 'B5-024'." } }, required: ['bay_id'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'release_parking_bay',
    description: 'Releases an allocated bay into the FCFS pool for a date range. Mutating: returns a preview unless confirmed is true.',
    inputSchema: {
      type: 'object',
      properties: {
        bay_id: bayIdProp,
        duration_days: { type: 'integer', minimum: 1, maximum: 30, description: 'Number of days starting from start_date (default 1).' },
        start_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Overrides duration_days.' },
        reason: { type: 'string', enum: RELEASE_REASONS },
        notes: { type: 'string', maxLength: 280 },
        confirmed: confirmedProp,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'reclaim_parking_bay',
    description: 'Cancels an active release and returns the bay to its owner. Mutating: returns a preview unless confirmed is true.',
    inputSchema: { type: 'object', properties: { bay_id: bayIdProp, confirmed: confirmedProp }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const text = (t: string, structuredContent?: Json, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(structuredContent ? { structuredContent } : {}), ...(isError ? { isError } : {}) });
const nice = (s: string) => s.replace(/_/g, ' ').toLowerCase();

@Injectable()
export class McpService {
  constructor(private readonly parking: ParkingService) {}

  /** Handles one JSON-RPC message. Returns null for notifications. */
  handle(msg: any, actor: Persona): Json | null {
    const id = msg?.id;
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' } };
    }
    if (id === undefined || id === null) return null; // notification
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
    switch (msg.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'smartpark-mcp', title: 'SmartPark', version: '1.0.0' },
          instructions: 'SmartPark parking tools. Mutating tools are human-in-the-loop gated: call once without `confirmed` to get a preview, show it to the user, then call again with confirmed: true only after they agree.',
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = msg.params?.name;
        const args = (msg.params?.arguments ?? {}) as Json;
        if (typeof name !== 'string' || !TOOLS.some((t) => t.name === name)) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${String(name)}` } };
        }
        try {
          return ok(this.call(name, args, actor));
        } catch (e) {
          const message = e instanceof HttpException ? this.httpMessage(e) : 'The tool failed unexpectedly.';
          return ok(text(message, undefined, true));
        }
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
    }
  }

  private httpMessage(e: HttpException): string {
    const r = e.getResponse();
    const m = typeof r === 'string' ? r : (r as { message?: string | string[] }).message;
    return Array.isArray(m) ? m.join(' ') : (m ?? e.message);
  }

  private ownBayId(args: Json, actor: Persona): string {
    if (typeof args.bay_id === 'string' && args.bay_id) return args.bay_id.toUpperCase();
    const own = this.parking.findBayOwnedBy(actor.email);
    if (!own) throw new HttpException(`${actor.name} has no allocated bay. Pass bay_id explicitly.`, 400);
    return own.id;
  }

  private call(name: string, args: Json, actor: Persona): ToolResult {
    switch (name) {
      case 'get_parking_summary': {
        this.parking.overview();
        const s = this.parking.summary();
        return text(
          [
            `SmartPark live summary (${this.parking.today()})`,
            `Capacity: ${s.total} bays (${s.allocated} allocated, ${s.flex} flex). Occupied ${s.occupied}, available now ${s.availableNow}.`,
            `Level B4 (HoD & reserved): ${s.levels.B4.occupied}/${s.levels.B4.total} occupied, ${s.levels.B4.available} unlocked.`,
            `Level B5 (open for all): ${s.levels.B5.occupied}/${s.levels.B5.total} occupied, ${s.levels.B5.available} available.`,
            `Unused allocated bays (hidden waste): ${s.unusedAllocated}. Unlocked today: ${s.unlockedToday} (${s.reallocated} already reallocated).`,
            ((own, r) => (own ? `Your reserved bay: ${own.id} (${nice(own.status)}).` : r ? `Nearest free bay to the lift right now: ${r.id} (${r.liftDistanceM} m walk).` : 'No bay is free right now.'))(this.parking.findBayOwnedBy(actor.email), this.parking.freeRanking()[0]),
            `Recovered this month: ${s.recoveredBayDays} bay-days, about RM ${s.leaseSavingsRm.toLocaleString('en-MY')} in lease cost avoided.`,
          ].join('\n'),
          s as unknown as Json,
        );
      }
      case 'list_unlocked_bays': {
        this.parking.overview();
        const level = args.level === 'B4' || args.level === 'B5' ? args.level : undefined;
        const bays = this.parking.freeRanking(level); // nearest to the lift first
        // Someone with their own reserved bay keeps it: no nearest-bay suggestion for them.
        const own = this.parking.findBayOwnedBy(actor.email);
        const ownNote = own ? `You have your own reserved bay, ${own.id}${own.releaseInfo ? `, currently released until ${own.releaseInfo.endDate} (reclaim it if you need to park)` : ''}. No suggestion is needed for you; these are the bays open to colleagues.

` : '';
        const line = (b: ParkingBay) =>
          b.status === 'RELEASED_AVAILABLE' ? `${b.id} — released by ${b.ownerName} until ${b.releaseInfo?.endDate} (${nice(b.releaseInfo?.reason ?? '')})` : `${b.id} — open FCFS bay`;
        return text(
          ownNote + (bays.length ? `${bays.length} bay${bays.length === 1 ? '' : 's'} available now${level ? ` on ${level}` : ''}:\n${bays.map((b, i) => `${i + 1}. ${line(b)} · ${b.liftDistanceM} m to the lift${i === 0 && !own ? ' (nearest, recommended)' : ''}`).join('\n')}` : `No bays are available right now${level ? ` on ${level}` : ''}.`),
          { count: bays.length, bays: bays.map((b) => ({ id: b.id, level: b.level, status: b.status, releasedUntil: b.releaseInfo?.endDate ?? null, liftDistanceM: b.liftDistanceM })) },
        );
      }
      case 'get_bay_status': {
        const b = this.parking.getBay(String(args.bay_id ?? ''));
        const lines = [
          `${b.id} — ${b.zone}`,
          `Status: ${nice(b.status)}`,
          b.ownerName ? `Owner: ${b.ownerName} (${b.ownerDepartment}), plate ${b.ownerPlate}` : 'Owner: none (open FCFS bay)',
          b.releaseInfo ? `Release: ${b.releaseInfo.startDate} to ${b.releaseInfo.endDate}, ${nice(b.releaseInfo.reason)}` : 'Release: none',
          b.currentOccupant ? `Occupant: ${b.currentOccupant.name}, plate ${b.currentOccupant.plate}, linked via ${nice(b.currentOccupant.authMethod)}` : 'Occupant: none',
          `Walk to the lift: ${b.liftDistanceM} m`,
          `Floor puck ${b.iotSensor.sensorId}: ${nice(b.iotSensor.state)}, battery ${b.iotSensor.batteryPct}%, RSSI ${b.iotSensor.rssiDbm} dBm`,
        ];
        return text(lines.join('\n'), b as unknown as Json);
      }
      case 'release_parking_bay': {
        const bayId = this.ownBayId(args, actor);
        const input = { startDate: args.start_date, endDate: args.end_date, durationDays: args.duration_days, reason: args.reason, notes: args.notes };
        const plan = this.parking.planRelease(bayId, actor, input);
        if (args.confirmed !== true) {
          return text(
            `CONFIRMATION REQUIRED\nRelease ${plan.bay.id} (${plan.bay.ownerName}) from ${plan.startDate} to ${plan.endDate}, ${plan.days} day${plan.days === 1 ? '' : 's'}, reason: ${nice(plan.reason)}.\nThe bay opens to all staff first-come-first-served for that window. Nothing has changed yet. Call again with confirmed: true once the user agrees.`,
            { requiresConfirmation: true, action: 'release_parking_bay', bayId: plan.bay.id, startDate: plan.startDate, endDate: plan.endDate, days: plan.days, reason: plan.reason },
          );
        }
        const r = this.parking.release(bayId, actor, input);
        return text(`Done. ${r.bay.id} is released from ${plan.startDate} to ${plan.endDate} and is now ${nice(r.bay.status)}. ${r.daysReleased} bay-day${r.daysReleased === 1 ? '' : 's'} added to recovered capacity.`, { bay: r.bay as unknown as Json });
      }
      case 'reclaim_parking_bay': {
        const bayId = this.ownBayId(args, actor);
        const b = this.parking.getBay(bayId);
        if (args.confirmed !== true) {
          if (!b.releaseInfo) return text(`${b.id} is not currently released, so there is nothing to reclaim.`, undefined, true);
          return text(
            `CONFIRMATION REQUIRED\nReclaim ${b.id} and cancel its release (currently ${b.releaseInfo.startDate} to ${b.releaseInfo.endDate}).${b.currentOccupant && b.status === 'OCCUPIED_REALLOCATED' ? ` ${b.currentOccupant.name} is parked there and will be notified to move.` : ''}\nNothing has changed yet. Call again with confirmed: true once the user agrees.`,
            { requiresConfirmation: true, action: 'reclaim_parking_bay', bayId: b.id },
          );
        }
        const r = this.parking.reclaim(bayId, actor);
        return text(`Done. ${r.bay.id} is reclaimed and is now ${nice(r.bay.status)}.${r.notification ? ` ${r.notification}` : ''}`, { bay: r.bay as unknown as Json });
      }
      default:
        throw new HttpException('Unknown tool.', 400);
    }
  }
}
