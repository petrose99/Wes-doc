# Contributing to DocuBite

Thank you for taking the time to help improve DocuBite. This guide describes the process for
submitting changes, reporting bugs, and cutting a release.

## Reporting security issues

Please **do not** open a public issue for security problems. Follow the process in
[SECURITY.md](SECURITY.md).

## Reporting bugs and requesting features

Open an issue at the project's issue tracker. Include:

- What you were trying to do.
- What actually happened, with the exact error text and any stack trace.
- Steps to reproduce, with the smallest example that shows the problem.
- The versions of DocuBite, Node.js, and your operating system.

## Working on a change

1. Fork the repository and create a branch. Branch names follow `type/short-topic`, where `type`
   is `feature`, `fix`, `docs`, `refactor`, `chore`, `test`, or `security`. Example:
   `fix/health-sync-scope`.
2. Sign your commits (`git commit -s`). By signing you accept the
   [Developer Certificate of Origin](https://developercertificate.org/).
3. Follow the commit-message convention already in `git log`: a short imperative summary on the
   first line, an optional blank line, and a body that says *why* rather than *what*.
4. Add or update tests. `npm run test`, `npm run lint`, and `npm run type-check` must pass. Run
   them locally before opening a PR.
5. Update [CHANGELOG.md](CHANGELOG.md) under the `Unreleased` section with a short entry in the
   appropriate category (Added / Changed / Fixed / Removed / Security).
6. Open a pull request against `master`. Fill in the PR template. At least one code owner (see
   `.github/CODEOWNERS`) must approve before merge.

## Code style

- TypeScript strict mode; no `any` unless narrowed at a system boundary.
- Prefer editing existing files to creating new abstractions. Three similar lines beats a
  premature abstraction.
- Do not add error handling, fallbacks, or validation for scenarios that cannot happen.
- Default to writing no comments; add one only when the *why* is non-obvious.

## Tests

- `npm run test` — unit and integration tests (Vitest).
- `npm run test -- <path>` — one file or match.
- `npm run test:db` — integration tests that talk to a real Postgres (see
  [docs/security/README.md](docs/security/README.md) for the setup).
- Every change to security-relevant code needs a test that would have caught the regression.

## Release process

1. On `master`, verify CI is green and CHANGELOG has all merged entries in `Unreleased`.
2. Choose the version bump per semver.
3. Move `Unreleased` entries into a new `## [X.Y.Z] - YYYY-MM-DD` section.
4. Tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`, then push the tag.
5. The `docker-release.yml` workflow builds and publishes the image.

## Licence

By contributing, you agree that your contributions will be licensed under the same licence as
the rest of the project. See [LICENSE](LICENSE).
