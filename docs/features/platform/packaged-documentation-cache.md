# Packaged documentation catalogue reuse

The trusted main process supplies `app.isPackaged` to the documentation service.
Only that explicit packaged-runtime decision enables service-lifetime reuse. A
pathname that looks packaged never enables it. Development requests read the
current catalogue again, preserving source-edit visibility.

`src/main/documentation-catalog-service.js` loads lazily. Concurrent catalogue and
changelog requests share one read and parse in packaged mode. The parsed JSON is
deeply frozen once, so direct service callers cannot mutate later responses.
Read or parse failure releases the promise for a later retry. Closing releases
the reference and rejects pending or later results. Existing request validation
and exit admission remain unchanged.

The packaged file is immutable for that application lifetime. Installing a new
version requires its own new service lifetime. This cache does not replace IPC
serialization, renderer article rendering, or browser documentation fetching.
Retaining the parsed catalogue increases main-process memory while avoiding
repeated temporary reads and parses.

On the measured 8,043,502-byte catalogue, repeated warm read/parse cost a median
14.45 ms in a separate Node process. This is a bounded component measurement,
not a cold-cache result or an end-to-end application improvement. Candidate-bound
before/after service measurements remain separate from actual GUI acceptance.

A controlled actual service-dispatch comparison on the same bytes measured a
14.96 ms fresh-read median versus 0.0014 ms for an already loaded packaged
catalogue. Concurrent catalogue/changelog medians were 33.11 ms and 0.0338 ms;
the first packaged read, parse and freeze took 14.64 ms. Explicit garbage
collection in a separate service lifetime observed 8,295,528 additional heap
bytes after loading and 8,362,216 fewer heap bytes after close. These are local
Node component observations, with raw timing samples retained separately; IPC,
ASAR access, renderer work and installed application responsiveness are unverified.

`test/documentation-catalog-service.test.js` checks lazy concurrent reuse, nested
mutation rejection, retry after read/parse failure, fresh development data,
unsupported actions, close during load, and the production dispatch/exit seam.
Synthetic results do not establish installed-runtime responsiveness.
