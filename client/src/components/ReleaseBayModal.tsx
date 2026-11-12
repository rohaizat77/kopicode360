import { Button, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { fmtDate, REASON_LABEL, run } from '../lib/status';
import { useParkingStore } from '../store/useParkingStore';
import type { ReleaseReason } from '../types';

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Form state is local to this leaf: typing here never re-renders the map. */
export function ReleaseBayModal() {
  const bayId = useParkingStore((s) => s.releaseBayId);
  const today = useParkingStore((s) => s.today);
  const openRelease = useParkingStore((s) => s.openRelease);
  const post = useParkingStore((s) => s.post);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [reason, setReason] = useState<ReleaseReason>('BUSINESS_TRAVEL');
  const [startDate, setStartDate] = useState(today);
  const [days, setDays] = useState<number>(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bayId) {
      setReason('BUSINESS_TRAVEL');
      setStartDate(today);
      setDays(3);
      setNotes('');
    }
  }, [bayId, today]);

  const valid = !!startDate && startDate >= today && Number.isInteger(days) && days >= 1 && days <= 30;
  const endDate = valid ? addDays(startDate, days - 1) : null;

  const submit = async () => {
    if (!bayId || !valid) return;
    setSaving(true);
    const ok = await run(() => post(`/api/parking/bays/${bayId}/release`, { startDate, durationDays: days, reason, notes }), `${bayId} released. It is now open to colleagues first come, first served.`);
    setSaving(false);
    if (ok) openRelease(null);
  };

  return (
    <Modal opened={!!bayId} onClose={() => openRelease(null)} title={<Text fw={700}>Release bay {bayId}</Text>} fullScreen={isMobile} centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          While released, any colleague can park here. The bay locks back to you automatically when the window ends, and you can reclaim it early.
        </Text>
        <Select
          label="Reason"
          data={Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))}
          value={reason}
          onChange={(v) => v && setReason(v as ReleaseReason)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
        <Group grow align="flex-start">
          <TextInput label="From" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} error={startDate && startDate < today ? 'Cannot start in the past' : undefined} />
          <NumberInput label="Number of days" min={1} max={30} allowDecimal={false} value={days} onChange={(v) => setDays(typeof v === 'number' ? v : Number(v) || 0)} error={days < 1 || days > 30 ? '1 to 30 days' : undefined} />
        </Group>
        <Textarea label="Notes (optional)" placeholder="e.g. Back Monday morning" maxLength={280} autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        {endDate && (
          <Text size="sm">
            Open to colleagues from <strong>{fmtDate(startDate)}</strong> to <strong>{fmtDate(endDate)}</strong>, adding <strong>{days}</strong> bay-day{days === 1 ? '' : 's'} of capacity.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => openRelease(null)}>
            Cancel
          </Button>
          <Button color="teal" onClick={submit} loading={saving} disabled={!valid}>
            Release bay {bayId}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
