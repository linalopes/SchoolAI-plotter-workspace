import { writable } from 'svelte/store';
import { readStored, writeStored, STORAGE_KEYS } from '../utils/storage';

export const PRIMARY_TABS = [
  'generate',
  'prepare',
  'machines',
  'guide',
] as const;

export type PrimaryTab = (typeof PRIMARY_TABS)[number];

export const TAB_LABELS: Record<PrimaryTab, string> = {
  generate: 'Generate',
  prepare: 'Prepare',
  machines: 'Machines',
  guide: 'Guide',
};

/** First-time visitors land on Machines, the functional section. */
const DEFAULT_TAB: PrimaryTab = 'machines';

function isPrimaryTab(value: unknown): value is PrimaryTab {
  return (
    typeof value === 'string' && (PRIMARY_TABS as readonly string[]).includes(value)
  );
}

function createNavigationStore() {
  const initial = readStored(STORAGE_KEYS.activeTab, isPrimaryTab, DEFAULT_TAB);
  const { subscribe, set } = writable<PrimaryTab>(initial);

  return {
    subscribe,
    goTo(tab: PrimaryTab) {
      set(tab);
      writeStored(STORAGE_KEYS.activeTab, tab);
    },
  };
}

export const activeTab = createNavigationStore();

/**
 * Section selected inside each tab's left sidebar. Not persisted: sections are
 * cheap to re-enter, and returning to Overview is the least surprising default.
 */
export const machinesSection = writable<string>('overview');
export const generateSection = writable<string>('sketches');
export const prepareSection = writable<string>('documents');
export const guideSection = writable<string>('getting-started');
