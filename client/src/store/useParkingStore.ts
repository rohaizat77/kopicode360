import { create } from 'zustand';
import { secureFetch } from '../lib/api';
import type { MapFilter } from '../lib/status';
import type { CalendarView, DepartmentRow, FreeRank, Level, Overview, ParkingBay, ParkingEvent, PersonaKey, Summary, WatchRow } from '../types';

export type AppView = 'portal' | 'parkiq' | 'odin';
export type ThemeMode = 'kopi-o' | 'teh-susu';

interface ParkingStore {
  // Theme state
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;

  // Shared server data
  initialized: boolean | null; // null = not loaded yet
  version: number;
  today: string;
  bays: Record<string, ParkingBay>;
  summary: Summary | null;
  departments: DepartmentRow[];
  watchlist: WatchRow[];
  events: ParkingEvent[];
  calendar: CalendarView;
  freeRanking: FreeRank[];
  nearestByLevel: Record<Level, string | null>;
  offline: boolean;
  // Shared UI state
  activePersona: PersonaKey;
  view: AppView;
  selectedLevel: Level;
  selectedBayId: string | null;
  releaseBayId: string | null;
  mapQuery: string;
  mapFilter: MapFilter;
  busy: boolean;

  setPersona: (p: PersonaKey) => void;
  setView: (v: AppView) => void;
  setLevel: (l: Level) => void;
  selectBay: (id: string | null) => void;
  openRelease: (id: string | null) => void;
  setMapQuery: (q: string) => void;
  setMapFilter: (f: MapFilter) => void;
  refresh: (force?: boolean) => Promise<void>;
  post: <T = any>(path: string, body?: unknown, persona?: PersonaKey) => Promise<T>;
}

let inFlight: Promise<void> | null = null;

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'kopi-o';
  const saved = localStorage.getItem('smartpark_theme');
  return saved === 'teh-susu' ? 'teh-susu' : 'kopi-o';
};

const applyThemeToDOM = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-mantine-color-scheme', mode === 'kopi-o' ? 'dark' : 'light');
};

const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const useParkingStore = create<ParkingStore>((set, get) => ({
  themeMode: initialTheme,
  setThemeMode: (mode) => {
    localStorage.setItem('smartpark_theme', mode);
    applyThemeToDOM(mode);
    set({ themeMode: mode });
  },
  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === 'kopi-o' ? 'teh-susu' : 'kopi-o';
    localStorage.setItem('smartpark_theme', next);
    applyThemeToDOM(next);
    set({ themeMode: next });
  },

  initialized: null,
  version: -1,
  today: '',
  bays: {},
  summary: null,
  departments: [],
  watchlist: [],
  events: [],
  calendar: { account: '', events: [], suggestions: [] },
  freeRanking: [],
  nearestByLevel: { B4: null, B5: null },
  offline: false,
  activePersona: 'commuter',
  view: 'portal',
  selectedLevel: 'B5',
  selectedBayId: null,
  releaseBayId: null,
  mapQuery: '',
  mapFilter: 'ALL',
  busy: false,

  setPersona: (p) => set({ activePersona: p, view: p === 'management' ? 'parkiq' : get().view === 'parkiq' ? 'portal' : get().view }),
  setView: (view) => set({ view }),
  setLevel: (selectedLevel) => set({ selectedLevel }),
  selectBay: (selectedBayId) => set({ selectedBayId }),
  openRelease: (releaseBayId) => set({ releaseBayId }),
  setMapQuery: (mapQuery) => set({ mapQuery }),
  setMapFilter: (mapFilter) => set({ mapFilter }),

  refresh: (force = false) => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const { version, activePersona } = get();
        const o = await secureFetch<Overview>(`/api/parking/overview${!force && version >= 0 ? `?since=${version}` : ''}`, { persona: activePersona });
        if (o.unchanged) {
          if (get().offline) set({ offline: false });
          return;
        }
        // Keep the previous object for every bay that did not change, so memoised
        // tiles subscribed to a single bay do not re-render.
        const prev = get().bays;
        const bays: Record<string, ParkingBay> = {};
        for (const b of o.bays) bays[b.id] = prev[b.id] && prev[b.id].updatedAt === b.updatedAt ? prev[b.id] : b;
        set({ initialized: o.initialized, version: o.version, today: o.today, bays, summary: o.summary, departments: o.departments, watchlist: o.watchlist, events: o.events, calendar: o.calendar ?? { account: '', events: [], suggestions: [] }, freeRanking: o.freeRanking ?? [], nearestByLevel: o.nearestByLevel ?? { B4: null, B5: null }, offline: false });
      } catch {
        set({ offline: true });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  post: async (path, body, persona) => {
    set({ busy: true });
    try {
      const result = await secureFetch<any>(path, { method: 'POST', body: body ?? {}, persona: persona ?? get().activePersona });
      if (inFlight) await inFlight;
      await get().refresh();
      return result;
    } finally {
      set({ busy: false });
    }
  },
}));
