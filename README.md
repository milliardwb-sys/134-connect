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

Windows preview status:

- Telegram device pairing and encrypted Windows credential storage are implemented;
- the production service can authorize a device and return its active Remnawave subscription to the Electron main process;
- the renderer never receives the session token or subscription URL;
- pinned Xray-core and tun2proxy runtimes are checksum-verified and packaged;
- an elevated helper starts the system-wide Windows TUN tunnel, monitors it,
  and removes routes before Xray is stopped;
- the current package is unsigned and still requires real-device acceptance
  testing, so it must remain clearly identified as a preview build.

See
[`docs/spec.md`](docs/spec.md) and [`tasks/plan.md`](tasks/plan.md).

## Licensing

134 Connect application code is MIT licensed. Xray-core and tun2proxy are
separate third-party runtime components under MPL-2.0 and MIT respectively. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
