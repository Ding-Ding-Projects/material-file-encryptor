import { runOperation } from './regex/engine.js';

// Every operation (filter, test, split, grep, debug, benchmark) runs here so a runaway match can be
// stopped by terminating this worker. The owner starts its match deadline when it sees `ready`.
self.onmessage = ({ data }) => {
  try {
    self.postMessage(runOperation(data));
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
self.postMessage({ ready: true });
