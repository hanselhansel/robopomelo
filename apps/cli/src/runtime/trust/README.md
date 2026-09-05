Bundled Sigstore trust material is decoded from the `https://tuf-repo-cdn.sigstore.dev` trusted_root.json seed in locked @sigstore/tuf 5.0.0, retrieved with the dependency on 2026-09-05. Source: https://github.com/sigstore/sigstore-js/tree/main/packages/tuf. Copyright The Sigstore Authors, Apache-2.0.

The runtime uses this installed trust anchor without calling a TUF transport client. Unknown/rotated signing roots fail closed with instructions to update the installed launcher through the package manager. This is not a promise that a static trust snapshot can verify every future release.
