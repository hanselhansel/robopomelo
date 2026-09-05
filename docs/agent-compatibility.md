# Agent compatibility

RoboPomelo's core CLI needs supported Node, not a model API key, GPU or Git. An optional agent host has its own installation, account and tool-access requirements. RoboPomelo does not configure that host or transmit project data to it.

## Ordinary-file and CLI path

1. Install or select a verified compatible RoboPomelo runtime. Check its version and `robopomelo capabilities --json --offline` output.
2. Give the host the chosen bundled `skills/<name>/SKILL.md`, its `contract.json`, matching schemas at `packages/spec/schemas`, and the caller's explicit project selection. Preserve relative bundle paths or supply the schema location explicitly.
3. Supply only facts and files you are authorized to share with that host. Obtain current source identities using `robopomelo show --project "$PROJECT" --json --offline`.
4. Have the host return a complete capability-tagged agent patch. Check, diff and apply it with the same installed CLI and existing authority. The Skill does not create its own grant.
5. Preserve proposal, conflict and uncertain-receipt states. Read the committed source before generating dependent patches.

If the host cannot read local files or run commands, the user can provide the relevant source/schema inputs and run the returned patch through the CLI themselves. Do not treat the host's prose as a successful application or a human acceptance decision.

## Evidence categories

| Category                   | What it establishes                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Actual tested invocation   | A dated host/version/OS run completed specified operations with recorded results                     |
| Official documented setup  | A cited vendor setup path exists; it has not necessarily been exercised here                         |
| Ordinary-file/CLI fallback | The host may consume the files and CLI contract if its tools permit; native invocation is unverified |

Common file format alone does not establish a native host integration. Host-specific installation paths and automatic Skill discovery are deliberately not asserted without evidence.

| Host                 | Current documented path                                               | Native invocation status |
| -------------------- | --------------------------------------------------------------------- | ------------------------ |
| Codex                | Ordinary-file/CLI path above                                          | Unverified               |
| Claude               | Ordinary-file/CLI path above                                          | Unverified               |
| Copilot              | Ordinary-file/CLI path above, where local command tools are available | Unverified               |
| Grok                 | Ordinary-file/CLI path above, where local command tools are available | Unverified               |
| Gemini               | Ordinary-file/CLI path above, where local command tools are available | Unverified               |
| Local or future host | Ordinary-file/CLI path above, subject to that host's tools            | Unverified               |

On 2026-09-05 the source contract checker and CLI-dispatch subprocess replay ran on macOS arm64 with Node 24.20.0. The replay used fixed fictional inputs and no model. It is a core/CLI conformance check, not a native Skill activation test, prompt-injection resistance assessment or publication proof.

For a real host record, capture host name/version, OS/Node/runtime/spec versions, date, activation method, requested task, actual commands, resulting source/proposal IDs, missing-input behavior and verification limits. Sanitize the record before publication. Do not overwrite copied or user-modified host Skills when updating RoboPomelo.

See [Skill contracts and workflow](skills.md) and the [security policy](../SECURITY.md).
