These are synthetic Sigstore upstream test fixtures, not RoboPomelo publisher evidence.

Source: https://github.com/sigstore/sigstore-js/tree/main/packages/verify/src/__tests__/__fixtures__ (retrieved 2026-09-05). `test-bundle.json` extracts `V1.DSSE.WITH_SIGNING_CERT.TLOG_DSSE` from bundles.ts. `test-trusted-root.json` extracts the static trustedRootJSON object from trust.ts. They test actual cryptographic certificate, CT and transparency verification under the upstream test trust root. They do not establish npm publication or RoboPomelo's publisher identity.

Copyright 2023 The Sigstore Authors. Licensed under the Apache License, Version 2.0. License: https://www.apache.org/licenses/LICENSE-2.0
