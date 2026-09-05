# Post-release practitioner learning

Full v1 implementation and release come first. No interviews, customer artifacts or commitments currently validate product fit. Fictional examples, automated tests and simulated users are not customer evidence.

## Study design

After release, recruit five practitioners with appropriate permission. Each completes a bounded inbound-material-flow planning task using their existing method and RoboPomelo. Use authorized, sanitized inputs and define the task before measuring time. Record the actual existing-method baseline; do not compare against an estimated baseline or general productivity claim.

A second engineer receives each resulting package without interviewing its author. The handoff exercise tests whether the package carries the reasoning needed for the next engineering step. It does not test robot performance or physical safety.

Record:

- Task completion and time, with start/end rules and tool versions.
- Misunderstood fields, unanswered questions and missing inputs.
- Requirements or open issues the practitioner initially missed.
- Questions the second engineer needed to reconstruct the author's reasoning.
- Handoff rework and any critical omission hidden by a ready label.

Keep private working notes separate from any public summary. Obtain permission before sharing a participant's material. This document sends no outreach, schedules no interviews and authorizes no disclosure.

## Predeclared usable-handoff rubric

A handoff passes only if the second engineer correctly identifies all five items:

| Item                       | Required evidence in the package                                               |
| -------------------------- | ------------------------------------------------------------------------------ |
| Intended flow              | The named material movement, endpoints and relevant handoffs                   |
| Measurable criterion       | A planned measurable criterion and its measurement context                     |
| Responsible approver       | The recorded person responsible for approval                                   |
| Open assumptions and risks | The material unresolved issues, owners where known and next actions            |
| Next engineering inputs    | What must be obtained or decided before detailed engineering or test execution |

No critical omission may be concealed by a ready label. A missing criterion or approver must stay explicit and does not pass its rubric item. Count reconstruction questions rather than quietly supplying answers during the second engineer's assessment.

Continue the current workflow direction if at least four of five handoffs satisfy this rubric without a critical omission. Otherwise prioritize the repeated failure pattern in the basic workflow before adding adapters. This is a learning threshold for five observed tasks, not statistical validation or a promise of business impact.

## Decisions after observation

Summarize the repeated problem, evidence, affected workflow and smallest change to test next. Distinguish a participant request from an observed failure and from a proposed solution. Keep contradictory observations visible.

Future Git/MCP access, layouts, capacity calculations, simulator/interface adapters, acceptance-result assessment and production evidence retain their separate [roadmap gates](superpowers/specs/robopomelo/delivery-and-roadmap.md#future-capability-gates). Their presence in a roadmap does not authorize implementation or enablement.
