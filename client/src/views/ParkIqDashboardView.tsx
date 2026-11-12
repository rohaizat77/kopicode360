import { Badge, Grid, Group, Paper, SimpleGrid, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { memo, type ReactNode } from 'react';
import { ActivityFeed } from '../components/ActivityFeed';
import { STATUS_META } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';

const Kpi = memo(function Kpi({ label, value, unit, note, tone }: { label: string; value: ReactNode; unit?: string; note: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <Paper withBorder p="md" radius="md" className="sp-kpi" data-tone={tone}>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Group gap={6} align="baseline" mt={4}>
        <Text className="sp-kpi__value">{value}</Text>
        {unit && (
          <Text size="sm" c="dimmed" fw={600}>
            {unit}
          </Text>
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {note}
      </Text>
    </Paper>
  );
});

export function ParkIqDashboardView() {
  const s = useParkingStore((st) => st.summary);
  const departments = useParkingStore((st) => st.departments);
  const watchlist = useParkingStore((st) => st.watchlist);
  const selectBay = useParkingStore((st) => st.selectBay);
  if (!s) return null;

  const segments = [
    { key: 'Owner parked', n: s.breakdown.occupiedOwner, color: STATUS_META.OCCUPIED_OWNER.swatch },
    { key: 'Released · reallocated', n: s.breakdown.reallocated, color: STATUS_META.OCCUPIED_REALLOCATED.swatch },
    { key: 'Released · open', n: s.breakdown.releasedOpen, color: STATUS_META.RELEASED_AVAILABLE.swatch },
    { key: 'Unused locked (waste)', n: s.breakdown.unusedLocked, color: STATUS_META.RESERVED_LOCKED.swatch },
    { key: 'Flex occupied', n: s.breakdown.flexOccupied, color: STATUS_META.OCCUPIED_FLEX.swatch },
    { key: 'Flex free', n: s.breakdown.flexAvailable, color: STATUS_META.FLEX_AVAILABLE.swatch },
    { key: 'Unauthorized alert', n: s.breakdown.alerts, color: STATUS_META.UNAUTHORIZED_ALERT.swatch },
  ].filter((x) => x.n > 0);
  const ratePerDay = s.leaseRatePerBayMonth / s.workingDaysPerMonth;

  return (
    <Stack gap="md">
      <div>
        <Title order={2} size="h3">
          ParkIQ — Management Intelligence
        </Title>
        <Text c="dimmed" size="sm">
          Live from the floor sensors. Mock data for the hackathon demo.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="md">
        <Kpi label="Total capacity" value={s.total} unit="bays" note={`${s.allocated} allocated + ${s.flex} flex`} />
        <Kpi label="Live occupancy" value={s.occupied} unit={`of ${s.total}`} note={`${s.availableNow} available now${s.pendingAuth ? ` · ${s.pendingAuth} awaiting ID link` : ''}`} />
        <Kpi label="Unused allocated bays" value={s.unusedAllocated} unit="bays" tone="warn" note="Hidden waste: reserved, empty and not released" />
        <Kpi label="Unlocked & reallocated today" value={s.unlockedToday} unit="bays" tone="good" note={`${s.reallocated} in use by colleagues · ${s.breakdown.releasedOpen} still open`} />
        <Kpi
          label="Recovered capacity this month"
          value={s.recoveredBayDays}
          unit="bay-days"
          tone="good"
          note={
            <>
              ≈ <strong>RM {s.leaseSavingsRm.toLocaleString('en-MY')}</strong> lease cost avoided (RM {s.leaseRatePerBayMonth}/bay/month ÷ {s.workingDaysPerMonth} working days = RM {ratePerDay.toFixed(0)} per bay-day)
            </>
          }
        />
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Title order={3} size="h5" mb="sm">
          Capacity utilisation breakdown
        </Title>
        <div className="sp-stack" role="img" aria-label={segments.map((x) => `${x.key}: ${x.n}`).join(', ')}>
          {segments.map((x) => (
            <div key={x.key} style={{ flexGrow: x.n, background: x.color }} title={`${x.key}: ${x.n}`}>
              {x.n >= 4 ? x.n : ''}
            </div>
          ))}
        </div>
        <Group gap="md" mt="sm">
          {segments.map((x) => (
            <Group key={x.key} gap={6} wrap="nowrap">
              <span className="sp-swatch" style={{ background: x.color }} />
              <Text size="sm">
                {x.key} <strong>{x.n}</strong>
              </Text>
            </Group>
          ))}
        </Group>
      </Paper>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Title order={3} size="h5">
              Department release & demand
            </Title>
            <Text size="xs" c="dimmed" mb="xs">
              Supply each department gives back versus how many of its people rely on shared bays.
            </Text>
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Department</Table.Th>
                    <Table.Th ta="right">Allocated</Table.Th>
                    <Table.Th ta="right">Owner parked</Table.Th>
                    <Table.Th ta="right">Unused</Table.Th>
                    <Table.Th ta="right">Released</Table.Th>
                    <Table.Th ta="right">Shared-bay demand</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {departments.map((d) => (
                    <Table.Tr key={d.department}>
                      <Table.Td fw={600}>{d.department}</Table.Td>
                      <Table.Td ta="right">{d.allocated}</Table.Td>
                      <Table.Td ta="right">{d.ownerParked}</Table.Td>
                      <Table.Td ta="right">{d.unused > 0 ? <Badge color="red" variant="light">{d.unused}</Badge> : 0}</Table.Td>
                      <Table.Td ta="right">{d.released > 0 ? <Badge color="teal" variant="light">{d.released}</Badge> : 0}</Table.Td>
                      <Table.Td ta="right">{d.demand}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Title order={3} size="h5">
              Chronic idle bay watchlist
            </Title>
            <Text size="xs" c="dimmed" mb="xs">
              Allocated bays under 40% sensor occupancy with zero voluntary releases in 30 days. Candidates for a policy review.
            </Text>
            {watchlist.length === 0 ? (
              <Text size="sm" c="dimmed">
                No chronic idle bays right now.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={380}>
                <Table verticalSpacing={6}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Bay</Table.Th>
                      <Table.Th>Owner</Table.Th>
                      <Table.Th ta="right">30-day occupancy</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {watchlist.map((w) => (
                      <Table.Tr key={w.bayId}>
                        <Table.Td>
                          <UnstyledButton className="sp-link" onClick={() => selectBay(w.bayId)}>
                            {w.bayId}
                          </UnstyledButton>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{w.ownerName}</Text>
                          <Text size="xs" c="dimmed">
                            {w.ownerDepartment}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Group gap={8} justify="flex-end" wrap="nowrap">
                            <div className="sp-meter" aria-hidden>
                              <div style={{ width: `${w.occupancy30dPct}%` }} />
                            </div>
                            <Text size="sm" fw={600} w={36} ta="right">
                              {w.occupancy30dPct}%
                            </Text>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      <ActivityFeed limit={10} />
    </Stack>
  );
}
