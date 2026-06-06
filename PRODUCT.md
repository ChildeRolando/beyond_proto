# Product

## Register

product

## Users

Players and developers testing a hex-grid synchronous turn battle game in a browser. They move between local, P2P, and PVE flows, configure roles and loadouts, then make precise turn-by-turn combat decisions from a dense battlefield UI.

## Product Purpose

The combat engine lets users set up classes, roles, loadouts, and battle modes, then resolve deterministic simultaneous turns on a hex board. Success means the interface makes tactical state, available actions, resources, and battle feedback easy to scan without hiding the game's martial fantasy tone.

## Brand Personality

Tactical, arcane, decisive. The UI should feel like a battle command table for qi, bullets, blades, shields, and dimensional effects, not a generic SaaS dashboard or decorative fantasy landing page.

## Anti-references

Avoid generic AI game UI patterns: purple glass cards everywhere, oversized marketing hero sections, soft blurry blobs, identical icon cards, low-contrast gray text, and decorative labels that do not help play. Avoid noisy fantasy ornament that competes with the board or slows repeated play.

## Design Principles

1. Put combat decisions first: current actor, resources, skill costs, target hints, and log feedback must remain immediately visible.
2. Treat visual style as instrumentation: glow, color, and motion should indicate selection, readiness, energy, danger, or mode.
3. Preserve density with hierarchy: the interface can be compact, but panels need clear edges, readable text, and consistent controls.
4. Match the game's hybrid tone: martial arts, gunplay, and spell systems can coexist through restrained tactical surfaces and sharp accent colors.
5. Keep routing simple: start, config, battle, overlays, and rematch states should retain the existing DOM and controller contracts.

## Accessibility & Inclusion

Aim for readable contrast on dark surfaces, clear focus states for keyboard navigation, and reduced-motion fallbacks for decorative pulses or scanning effects. Do not rely on color alone for selected, disabled, or ready states.
