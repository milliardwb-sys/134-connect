# Third-party notices

## Xray-core

134 Connect is designed to distribute an unmodified Xray-core executable as a
separate runtime component.

- Project: https://github.com/XTLS/Xray-core
- License: Mozilla Public License 2.0
- Relationship: independent upstream project; no affiliation or endorsement
  is implied.

The release workflow must ship Xray-core's license next to its executable and
publish the exact upstream version and checksum used for every 134 Connect
release.

## tun2proxy

134 Connect distributes tun2proxy as a separate runtime component for
the Windows TUN layer.

- Project: https://github.com/tun2proxy/tun2proxy
- Version: v0.8.3
- License: MIT

The Windows x64 binary is downloaded from the official release and verified
against a pinned SHA-256 checksum. It is not committed to this repository.
