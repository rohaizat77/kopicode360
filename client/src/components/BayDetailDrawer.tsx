import { Alert, Badge, Box, Button, Divider, Drawer, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconCarOff, IconCarGarage, IconLockOpen, IconLock, IconRouter } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { fmtDate, fmtTime, REASON_LABEL, run, SENSOR_LABEL, STATUS_META, timeAgo, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { PERSONAS } from '../types';

function Field({ label, children, secondary }: { label: string; children: ReactNode; secondary?: boolean }) {
  return (
    <Box visibleFrom={secondary ? 'sm' : undefined}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" fw={500} component="div">
        {children}
      </Text>
    </Box>
  );
}

export function BayDetailDrawer() {
  const bayId = useParkingStore((s) => s.selectedBayId);
  const bay = useParkingStore((s) => (s.selectedBayId ? s.bays[s.selectedBayId] : undefined));
  const persona = useParkingStore((s) => PERSONAS[s.activePersona]);
  const today = useParkingStore((s) => s.today);
  const busy = useParkingStore((s) => s.busy);
  const selectBay = useParkingStore((s) => s.selectBay);
  const openRelease = useParkingStore((s) => s.openRelease);
  const post = useParkingStore((s) => s.post);
  const isMobile = useMediaQuery('(max-width: 48em)');

  const body = () => {
    if (!bay) return null;
    const visual = visualOf(bay);
    const meta = STATUS_META[visual];
    const sensor = bay.iotSensor;
    const isAdmin = persona.key === 'management';
    const canManage = isAdmin || bay.ownerEmail === persona.email;
    const releaseActive = !!bay.releaseInfo && bay.releaseInfo.startDate <= today && today <= bay.releaseInfo.endDate;
    const lockedBase = bay.tier === 'ALLOCATED' && !releaseActive;
    const iot = (payload: Record<string, unknown>, ok: string) => run(() => post(`/api/parking/bays/${bay.id}/iot-event`, payload), ok);
    const who = isAdmin ? 'a simulated staff vehicle' : persona.name;

    const isOwner = isAdmin || (bay.tier === 'ALLOCATED' && bay.ownerEmail === persona.email);
    const isOccupantMe =
      bay.currentOccupant?.email === persona.email ||
      (!!persona.plate && bay.currentOccupant?.plate === persona.plate);
    const canSeeOccupant = isAdmin || isOccupantMe;

    return (
      <Stack gap="md">
        <Group gap="xs">
          <Badge color={meta.color} size="lg" variant="filled">
            {meta.label}
          </Badge>
          <Badge variant="outline" color="gray">
            {bay.tier === 'ALLOCATED' ? 'Allocated bay' : 'Flex pool'}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {bay.zone}
        </Text>

        {bay.status === 'UNAUTHORIZED_ALERT' && (
          <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Unauthorized vehicle">
            A vehicle is on this locked bay without the owner's credentials. Facilities and {isOwner ? bay.ownerName : 'the bay owner'} have been alerted.
          </Alert>
        )}

        {bay.tier === 'ALLOCATED' && (
          <>
            <SimpleGrid cols={2} spacing="sm">
              <Field label="Owner">{isOwner ? (bay.ownerName ?? 'None · open to all') : '—'}</Field>
              <Field label="Department">{isOwner ? (bay.ownerDepartment ?? '—') : '—'}</Field>
              <Field label="Owner plate">{isOwner ? (bay.ownerPlate ?? '—') : '—'}</Field>
              <Field label="Walk to lift">{bay.liftDistanceM} m</Field>
              <Field label="30-day use">
                {isOwner && bay.usage
                  ? `${bay.usage.occupancy30dPct}% occupied · ${bay.usage.releases30d} release${bay.usage.releases30d === 1 ? '' : 's'}`
                  : '—'}
              </Field>
            </SimpleGrid>

            <Divider label="Release window" labelPosition="left" />
            {bay.releaseInfo ? (
              <Box>
                <Text size="sm" fw={600}>
                  {fmtDate(bay.releaseInfo.startDate)} to {fmtDate(bay.releaseInfo.endDate)} · {REASON_LABEL[bay.releaseInfo.reason]}
                </Text>
                <Text size="xs" c="dimmed">
                  Released {timeAgo(bay.releaseInfo.releasedAt)}
                  {bay.releaseInfo.notes ? ` · “${bay.releaseInfo.notes}”` : ''}
                </Text>
              </Box>
            ) : (
              <Text size="sm" c="dimmed">
                Not released. Only the owner may park here.
              </Text>
            )}
          </>
        )}

        {bay.tier === 'FLEX_POOL' && (
          <SimpleGrid cols={2} spacing="sm">
            <Field label="Parking Type">Open Free Parking (FCFS)</Field>
            <Field label="Walk to lift">{bay.liftDistanceM} m</Field>
          </SimpleGrid>
        )}

        <Divider label={isOccupantMe && !isAdmin ? 'Your parking session' : 'Current occupant'} labelPosition="left" />
        {bay.currentOccupant ? (
          <SimpleGrid cols={2} spacing="sm">
            <Field label="Driver">{canSeeOccupant ? bay.currentOccupant.name : '—'}</Field>
            <Field label="Plate">{canSeeOccupant ? bay.currentOccupant.plate : '—'}</Field>
            <Field label="Parked at">{canSeeOccupant ? fmtTime(bay.currentOccupant.parkedAt) : '—'}</Field>
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">
            {sensor.state === 'EMPTY' ? 'No vehicle on this bay.' : 'Vehicle present, identity not linked.'}
          </Text>
        )}

        {isAdmin && (
          <>
            <Divider
              label={
                <Group gap={6}>
                  <IconRouter size={14} /> LoRaWAN + BLE floor puck
                </Group>
              }
              labelPosition="left"
            />
            <SimpleGrid cols={2} spacing="sm">
              <Field label="Sensor state">
                <Group gap={6} wrap="nowrap">
                  <span className="sp-led sp-led--inline" data-sensor={sensor.state} />
                  {SENSOR_LABEL[sensor.state]}
                </Group>
              </Field>
              <Field label="Battery">{sensor.batteryPct}%</Field>
              <Field label="Last heartbeat">{timeAgo(sensor.lastHeartbeat)}</Field>
              <Field label="Signal RSSI" secondary>
                {sensor.rssiDbm} dBm
              </Field>
              <Field label="Sensor ID" secondary>
                {sensor.sensorId}
              </Field>
            </SimpleGrid>
          </>
        )}

        <Divider label="Actions" labelPosition="left" />
        <Stack gap="xs">
          {bay.tier === 'ALLOCATED' && canManage && !bay.releaseInfo && (bay.status === 'RESERVED_LOCKED' || bay.status === 'OCCUPIED_OWNER') && (
            <Button color="amber" leftSection={<IconLockOpen size={18} />} onClick={() => openRelease(bay.id)} disabled={busy}>
              Release bay {bay.id}
            </Button>
          )}
          {bay.releaseInfo && canManage && (
            <Button
              color="red"
              variant="light"
              leftSection={<IconLock size={18} />}
              disabled={busy}
              onClick={() => void run(() => post<{ notification: string | null }>(`/api/parking/bays/${bay.id}/reclaim`), (r) => r.notification ?? `${bay.id} reclaimed and locked.`)}
            >
              Reclaim bay {bay.id}
            </Button>
          )}
          {bay.tier === 'ALLOCATED' && !canManage && !bay.releaseInfo && (
            <Text size="xs" c="dimmed">
              Only {isOwner ? bay.ownerName : 'the assigned owner'} or Facilities can release this bay.
            </Text>
          )}
        </Stack>

        {(sensor.state === 'EMPTY' || isOccupantMe || isAdmin) && (
          <Box className="sp-sim">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={8}>
              IoT simulator · acting as {who}
            </Text>
            <Stack gap="xs">
              {sensor.state === 'EMPTY' && (
                <Button
                  color="amber"
                  leftSection={<IconCarGarage size={18} />}
                  disabled={busy}
                  onClick={() =>
                    void iot(
                      { type: 'LINK_IDENTITY', authMethod: 'BLE_AUTO', plate: persona.plate || undefined },
                      `Vehicle parked on ${bay.id} — automatically detected and verified.`,
                    )
                  }
                >
                  Car arrives & parks (auto-detected)
                </Button>
              )}
              {sensor.state !== 'EMPTY' && (isAdmin || isOccupantMe) && (
                <Button
                  variant="default"
                  leftSection={<IconCarOff size={18} />}
                  disabled={busy}
                  onClick={() => void iot({ type: 'VEHICLE_DEPARTED' }, `${bay.id} auto-cleared. Vehicle departed.`)}
                >
                  Car leaves (auto move-out)
                </Button>
              )}
              {lockedBase && sensor.state === 'EMPTY' && (
                <Button
                  color="orange"
                  variant="light"
                  leftSection={<IconAlertTriangle size={18} />}
                  disabled={busy}
                  onClick={() => void iot({ type: 'AUTH_FAILED' }, `Unauthorized alert raised on ${bay.id}.`)}
                >
                  Simulate unauthorized car alert
                </Button>
              )}
            </Stack>
          </Box>
        )}
      </Stack>
    );
  };

  return (
    <Drawer
      opened={!!bayId}
      onClose={() => selectBay(null)}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '88%' : 440}
      title={
        <Text fw={800} size="xl">
          Bay {bayId}
        </Text>
      }
    >
      {body()}
    </Drawer>
  );
}
