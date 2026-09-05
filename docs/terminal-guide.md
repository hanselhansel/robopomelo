# Terminal planning

Run `robopomelo plan <folder>` in a terminal. Use `--authorize author` for an explicit per-run author grant, or deliberately authorize the selected project when prompted. A TTY enables the interface; it does not supply authority or reviewer consent. `plan --json` and non-TTY invocation are rejected. Use the composable commands for automation.

The five steps are Frame the deployment, Specify material flow, Define success, Specify requirements, and Plan acceptance. Next and Previous step move between them without silently saving. Reopening reads the actual saved source and readiness. It does not use a hidden project database.

## Keyboard editing

Choose a menu number, exact option value, or a unique displayed record name. Stable IDs are always displayed. When names are duplicated, choose the number or ID; the wizard does not guess.

Every step exposes its record collections, applicable engineering prompts, findings, Save and Exit. Other record types opens any collection, including challenges, risks, assumptions, decisions and evidence. Add, edit and remove one record at a time. Changes remain in memory until Save; saving one field never replaces an unrelated collection.

Knowledge fields offer Missing, Unknown, Unverified, Provided and Not applicable. Unknown records the uncertainty plus optional owner and next action. Provided and Unverified can carry explicit notes and evidence references. Not applicable requires a reason. Provided is an assertion, not independent verification.

Enter keeps a displayed current text value. `:empty` clears it. `:multi` opens multiline input where supported; finish with a single period on its own line. Type two periods for a literal period line. `:back` cancels the current field edit. Previously completed pending field edits remain in memory.

Quantities keep the entered decimal, unit and measured subject. No conversion is inferred. Criteria support numeric operators/ranges, Boolean true or false, and categorical outcome lists. Defining a criterion never executes a test or records a result.

Reference menus list actual records from the current draft, including newly added records. Return and create a missing related record rather than inventing its ID. Mutually linked records can be saved in one atomic patch.

## Structured and advanced fields

Flow steps and exceptions have typed editors. Steps can be moved up or down, and retain their intentional order. Exceptions expose trigger, response, owner and planned recovery-test links.

Verification declarations select one known claim field, explicit required-support obligation, planning evidence and optional supplied attestation. Attestations require the supplied actor, statement, date/time and source. No decision date is generated. Protected obligations, attestations and accepted decisions still require core decision-recording authority at Save.

Advanced record fields expose namespaced extension JSON, supplied decision actor/date, evidence location, and challenge prompt identity/version. JSON can be typed or loaded from an explicitly selected file, with the shared input bounds. Attachment paths and hashes come only from the copied-evidence tool. Future evidence descriptions and external references remain separate from available local files.

## Saving and proposals

The first Save asks for the supplied mutation recorder and a purpose. These are provenance assertions. The wizard submits a focused patch through the same project session as the CLI and browser. A schema-valid blocked draft can be saved; readiness and next actions remain visible.

A save failure retains the pending draft. A source conflict displays the expected and current identities. The wizard does not silently rebase or overwrite another writer. Inspect current source or export the pending candidate patch before explicitly reloading. Reload and discard are deliberate actions.

In review-each-change mode, Save records a proposal and leaves committed source unchanged. Later edits form a complete cumulative proposal against the same base. Inspect and apply stored proposal displays the exact diff and binds application to its stored digest and base. Protected permissions are checked again.

Exit with unsaved changes offers Save, Discard pending changes, or Continue editing. EOF and Ctrl-C do not implicitly save. Already saved revisions and stored proposals remain. An in-flight transaction finishes its safely reported outcome before the wizard exits.

## Review and handoff tools

Review, evidence and export tools provides:

- Draft findings and current committed-source inspection.
- A complete supplied ReviewCommand JSON file, including approvals, acknowledgments, waivers and revocations. The wizard preserves its supplied identities, dates, source and reviewed hashes.
- Explicit selection and copy of one evidence file with supplied metadata and related records.
- Review-package export from committed source, with explicit attachment selection and files/ZIP format.
- Candidate-patch export for a pending or conflicting draft. `candidate-patch.json` retains its original base and is not applied.
- Stored proposal inspection/application, recorded history, explicit source reload, and editing the mutation recorder/purpose.

Each tool requests any missing operation scope explicitly. Export paths remain under the project's `exports/` directory. Stored proposals do not become committed source merely because they were exported. Use the composable history, migration and update commands for those additional operations.
