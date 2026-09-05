# Offline operation

Install the package and required Node runtime before disconnecting. Once installed, planning, validation, evidence handling, review, history and exports use local files.

```sh
robopomelo open demo --offline
robopomelo plan demo --offline
robopomelo validate --project demo --json --offline
```

`--offline` disables release-network access for that invocation. It does not rewrite the saved update preference. To persist offline operation, use Settings or:

```sh
robopomelo update configure --offline --authorize manage-settings --json
```

An invocation started offline remains offline even if a later preference change enables future online launches. Clear the stored preference explicitly with `update configure --online --authorize manage-settings` when wanted.

Fonts, styles, scripts, schemas and signature trust material ship with the application. An attachment's remote links and Markdown images are inert project data. RoboPomelo does not fetch those URLs. External Agent Skills run in the host you choose; that host's own model/network behavior is outside this local application's transport.

`--version`, help and read-only update status report local information without a freshness request. A pin or explicit version that is unavailable locally cannot be downloaded while offline. The error identifies the missing runtime; the application does not substitute another version.

The initial `npx robopomelo` package acquisition belongs to npm and can require network access. For a disconnected machine, prepare the package through an approved package-manager cache or transfer the verified package artifact before starting the local application.
