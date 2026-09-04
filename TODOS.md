# TODOS

These are approved post-v1 phases. Full dependencies, entry/exit criteria, compatibility, security, success metrics and kill/deferral criteria live in [the roadmap](docs/superpowers/specs/robopomelo/delivery-and-roadmap.md). No item authorizes physical-system writes.

## Future capabilities

### Git-aware intent and optional local-agent access

**What:** Add Git-aware intent/evidence/review workflows and optional local LLM or read-first MCP access.

**Why:** Let engineers integrate the portable specification with existing local workflows without creating competing state.

**Context:** V1 uses folders and CLI-backed Agent Skills. Start with deterministic source/history round trips and read-only MCP field coverage. GitOps governs intent, evidence and recorded approval, never autonomous robot control. See roadmap phase 1.

**Pros:** Better review interoperability and agent access.
**Cons:** Additional host compatibility and permission boundaries.
**Effort:** L
**Priority:** P3
**Depends on:** Stable v1 contract, observed user workflow need and read-access security tests.

### Layouts and capacity reasoning

**What:** Add 2D layouts and bounded capacity modeling.

**Why:** Expose spatial and throughput assumptions that the textual handoff cannot quantify.

**Context:** V1 deliberately records the missing engineering inputs. New geometry/calculation extensions require declared units, coordinate frames, transparent formulas and reproducible reference cases. See roadmap phase 2.

**Pros:** Less repeated engineering setup and clearer assumptions.
**Cons:** False precision, model input burden and additional UI complexity.
**Effort:** XL
**Priority:** P3
**Depends on:** Stable handoff, actual spatial inputs and validated reference calculations.

### Simulation and interface adapters

**What:** Add individually gated Open-RMF, Gazebo, VDA 5050/LIF and Isaac Sim adapters.

**Why:** Reduce repeated translation from deployment intent into named engineering environments.

**Context:** V1 exports a portable engineering handoff, not executable simulation. Each adapter declares target version, prerequisites, unsupported semantics, asset licensing and round-trip behavior. Defer any adapter without a concrete user task and testable target. See roadmap phase 3.

**Pros:** Faster environment setup with explicit traceability.
**Cons:** Platform churn, asset constraints and silent translation risk.
**Effort:** XL
**Priority:** P3
**Depends on:** Stable handoff contract; geometry when spatial exports require it; named target/test fixture.

### Test execution records and result assessment

**What:** Record test runs, observed results, evidence and attributed assessment in a later specification version.

**Why:** Connect the planned acceptance criteria to what was actually tested.

**Context:** Explicitly requested for later versions. V1 defines procedures/criteria/evidence requirements only. Run identities, tested revision, environment, deviations and assessors need separate versioned entities. Never infer safety certification or successful commissioning from a recorded result. See roadmap phase 4.

**Pros:** Traceable planned-versus-observed acceptance evidence.
**Cons:** New evidence integrity, applicability and authority responsibilities.
**Effort:** L
**Priority:** P3
**Depends on:** Stable acceptance plans, observation provenance and explicit assessment authority.

### Production telemetry and planned-versus-actual evidence

**What:** Import bounded production observations and compare them with recorded intent.

**Why:** Make measurement gaps and deployment deviations inspectable.

**Context:** Start with explicit read/import profiles and provenance. No facility access is assumed, no project data is uploaded by default and no automatic reconciliation writes into physical systems. Compare only compatible units/subjects/windows. See roadmap phase 5.

**Pros:** Better evidence for deployment learning.
**Cons:** Sensitive operational data and integration maintenance.
**Effort:** XL
**Priority:** P3
**Depends on:** Versioned run/evidence records, permissioned sanitized inputs and compatibility checks.

## Completed

No post-v1 capabilities have been implemented.
