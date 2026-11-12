import { Alert, Badge, Box, Button, Divider, Drawer, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconCarOff, IconCarGarage, IconLink, IconLockOpen, IconLock, IconRouter } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { AUTH_LABEL, fmtDate, fmtTime, REASON_LABEL, run, SENSOR_LABEL, STATUS_META, timeAgo, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { PERSONAS, type AuthMethod } from '../types';

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
  // Transient simulator inputs stay local to the drawer.
  const [authMethod, setAuthMethod] = useState<AuthMethod>('ACCESS_CARD_NFC');
  const [plate, setPlate] = useState('');

  useEffect(() => {
    setPlate(persona.plate ?? '');
  }, [persona.plate, bayId]);

  const body = () => {
    if (!bay) return null;
    const visual = visualOf(bay);
    const meta = STATUS_META[visual];
    const sensor = bay.iotSensor;
    const canManage = persona.key === 'management' || bay.ownerEmail === persona.email;
    const releaseActive = !!bay.releaseInfo && bay.releaseInfo.startDate <= today && today <= bay.releaseInfo.endDate;
    const lockedBase = bay.tier === 'ALLOCATED' && !releaseActive;
    const iot = (payload: Record<string, unknown>, ok: string) => run(() => post(`/api/parking/bays/${bay.id}/iot-event`, payload), ok);
    const who = persona.key === 'management' ? 'a simulated staff vehicle' : persona.name;

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
            A vehicle is on this locked bay without the owner's credentials. Facilities and {bay.ownerName} have been alerted.
          </Alert>
        )}

        <SimpleGrid cols={2} spacing="sm">
          <Field label="Owner">{bay.ownerName ?? 'None · open to all'}</Field>
          <Field label="Department">{bay.ownerDepartment ?? '—'}</Field>
          <Field label="Owner plate">{bay.ownerPlate ?? '—'}</Field>
          <Field label="Walk to lift">{bay.liftDistanceM} m</Field>
          <Field label="30-day use">{bay.usage ? `${bay.usage.occupancy30dPct}% occupied · ${bay.usage.releases30d} release${bay.usage.releases30d === 1 ? '' : 's'}` : '—'}</Field>
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
            {bay.tier === 'ALLOCATED' ? 'Not released. Only the owner may park here.' : 'Not applicable. This bay is always first come, first served.'}
          </Text>
        )}

        <Divider label="Current occupant" labelPosition="left" />
        {bay.currentOccupant ? (
          <SimpleGrid cols={2} spacing="sm">
            <Field label="Driver">{bay.currentOccupant.name}</Field>
            <Field label="Plate">{bay.currentOccupant.plate}</Field>
            <Field label="Linked via">{AUTH_LABEL[bay.currentOccupant.authMethod]}</Field>
            <Field label="Parked at">{fmtTime(bay.currentOccupant.parkedAt)}</Field>
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">
            {sensor.state === 'EMPTY' ? 'No vehicle on this bay.' : 'Vehicle present, identity not linked.'}
          </Text>
        )}

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

        <Divider label="Actions" labelPosition="left" />
        <Stack gap="xs">
          {bay.tier === 'ALLOCATED' && canManage && !bay.releaseInfo && (bay.status === 'RESERVED_LOCKED' || bay.status === 'OCCUPIED_OWNER') && (
            <Button color="teal" leftSection={<IconLockOpen size={18} />} onClick={() => openRelease(bay.id)} disabled={busy}>
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
              Only {bay.ownerName} or Facilities can release this bay.
            </Text>
          )}
        </Stack>

        <Box className="sp-sim">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
            IoT simulator · acting as {who}
          </Text>
          {sensor.state !== 'OCCUPIED_VERIFIED' && sensor.state !== 'OCCUPIED_UNAUTHORIZED' && (
            <Group grow align="flex-end" mb="xs">
              <Select
                label="Identity link method"
                data={Object.entries(AUTH_LABEL).map(([value, label]) => ({ value, label }))}
                value={authMethod}
                onChange={(v) => v && setAuthMethod(v as AuthMethod)}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
              <TextInput label="Vehicle plate" placeholder={persona.key === 'management' ? 'Auto' : undefined} value={plate} maxLength={12} onChange={(e) => setPlate(e.currentTarget.value.toUpperCase())} />
            </Group>
          )}
          <Stack gap="xs">
            {sensor.state === 'EMPTY' && (
              <>
                <Button variant="default" leftSection={<IconCarGarage size={18} />} disabled={busy} onClick={() => void iot({ type: 'VEHICLE_ARRIVED' }, `Floor puck detected a vehicle on ${bay.id}.`)}>
                  Car pulls in (puck detects only)
                </Button>
                <Button leftSection={<IconLink size={18} />} disabled={busy} onClick={() => void iot({ type: 'LINK_IDENTITY', authMethod, plate: plate || undefined }, `Vehicle arrived and identity link sent for ${bay.id}.`)}>
                  Car pulls in + link identity
                </Button>
              </>
            )}
            {sensor.state === 'VEHICLE_DETECTED_PENDING_AUTH' && (
              <Button leftSection={<IconLink size={18} />} disabled={busy} onClick={() => void iot({ type: 'LINK_IDENTITY', authMethod, plate: plate || undefined }, `Identity link sent for ${bay.id}.`)}>
                Link identity to this bay
              </Button>
            )}
            {sensor.state !== 'EMPTY' && (
              <Button variant="default" leftSection={<IconCarOff size={18} />} disabled={busy} onClick={() => void iot({ type: 'VEHICLE_DEPARTED' }, `${bay.id} auto-cleared. No checkout needed.`)}>
                Car leaves (auto move-out)
              </Button>
            )}
            {lockedBase && (sensor.state === 'EMPTY' || sensor.state === 'VEHICLE_DETECTED_PENDING_AUTH') && (
              <Button color="orange" variant="light" leftSection={<IconAlertTriangle size={18} />} disabled={busy} onClick={() => void iot({ type: 'AUTH_FAILED' }, `Unauthorized alert raised on ${bay.id}.`)}>
                Simulate unauthorized car alert
              </Button>
            )}
          </Stack>
        </Box>
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
