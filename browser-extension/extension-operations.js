// One entry point for the workspace's operations features, so options.js needs
// a single import and a handful of small hooks:
//   - procedures, interrupted-operation recovery and Status Hub enrollment,
//   - the durable step journal around desktop requests and exports,
//   - the personal wording boundary.
import {mountOperations} from './operations-panel.js';
import {newId, bindingFor, journaledRequest, trackRequest, beginOperation, markStep, finishOperation} from './operation-journal.js';
import {entriesFor, publicCopy} from './vocabulary-boundary.js';

/** Sends a desktop message; the requests listed in JOURNALED_REQUESTS leave a journal record while in flight. */
export function journaledSend(storage, send, message, {owner, binding}) {
  return journaledRequest(storage, send, message, {owner, binding});
}

/** Records an export's save step so an interruption between building and saving can be resumed. */
export function trackExport(storage, {owner, binding, format, now = Date.now}) {
  const begun = beginOperation(storage, {kind: 'export', owner, binding, param: format, steps: [{id: 'build', destructive: false}, {id: 'save', destructive: false}], now: now()});
  const id = begun.operation?.id;
  if (id) { markStep(storage, id, 'build', 'done', now()); markStep(storage, id, 'save', 'started', now()); }
  return {complete() { if (id) finishOperation(storage, id); }};
}

export const extensionOperations = Object.freeze({mount: mountOperations, newId, bindingFor, journaledSend, trackRequest, trackExport, entriesFor, publicCopy});
