# Testing RoboPomelo

Use Node 22.22.2+ on the 22 line or Node 24.15.0+ on the 24 line. Development currently uses Node 24.20.0.

```sh
npm ci --ignore-scripts
npm run test:tooling
npm run typecheck
npm test
```

The repository is under implementation. Only test families that exist and actually execute provide evidence. Do not treat an empty selection or unavailable script as a passing product check.

Tooling tests use Node's test runner. Product tests use Vitest. Browser tests use Playwright against the built local server; real Safari and assistive-technology checks are recorded separately. Runtime installation does not require test-only browser binaries or development build tools.

Release acceptance includes native operating systems, recovery/security, offline behavior, all CLI leaves and five-step wizard, deterministic exports, six Skill contracts, browser/accessibility/print, exact packed installation and verified published artifacts. The detailed [delivery matrix](docs/superpowers/plans/robopomelo-delivery.md) and [engineering test map](docs/reviews/2026-09-05-autoplan-eng.md) govern remaining work.
