# Packaged documentation catalogue reuse

The main process supplies `app.isPackaged` as a trusted input. Only that explicit decision enables a lazy shared read and parse for catalogue and changelog requests. A packaged-looking pathname does not enable reuse. Development requests read fresh content.

Parsed packaged JSON is deeply frozen, read or parse failures permit retry, and closing releases the retained reference and rejects pending or later results. Existing request validation and exit admission remain unchanged. Installing another version requires a new service lifetime. Retaining the parsed catalogue costs memory while avoiding repeated reads and parses.

The main-baseline adaptation includes no newer access, browser or server lifecycle methods. Dedicated tests cover concurrent reuse, mutation rejection, retry, fresh development reads, unsupported actions, close during load and actual feature-service dispatch. New source-bound root build and service measurements remain pending. Earlier candidate measurements at `9c4f6dc33d1988fc3a47bcdb7f2ebf420438dc08` do not certify this source. IPC, renderer speed, installed behavior and visible acceptance remain separate.
