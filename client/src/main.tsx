import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './smartpark.css';
import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const theme = createTheme({
  primaryColor: 'amber',
  colors: {
    amber: [
      '#fef3c7',
      '#fde68a',
      '#fcd34d',
      '#fbbf24',
      '#f59e0b',
      '#d97706',
      '#b45309',
      '#92400e',
      '#78350f',
      '#451a03',
    ],
  },
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: '700' },
});

import { useParkingStore } from './store/useParkingStore';

function Root() {
  const themeMode = useParkingStore((s) => s.themeMode);
  return (
    <MantineProvider theme={theme} forceColorScheme={themeMode === 'kopi-o' ? 'dark' : 'light'}>
      <Notifications position="bottom-right" autoClose={4500} />
      <App />
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
