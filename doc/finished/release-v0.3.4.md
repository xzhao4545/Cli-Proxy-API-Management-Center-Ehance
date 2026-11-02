# Release v0.3.4

The panel advances its local fork version from `0.3.3` to `0.3.4`, tagged
`v0.3.4`. The paired server advances from `0.3.7` to `0.3.8`, tagged `v0.3.8`
in its repository. Upstream versions do not determine these release numbers.

The release includes the upstream UI merge, response-model validation editor,
provider labels and complete Amp configuration clearing. Enhance usage statistics
and unavailable-credential views are retained.

Validation: the production build passed with `VERSION=v0.3.4` and produces a
single `dist/index.html`. The release workflow injects the pushed tag through
the same environment variable. Dependency versions and the lockfile are unchanged.

Current versions: [Current Documentation](../current/index.md).
