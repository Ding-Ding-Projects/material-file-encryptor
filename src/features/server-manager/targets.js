export const TARGET_IDS = Object.freeze(['local-process','local-container','ssh-process','ssh-container']);
const requirements={
  'local-process':['distribution-digest','runtime','owned-process-identity','ports','paths','graceful-stop'],
  'local-container':['daemon-identity','image-digest','owned-container-labels','mounts','ports','capacity'],
  'ssh-process':['approved-host-key','protected-authentication','runtime','owned-process-identity','paths','reconnect'],
  'ssh-container':['approved-host-key','protected-authentication','daemon-identity','image-digest','owned-container-labels','mounts','ports','reconnect']
};
export function targetCapabilities() {
  return TARGET_IDS.map(id=>({id,discovery:'not-implemented',lifecycle:id==='local-process'?'implemented-unverified':'not-implemented',extensions:'not-implemented',available:false,reason:id==='local-process'?'An internal conditional lifecycle adapter exists, but trusted native file leases, runtime/network admission and product integration remain unavailable.':'No runtime target adapter is implemented.',requiredProofs:[...requirements[id]],adoptionRequiresConsent:true,disconnectedMeansStopped:false}));
}
export function assertTargetInventory(rows) {
  if(!Array.isArray(rows)||rows.length!==TARGET_IDS.length||new Set(rows.map(x=>x.id)).size!==TARGET_IDS.length||TARGET_IDS.some(id=>!rows.some(x=>x.id===id))) throw new Error('Execution target inventory is incomplete.');
  for(const row of rows) if(row.available!==false||!row.reason||requirements[row.id].some(proof=>!row.requiredProofs.includes(proof))) throw new Error('Unimplemented target or proof was misrepresented.');
  return true;
}
