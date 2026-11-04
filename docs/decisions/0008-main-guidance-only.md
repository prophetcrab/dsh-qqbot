# 0008 - main as Guidance-Only Branch

## Status

Accepted. Supersedes the "platform branches merge main" part of
[0007](0007-multiplatform-branch-strategy.md). Feature/release flow is defined
in [0009](0009-feature-flow-and-release-convention.md).

## Decision

`main` is the repository's **guidance / management** branch. It does not carry
the plugin body (no `host/`, `client/`, `template/`, `vendor/`, built bundles or
release binaries).

```text
main               direction, decisions, roadmap, release metadata, governance
dshbot-mac         complete macOS code + macOS assets
dshbot-win64       complete Windows code + Windows assets
feature/*          short-lived work branched from the owning platform branch
```

## Branch Rules

- Platform branches are code-bearing and platform-scoped. `dshbot-win64` must
  not carry macOS source, payloads or runtime bundles; `dshbot-mac` must not
  carry Windows-only assets.
- `main` changes are documentation/governance changes only.
- Do **not** merge `main` wholesale into a platform branch. If shared guidance
  is needed, take the relevant paths explicitly:

  ```bash
  git checkout main -- docs/ README.md
  ```

- Shared code changes flow from `dshbot-mac` to `dshbot-win64` through focused
  cherry-picks (or a short-lived shared feature branch), not through `main`.
  Do not develop cross-platform features independently on the Windows branch.
- Platform-specific features stay on the owning platform branch; Windows work is
  primarily synchronization plus platform adaptation.

## Release Shape

Platform branches own their code tags:

```text
dshbot-mac    → v0.7.0          (existing mac convention)
dshbot-win64  → v0.7.0-win64
```

The two platform releases are independent; version numbers do not need to match.
See [0009](0009-feature-flow-and-release-convention.md) for release quality
requirements.

`main` records the release set, artifact names, checksums and links under
`releases/`; it does not host the artifacts.

## CI

- `main`: documentation/link/decision checks only.
- `dshbot-mac`: macOS runner, macOS code tests and packaging.
- `dshbot-win64`: Windows runner, Windows code tests and packaging.

Shared workflow definitions may live under `main/.github/workflows/` as
reusable workflows, but platform code is checked out and tested from the
platform branch.

## Platform Isolation

Platform-specific code/resources live only on their branch:

```text
dshbot-mac    host/platform/mac, macOS NapCat payload, darwin runtime bundle
dshbot-win64  host/platform/win, Docker backend, win32-x64 runtime bundle
main          none of the above
```

Platform-neutral code (`host/platform/common`, kernel, contracts, most
services/plugins/client) is synced between platform branches by cherry-pick or a
focused shared change, never by importing code from `main`.

## Migration

Completed on 2026-11-05:

1. `main` was reconstructed as a guidance-only branch with no plugin body.
2. The previous `main` tip is preserved by the `archive/main-pre-guidance` tag.
3. Platform branches keep the code history and continue as `dshbot-mac` /
   `dshbot-win64`.
4. From now on, only documentation/governance PRs target `main`; never merge
   `main` into a platform branch.
5. Platform branches record guidance references and keep their own release tags
   and artifacts.
