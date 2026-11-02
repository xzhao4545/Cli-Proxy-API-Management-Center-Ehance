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
- Exclude the Amp configuration singleton from retired-provider credential counts.

## Verification

Production build and lint passed. A small set of key checks covers provider label
writes, custom endpoint paths, response-model rules and cross-platform regressions.
Browser checks cover configuration editing and retained fork views with simulated
Management API responses. The full suite ran 1,880 tests: 1,874 passed and six
retired-provider resource counts failed because they included the Amp configuration
singleton. After correcting that shared assertion, all seven tests in the affected
file passed in a focused rerun. The full suite was not repeated after this test-only
correction.

Current contract: [Backend Integration](../current/backend-integration.md).
