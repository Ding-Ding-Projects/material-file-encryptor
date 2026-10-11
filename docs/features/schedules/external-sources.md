# Privileged schedule sources

`src/main/schedule-source.js` exposes `createScheduleSource({ credentials, lookup, request, authorizeCredentialMutation })`. Network work belongs only in the main process. The renderer must not receive this object or access the credential methods directly.

## Source shape and result

```js
await adapter.fetch({ type: 'api', url: 'https://example.org/settings' }, { id: rule.id });
await adapter.fetch({ type: 'home-assistant', url: 'https://ha.example.org',
  entityId: 'binary_sensor.work' }, { id: rule.id });
```

The API returns JSON with exactly `version: 1` and `settings`. Only language, theme, density, seed color, font family/scale/weight, motion, display name, emoji and the two funny-level fields are accepted. Their ranges match the shared settings contract. The adapter returns validated settings with a fresh check timestamp and provenance containing the source host and opaque source identity, without the URL path or query.

Home Assistant uses `/api/states/<entityId>`, allows only `binary_sensor` and `input_boolean`, requires a matching response `entity_id`, and accepts only `on` or `off`. The result contains `state`, `active`, timestamp and bounded provenance. Other entity attributes are discarded. The caller applies `on` to the rule values; `off` leaves the local base or other matching rule active. Network errors must leave base settings intact.

The current editor's `entity` field is also accepted as an alias for `entityId`. Supplying both with different values is rejected. Empty entity text on an API source is harmless; a nonempty API entity is rejected.

## Credentials and native boundary

The credential key is `schedule:<rule id>`. The existing protected store must allow this prefix internally while excluding it from every renderer-readable credential route. `credentials.get()` supplies `{token, origin}` only inside the fetcher. `registerToken(id, token, nativeContext)` and `deleteToken(id, nativeContext)` require the host's `authorizeCredentialMutation` callback. Registration's native context also contains the approved `source` configuration. The parent must bind authorization to verified native callers and a private credential intake control, not a renderer-supplied Boolean. The credential is bound to that source origin, preventing an edited URL from forwarding it to a different server. Unbound legacy string credentials are rejected and require native registration. These methods return only identifier and outcome. No method returns a credential.

The shared resolver currently calls `fetchSource(source)`. The parent wrapper must also supply the stable rule identifier, either through `fetch(source, {id: rule.id})` or the permitted source `id` field. Results retain the shared resolver's existing version/settings and on/off shapes.

## Transport protections

Production sources require HTTPS. Redirects, URL credentials, credential-like query fields, fragments, compressed bodies and non-JSON content types are rejected. The default ports are 443, 8123 and 8443. Private, loopback, link-local, multicast, documentation and special-use addresses are rejected, including IPv4-mapped IPv6. Every DNS answer must be approved; one validated address is pinned through the connection's custom lookup callback. TLS still verifies the original hostname, with certificate validation enabled and connection reuse disabled.

An explicit `allowLoopbackDevelopment` option permits HTTP only for exact literal `127.0.0.1` or `[::1]`, on the bounded development ports. It does not permit `localhost`, alternate numeric spellings, other loopback addresses, private LAN hosts, or names resolving to loopback. Production defaults leave this disabled.

Limits: 2,048 URL characters, 32 KiB UTF-8 JSON, depth 6, 128 fields per object, 5 seconds total, four concurrent requests and 100 schedule identifiers. Duplicate JSON keys and unsafe keys are rejected. Refreshes are rate-limited to one attempt per rule per 30 seconds; overlapping identical requests share one operation. Errors contain no response bodies, credentials or paths. There is no automatic retry loop.

## Verification and ownership

`node --test test/schedule-source.test.js` uses synthetic DNS and HTTP transports. It tests pinning, mixed private/public answers, URL rejection, exact loopback opt-in, redirect/body/schema limits, Home Assistant credentials, native mutation authorization, refresh throttling and timeouts. No user endpoint is contacted. The parent owns IPC authorization, protected-store key policy and resolver integration; this module does not modify those files or schedule timing semantics.
