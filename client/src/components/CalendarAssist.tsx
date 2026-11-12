import { ActionIcon, Badge, Button, Group, Modal, NumberInput, Paper, Select, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCalendarEvent, IconCalendarPlus, IconLockOpen, IconPlaneDeparture, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { fmtDate, REASON_LABEL, run } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import { PERSONAS, type CalendarKind, type ReleaseSuggestion } from '../types';

const KIND_LABEL: Record<CalendarKind, string> = { ...REASON_LABEL, IN_OFFICE: 'Meeting at the office' };
const range = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`);

function useMySuggestions(): ReleaseSuggestion[] {
  const email = useParkingStore((s) => PERSONAS[s.activePersona].email);
  const suggestions = useParkingStore((s) => s.calendar.suggestions);
  return useMemo(() => suggestions.filter((x) => x.ownerEmail === email), [suggestions, email]);
}

function useAnswer() {
  const post = useParkingStore((s) => s.post);
  return (s: ReleaseSuggestion, accept: boolean) =>
    run(
      () => post(`/api/calendar/suggestions/${s.eventId}/${accept ? 'accept' : 'decline'}`),
      accept ? `${s.bayId} released for ${s.days} day${s.days === 1 ? '' : 's'}. Colleagues can park there.` : `Okay, ${s.bayId} stays reserved for you.`,
    );
}

/**
 * Pops up for a bay owner when their calendar shows them out of the office and
 * their bay is not released yet. Nothing is released without their answer.
 */
export function CalendarPrompt() {
  const mine = useMySuggestions();
  const busy = useParkingStore((s) => s.busy);
  const releaseOpen = useParkingStore((s) => s.releaseBayId !== null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const answer = useAnswer();
  const [later, setLater] = useState<string[]>([]); // "ask me later" for this visit only
  const s = mine.find((x) => !later.includes(x.eventId));

  return (
    <Modal
      opened={!!s && !releaseOpen}
      onClose={() => s && setLater((l) => [...l, s.eventId])}
      centered={!isMobile}
      yOffset={isMobile ? 12 : undefined}
      size={460}
      title={
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color="teal" variant="light" size={38} radius="md">
            <IconCalendarEvent size={22} />
          </ThemeIcon>
          <Text fw={800} size="lg">
            Your calendar says you're away
          </Text>
        </Group>
      }
    >
      {s && (
        <Stack gap="md">
          <Paper withBorder p="sm" radius="md" bg="gray.0">
            <Text fw={700}>{s.title}</Text>
            <Text size="sm" c="dimmed">
              {range(s.startDate, s.endDate)} · {s.days} day{s.days === 1 ? '' : 's'} · {REASON_LABEL[s.reason]}
            </Text>
          </Paper>
          <Text>
            You won't need bay <strong>{s.bayId}</strong> on those days. Release it so a colleague can park there? It locks back to you automatically afterwards, and you can reclaim it early.
          </Text>
          <Stack gap="xs">
            <Button size="md" color="teal" leftSection={<IconLockOpen size={18} />} disabled={busy} onClick={() => void answer(s, true)}>
              Yes, release {s.bayId} for {s.days} day{s.days === 1 ? '' : 's'}
            </Button>
            <Button size="md" variant="default" disabled={busy} onClick={() => void answer(s, false)}>
              No, keep my bay
            </Button>
            <Button size="md" variant="subtle" color="gray" onClick={() => setLater((l) => [...l, s.eventId])}>
              Ask me later
            </Button>
          </Stack>
          <Text size="xs" c="dimmed">
            Detected from Google Calendar. Demo data: no real Google account is connected.
          </Text>
        </Stack>
      )}
    </Modal>
  );
}

/** The owner's upcoming calendar, plus a way to simulate "I just updated my Google Calendar". */
export function CalendarCard() {
  const persona = useParkingStore((s) => PERSONAS[s.activePersona]);
  const events = useParkingStore((s) => s.calendar.events);
  const today = useParkingStore((s) => s.today);
  const busy = useParkingStore((s) => s.busy);
  const post = useParkingStore((s) => s.post);
  const mine = useMySuggestions();
  const answer = useAnswer();
  // Form inputs stay local to this card.
  const [kind, setKind] = useState<CalendarKind>('BUSINESS_TRAVEL');
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState<number>(3);

  const myEvents = useMemo(() => events.filter((e) => e.ownerEmail === persona.email), [events, persona.email]);
  const valid = Number.isInteger(days) && days >= 1 && days <= 30 && (!startDate || startDate >= today);
  const add = () =>
    void run(
      () => post('/api/calendar/events', { kind, durationDays: days, startDate: startDate || undefined }),
      (r) => (r.suggestion ? undefined : kind === 'IN_OFFICE' ? 'Added. You are in the office, so no release is suggested.' : 'Added to your calendar.'),
    );

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" gap="xs" mb="xs">
        <Group gap="xs" wrap="nowrap">
          <IconCalendarEvent size={20} color="#0ca678" aria-hidden />
          <Title order={3} size="h5">
            My calendar
          </Title>
        </Group>
        <Badge color="teal" variant="light">
          Google Calendar linked · demo data
        </Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        When an entry shows you out of the office, SmartPark asks whether to release your bay for those days.
      </Text>

      <Stack gap={0}>
        {myEvents.length === 0 && (
          <Text size="sm" c="dimmed" py="xs">
            Nothing coming up.
          </Text>
        )}
        {myEvents.map((e) => {
          const pending = mine.find((x) => x.eventId === e.id);
          return (
            <div key={e.id} className="sp-cal" data-ooo={e.outOfOffice || undefined}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600}>
                  {e.title}
                </Text>
                <Text size="xs" c="dimmed">
                  {range(e.startDate, e.endDate)}
                </Text>
              </div>
              <Group gap={6} wrap="nowrap">
                {e.outOfOffice ? (
                  <Badge color={e.accepted ? 'teal' : e.dismissed ? 'gray' : 'orange'} variant="light">
                    {e.accepted ? 'Bay released' : e.dismissed ? 'Bay kept' : pending ? 'Release?' : 'Out of office'}
                  </Badge>
                ) : (
                  <Badge color="gray" variant="outline">
                    In office
                  </Badge>
                )}
                {pending && (
                  <Button size="compact-sm" color="teal" disabled={busy} onClick={() => void answer(pending, true)}>
                    Release {pending.bayId}
                  </Button>
                )}
                <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Remove ${e.title}`} disabled={busy} onClick={() => void run(() => post(`/api/calendar/events/${e.id}/remove`))}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </div>
          );
        })}
      </Stack>

      <div className="sp-cal__add">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
          Simulate a Google Calendar update
        </Text>
        <Group gap="xs" align="flex-end">
          <Select label="Entry" data={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} value={kind} onChange={(v) => v && setKind(v as CalendarKind)} allowDeselect={false} w={{ base: '100%', xs: 190 }} comboboxProps={{ withinPortal: true }} />
          <TextInput label="From" type="date" min={today} value={startDate || today} onChange={(e) => setStartDate(e.currentTarget.value)} w={{ base: '48%', xs: 150 }} />
          <NumberInput label="Days" min={1} max={30} allowDecimal={false} value={days} onChange={(v) => setDays(typeof v === 'number' ? v : Number(v) || 0)} w={{ base: '48%', xs: 80 }} />
          <Button leftSection={<IconCalendarPlus size={16} />} onClick={add} disabled={busy || !valid}>
            Add to calendar
          </Button>
          <Button variant="light" leftSection={<IconPlaneDeparture size={16} />} disabled={busy} onClick={() => void run(() => post('/api/calendar/events', { kind: 'BUSINESS_TRAVEL', durationDays: 3, title: 'Out of office: business trip' }))}>
            I'm away for 3 days
          </Button>
        </Group>
      </div>
    </Paper>
  );
}
