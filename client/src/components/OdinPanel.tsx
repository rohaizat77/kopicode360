import { Alert, Button, Code, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconInfoCircle, IconSend, IconTool } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { secureFetch } from '../lib/api';
import { useParkingStore } from '../store/useParkingStore';
import { PERSONAS } from '../types';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
interface Msg {
  id: number;
  role: 'user' | 'odin';
  text: string;
  call?: ToolCall;
  pending?: ToolCall; // awaiting human confirmation
  error?: boolean;
}

const SUGGESTIONS = ["I'm travelling for 3 days, release my bay B5-024", 'Which bays are unlocked on B5?', 'Status of B5-024', 'Give me the parking summary', 'I need my bay back'];

const HELP = 'I can release or reclaim your bay, list unlocked bays, check a bay such as B5-024, or give the parking summary. Try one of the suggestions below.';

/** Rule-based stand-in for Odin's language understanding. The tool calls themselves are real. */
function parse(input: string): ToolCall | null {
  const t = input.toLowerCase();
  const bay = input.match(/\bb[45]-\d{3}\b/i)?.[0].toUpperCase();
  if (/reclaim|cancel|take .*back|bay back|back early/.test(t)) return { name: 'reclaim_parking_bay', args: bay ? { bay_id: bay } : {} };
  if (/release|free up|give up|lepas/.test(t)) {
    const n = t.match(/(\d+)\s*(day|hari)/);
    const weeks = t.match(/(\d+|a|one)\s*week/);
    const days = n ? Number(n[1]) : weeks ? (Number(weeks[1]) || 1) * 5 : /tomorrow|today/.test(t) ? 1 : 1;
    const reason = /leave|cuti|holiday|vacation/.test(t) ? 'ANNUAL_LEAVE' : /wfh|from home/.test(t) ? 'WORK_FROM_HOME' : /site/.test(t) ? 'SITE_VISIT' : 'BUSINESS_TRAVEL';
    return { name: 'release_parking_bay', args: { ...(bay ? { bay_id: bay } : {}), duration_days: days, reason } };
  }
  if (bay) return { name: 'get_bay_status', args: { bay_id: bay } };
  if (/unlock|available|free|open|where can i park|kosong|empty/.test(t)) {
    const level = t.match(/\bb([45])\b/);
    return { name: 'list_unlocked_bays', args: level ? { level: `B${level[1]}` } : {} };
  }
  if (/summary|capacity|how many|occupan|utili|saving|overview|status/.test(t)) return { name: 'get_parking_summary', args: {} };
  return null;
}

let seq = 0;

export function OdinPanel() {
  const personaKey = useParkingStore((s) => s.activePersona);
  const refresh = useParkingStore((s) => s.refresh);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: ++seq, role: 'odin', text: `Hi, I'm Odin. ${HELP}` }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const persona = PERSONAS[personaKey];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs]);

  const callTool = async (call: ToolCall) => {
    setBusy(true);
    try {
      const rpc = await secureFetch<any>('/api/mcp', { method: 'POST', persona: personaKey, body: { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: call.name, arguments: call.args } } });
      if (rpc.error) throw new Error(rpc.error.message);
      const result = rpc.result;
      const needsConfirm = result.structuredContent?.requiresConfirmation === true;
      setMsgs((m) => [...m, { id: ++seq, role: 'odin', text: result.content?.[0]?.text ?? '(no text)', call, pending: needsConfirm ? call : undefined, error: result.isError === true }]);
      if (call.args.confirmed === true) void refresh();
    } catch (e) {
      setMsgs((m) => [...m, { id: ++seq, role: 'odin', text: e instanceof Error ? e.message : 'The tool call failed.', call, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const send = (input: string) => {
    const value = input.trim();
    if (!value || busy) return;
    setText('');
    setMsgs((m) => [...m.map((x) => ({ ...x, pending: undefined })), { id: ++seq, role: 'user', text: value }]);
    const call = parse(value);
    if (!call) {
      setMsgs((m) => [...m, { id: ++seq, role: 'odin', text: `I did not catch that. ${HELP}` }]);
      return;
    }
    void callTool(call);
  };

  const decide = (msg: Msg, yes: boolean) => {
    setMsgs((m) => m.map((x) => (x.id === msg.id ? { ...x, pending: undefined } : x)));
    if (!msg.pending) return;
    if (yes) {
      setMsgs((m) => [...m, { id: ++seq, role: 'user', text: 'Yes, go ahead.' }]);
      void callTool({ name: msg.pending.name, args: { ...msg.pending.args, confirmed: true } });
    } else {
      setMsgs((m) => [...m, { id: ++seq, role: 'user', text: 'Cancel.' }, { id: ++seq, role: 'odin', text: 'Cancelled. Nothing was changed.' }]);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <Stack gap="md" maw={820} mx="auto">
      <div>
        <Title order={2} size="h3">
          Odin AI · SmartPark tools
        </Title>
        <Text c="dimmed" size="sm">
          Talking as {persona.name}. Every answer comes from a live call to the MCP endpoint at <Code>/api/mcp</Code>.
        </Text>
      </div>
      <Alert icon={<IconInfoCircle size={18} />} color="gray" variant="light">
        Demo stand-in: Odin itself is not connected here, so a simple keyword matcher picks the tool. The five MCP tools, their results and the confirmation step before any change are real, and any MCP client can call the same endpoint.
      </Alert>

      <Paper withBorder radius="md" p="md" className="sp-chat" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className="sp-msg" data-role={m.role}>
            {m.call && (
              <Text size="xs" c="dimmed" mb={4} className="sp-msg__tool">
                <IconTool size={12} /> tools/call <strong>{m.call.name}</strong> {JSON.stringify(m.call.args)}
              </Text>
            )}
            <div className="sp-msg__bubble" data-error={m.error || undefined}>
              {m.text}
            </div>
            {m.pending && (
              <Group gap="xs" mt={8}>
                <Button size="sm" color="teal" onClick={() => decide(m, true)} disabled={busy}>
                  Confirm
                </Button>
                <Button size="sm" variant="default" onClick={() => decide(m, false)} disabled={busy}>
                  Cancel
                </Button>
              </Group>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </Paper>

      <Group gap={6}>
        {SUGGESTIONS.map((s) => (
          <Button key={s} size="xs" variant="light" color="gray" onClick={() => send(s)} disabled={busy}>
            {s}
          </Button>
        ))}
      </Group>

      <form onSubmit={onSubmit}>
        <Group gap="xs" wrap="nowrap">
          <TextInput aria-label="Message to Odin" placeholder="Ask Odin about parking…" value={text} onChange={(e) => setText(e.currentTarget.value)} maxLength={200} style={{ flex: 1 }} />
          <Button type="submit" loading={busy} leftSection={<IconSend size={16} />}>
            Send
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
