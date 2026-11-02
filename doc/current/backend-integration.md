# Backend Integration

## API and Configuration

Core management requests use `/v8/management` and the v8 configuration tree.
The shared API client attaches management authentication, pins connection identity
and publishes server version updates. Configuration editing keeps unknown fields,
comments, provider group identities and explicit inheritance overrides.

The Enhance backend mounts Amp, detailed usage and unavailable/reset endpoints as
custom extensions under `/v0/management`. Their domain modules resolve these explicit
paths through `apiClient.getExtensionUrl`; they use the shared authenticated client.
These paths are not fallbacks for core management requests.

## Enhance Features

- Usage statistics and unavailable credentials retain separate routes and navigation.
- Standard API-key and OpenAI-compatible provider forms read and write configuration
  `label` independently of routing names. Provider filtering and sorting include labels.
- Amp configuration supports upstream fallback keys, client-key mappings, model
  mappings and the force-mapping flag. Clearing removes all displayed settings;
  failed mutations report an error and reload the current server configuration.
- Network configuration exposes `upstream-4xx-to-502` and response-model validation.
- Logging configuration exposes SQLite usage storage at `usage.enabled`.
- Response-model validation rules accept a provider key, optional `label`, and
  resolved model IDs. Selected streams are buffered completely before release;
  loose model matching and missing-model behavior are enforced by the backend.
- Seven UI languages are registered: English, Simplified Chinese, Traditional
  Chinese, Russian, Vietnamese, Korean and Turkish.

## Verification

Use Bun 1.4.3 for build and lint. Lint excludes generated `dist` output and local
`.codex` tooling/snapshots. The production artifact is a single `dist/index.html`.
Run a small selection of key tests for changes to provider writes, API paths and
configuration round trips. Browser checks can use a simulated backend for UI and
wire payloads; live backend verification is required to assess deployment behavior.
