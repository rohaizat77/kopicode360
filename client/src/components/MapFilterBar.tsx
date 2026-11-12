import { Chip, CloseButton, Group, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { memo, useEffect, useState } from 'react';
import type { MapFilter } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';

const FILTERS: Array<{ value: MapFilter; label: string }> = [
  { value: 'ALL', label: 'All bays' },
  { value: 'AVAILABLE', label: 'Available now' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'UNUSED', label: 'Unused reserved' },
  { value: 'ATTENTION', label: 'Needs attention' },
];

/** Typing here re-renders only this component; the debounced value reaches the store. */
export const MapFilterBar = memo(function MapFilterBar() {
  const [text, setText] = useState('');
  const [debounced] = useDebouncedValue(text, 200);
  const setMapQuery = useParkingStore((s) => s.setMapQuery);
  const mapFilter = useParkingStore((s) => s.mapFilter);
  const setMapFilter = useParkingStore((s) => s.setMapFilter);

  useEffect(() => {
    setMapQuery(debounced);
  }, [debounced, setMapQuery]);

  return (
    <Group gap="sm" align="center">
      <TextInput
        aria-label="Search bays by code, plate or name"
        placeholder="Search bay, plate or name"
        leftSection={<IconSearch size={16} />}
        rightSection={text ? <CloseButton size="sm" aria-label="Clear search" onClick={() => setText('')} /> : null}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        w={{ base: '100%', sm: 240 }}
        maxLength={40}
      />
      <Chip.Group value={mapFilter} onChange={(v) => setMapFilter(v as MapFilter)}>
        <Group gap={6}>
          {FILTERS.map((f) => (
            <Chip key={f.value} value={f.value} size="sm" variant="light">
              {f.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Group>
  );
});
