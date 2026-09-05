# Internal browser/server interface

Implementation coordination for the approved loopback API. The server is authoritative for all mutations, readiness and storage. Successful JSON responses use `{ok:true,data:T}`; errors use `{ok:false,error:{code,message,cause,action,details?}}` with appropriate HTTP status. Downloads are raw bytes with safe disposition. No generic code/method execution endpoint exists.

## Browser session

POST `/api/session` exchanges `{secret}` from the URL fragment once, returning `{credential,csrf,projectEpoch,toolVersion,projectOpen}`. Clear the fragment immediately and retain credential/CSRF in tab sessionStorage only. GET `/api/session` with credentials returns the same status fields (credential/CSRF need not be repeated), plus optional root and current authorization mode/scopes. Every authenticated request carries `Authorization: Bearer <credential>`. Every mutation carries `X-RP-CSRF`. Project-bound requests carry `X-RP-Project-Epoch`; switching project invalidates outstanding old-epoch requests. No cookie or permissive CORS fallback.

GET `/api/workflow` returns `{workflows,fields,questions,capabilities}` from the common registry. POST `/api/projects/open` accepts `{path}`. POST `/api/projects/create` accepts `{path,name,example?:'inbound-pallet'}`. Explicit user root selection is a separate action; imported source never chooses a path. Both return session status with new epoch/root and then the client fetches project state. Initial root selection permits inspection; write authority follows visible trust controls.

GET `/api/project` returns either `{kind:'readable',snapshot:ProjectSnapshot,externalEdit:boolean}` or `{kind:'inspection',rawText,problems,lastReadable?}`. GET `/api/validate` returns ValidationReport. Source inspection does not overwrite invalid external YAML. Core-owned reviewDocument and traceability may be fetched through GET `/api/project/review` and `/api/project/traceability`.

## Authoring and proposals

POST `/api/patch/check` and `/api/patch/apply` accept `{patch:PatchEnvelope}`. Check returns core evaluation/diff without source writes. Apply returns the session CommitResult: committed with snapshot/diff, proposal with proposalId/patchDigest/diff, or conflict with current/expected identities and preserved proposed diff. HTTP409 represents a conflict. The browser must not treat a proposal as a committed snapshot.

GET `/api/proposals` returns a list of `{id,patchDigest,baseRevision,baseHash,patch,diff,status}` with status pending/superseded/applied. POST `/api/proposals/:id/apply` accepts `{expected:{sourceRevision,sourceHash},approvedPatchDigest}`. It rechecks the exact stored proposal and normal authority. Subsequent browser edits form a cumulative new proposal against the unchanged committed base. Supersession is explicit through the request's optional `supersedes` proposal ID, never mutation of the original proposal.

GET `/api/changes/:id?digest=<sha256>` returns MutationReceipt. Unknown outcome handling follows its pending/proposed/committed/not-found/indeterminate branches. Only a committed receipt permits a Saved label. The current snapshot may be newer than the receipt, so preserve and reconcile remaining local edits.

## Evidence and history

GET `/api/evidence` returns `{records,observations}`. Observations include actual checkedAt or null for external/future references. POST `/api/evidence/reference` accepts a base-bound declaration with title/purpose/provenance/related IDs and external URI or future description. No external URI is fetched.

POST `/api/evidence/prepare` accepts metadata, expected source identity, selected file name/size/SHA-256 and mutation ID, returning an upload ID. PUT `/api/evidence/uploads/:id` streams the selected bytes with session/CSRF/epoch headers and octet-stream content type. The server independently verifies size/hash before committing. Upload IDs are bound to this session/project and cannot choose host paths. The browser computes hashes by streaming the selected File and retains it until the receipt is known. POST `/api/evidence/check` reobserves selected or all local references. POST `/api/evidence/:id/remove` accepts expected identity and explicit actor/purpose; history files remain retained.

GET `/api/history` returns revision summaries. GET `/api/history/:revision` returns the immutable source, parsed snapshot/metadata and diff when available. POST `/api/history/:revision/restore` accepts expected identity and supplied actor/purpose. It invokes evaluateRestore and preserves current protected review history.

## Decisions and exports

POST `/api/review` accepts `{command:ReviewCommand}`. Supply reviewer, recorder, source, date and exact reviewed context; do not default missing external decision facts. Warning acknowledgment and final approval remain deliberate operations. Record-decisions authority is separate from authoring.

POST `/api/export/preview` accepts `{expected,selectedEvidenceIds}` and returns `{previewId,sourceRevision,sourceHash,members,evidence}`. POST `/api/export` accepts `{previewId,expected}` and returns ZIP bytes. The preview freezes selection/source identities; stale or changed evidence fails without reporting a complete download. Both blocked drafts and review-ready specifications can be exported with their actual status.

## Trust and updates

GET `/api/trust` returns `{root,grant,effectiveScopes,mode}`. POST `/api/trust` accepts one explicit action grant/revoke/forget. Grant includes scopes, mode and remember Boolean; remembering is machine-local. Human browser configuration actions are explicit authority; generic project data cannot invoke them. Inspect-only remains available. Manage-settings/record-decisions controls visibly explain their distinct authority.

GET `/api/updates` returns actual mode/pin/rollback hold, offline flag, launcher/bundled/selected/current runtime identities and last outcome. POST `/api/updates/configure` accepts the same validated changes as CLI update configure. POST `/api/updates/check`, `/install`, `/rollback` invoke the shared updater; unavailable or failed operations return explicit outcomes. Offline disables network actions. No front-end update logic may bypass verifier, pin/hold or compatibility.

Every endpoint above requires the exact loopback Host. Foreign Origin is rejected; mutation Origin must match. Session credentials are required even if Origin is absent on an authenticated read. Server-owned error codes drive browser state; never infer successful writes or physical readiness from HTTP transport success alone.
