# Synthetic attachment fixtures

`pdf.ts` generates small fictional PDFs using standard Helvetica and ASCII text.
`protected.pdf` is the one-page output encrypted with qpdf using the deliberately
public fixture passwords in `generate-protected.mjs`. It contains no user data.
Regenerate with Node24 and qpdf installed:

```sh
node tests/fixtures/ingestion/generate-protected.mjs
```

Encryption randomness can change the binary; tests assert parser behavior rather
than ciphertext identity. Ordinary tests use the committed file and need no qpdf.
