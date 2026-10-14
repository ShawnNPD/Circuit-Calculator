// Persists per-tool settings across restarts. When running inside Electron
// (nodeIntegration is enabled for this app, see electron/main.cjs) this reads
// and writes a single JSON config file in the OS user-data directory. When
// running as a plain browser page (e.g. `npm run dev` opened directly, or
// automated testing), it falls back to localStorage so the app still works.

type ConfigStore = Record<string, unknown>;

const CONFIG_FILE_NAME = 'config.json';
const APP_FOLDER_NAME = 'Circuit Calculator';
const LOCAL_STORAGE_KEY = 'circuit-calculator-config';

interface FsModule {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: string) => string;
  writeFileSync: (path: string, data: string, encoding: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
}

interface PathModule {
  join: (...parts: string[]) => string;
  dirname: (path: string) => string;
}

interface OsModule {
  homedir: () => string;
}

interface ElectronWindow {
  require?: (id: string) => unknown;
  process?: { versions?: { electron?: string }; platform?: string; env?: Record<string, string | undefined> };
}

function getNodeRequire(): ((id: string) => unknown) | null {
  const w = window as unknown as ElectronWindow;
  if (w.process?.versions?.electron && typeof w.require === 'function') {
    return w.require;
  }
  return null;
}

function getConfigFilePath(): string | null {
  const req = getNodeRequire();
  if (!req) return null;
  try {
    const path = req('path') as PathModule;
    const os = req('os') as OsModule;
    const w = window as unknown as ElectronWindow;
    const env = w.process?.env ?? {};
    const platform = w.process?.platform;

    let base: string;
    if (platform === 'win32') {
      base = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else if (platform === 'darwin') {
      base = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
      base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    }

    return path.join(base, APP_FOLDER_NAME, CONFIG_FILE_NAME);
  } catch {
    return null;
  }
}

function readFullConfig(): ConfigStore {
  const req = getNodeRequire();
  const filePath = getConfigFilePath();
  if (req && filePath) {
    try {
      const fs = req('fs') as FsModule;
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as ConfigStore;
      }
    } catch {
      // Corrupt or unreadable file — start fresh rather than crash the app.
    }
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConfigStore) : {};
  } catch {
    return {};
  }
}

function writeFullConfig(cfg: ConfigStore): void {
  const req = getNodeRequire();
  const filePath = getConfigFilePath();
  if (req && filePath) {
    try {
      const fs = req('fs') as FsModule;
      const path = req('path') as PathModule;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf-8');
      return;
    } catch {
      // Fall through to localStorage as a last resort.
    }
  }

  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Nothing more we can do — persistence is best-effort.
  }
}

export function loadToolConfig<T>(toolKey: string): T | null {
  const cfg = readFullConfig();
  return (cfg[toolKey] as T) ?? null;
}

export function saveToolConfig<T>(toolKey: string, value: T): void {
  const cfg = readFullConfig();
  cfg[toolKey] = value;
  writeFullConfig(cfg);
}

interface IpcRendererModule {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

// Exports arbitrary JSON to a user-chosen file. Inside Electron this opens a
// native "Save As" dialog (via the main process — renderers can't show
// dialogs directly since the `remote` module was removed). In a plain
// browser (e.g. `npm run dev` opened outside Electron) it falls back to a
// standard browser download.
export async function exportJsonFile(data: unknown, suggestedName: string): Promise<boolean> {
  const req = getNodeRequire();
  if (req) {
    try {
      const { ipcRenderer } = req('electron') as { ipcRenderer: IpcRendererModule };
      const result = (await ipcRenderer.invoke('show-save-dialog', {
        title: 'Save Config',
        defaultPath: suggestedName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })) as SaveDialogResult;
      if (result.canceled || !result.filePath) return false;
      const fs = req('fs') as FsModule;
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch {
      // Fall through to the browser download fallback below.
    }
  }

  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
