import { Badge, Button, Group, SegmentedControl, Select, Text, Tooltip } from '@mantine/core';
import {
  IconCoffee,
  IconCup,
  IconParking,
  IconRefresh,
  IconUser,
} from '@tabler/icons-react';
import { memo } from 'react';
import { run } from '../lib/status';
import { useParkingStore, type ThemeMode } from '../store/useParkingStore';
import { PERSONAS, type PersonaKey } from '../types';

export const DemoControlBar = memo(function DemoControlBar() {
  const themeMode = useParkingStore((s) => s.themeMode);
  const setThemeMode = useParkingStore((s) => s.setThemeMode);
  const persona = useParkingStore((s) => s.activePersona);
  const setPersona = useParkingStore((s) => s.setPersona);
  const initialized = useParkingStore((s) => s.initialized);
  const busy = useParkingStore((s) => s.busy);
  const offline = useParkingStore((s) => s.offline);
  const post = useParkingStore((s) => s.post);

  const reset = () => {
    if (initialized && !window.confirm('Reset demo data back to the clean baseline?')) return;
    void run(() => post('/api/parking/demo/reset', {}, 'management'), 'Demo reset: 70 bays restored, B5-024 ready.');
  };

  return (
    <header className="sp-bar">
      <div className="sp-bar__row sp-bar__row--brand">
        <Group gap="sm" wrap="nowrap">
          <span className="sp-logo" aria-hidden>
            <IconParking size={20} />
          </span>
          <div>
            <Group gap="xs" align="center">
              <Text fw={800} size="md" lh={1.1} className="sp-brand-title">
                SmartPark
              </Text>
              <Badge size="xs" variant="outline" className="sp-brand-badge">
                KopiCode 360
              </Badge>
            </Group>
            <Text size="xs" className="sp-brand-sub" lh={1.2}>
              Autonomous Frictionless Bay Allocation
            </Text>
          </div>
        </Group>

        <Group gap="sm" wrap="wrap" justify="flex-end">
          {offline && (
            <Badge color="red" variant="filled" size="sm">
              Server Reconnecting…
            </Badge>
          )}

          {/* Theme Toggle Button: Kopi O (Dark) / Teh Susu (Light) */}
          <div className="sp-theme-switch-wrap" title="Toggle App Theme: Kopi O (Dark) or Teh Susu (Light)">
            <SegmentedControl
              size="xs"
              radius="xl"
              value={themeMode}
              onChange={(val) => setThemeMode(val as ThemeMode)}
              data={[
                {
                  value: 'kopi-o',
                  label: (
                    <Group gap={4} wrap="nowrap" px={2}>
                      <IconCoffee size={13} />
                      <Text size="xs" fw={700}>
                        Kopi O
                      </Text>
                    </Group>
                  ),
                },
                {
                  value: 'teh-susu',
                  label: (
                    <Group gap={4} wrap="nowrap" px={2}>
                      <IconCup size={13} />
                      <Text size="xs" fw={700}>
                        Teh Susu
                      </Text>
                    </Group>
                  ),
                },
              ]}
              className="sp-theme-toggle"
            />
          </div>

          {/* Persona Switcher */}
          <Select
            aria-label="Active demo persona"
            size="xs"
            leftSection={<IconUser size={13} />}
            data={(Object.keys(PERSONAS) as PersonaKey[]).map((k) => ({
              value: k,
              label: `${PERSONAS[k].name} (${PERSONAS[k].short})`,
            }))}
            value={persona}
            onChange={(v) => v && setPersona(v as PersonaKey)}
            allowDeselect={false}
            w={{ base: '100%', sm: 240 }}
            comboboxProps={{ withinPortal: true }}
            className="sp-persona-select"
          />

          {/* Reset Action */}
          <Tooltip label="Reset all 70 bays back to baseline" position="bottom" withArrow>
            <Button
              size="xs"
              variant="subtle"
              className="sp-reset-btn"
              disabled={busy}
              leftSection={<IconRefresh size={13} />}
              onClick={reset}
            >
              Reset Demo
            </Button>
          </Tooltip>
        </Group>
      </div>
    </header>
  );
});
