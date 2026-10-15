// Electron wraps an error thrown in the main process as
// "Error invoking remote method 'channel': Error: <message>". The wrapper is internal detail, and it also stops the
// interface from finding the translated text for the real message, so only the message itself is shown.
const WRAPPER = /^Error invoking remote method '[^']{1,80}': (?:[A-Za-z]{0,40}Error: )?/u;

export function plainErrorMessage(error, fallback = 'The operation could not be completed.') {
  const message = error instanceof Error ? error.message : String(error || fallback);
  const plain = message.replace(WRAPPER, '').trim();
  return plain || fallback;
}
