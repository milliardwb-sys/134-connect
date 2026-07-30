# 134 Connect design system

## Product character

Calm, direct, independent. The interface should feel like a reliable utility,
not a technical dashboard and not a generic neon VPN.

## Signature motif

The 134 radial signal mark sits behind or beside the primary connection
control. It represents reach and movement. It may be cropped, but its origin
must remain visually clear.

## Palette

- Ink: `#0A0D12`
- Signal blue: `#315CFF`
- Electric lime: `#C7FF4A`
- Warm white: `#F7F7F2`
- Action orange: `#FF6B35`

## Typography

Use the native Segoe UI variable family on Windows. Headlines are heavy,
tightly tracked, and short. Interface copy uses sentence case and plain
Russian.

## Interaction rules

- One primary action per screen.
- Never show protocols, subscription URLs, tokens, or server identifiers.
- Never display “connected” until the tunnel runtime reports readiness.
- Keyboard focus is always visible.
- Motion is optional and has a reduced-motion fallback.
