// Small JSON store over localStorage. Every read and write is guarded: private windows and blocked storage fall back to memory.
const memory = new Map();
export function readJson(key, fallback) {
 try { const raw = localStorage.getItem(key); if (raw !== null) return {...fallback, ...JSON.parse(raw)}; } catch { /* use memory */ }
 return memory.has(key) ? {...fallback, ...memory.get(key)} : {...fallback};
}
export function writeJson(key, value) {
 memory.set(key, value);
 try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function removeKey(key) { memory.delete(key); try { localStorage.removeItem(key); } catch { /* nothing stored */ } }
