# Tasks

- [ ] Scaffold Electron, React, Vite, TypeScript, Vitest, and ESLint.
  - Acceptance: development window opens and automated checks run.
  - Verify: `npm run test:run && npm run lint && npm run typecheck && npm run build`

- [ ] Implement pairing-code domain rules using TDD.
  - Acceptance: normalization, expiry, single use, and device binding are specified by tests.
  - Verify: targeted Vitest suite.

- [ ] Implement a typed and sandboxed preload bridge.
  - Acceptance: renderer has no Node.js access and only documented commands are exposed.
  - Verify: IPC contract tests and Electron security assertions.

- [ ] Build the branded onboarding and connection interface.
  - Acceptance: all defined application states are usable at 1280×720 and 1024×640.
  - Verify: component tests and screenshots.

- [ ] Implement the tunnel child-process lifecycle.
  - Acceptance: connect, disconnect, unexpected exit, and app shutdown are deterministic.
  - Verify: integration tests with a fake runtime.

- [ ] Add pairing APIs to the 134 production control plane.
  - Acceptance: authenticated Mini App confirms a code; desktop exchanges it once.
  - Verify: API contract, PostgreSQL integration, replay, and expiry tests.

- [ ] Package a Windows preview.
  - Acceptance: installer launches on a clean Windows VM and uninstalls cleanly.
  - Verify: GitHub Actions packaging smoke test.

