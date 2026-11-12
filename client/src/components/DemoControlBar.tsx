import { Badge, Button, Group, Select, Text } from '@mantine/core';
import { IconCalendarEvent, IconCarGarage, IconCarOff, IconLink, IconLockOpen, IconParking, IconRefresh } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { AUTH_LABEL, run, STATUS_META, visualOf } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { HERO_BAY, PERSONAS, type AuthMethod, type PersonaKey } from '../types';

const HERO = `/api/parking/bays/${HERO_BAY}`;

export const DemoControlBar = memo(function DemoControlBar() {
  const persona = useParkingStore((s) => s.activePersona);
  const setPersona = useParkingStore((s) => s.setPersona);
  const setLevel = useParkingStore((s) => s.setLevel);
  const setView = useParkingStore((s) => s.setView);
  const hero = useParkingStore((s) => s.bays[HERO_BAY]);
  const initialized = useParkingStore((s) => s.initialized);
  const busy = useParkingStore((s) => s.busy);
  const offline = useParkingStore((s) => s.offline);
  const post = useParkingStore((s) => s.post);
  const [method, setMethod] = useState<AuthMethod>('ACCESS_CARD_NFC');

  // Which simulator step makes sense next, so the presenter can just follow the highlight.
  const next = !hero
    ? 0
    : hero.iotSensor.state === 'VEHICLE_DETECTED_PENDING_AUTH'
      ? 3
      : hero.status === 'OCCUPIED_REALLOCATED'
        ? 4
        : hero.status === 'RELEASED_AVAILABLE'
          ? 2
          : hero.status === 'RESERVED_LOCKED' && !hero.releaseInfo
            ? 1
            : 0;

  const step = (as: PersonaKey, action: () => Promise<unknown>, ok: string) => {
    setPersona(as);
    setView('portal');
    setLevel('B5');
    void run(action, ok);
  };

  const reset = () => {
    if (initialized && !window.confirm('Reset the demo? All 70 bays go back to the baseline scenario for everyone viewing this site.')) return;
    void run(() => post('/api/parking/demo/reset', {}, 'management'), 'Demo scenario reset: 70 bays, 13 unused allocated bays, B5-024 ready.');
  };

  const meta = hero ? STATUS_META[visualOf(hero)] : null;
  const disabled = busy || !initialized;

  return (
    <header className="sp-bar">
      <div className="sp-bar__row sp-bar__row--brand">
        <Group gap="sm" wrap="nowrap">
          <span className="sp-logo" aria-hidden>
            <IconParking size={22} />
          </span>
          <div>
            <Text fw={800} size="lg" lh={1.1} c="white">
              SmartPark
            </Text>
            <Text size="xs" c="teal.2" lh={1.2}>
              Unlock Hidden Parking Capacity
            </Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {offline && (
            <Badge color="red" variant="filled">
              Offline · retrying
            </Badge>
          )}
          <Select
            aria-label="Active demo persona"
            data={(Object.keys(PERSONAS) as PersonaKey[]).map((k) => ({ value: k, label: `${PERSONAS[k].short} — ${PERSONAS[k].name}` }))}
            value={persona}
            onChange={(v) => v && setPersona(v as PersonaKey)}
            allowDeselect={false}
            w={{ base: 210, sm: 330 }}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
      </div>

      <div className="sp-bar__row sp-bar__row--sim">
        <Group gap={8} wrap="nowrap" className="sp-bar__hero">
          <Text size="xs" fw={700} c="gray.4" tt="uppercase">
            IoT simulator · bay {HERO_BAY}
          </Text>
          {meta && (
            <Badge color={meta.color} variant="filled" size="sm">
              {meta.label}
            </Badge>
          )}
        </Group>
        <div className="sp-bar__steps">
          <Button
            size="xs"
            variant="default"
            disabled={disabled}
            leftSection={<IconCalendarEvent size={14} />}
            title="Simulates Alex adding a 3-day out-of-office entry to Google Calendar (demo data)"
            onClick={() => step('owner', () => post('/api/calendar/events', { kind: 'BUSINESS_TRAVEL', durationDays: 3, title: 'Out of office: business trip' }, 'owner'), '')}
          >
            Calendar: away 3 days
          </Button>
          <Button size="xs" color="teal" variant={next === 1 ? 'filled' : 'default'} disabled={disabled} leftSection={<IconLockOpen size={14} />} onClick={() => step('owner', () => post(`${HERO}/release`, { durationDays: 3, reason: 'BUSINESS_TRAVEL' }, 'owner'), 'Alex released B5-024 for 3 days (business travel).')}>
            1. Owner releases
          </Button>
          <Button size="xs" color="teal" variant={next === 2 ? 'filled' : 'default'} disabled={disabled} leftSection={<IconCarGarage size={14} />} onClick={() => step('commuter', () => post(`${HERO}/iot-event`, { type: 'VEHICLE_ARRIVED' }, 'commuter'), 'Floor puck detected a vehicle on B5-024.')}>
            2. Car pulls in
          </Button>
          <Group gap={4} wrap="nowrap">
            <Button size="xs" color="teal" variant={next === 3 ? 'filled' : 'default'} disabled={disabled} leftSection={<IconLink size={14} />} onClick={() => step('commuter', () => post(`${HERO}/iot-event`, { type: 'LINK_IDENTITY', authMethod: method }, 'commuter'), `Sarah linked to B5-024 via ${AUTH_LABEL[method]}.`)}>
              3. Link ID
            </Button>
            <Select
              aria-label="Identity link method for step 3"
              size="xs"
              w={96}
              data={[
                { value: 'ACCESS_CARD_NFC', label: 'Card' },
                { value: 'PILLAR_QR', label: 'QR' },
                { value: 'BLE_AUTO', label: 'BLE' },
              ]}
              value={method}
              onChange={(v) => v && setMethod(v as AuthMethod)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
          <Button size="xs" color="teal" variant={next === 4 ? 'filled' : 'default'} disabled={disabled} leftSection={<IconCarOff size={14} />} onClick={() => step('commuter', () => post(`${HERO}/iot-event`, { type: 'VEHICLE_DEPARTED' }, 'commuter'), 'Car left. B5-024 auto-cleared with zero clicks.')}>
            4. Car leaves
          </Button>
          <Button size="xs" variant="subtle" color="gray.3" disabled={busy} leftSection={<IconRefresh size={14} />} onClick={reset}>
            Reset demo (70 bays)
          </Button>
        </div>
      </div>
    </header>
  );
});
