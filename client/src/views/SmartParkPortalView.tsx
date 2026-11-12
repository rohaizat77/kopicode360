import { Badge, Button, Grid, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { IconCarOff, IconChartBar, IconLink, IconLock, IconLockOpen, IconRouter, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { ActivityFeed } from '../components/ActivityFeed';
import { CalendarCard } from '../components/CalendarAssist';
import { CarparkMapGrid, MapLegend } from '../components/CarparkMapGrid';
import { CarparkPhotoOverlay } from '../components/CarparkPhotoOverlay';
import { MapFilterBar } from '../components/MapFilterBar';
import { fmtDate, fmtTime, isAvailable, REASON_LABEL, run, STATUS_META, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { HERO_BAY, PERSONAS, type Level } from '../types';

function OwnerBanner() {
  const bay = useParkingStore((s) => s.bays[HERO_BAY]);
  const busy = useParkingStore((s) => s.busy);
  const openRelease = useParkingStore((s) => s.openRelease);
  const selectBay = useParkingStore((s) => s.selectBay);
  const post = useParkingStore((s) => s.post);
  if (!bay) return null;
  const meta = STATUS_META[visualOf(bay)];
  return (
    <Paper radius="md" p="lg" className="sp-banner">
      <Group justify="space-between" align="flex-start" gap="lg">
        <div>
          <Text size="xs" tt="uppercase" fw={800} style={{ color: 'var(--sp-accent)' }}>
            Your Reserved Bay · Level B5
          </Text>
          <Group gap="sm" mt={4}>
            <Title order={2} style={{ color: 'var(--sp-text)' }}>
              {HERO_BAY}
            </Title>
            <Badge color={meta.color} variant="filled" size="lg">
              {meta.label}
            </Badge>
          </Group>
          <Text size="sm" style={{ color: 'var(--sp-text-muted)' }} mt={6}>
            <IconRouter size={14} style={{ verticalAlign: -2 }} /> {bay.iotSensor.sensorId} • {bay.iotSensor.batteryPct}% battery • LoRaWAN sensor active
          </Text>
          {bay.releaseInfo ? (
            <Text size="sm" style={{ color: 'var(--sp-text)' }} mt={6}>
              Released from {fmtDate(bay.releaseInfo.startDate)} to {fmtDate(bay.releaseInfo.endDate)} ({REASON_LABEL[bay.releaseInfo.reason]}).
              {bay.currentOccupant && bay.status === 'OCCUPIED_REALLOCATED' ? ` Currently used by ${bay.currentOccupant.name} (${bay.currentOccupant.plate}).` : ' Unlocked for colleagues.'}
            </Text>
          ) : (
            <Text size="sm" style={{ color: 'var(--sp-text)' }} mt={6}>
              Travelling or working from home? Release your bay with one tap so colleagues can park. It will automatically reclaim when you return.
            </Text>
          )}
        </div>
        <Stack gap="xs" className="sp-banner__actions">
          {!bay.releaseInfo && (bay.status === 'RESERVED_LOCKED' || bay.status === 'OCCUPIED_OWNER') && (
            <Button size="md" color="amber" leftSection={<IconLockOpen size={18} />} onClick={() => openRelease(HERO_BAY)} disabled={busy}>
              Release Bay {HERO_BAY}
            </Button>
          )}
          {bay.releaseInfo && (
            <Button
              size="md"
              color="red"
              leftSection={<IconLock size={18} />}
              disabled={busy}
              onClick={() => void run(() => post<{ notification: string | null }>(`/api/parking/bays/${HERO_BAY}/reclaim`), (r) => r.notification ?? `${HERO_BAY} reclaimed and locked.`)}
            >
              Reclaim Bay {HERO_BAY}
            </Button>
          )}
          <Button variant="default" leftSection={<IconSearch size={16} />} onClick={() => selectBay(HERO_BAY)}>
            Inspect Bay Telemetry
          </Button>
        </Stack>
      </Group>
    </Paper>
  );
}

function CommuterBanner() {
  const bays = useParkingStore((s) => s.bays);
  const summary = useParkingStore((s) => s.summary);
  const busy = useParkingStore((s) => s.busy);
  const post = useParkingStore((s) => s.post);
  const selectBay = useParkingStore((s) => s.selectBay);
  const setLevel = useParkingStore((s) => s.setLevel);
  const me = PERSONAS.commuter;

  // The server ranks free bays by walking distance to the lift; the first one is the suggestion.
  const level = useParkingStore((s) => s.selectedLevel);
  const allRanked = useParkingStore((s) => s.freeRanking);
  const mine = useMemo(() => Object.values(bays).find((b) => b.currentOccupant?.email === me.email), [bays, me.email]);
  // Suggest from the level shown on the map, so the banner and the map always agree
  const { ranking, onThisLevel, otherBest } = useMemo(() => {
    const here = allRanked.filter((r) => r.level === level);
    return { ranking: here.length ? here : allRanked, onThisLevel: here.length > 0, otherBest: here.length ? allRanked.find((r) => r.level !== level) : undefined };
  }, [allRanked, level]);
  const recommended = ranking.length ? bays[ranking[0].bayId] : undefined;

  return (
    <Paper radius="md" p="lg" className="sp-banner">
      <Group justify="space-between" align="flex-start" gap="lg">
        <div>
          <Text size="xs" tt="uppercase" fw={800} style={{ color: 'var(--sp-accent)' }}>
            Available Bays · First-Come, First-Served
          </Text>
          <Group gap="sm" align="baseline" mt={4}>
            <Title order={2} style={{ color: 'var(--sp-text)' }} className="sp-big">
              {summary?.availableNow ?? 0}
            </Title>
            <Text style={{ color: 'var(--sp-text-muted)' }} size="sm">
              bays free right now · {summary?.releasedAvailable ?? 0} released reserved bays + {summary?.flexAvailable ?? 0} open bays
            </Text>
          </Group>
          {mine ? (
            <Text size="sm" style={{ color: 'var(--sp-text)' }} mt={6}>
              You are parked in <strong>{mine.id}</strong> since {fmtTime(mine.currentOccupant!.parkedAt)}. The floor sensor will auto-checkout when you leave.
            </Text>
          ) : recommended ? (
            <Text size="sm" style={{ color: 'var(--sp-text)' }} mt={6}>
              {onThisLevel ? `Nearest free bay to lift on Level ${level}: ` : `Level ${level} is full. Nearest free bay on Level ${recommended.level}: `}
              <strong>{recommended.id}</strong> ({recommended.liftDistanceM}m walk)
              {recommended.status === 'RELEASED_AVAILABLE' ? ` — shared by ${recommended.ownerName} until ${fmtDate(recommended.releaseInfo!.endDate)}.` : ` — open bay.`}
            </Text>
          ) : (
            <Text size="sm" style={{ color: 'var(--sp-text)' }} mt={6}>
              No bays are free right now. Updates automatically when any bay is released or vacated.
            </Text>
          )}
          {!mine && (ranking.length > 1 || otherBest) && (
            <Group gap={6} mt={10} align="center">
              <Text size="xs" style={{ color: 'var(--sp-accent)' }} fw={800} tt="uppercase">
                Next nearest
              </Text>
              {ranking.slice(1, 5).map((r, i) => (
                <button
                  key={r.bayId}
                  type="button"
                  className="sp-rank"
                  onClick={() => {
                    setLevel(r.level);
                    selectBay(r.bayId);
                  }}
                >
                  #{i + 2} {r.bayId} · {r.liftDistanceM}m
                </button>
              ))}
              {otherBest && (
                <button type="button" className="sp-rank sp-rank--alt" onClick={() => setLevel(otherBest.level)}>
                  Level {otherBest.level}: {otherBest.bayId} · {otherBest.liftDistanceM}m
                </button>
              )}
            </Group>
          )}
        </div>
        <Stack gap="xs" className="sp-banner__actions">
          {mine ? (
            <Button size="md" color="amber" variant="light" leftSection={<IconCarOff size={18} />} disabled={busy} onClick={() => void run(() => post(`/api/parking/bays/${mine.id}/iot-event`, { type: 'VEHICLE_DEPARTED' }), `${mine.id} auto-cleared. No checkout needed.`)}>
              Simulate Driving Out ({mine.id})
            </Button>
          ) : (
            recommended && (
              <Button size="md" color="amber" leftSection={<IconLink size={18} />} disabled={busy} onClick={() => void run(() => post(`/api/parking/bays/${recommended.id}/iot-event`, { type: 'LINK_IDENTITY', authMethod: 'ACCESS_CARD_NFC' }), `Linked to ${recommended.id} with plate ${me.plate}.`)}>
                Park at {recommended.id} (Tap Card)
              </Button>
            )
          )}
          {(mine ?? recommended) && (
            <Button
              variant="default"
              leftSection={<IconSearch size={16} />}
              onClick={() => {
                const b = (mine ?? recommended)!;
                setLevel(b.level);
                selectBay(b.id);
              }}
            >
              View {(mine ?? recommended)!.id} Details
            </Button>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

function ManagementBanner() {
  const summary = useParkingStore((s) => s.summary);
  const setView = useParkingStore((s) => s.setView);
  return (
    <Paper radius="md" p="lg" className="sp-banner">
      <Group justify="space-between" gap="lg">
        <div>
          <Text size="xs" tt="uppercase" fw={800} style={{ color: 'var(--sp-accent)' }}>
            Workplace Capacity & Facilities
          </Text>
          <Title order={2} style={{ color: 'var(--sp-text)' }} size="h3" mt={4}>
            {summary?.unusedAllocated ?? 0} reserved bays are currently empty and locked
          </Title>
          <Text size="sm" style={{ color: 'var(--sp-text-muted)' }} mt={4}>
            Inspect real-time sensor occupancy, release bays on owners' behalf, or review cost savings in ParkIQ.
          </Text>
        </div>
        <Button size="md" color="amber" leftSection={<IconChartBar size={18} />} onClick={() => setView('parkiq')}>
          View ParkIQ Analytics
        </Button>
      </Group>
    </Paper>
  );
}

/** Short on phones ("B5 · 6 free"), full on wider screens. */
function LevelLabel({ code, name, free }: { code: string; name: string; free: number }) {
  return (
    <span>
      {code}
      <Text span inherit visibleFrom="sm">
        {' — '}
        {name}
      </Text>
      {' · '}
      {free} free
    </span>
  );
}

export function SmartParkPortalView() {
  const persona = useParkingStore((s) => s.activePersona);
  const level = useParkingStore((s) => s.selectedLevel);
  const setLevel = useParkingStore((s) => s.setLevel);
  const b4 = useParkingStore((s) => s.summary?.levels.B4.available ?? 0);
  const b5 = useParkingStore((s) => s.summary?.levels.B5.available ?? 0);
  const [mode, setMode] = useState<'map' | 'photo'>('map');

  const hasSidebar = persona === 'owner' || persona === 'management';

  return (
    <Stack gap="md">
      {persona === 'owner' ? <OwnerBanner /> : persona === 'commuter' ? <CommuterBanner /> : <ManagementBanner />}
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: hasSidebar ? 8.5 : 12 }}>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm" gap="sm">
              <Title order={3} size="h5">
                Live carpark map
              </Title>
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(v) => setMode(v as 'map' | 'photo')}
                data={[
                  { value: 'map', label: 'Level map' },
                  { value: 'photo', label: 'Photo overlay' },
                ]}
              />
            </Group>
            {mode === 'map' ? (
              <>
                <SegmentedControl
                  fullWidth
                  mb="sm"
                  value={level}
                  onChange={(v) => setLevel(v as Level)}
                  data={[
                    { value: 'B4', label: <LevelLabel code="B4" name="HoD & Reserved" free={b4} /> },
                    { value: 'B5', label: <LevelLabel code="B5" name="Open for All" free={b5} /> },
                  ]}
                />
                <MapFilterBar />
                <CarparkMapGrid level={level} />
                <MapLegend />
                {persona !== 'owner' && (
                <Text size="xs" c="dimmed" mt={6}>
                  The bay marked NEAREST LIFT is the free bay with the shortest walk to the lift on this level. Suggestions always follow that ranking.
                </Text>
                )}
              </>
            ) : (
              <CarparkPhotoOverlay />
            )}
          </Paper>
        </Grid.Col>
        {hasSidebar && (
          <Grid.Col span={{ base: 12, lg: 3.5 }}>
            <Stack gap="md">
              {persona === 'owner' && <CalendarCard />}
              {persona === 'management' && <ActivityFeed />}
            </Stack>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}
