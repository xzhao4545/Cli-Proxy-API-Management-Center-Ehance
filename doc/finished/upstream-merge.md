# Upstream Frontend Merge

## Result

Integrated upstream `main` at `4e4aeff23f9f82b3ccdbe48b2e774d5dc918234e`
with Enhance usage statistics, unavailable credentials, Amp integration,
provider labels, upstream error mapping, SQLite usage settings and
response-model validation. The upstream React feature layout, v8 configuration
editing, OAuth/quota flows and single-file deployment are preserved.

## Merge Corrections

- Read and persist provider labels through standard and OpenAI-compatible forms.
- Keep explicit custom backend routes for Amp, usage and unavailable APIs.
- Clear all displayed Amp configuration and reload after failed mutations.
- Complete missing locale keys for Amp and the retained fork pages.
- Keep the unavailable-page refresh callback current and restore its color token.
- Normalize Windows subprocess paths, source line endings and currency assertions.
- Exclude local conflict snapshots from lint and remove trailing empty lines.

## Verification

Production build and lint passed. A small set of key checks covers provider label
writes, custom endpoint paths, response-model rules and cross-platform regressions.
Browser checks cover configuration editing and retained fork views with simulated
Management API responses. No full test suite was run for this merge completion.

Current contract: [Backend Integration](../current/backend-integration.md).
