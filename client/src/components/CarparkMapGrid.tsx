import { Group, Text } from '@mantine/core';
import { IconArrowNarrowRight, IconArrowsUpDown, IconElevator } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import { STATUS_META, type Visual } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import type { Level } from '../types';
import { BayTileCard } from './BayTileCard';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
// 35 bays per level. Two drive aisles: a wall row of ten, a back-to-back island of
// eight + eight with the lift core at its end, and a wall row of nine beside the ramp.
// The grid is ten columns on desktop and five on phones, so every row simply wraps in two.
const ROW_A = range(1, 10);
const ROW_B = range(11, 18);
const ROW_C = range(19, 26);
const ROW_D = range(27, 35);
const bayId = (level: Level, n: number) => `${level}-${String(n).padStart(3, '0')}`;

const LEGEND: Visual[] = ['RELEASED_AVAILABLE', 'FLEX_AVAILABLE', 'RESERVED_LOCKED', 'OCCUPIED_OWNER', 'OCCUPIED_REALLOCATED', 'OCCUPIED_FLEX', 'PENDING', 'UNAUTHORIZED_ALERT'];

export const MapLegend = memo(function MapLegend() {
  return (
    <Group gap="xs" mt="sm" aria-label="Map legend">
      {LEGEND.map((v) => (
        <Group key={v} gap={6} wrap="nowrap">
          <span className="sp-swatch" style={{ background: STATUS_META[v].swatch }} />
          <Text size="xs" c="dimmed">
            {STATUS_META[v].label}
          </Text>
        </Group>
      ))}
    </Group>
  );
});

export const CarparkMapGrid = memo(function CarparkMapGrid({ level }: { level: Level }) {
  const selectBay = useParkingStore((s) => s.selectBay);
  const onSelectBay = useCallback((id: string) => selectBay(id), [selectBay]);
  const row = (nums: number[]) => nums.map((n) => <BayTileCard key={bayId(level, n)} id={bayId(level, n)} onSelectBay={onSelectBay} />);

  return (
    <div className="sp-map" role="group" aria-label={`Level ${level} carpark map`}>
      <div className="sp-row">{row(ROW_A)}</div>
      <div className="sp-aisle">
        <span>ENTRY RAMP</span>
        <IconArrowNarrowRight size={16} aria-hidden />
        <span>DRIVE AISLE 1</span>
        <IconArrowNarrowRight size={16} aria-hidden />
      </div>
      <div className="sp-row">
        {row(ROW_B)}
        <div className="sp-core" role="img" aria-label="Lift, beside bays 017 and 018">
          <IconElevator size={20} aria-hidden />
          <span>LIFT</span>
        </div>
      </div>
      <div className="sp-row">
        {row(ROW_C)}
        <div className="sp-core" role="img" aria-label="Lift lobby, beside bays 025 and 026">
          <span>LIFT LOBBY</span>
        </div>
      </div>
      <div className="sp-aisle">
        <IconArrowNarrowRight size={16} style={{ transform: 'rotate(180deg)' }} aria-hidden />
        <span>DRIVE AISLE 2</span>
        <IconArrowNarrowRight size={16} style={{ transform: 'rotate(180deg)' }} aria-hidden />
        <span>EXIT RAMP</span>
      </div>
      <div className="sp-row">
        {row(ROW_D)}
        <div className="sp-core sp-core--ramp" role="img" aria-label="Ramp to the other level">
          <IconArrowsUpDown size={18} aria-hidden />
          <span>RAMP</span>
        </div>
      </div>
    </div>
  );
});
