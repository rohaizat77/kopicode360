import { Button, Container, Loader, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { IconChartBar, IconDatabaseImport, IconMap2, IconMessageChatbot } from '@tabler/icons-react';
import { useEffect } from 'react';
import { BayDetailDrawer } from './components/BayDetailDrawer';
import { CalendarPrompt } from './components/CalendarAssist';
import { DemoControlBar } from './components/DemoControlBar';
import { OdinPanel } from './components/OdinPanel';
import { ReleaseBayModal } from './components/ReleaseBayModal';
import { run } from './lib/status';
import { useParkingStore, type AppView } from './store/useParkingStore';
import { ParkIqDashboardView } from './views/ParkIqDashboardView';
import { SmartParkPortalView } from './views/SmartParkPortalView';

const POLL_MS = 2500;

export function App() {
  const initialized = useParkingStore((s) => s.initialized);
  const offline = useParkingStore((s) => s.offline);
  const view = useParkingStore((s) => s.view);
  const setView = useParkingStore((s) => s.setView);
  const busy = useParkingStore((s) => s.busy);
  const post = useParkingStore((s) => s.post);

  // Polling stands in for a Firestore realtime listener. Unchanged polls return a few bytes.
  useEffect(() => {
    const { refresh } = useParkingStore.getState();
    void refresh(true);
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const onVisible = () => !document.hidden && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <>
      <DemoControlBar />
      <Container size={1480} px={{ base: 'md', sm: 'lg' }} py="md" component="main">
        {initialized === null ? (
          <Stack align="center" py={80}>
            {offline ? <Text c="red">Cannot reach the SmartPark server. Retrying…</Text> : <Loader color="teal" />}
          </Stack>
        ) : !initialized ? (
          <Paper withBorder radius="md" p="xl" maw={520} mx="auto" mt={60} ta="center">
            <Title order={2} size="h3">
              No demo data yet
            </Title>
            <Text c="dimmed" mt="xs" mb="lg">
              Load the hackathon baseline: 70 bays across Levels B4 and B5, 13 unused allocated bays, and hero bay B5-024 ready for the live demo.
            </Text>
            <Button size="md" color="teal" loading={busy} leftSection={<IconDatabaseImport size={18} />} onClick={() => void run(() => post('/api/parking/demo/reset', {}, 'management'), 'Demo dataset initialised.')}>
              Initialize 70-Bay Demo Dataset
            </Button>
          </Paper>
        ) : (
          <Tabs value={view} onChange={(v) => v && setView(v as AppView)} keepMounted={false}>
            <Tabs.List mb="md" className="sp-tabs">
              <Tabs.Tab value="portal" leftSection={<IconMap2 size={16} />}>
                SmartBay Portal
              </Tabs.Tab>
              <Tabs.Tab value="parkiq" leftSection={<IconChartBar size={16} />}>
                ParkIQ
              </Tabs.Tab>
              <Tabs.Tab value="odin" leftSection={<IconMessageChatbot size={16} />}>
                Odin AI
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="portal">
              <SmartParkPortalView />
            </Tabs.Panel>
            <Tabs.Panel value="parkiq">
              <ParkIqDashboardView />
            </Tabs.Panel>
            <Tabs.Panel value="odin">
              <OdinPanel />
            </Tabs.Panel>
          </Tabs>
        )}
        <Text size="xs" c="dimmed" ta="center" mt="xl">
          SmartPark · KopiCode hackathon MVP · all people, plates and sensor readings are mock data · no real company system is connected
        </Text>
      </Container>
      <BayDetailDrawer />
      <ReleaseBayModal />
      <CalendarPrompt />
    </>
  );
}
