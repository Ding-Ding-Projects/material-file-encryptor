// When may the personal wording be shown? Private wording appears only after authentication, except that a person
// who never set up a local profile has nothing to authenticate with, so they are the owner of this device.
//   applied   the wording is shown;
//   waiting   a file is loaded and a local profile exists but is locked: shown right after unlock;
//   inactive  nothing to show: school mode, no file loaded, or the profile check has not answered yet.
// profileExists is true, false, or undefined while unknown; unknown fails closed.
export function wordingGate({ school = false, authenticated = false, profileExists, hasWording = false } = {}) {
  if (school === true) return { state: 'inactive', active: false };
  if (authenticated === true || profileExists === false) return { state: 'applied', active: true };
  return profileExists === true && hasWording ? { state: 'waiting', active: false } : { state: 'inactive', active: false };
}
