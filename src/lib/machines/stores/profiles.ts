import { derived, get, writable } from 'svelte/store';
import {
  STORAGE_KEYS,
  readStored,
  readStoredRaw,
  writeStored,
} from '../../utils/storage';
import { createDefaultProfile } from '../profiles/defaults';
import type { MachineProfile } from '../profiles/types';
import {
  sanitizeProfile,
  sanitizeStoredProfiles,
  toStoredProfiles,
} from '../profiles/validation';

/**
 * Machine profile collection.
 *
 * The store always holds at least one profile, so consumers never have to
 * handle an empty selection. Multiple profiles are supported by the data model
 * even though this milestone ships a single default.
 */

function loadProfiles(): MachineProfile[] {
  return sanitizeStoredProfiles(readStoredRaw(STORAGE_KEYS.profiles));
}

function loadActiveId(profiles: MachineProfile[]): string {
  const stored = readStored<string | null>(
    STORAGE_KEYS.activeProfileId,
    (v): v is string | null => typeof v === 'string' || v === null,
    null,
  );
  const exists = profiles.some((p) => p.id === stored);
  return exists && stored !== null ? stored : (profiles[0] as MachineProfile).id;
}

const initialProfiles = loadProfiles();

const profilesStore = writable<MachineProfile[]>(initialProfiles);
const activeProfileIdStore = writable<string>(loadActiveId(initialProfiles));

function persist(profiles: MachineProfile[]): void {
  writeStored(STORAGE_KEYS.profiles, toStoredProfiles(profiles));
}

function commit(profiles: MachineProfile[]): void {
  profilesStore.set(profiles);
  persist(profiles);
}

export const profiles = { subscribe: profilesStore.subscribe };

export const activeProfileId = { subscribe: activeProfileIdStore.subscribe };

/** The currently selected profile. Never undefined. */
export const activeProfile = derived(
  [profilesStore, activeProfileIdStore],
  ([$profiles, $id]) =>
    $profiles.find((p) => p.id === $id) ?? ($profiles[0] as MachineProfile),
);

export function selectProfile(id: string): void {
  const list = get(profilesStore);
  if (!list.some((p) => p.id === id)) return;
  activeProfileIdStore.set(id);
  writeStored(STORAGE_KEYS.activeProfileId, id);
}

/** Ensures a new or renamed profile is distinguishable in the selector. */
function uniqueName(base: string, list: MachineProfile[]): string {
  const taken = new Set(list.map((p) => p.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function createProfile(name = 'New Machine'): MachineProfile {
  const list = get(profilesStore);
  const profile = createDefaultProfile(uniqueName(name, list));
  commit([...list, profile]);
  selectProfile(profile.id);
  return profile;
}

export function addProfile(profile: MachineProfile): MachineProfile {
  const list = get(profilesStore);
  const named = { ...profile, name: uniqueName(profile.name, list) };
  commit([...list, named]);
  selectProfile(named.id);
  return named;
}

export function duplicateProfile(id: string): MachineProfile | null {
  const list = get(profilesStore);
  const source = list.find((p) => p.id === id);
  if (!source) return null;
  const copy = sanitizeProfile(
    { ...source, name: uniqueName(`${source.name} copy`, list) },
    false,
  );
  commit([...list, copy]);
  selectProfile(copy.id);
  return copy;
}

/** Deletion is refused for the last remaining profile. */
export function deleteProfile(id: string): boolean {
  const list = get(profilesStore);
  if (list.length <= 1) return false;
  const remaining = list.filter((p) => p.id !== id);
  if (remaining.length === list.length) return false;
  commit(remaining);
  if (get(activeProfileIdStore) === id) {
    selectProfile((remaining[0] as MachineProfile).id);
  }
  return true;
}

export function renameProfile(id: string, name: string): void {
  updateProfile(id, (profile) => ({ ...profile, name: name.trim() || profile.name }));
}

/**
 * Applies a patch to one profile and re-sanitises the result, so edits coming
 * from form inputs cannot store an out-of-range value.
 */
export function updateProfile(
  id: string,
  patch:
    | Partial<MachineProfile>
    | ((profile: MachineProfile) => MachineProfile),
): void {
  const list = get(profilesStore);
  const next = list.map((profile) => {
    if (profile.id !== id) return profile;
    const merged =
      typeof patch === 'function' ? patch(profile) : { ...profile, ...patch };
    return sanitizeProfile({ ...merged, id: profile.id, createdAt: profile.createdAt });
  });
  commit(next);
}

/** Convenience wrapper for edits to the selected profile. */
export function updateActiveProfile(
  patch:
    | Partial<MachineProfile>
    | ((profile: MachineProfile) => MachineProfile),
): void {
  updateProfile(get(activeProfileIdStore), patch);
}

export function resetProfileToDefaults(id: string): void {
  const list = get(profilesStore);
  const source = list.find((p) => p.id === id);
  if (!source) return;
  const fresh = createDefaultProfile(source.name, source.id);
  commit(list.map((p) => (p.id === id ? fresh : p)));
}
