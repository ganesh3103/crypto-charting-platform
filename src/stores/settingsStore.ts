import { create } from 'zustand';
import { DEFAULT_TIMEZONE } from '../utils/time/timezone';

const STORAGE_KEY = 'crypto-charting:settings';

interface PersistedSettings {
  timezone: string;
  theme: 'dark' | 'light';
  showGrid: boolean;
}

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    // ignore corrupt storage
  }
  return defaultSettings;
}

const defaultSettings: PersistedSettings = {
  timezone: DEFAULT_TIMEZONE,
  theme: 'dark',
  showGrid: true,
};

interface SettingsState extends PersistedSettings {
  setTimezone: (timezone: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setShowGrid: (show: boolean) => void;
}

function persist(state: PersistedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full/unavailable — non-fatal
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadPersisted(),

  setTimezone: (timezone) => {
    set({ timezone });
    persist({ timezone, theme: get().theme, showGrid: get().showGrid });
  },
  setTheme: (theme) => {
    set({ theme });
    persist({ timezone: get().timezone, theme, showGrid: get().showGrid });
  },
  setShowGrid: (showGrid) => {
    set({ showGrid });
    persist({ timezone: get().timezone, theme: get().theme, showGrid });
  },
}));
