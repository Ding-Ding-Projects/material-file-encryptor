# Packaged state adapter contract, version 1

Each area owns one new `scripts/gui-acceptance-<area>.mjs` and matching `test/gui-acceptance-<area>.test.js`. Do not modify the shared acquisition module or state inventory from area lanes.

Export `createAreaAdapters({launch, receipt, inventory, prepareOwnedFixture, fixtures = {}})`. Return an object keyed by the exact state IDs in `contracts/gui-states.json`. The caller merges these objects and rejects duplicate keys. `baselineAdapters` already owns `drive-locked`, `settings-default`, `create-password`, `ollama-help`, and `p-attention`; do not duplicate them.

Each state adapter implements:

```js
{
  async prepare({tuple, binding, executePlan}) {
    // Observe/setup ONLY owned native fixtures through supported production APIs.
    // Invoke prepareOwnedFixture to establish exact drive identity when needed.
    return {ownedSyntheticFixture: true, sourceCommit: binding.sourceCommit,
      /* actual fixture observations, no credentials or user data */};
  },
  async enter({tuple, binding, executePlan, prepared}) {
    // Optional: ordinary UI actions after shared navigation selects the view/tab.
    // Open the required editor, disclosure, prompt or other state here.
  },
  async assertState({tuple, executePlan}) {
    // Independent read-only observations. Throw on a mismatch.
    return {passed: true, observable: /* exact inventory observable */, evidence};
  },
  actions: {
    /* every exact inventory action ID */: async ({tuple, binding, executePlan, prepared}) => {
      // Drive a real control and assert its independent resulting observable.
      return {id: /* exact action ID */, activated: true,
        observablePassed: true, activation: /* actual route */, evidence};
    }
  },
  async restore({tuple, binding, executePlan}) {
    // Optional: restore owned settings and close transient surfaces via real UI.
    // Runs after capture or failure. A restoration failure remains failed.
    return {restored: true, evidence};
  }
}
```

`prepare` runs before navigation and again after action verification. `enter` runs after each navigation. `assertState` runs before actions and again before capture. Action order is the inventory order. The producer then observes settled motion, composed controls, layout, runtime and native ownership, saves genuine pixels, and leaves them awaiting independent inspection/reference comparison. `restore` runs at the end of each tuple even when capture failed.

`executePlan` accepts the existing version-1 CDP plan with exact `receipt`, loopback endpoint, `expectedUrl`, `allowEvaluate`, bounded `timeoutMs` and `steps`. Use `withCdpConnectionProof` for every plan. It returns the existing driver's real results. Use production selectors and open shadow roots. A DOM click is labeled `dom-click`, never native pointer proof. Do not assume a returned `ok` proves the state; check step results and actual observables.

`fixtures` contains caller-provided producers for capabilities genuinely requiring native setup, native pickers, bounded loopback providers or protected credential operations. Missing capabilities throw a precise `CAPABILITY_UNAVAILABLE: <name>` before mutation. Never return optimistic success, replace `window.drive`, remount components, fabricate catalogue/status/operation objects, freeze Date, bypass integrity checks, or alter the production graph/CSP. Clock-relative schedules use actual recorded wall-clock observations. No real vault, model download or unrelated data is allowed.

Do not return secrets, secret-derived diagnostics, QR contents, one-time codes, local profile credentials or arbitrary full private records in evidence. Synthetic data is explicitly identified. Clear or hide sensitive surfaces before capture and prove the condition read-only. File chooser interception proves browser behavior only, not native picker pixels.

Focused tests exercise meaningful negative cases: missing capabilities must stop before mutation, wrong state must fail, and absent or inactive controls must not produce success. Parser checks and mocked tests are labeled source-only. Runtime acceptance remains pending the exact packaged candidate.

Inventory additions require owner-supplied ID, selector, fixture, observable, actions, reason and source commit. Existing 74 baseline IDs remain frozen. Ten approved history/logo additions and three independently privileged access-history additions bring the total to 87 states and 4,176 tuples. Area code reads the inventory; it does not silently delete or replace requirements.
