// The driver retries only complete pre-attachment ownership proof. This helper
// neither executes steps nor retries an action, target discovery or recovery.
export function withCdpConnectionProof(plan, purpose = 'runtime') {
 const allowed = ['runtime','control','capture','modern-observation','recovery','teardown'];
 if (!allowed.includes(purpose)) throw new Error('Unknown CDP connection purpose.');
 const {startupOwnershipAttempts, ...connection} = plan;
 return ['recovery','teardown'].includes(purpose)
  ? connection
  : {...connection, startupOwnershipAttempts:3};
}
