import { Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { memo } from 'react';
import { fmtTime } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';

const TONE: Record<string, string> = {
  BAY_RELEASED: '#10b981',
  BAY_RECLAIMED: '#e03131',
  RECLAIM_NOTICE: '#f08c00',
  VEHICLE_ARRIVED: '#fab005',
  IDENTITY_LINKED: '#4263eb',
  AUTO_MOVE_OUT: '#0ca678',
  UNAUTHORIZED_ALERT: '#f76707',
};

export const ActivityFeed = memo(function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const events = useParkingStore((s) => s.events);
  const selectBay = useParkingStore((s) => s.selectBay);
  return (
    <Paper withBorder p="md" radius="md">
      <Title order={3} size="h5" mb="xs">
        Live IoT activity
      </Title>
      {events.length === 0 && (
        <Text size="sm" c="dimmed">
          No activity yet.
        </Text>
      )}
      <Stack gap={0} aria-live="polite">
        {events.slice(0, limit).map((e) => (
          <UnstyledButton key={e.id} className="sp-event" onClick={() => e.bayId && selectBay(e.bayId)} disabled={!e.bayId} style={{ borderLeftColor: TONE[e.type] ?? '#adb5bd' }}>
            <Text size="xs" c="dimmed">
              {fmtTime(e.at)} · {e.actor}
            </Text>
            <Text size="sm">{e.message}</Text>
          </UnstyledButton>
        ))}
      </Stack>
    </Paper>
  );
});
