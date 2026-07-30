# Spec: 134 Connect

## Objective

Build an open-source, branded VPN client for customers of the 134 service. A non-technical user installs the application, pairs it with Telegram using a short-lived code, and controls the VPN with one primary button. Technical protocol details and subscription URLs stay hidden.

The first production slice targets Windows 10/11 x64. The architecture must permit later macOS, Android, and iOS clients without changing the server-side pairing contract.

## Acceptance criteria

- The application is branded only as 134 Connect.
- A user can pair with a short-lived, single-use code issued by the 134 Mini App.
- Pairing is bound to a locally generated device identity.
- The renderer never receives a raw subscription URL or a long-lived service credential.
- The application can start, stop, and report the state of an Xray-based tunnel.
- Closing or crashing the application restores networking and stops its child process.
- Installers are produced by GitHub Actions from public source.
- No HAPP or Hiddify source, binary, artwork, or trademark is included.

## Tech stack

- Electron for the desktop host and lifecycle integration.
- React and TypeScript for the renderer.
- Vite for renderer builds.
- Zod for all external boundaries.
- Vitest for domain and security tests.
- Xray-core as an unmodified sidecar under MPL-2.0.
- electron-builder for Windows NSIS and macOS DMG packaging.

## Commands

- `npm install`
- `npm run dev`
- `npm run test:run`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run package:windows`

## Project structure

```text
src/main/       Electron process, secure storage, tunnel lifecycle
src/preload/    Narrow typed IPC bridge
src/renderer/   React interface
src/shared/     Pure contracts and state machines
tests/          Unit and contract tests
resources/      Branding and packaging assets
scripts/        Verified core download and release helpers
docs/           Architecture, security, release documentation
tasks/          Implementation plan and task list
```

## Code style

```ts
export function transitionConnection(
  current: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  const next = connectionTransitionSchema.parse({ current, event });
  return reduceConnectionTransition(next);
}
```

- Pure domain functions.
- Named exports.
- Explicit return types at external boundaries.
- No unvalidated casts for API or IPC data.

## Pairing protocol

1. The desktop client generates an Ed25519 key pair and stores the private key using the operating-system credential store.
2. The client displays an eight-character pairing code.
3. The user confirms that code in the authenticated Telegram Mini App.
4. The server binds the device public key to the Telegram account and active entitlement.
5. The desktop exchanges the confirmed code for a short-lived access token.
6. Configuration is fetched over HTTPS and passed only to the privileged tunnel controller.
7. Renewal uses the device identity; no subscription URL is exposed to the renderer.

## Testing strategy

- Unit tests: pairing-code normalization, connection transitions, redaction, configuration validation.
- Contract tests: IPC schemas and API response schemas.
- Integration tests: tunnel child-process lifecycle with a fake executable.
- E2E tests: first launch, pairing, connect, disconnect, expired subscription.
- Packaging smoke test: unattended CI install, launch, uninstall.

## Boundaries

### Always
- Validate external data.
- Redact sensitive fields from logs.
- Verify Xray checksums before packaging.
- Preserve upstream license and notices.
- Keep OS security prompts visible.

### Ask first
- Add analytics or crash reporting.
- Add a new third-party networking core.
- Publish to Microsoft Store or Apple App Store.
- Purchase or use signing certificates.

### Never
- Commit production secrets.
- Accept a subscription URL from renderer-controlled input.
- Download and execute an unverified binary.
- Disable TLS validation.
- Claim affiliation with HAPP, Hiddify, Xray, or their authors.

## Success criteria

- All automated checks pass on Windows CI.
- A clean Windows VM can install the signed-or-clearly-identified preview package.
- Pairing cannot be reused or transferred to another device key.
- The application connects to a real 134 test entitlement and disconnects cleanly.
- The repository and release source remain public.

