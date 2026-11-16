// Applies the motion profile to the document and owns its persistence. Every animated surface reads the CSS custom
// properties this controller writes, so a change here is visible everywhere at once, with no reload.
import {
  BUILT_IN_PROFILES, DEFAULT_PROFILE_ID, MAX_CUSTOM_PROFILES, MOTION_KINDS, STORAGE_KEY,
  builtInProfile, defaultState, exportProfileJson, motionCssVars, parseProfileJson, reducedMotionReason,
  sameProfile, validateProfile, validateState
} from './motion-tokens.js';

const MAX_STORED_BYTES = 131072;

export function createMotionController({doc = globalThis.document, storage = globalThis.localStorage, onError = () => {}} = {}) {
  const view = doc?.defaultView || globalThis;
  const root = doc?.documentElement;
  const listeners = new Set();
  let state = defaultState();
  let disposed = false;

  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return;
      if (new TextEncoder().encode(raw).length > MAX_STORED_BYTES) throw new Error('Stored motion settings are too large.');
      state = validateState(JSON.parse(raw));
    } catch (error) {
      state = defaultState();
      onError(error);
    }
  }

  function persist() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { onError(error); }
  }

  function reducedInfo() {
    const media = (() => { try { return view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; } })();
    const reason = reducedMotionReason({media, appSetting: root?.dataset?.motion, lowStimulation: root?.dataset?.lowStimulation === 'true'});
    return {reduced: reason !== null, reason};
  }

  /** Writes the effective custom properties on the root element. */
  function apply() {
    if (disposed || !root) return;
    const {reduced} = reducedInfo();
    for (const [name, value] of Object.entries(motionCssVars(state.profile, {reduced}))) root.style.setProperty(name, value);
    root.dataset.motionProfile = state.activeId;
    root.dataset.motionLayer = reduced || !state.profile.master ? 'off' : 'on';
  }

  function emit() { for (const listener of [...listeners]) { try { listener(snapshot()); } catch (error) { onError(error); } } }

  function commit(next, activeId) {
    state = {...state, profile: next, activeId};
    persist(); apply(); emit();
    return snapshot();
  }

  function snapshot() {
    return {state: structuredClone(state), ...reducedInfo(), profileName: state.profile.name};
  }

  function markEdited(profile) {
    const match = BUILT_IN_PROFILES.find(row => sameProfile(builtInProfile(row.id), profile));
    if (match) return match.id;
    const custom = Object.entries(state.custom).find(([, value]) => sameProfile(value, profile));
    return custom ? custom[0] : 'edited';
  }

  const api = {
    snapshot,
    kinds: MOTION_KINDS,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reduced: reducedInfo,
    /** Replaces one kind's values after validation. */
    setKind(id, patch) {
      const next = validateProfile({...state.profile, kinds: {[id]: patch}}, {fallback: state.profile});
      return commit(next, markEdited(next));
    },
    setMaster(value) {
      const next = validateProfile({version: 1, master: value}, {fallback: state.profile});
      return commit(next, markEdited(next));
    },
    setSpeed(value) {
      const next = validateProfile({version: 1, speed: value}, {fallback: state.profile});
      return commit(next, markEdited(next));
    },
    useProfile(id) {
      if (BUILT_IN_PROFILES.some(row => row.id === id)) return commit(builtInProfile(id), id);
      if (Object.hasOwn(state.custom, id)) return commit(validateProfile(state.custom[id]), id);
      throw new Error('This motion profile does not exist.');
    },
    saveProfile(name) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed || trimmed.length > 40 || /[\x00-\x1f\x7f<>]/.test(trimmed) || BUILT_IN_PROFILES.some(row => row.id === trimmed.toLowerCase() || row.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('Choose a different profile name.');
      if (!Object.hasOwn(state.custom, trimmed) && Object.keys(state.custom).length >= MAX_CUSTOM_PROFILES) throw new Error('Delete a saved motion profile before saving another.');
      state = {...state, custom: {...state.custom, [trimmed]: validateProfile({...state.profile, name: trimmed})}};
      return commit({...state.profile, name: trimmed}, trimmed);
    },
    deleteProfile(name) {
      if (!Object.hasOwn(state.custom, name)) throw new Error('This motion profile does not exist.');
      const {[name]: removed, ...rest} = state.custom;
      state = {...state, custom: rest};
      return commit(state.profile, state.activeId === name ? 'edited' : state.activeId);
    },
    /** Resets one kind to the values of the active built-in profile, or Expressive for an edited or saved one. */
    resetKind(id) {
      const base = builtInProfile(BUILT_IN_PROFILES.some(row => row.id === state.activeId) ? state.activeId : DEFAULT_PROFILE_ID);
      const next = validateProfile({...state.profile, kinds: {[id]: base.kinds[id]}}, {fallback: state.profile});
      return commit(next, markEdited(next));
    },
    resetAll() {
      return commit(builtInProfile(DEFAULT_PROFILE_ID), DEFAULT_PROFILE_ID);
    },
    importJson(text) {
      const next = parseProfileJson(text);
      return commit(next, markEdited(next));
    },
    exportJson() { return exportProfileJson(state.profile); },
    /** Briefly shows what a kind looks like with its current effective values. Returns false when motion is off. */
    previewable() { return !reducedInfo().reduced && state.profile.master; },
    destroy() {
      disposed = true; listeners.clear(); mediaQuery?.removeEventListener?.('change', apply); observer?.disconnect(); view.removeEventListener?.('storage', onStorage);
    }
  };

  const mediaQuery = (() => { try { return view.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch { return null; } })();
  mediaQuery?.addEventListener?.('change', () => { apply(); emit(); });
  const observer = typeof view.MutationObserver === 'function' && root ? new view.MutationObserver(() => { apply(); emit(); }) : null;
  observer?.observe(root, {attributes: true, attributeFilter: ['data-motion', 'data-low-stimulation']});
  // Another window that changes the stored profile reaches this one through the storage event, like other settings.
  function onStorage(event) { if (event.key === STORAGE_KEY && !disposed) { load(); apply(); emit(); } }
  view.addEventListener?.('storage', onStorage);
  load(); apply();
  return api;
}
