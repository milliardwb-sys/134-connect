# 134 Connect

Open-source desktop client for the 134 VPN service.

The project is under active development. The first supported target is
Windows 10/11 x64. Preview packages must not be treated as stable releases.

## Principles

- one-button connection for non-technical users;
- Telegram-based, device-bound pairing;
- no subscription URLs or protocol details in the renderer;
- verified open-source network runtime;
- reproducible public releases.

## Status

Preview status:

- Telegram device pairing and encrypted Windows credential storage are implemented;
- the production service can authorize a device and return its active Remnawave subscription to the Electron main process;
- the renderer never receives the session token or subscription URL;
- the pinned Xray-core runtime is verified and packaged;
- the full Windows TUN routing layer is not implemented yet, so this repository must not be advertised as a production-ready system-wide VPN client.

See
[`docs/spec.md`](docs/spec.md) and [`tasks/plan.md`](tasks/plan.md).

## Licensing

134 Connect application code is MIT licensed. Xray-core is a separate
third-party component licensed under MPL-2.0. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
