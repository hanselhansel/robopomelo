# RoboPomelo agent instructions

## Scope and authority

The approved design is `docs/superpowers/specs/2026-09-05-robopomelo-design.md` and its five linked specifications. Hansel authorized end-to-end implementation on 2026-09-05 after receiving the written specification. Preserve the full v1 scope. Keep unrelated discoveries as follow-up work.

Never read or index unrelated private repositories. Never import another physical-AI repository's product code, history, migration, or packages.

## Workflow

- This implementation is Deep tier: public contract, filesystem security, privacy, updater and coupled interfaces.
- Use brainstorming proportionally on each run. The product design is approved; do not restart settled questions.
- Research current decision-relevant primary sources before changing external-platform assumptions. Log retrieval dates and stop when the decision is supported.
- Use writing-plans, autoplan, an isolated worktree, design-shotgun, plan-design-review, frontend QA and appropriate security review.
- At most three agents run concurrently, including the coordinating agent. Delegate only independent bounded work.
- Use one whole-branch implementation review and at most two global repair cycles. Do not duplicate release-owned reviews.
- On 2026-09-05 Hansel authorized one additional focused repair cycle for the proposal-application refresh regression, including its verification. Other release gates remain in force.
- On 2026-09-05 Hansel approved deferring only manual screen-reader testing for v1 as a documented unverified gap. Continue release with all other automated accessibility, keyboard, browser, package, CI and publication checks required. Do not claim full accessibility verification.
- Run gstack ship, then land-and-deploy exactly. Routine green proceed gates are authorized.
- Stop for failing CI, unresolved security, merge conflict, unexpected scope, an unresolved release-semantic version choice, destructive recovery or unhealthy deployment.

## Git and completion

- Never commit on main. Use chore/, feat/ or fix/ branches.
- Local implementation worktree: `.worktrees/v1` on `feat/v1`.
- Commit each meaningful green change. Stage explicit intended paths.
- No force pushes, resets, destructive cleanup or discarding unrelated work to obtain a clean tree.
- Compare local HEAD, cached remote and live remote before integration.
- Finish with canonical local main and live GitHub main at the same commit, while honestly preserving/reporting unrelated state.
- A local build, PR, tag or cached ref is not proof of publication or deployed health.

## Implementation

- Keep source files under 400 lines.
- Core rules are deterministic and shared by browser, terminal and Skills.
- No model dependency, project telemetry/upload, remote UI assets or physical-system writes.
- Automatic compatible stable updates are the only built-in network exception, disabled in offline mode.
- Preserve typed unknown states, extension data, provenance, revision recovery and protected review decisions.
- Test meaningful error and boundary behavior, not just implementation-shaped assertions.

## Communication

Short, concrete updates. No em dashes. No pricing or payment messaging in product materials. Explain actual blockers with evidence; do not invent completion.
