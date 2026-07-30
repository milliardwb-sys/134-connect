# 134 Connect implementation plan

## Phase 1 — Foundation

Status: completed

- Create the open-source repository and project rules.
- Record licensing decisions and third-party notices.
- Configure TypeScript, tests, lint, Vite, and Electron.

## Phase 2 — Pairing and session security

Status: completed

- Define pairing and device-identity contracts.
- Add one-time pairing endpoints to the 134 control plane.
- Store desktop credentials using the operating-system credential store.
- Prove code expiry, single use, and device binding with tests.

## Phase 3 — Desktop interface

Status: completed

- Implement first launch, pairing, home, connection, subscription, and help states.
- Apply the 134 brand system.
- Verify keyboard navigation, contrast, scaling, and reduced motion.

## Phase 4 — Tunnel runtime

Status: implementation_complete

- [x] Add a checksum-pinned Xray runtime.
- [x] Fetch server-owned runtime configuration only in Electron main.
- [x] Add the Windows TUN routing layer with tun2proxy.
- [x] Implement connect, disconnect, parent-process cleanup, and status reporting.
- [ ] Verify networking recovery after forced termination on a clean Windows machine.

## Phase 5 — Packaging and release

Status: in_progress

- [x] Create Windows NSIS packaging.
- [x] Add GitHub Actions checks and verified runtime download.
- [x] Produce an unsigned preview clearly marked as a test build.
- Publish the verified preview from the public repository.
- Add code signing before the stable public release.

## Phase 6 — Production acceptance

Status: pending

- Pair with a real 134 test account.
- Connect and verify public egress.
- Test sleep/wake, network change, reconnect, update, and uninstall.
- Publish the first stable release.

## Phase 7 — Additional platforms

Status: pending

- macOS Network Extension and notarized DMG.
- Android VpnService and store package.
- iOS NetworkExtension and TestFlight/App Store package.
