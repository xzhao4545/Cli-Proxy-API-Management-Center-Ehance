# Release v0.3.5

The panel advances its local fork version from `0.3.4` to `0.3.5`, tagged
`v0.3.5`. The paired server remains at `0.3.8`; this release changes only the panel.

Response-model validation rules now offer searchable provider and label dropdowns
and model selection for adding matched models. Model candidates follow the selected
provider and label, and duplicate additions are prevented.

Usage statistics display long first-token times with compound units, such as
`90s` as `1m30s` and `3661s` as `1h1m1s`. The response-model column shows mismatch
warnings and explicit validation-block reminders with explanations. Model matching
follows the backend rules, and unrelated HTTP 502 errors do not appear as blocks.
All seven locales are updated.

Validation: `bun run verify` passed with `VERSION=v0.3.5`; the production build
produces a single `dist/index.html`. Desktop and mobile browser checks used mocked
management responses; live-backend integration was not verified. Only three new
tests are retained for provider selection/serialization and model warning/block
classification. Dependency versions and the lockfile are unchanged.

Current versions: [Current Documentation](../current/index.md).
