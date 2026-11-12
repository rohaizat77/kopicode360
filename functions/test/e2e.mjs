// End-to-end check of the B5-024 demo scenario against a throwaway server instance.
// Usage: npm run build && npm test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3699;
const base = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), 'smartpark-e2e-'));
const server = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, CLIENT_DIST: '/nonexistent' }, stdio: ['ignore', 'pipe', 'inherit'] });

const call = async (method, path, persona, body) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(persona ? { 'x-demo-persona': persona } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
};
const mcp = async (name, args, persona = 'owner') => (await call('POST', '/api/mcp', persona, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).json.result;
const hero = async () => (await call('GET', '/api/parking/overview', 'management')).json.bays.find((b) => b.id === 'B5-024');

let passed = 0;
const step = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
};

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  await step('starts uninitialised (no automatic seeding)', async () => {
    const o = (await call('GET', '/api/parking/overview')).json;
    assert.equal(o.initialized, false);
    assert.equal(o.bays.length, 0);
  });

  await step('reset loads 70 bays, 13 unused allocated, hero bay ready', async () => {
    const r = await call('POST', '/api/parking/demo/reset', 'management');
    assert.equal(r.status, 200);
    const o = (await call('GET', '/api/parking/overview')).json;
    assert.equal(o.bays.length, 70);
    assert.equal(o.summary.allocated, 60);
    assert.equal(o.summary.flex, 10);
    assert.equal(o.summary.unusedAllocated, 13);
    assert.equal(o.bays.filter((b) => b.level === 'B4').length, 35);
    const b = o.bays.find((x) => x.id === 'B5-024');
    assert.equal(b.status, 'RESERVED_LOCKED');
    assert.equal(b.ownerName, 'Alex Tan');
    const sum = Object.values(o.summary.breakdown).reduce((a, n) => a + n, 0);
    assert.equal(sum, 70);
  });

  await step('unchanged poll returns a tiny payload', async () => {
    const o = (await call('GET', '/api/parking/overview')).json;
    const again = (await call('GET', `/api/parking/overview?since=${o.version}`)).json;
    assert.equal(again.unchanged, true);
  });

  await step('commuter cannot release someone else\'s bay', async () => {
    const r = await call('POST', '/api/parking/bays/B5-024/release', 'commuter', { durationDays: 3 });
    assert.equal(r.status, 403);
  });

  await step('non-owner linking to a locked bay raises an unauthorized alert, departure clears it', async () => {
    const r = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'LINK_IDENTITY', authMethod: 'PILLAR_QR' });
    assert.equal(r.json.bay.status, 'UNAUTHORIZED_ALERT');
    assert.equal(r.json.bay.iotSensor.state, 'OCCUPIED_UNAUTHORIZED');
    const d = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'VEHICLE_DEPARTED' });
    assert.equal(d.json.bay.status, 'RESERVED_LOCKED');
  });

  let before;
  await step('owner releases B5-024 for 3 days -> RELEASED_AVAILABLE', async () => {
    before = (await call('GET', '/api/parking/overview')).json.summary;
    const r = await call('POST', '/api/parking/bays/B5-024/release', 'owner', { durationDays: 3, reason: 'BUSINESS_TRAVEL' });
    assert.equal(r.status, 200);
    assert.equal(r.json.bay.status, 'RELEASED_AVAILABLE');
    assert.equal(r.json.daysReleased, 3);
    const s = (await call('GET', '/api/parking/overview')).json.summary;
    assert.equal(s.unusedAllocated, before.unusedAllocated - 1);
    assert.equal(s.recoveredBayDays, before.recoveredBayDays + 3);
    assert.equal(s.availableNow, before.availableNow + 1);
  });

  await step('validation rejects bad input', async () => {
    assert.equal((await call('POST', '/api/parking/bays/B5-024/release', 'owner', { durationDays: 3 })).status, 409);
    assert.equal((await call('POST', '/api/parking/bays/B9-001/reclaim', 'owner')).status, 404);
    assert.equal((await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'NOPE' })).status, 400);
    assert.equal((await call('POST', '/api/parking/bays/B5-030/release', 'management', {})).status, 400);
    assert.equal((await call('GET', '/api/parking/overview', 'hacker')).status, 401);
  });

  await step('car pulls in -> puck detects, pending auth', async () => {
    const r = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'VEHICLE_ARRIVED' });
    assert.equal(r.json.bay.iotSensor.state, 'VEHICLE_DETECTED_PENDING_AUTH');
    assert.equal(r.json.bay.status, 'RELEASED_AVAILABLE');
  });

  await step('identity link -> OCCUPIED_REALLOCATED, verified, linked to Sarah', async () => {
    const r = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'LINK_IDENTITY', authMethod: 'ACCESS_CARD_NFC' });
    assert.equal(r.json.bay.status, 'OCCUPIED_REALLOCATED');
    assert.equal(r.json.bay.iotSensor.state, 'OCCUPIED_VERIFIED');
    assert.equal(r.json.bay.currentOccupant.name, 'Sarah Lim');
    assert.equal(r.json.bay.currentOccupant.plate, 'VKL 8821');
  });

  await step('one driver cannot occupy two bays', async () => {
    const o = (await call('GET', '/api/parking/overview')).json;
    const free = o.bays.find((b) => b.status === 'FLEX_AVAILABLE');
    const r = await call('POST', `/api/parking/bays/${free.id}/iot-event`, 'commuter', { type: 'LINK_IDENTITY' });
    assert.equal(r.status, 409);
  });

  await step('car leaves -> auto-clears to RELEASED_AVAILABLE with no manual checkout', async () => {
    const r = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'VEHICLE_DEPARTED' });
    assert.equal(r.json.bay.status, 'RELEASED_AVAILABLE');
    assert.equal(r.json.bay.currentOccupant, null);
    assert.equal(r.json.bay.iotSensor.state, 'EMPTY');
  });

  await step('BLE auto-pair arrival links in one event; reclaim while occupied notifies and locks on exit', async () => {
    const a = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'VEHICLE_ARRIVED', authMethod: 'BLE_AUTO' });
    assert.equal(a.json.bay.status, 'OCCUPIED_REALLOCATED');
    const r = await call('POST', '/api/parking/bays/B5-024/reclaim', 'owner');
    assert.match(r.json.notification, /Sarah Lim/);
    assert.equal(r.json.bay.status, 'OCCUPIED_REALLOCATED');
    const d = await call('POST', '/api/parking/bays/B5-024/iot-event', 'commuter', { type: 'VEHICLE_DEPARTED' });
    assert.equal(d.json.bay.status, 'RESERVED_LOCKED');
    const s = (await call('GET', '/api/parking/overview')).json.summary;
    assert.equal(s.recoveredBayDays, before.recoveredBayDays + 1); // today was used, 2 unused days handed back
  });

  await step('MCP: initialize, tools/list and read-only tools', async () => {
    const init = (await call('POST', '/api/mcp', 'owner', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json;
    assert.equal(init.result.serverInfo.name, 'smartpark-mcp');
    assert.equal((await call('POST', '/api/mcp', 'owner', { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const list = (await call('POST', '/api/mcp', 'owner', { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json;
    assert.equal(list.result.tools.length, 5);
    assert.match((await mcp('get_parking_summary', {})).content[0].text, /70 bays/);
    assert.match((await mcp('get_bay_status', { bay_id: 'b5-024' })).content[0].text, /Alex Tan/);
    assert.ok((await mcp('list_unlocked_bays', { level: 'B5' })).structuredContent.count > 0);
  });

  await step('MCP: mutating tools are HITL gated', async () => {
    const preview = await mcp('release_parking_bay', { duration_days: 3, reason: 'BUSINESS_TRAVEL' });
    assert.equal(preview.structuredContent.requiresConfirmation, true);
    assert.equal((await hero()).status, 'RESERVED_LOCKED');
    const done = await mcp('release_parking_bay', { duration_days: 3, reason: 'BUSINESS_TRAVEL', confirmed: true });
    assert.match(done.content[0].text, /^Done/);
    assert.equal((await hero()).status, 'RELEASED_AVAILABLE');
    assert.equal((await mcp('release_parking_bay', { confirmed: true }, 'commuter')).isError, true);
    assert.equal((await mcp('reclaim_parking_bay', {})).structuredContent.requiresConfirmation, true);
    await mcp('reclaim_parking_bay', { confirmed: true });
    assert.equal((await hero()).status, 'RESERVED_LOCKED');
  });

  await step('photo pin coordinates are validated and saved', async () => {
    assert.equal((await call('POST', '/api/parking/bays/B5-024/photo-coords', 'owner', { xPct: 140, yPct: 2 })).status, 400);
    const r = await call('POST', '/api/parking/bays/B5-024/photo-coords', 'owner', { xPct: 41.26, yPct: 60 });
    assert.deepEqual(r.json.bay.photoCoords, { xPct: 41.3, yPct: 60 });
  });

  await step('suggestions: free bays are ranked by walk to the lift, and the ranking follows live state', async () => {
    const o = (await call('GET', '/api/parking/overview', 'commuter')).json;
    const r = o.freeRanking;
    assert.ok(r.length >= 2);
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].liftDistanceM <= r[i].liftDistanceM, 'ranking is ascending');
    const free = o.bays.filter((b) => b.iotSensor.state === 'EMPTY' && (b.status === 'RELEASED_AVAILABLE' || b.status === 'FLEX_AVAILABLE'));
    assert.equal(r[0].liftDistanceM, Math.min(...free.map((b) => b.liftDistanceM)));
    for (const lv of ['B4', 'B5']) {
      const onLevel = free.filter((b) => b.level === lv);
      if (onLevel.length) assert.equal(o.bays.find((b) => b.id === o.nearestByLevel[lv]).liftDistanceM, Math.min(...onLevel.map((b) => b.liftDistanceM)));
    }
    // Take the recommended bay: the next nearest one becomes the recommendation.
    await call('POST', `/api/parking/bays/${r[0].bayId}/iot-event`, 'commuter', { type: 'LINK_IDENTITY' });
    const after = (await call('GET', '/api/parking/overview', 'commuter')).json.freeRanking;
    assert.equal(after[0].bayId, r[1].bayId);
    assert.ok(!after.some((x) => x.bayId === r[0].bayId));
    await call('POST', `/api/parking/bays/${r[0].bayId}/iot-event`, 'commuter', { type: 'VEHICLE_DEPARTED' });
    assert.equal((await call('GET', '/api/parking/overview', 'commuter')).json.freeRanking[0].bayId, r[0].bayId);
    // A bay owner is kept on their reserved bay; only people without one get the suggestion.
    const ownerList = (await mcp('list_unlocked_bays', {}, 'owner')).content[0].text;
    assert.match(ownerList, /your own reserved bay, B5-024/);
    assert.ok(!ownerList.includes('recommended'));
    assert.match((await mcp('get_parking_summary', {}, 'owner')).content[0].text, /Your reserved bay: B5-024/);
    assert.match((await mcp('get_parking_summary', {}, 'commuter')).content[0].text, /Nearest free bay to the lift/);
    assert.match((await mcp('list_unlocked_bays', {}, 'commuter')).content[0].text, new RegExp(`1\\. ${r[0].bayId}.*nearest, recommended`));
  });

  await step('calendar: an in-office meeting raises no prompt; out-of-office does', async () => {
    assert.equal((await hero()).status, 'RESERVED_LOCKED');
    const meeting = await call('POST', '/api/calendar/events', 'owner', { kind: 'IN_OFFICE', durationDays: 1 });
    assert.equal(meeting.json.suggestion, null);
    const ooo = await call('POST', '/api/calendar/events', 'owner', { kind: 'BUSINESS_TRAVEL', durationDays: 3, title: 'Business trip to Penang' });
    assert.equal(ooo.json.suggestion.bayId, 'B5-024');
    assert.equal(ooo.json.suggestion.days, 3);
    const o = (await call('GET', '/api/parking/overview', 'owner')).json;
    assert.equal(o.calendar.suggestions.length, 1);
    assert.equal((await hero()).status, 'RESERVED_LOCKED'); // nothing is released without the owner's answer
    assert.equal((await call('POST', `/api/calendar/suggestions/${ooo.json.event.id}/accept`, 'commuter')).status, 403);
    assert.equal((await call('POST', '/api/calendar/events', 'management', {})).status, 400);
    const no = await call('POST', `/api/calendar/suggestions/${ooo.json.event.id}/decline`, 'owner');
    assert.equal(no.json.released, false);
    assert.equal((await call('GET', '/api/parking/overview', 'owner')).json.calendar.suggestions.length, 0);
    assert.equal((await hero()).status, 'RESERVED_LOCKED');
  });

  await step('calendar: accepting the prompt releases the bay for the calendar window', async () => {
    const ooo = await call('POST', '/api/calendar/events', 'owner', { kind: 'ANNUAL_LEAVE', durationDays: 2 });
    const yes = await call('POST', `/api/calendar/suggestions/${ooo.json.event.id}/accept`, 'owner');
    assert.equal(yes.json.released, true);
    assert.equal(yes.json.daysReleased, 2);
    const b = await hero();
    assert.equal(b.status, 'RELEASED_AVAILABLE');
    assert.equal(b.releaseInfo.reason, 'ANNUAL_LEAVE');
    assert.equal((await call('GET', '/api/parking/overview', 'owner')).json.calendar.suggestions.length, 0);
    assert.equal((await call('POST', `/api/calendar/suggestions/${ooo.json.event.id}/accept`, 'owner')).status, 409);
  });

  console.log(`\nAll ${passed} checks passed.`);
} catch (e) {
  console.error(`\nFAILED after ${passed} passing checks:\n`, e);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
