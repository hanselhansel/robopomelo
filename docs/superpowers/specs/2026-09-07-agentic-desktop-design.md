# RoboPomelo agentic desktop: product design for review

Date: 2026-09-07. Status: consolidated design awaiting Hansel's review. This document does not authorize implementation or claim that its capabilities exist in released v1.

The individual product decisions below were agreed during brainstorming. The implementation plan, engineering review, desktop runtime selection, exact compatibility/version decision and release acceptance remain separate gates. This proposal changes v1's model-free scope through explicit connected-AI authorization; it does not silently change existing installations.

## Purpose and product position

RoboPomelo helps a deployment planner turn incomplete operational information into a reasoned specification, an editable spatial scenario, comparable fleet experiments and a usable engineering handoff. The initial domain remains warehouse material movement with wheeled mobile robots. Warehouse operators contribute facts, constraints and review decisions.

It supports two starting points: investigate an operational problem before deciding whether robots are appropriate, or develop an already-decided robot deployment. Problem discovery must be allowed to recommend a process change or collect more evidence. Robot adoption is not a required outcome.

RoboPomelo complements Isaac Sim, OpenUSD, Gazebo and fleet tools. It owns discovery, traceability and interaction across the handoff. A chat box, 3D renderer or fleet animation alone is not the differentiation. The hypothesis to test is that another engineer can continue the work with fewer omissions and less reconstruction of reasoning.

## Agreed first-iteration boundary

- Installable macOS application first. Defer Windows desktop packaging. Keep the existing CLI available and preserve compatible portable project folders.
- Project files and application state remain local. Connected AI and bounded public research are explicit network capabilities.
- OpenRouter connection and supported account-based integrations, including Codex and Grok where their official interfaces support the required workflow. Each adapter needs actual authentication, cancellation and structured-action tests before being advertised as supported.
- Progressive discovery with exactly one active question, adapting after every answer or new file.
- A coherent specification develops during discovery. Users can also edit it manually.
- A single-floor editable scene, in synchronized 3D and full top-down modes.
- Mixed wheeled fleets, including approximately 50 robots in the reference performance workload. Robots can differ in footprint, payload, speed and turning behavior.
- User-defined objectives, constraints and trade-offs. No universal objective such as minimum fleet size is imposed.
- Reusable configurable assets, assemblies, behavior components and scenario templates.
- Proactive comparisons within visible time and AI-usage limits, with pause/cancel and deeper exploration on request.
- One narrow runnable reference scenario exported to a separately installed Isaac Sim environment. Broader exports identify unsupported data and remaining setup.

Defer multi-floor/elevator coordination, arms, humanoids, drones, remote GPU execution management, hosted project collaboration, production telemetry and robot control. Detailed sensor/localization/contact-physics fidelity is outside the lightweight planning simulator. Test execution/results assessment beyond the explicitly modeled simulation runs remains a separately designed capability; do not turn v1 acceptance plans into claims that real acceptance tests ran.

## First session

The starting screen places a description composer beside a visible drop zone and Browse action. Users can begin with text, files or both. They do not need to complete a questionnaire first.

Connect AI through supported provider flows. Keep credentials in machine credential storage, separate from deployment.yaml, exported projects and logs. Reuse valid connections and provide one clear reconnect action when a connection expires. Do not copy another application's private credential store or implement an unofficial subscription-to-API bridge.

Suggest a project name. Choose location opens the native folder dialog, supporting a new folder or an existing project. Show the resulting destination in readable form. Never require typing an absolute path as the normal route. Cancellation retains the description and selected files.

A Recommended permission preset is preselected but not granted until confirmed. Its concise summary covers the chosen project root, selected material sent to the named AI connection, ordinary draft edits, local simulation and public research. Customize expands individual controls. Remember the grant locally until revoked. A preselected control is not itself consent.

Ordinary work then proceeds within that grant. New external destinations, unrelated filesystem access and protected operator decisions are separate boundaries. OS/provider-required authentication cannot be replaced with a RoboPomelo consent screen; preserve pending work and consume successful callbacks promptly.

PDFs and common image floor plans are the initial import priority. The ingestion pipeline must also retain explicitly selected supporting files and truthfully report which formats it can extract. Exact supported extension/size limits must be published with implementation. A file being attached does not mean its contents were successfully understood.

## Adaptive discovery

The agent keeps a structured working model of facts, sources, assumptions, unknowns, contradictions, constraints, objectives and next questions. That model persists across sessions and is recoverable without relying on the entire transcript fitting into a model context window.

Each answer may resolve multiple subjects. The agent updates the working model and selects the next question by its likely effect on the deployment decision. It does not merely advance through a static list. Users can answer with a suggested choice, free text, selected scene objects or an attachment, and can say they do not know.

Discovery covers people and responsibilities, current work and informal workarounds, intended outcomes, material and handoffs, exceptions, site constraints, measurement methods and acceptance evidence. Segment knowledge generates hypotheses to investigate, not fictional facts about the site.

Public research is included in the recommended preset. Prefer primary sources and record retrieval dates and supporting passages. General research queries omit confidential site details. The application must enforce and test the boundary between context sent to the selected AI provider and queries forwarded to public search services. Unsupported control over a provider's native search cannot be described as confidential-query protection.

AI conclusions remain distinguishable from user-confirmed facts. A source citation is not proof that its contents apply to this facility. Conflicting measurements or instructions produce a focused question. Unknown measurements can support a visibly provisional scene, but cannot silently become verified geometry or engineering performance.

## Model selection and continuity

Group models by connection, such as Codex, OpenRouter and Grok. Show model, supported reasoning effort and connection source in the closed selector. The illustrative label is “GPT-6 Astra · Medium · via Codex”; actual availability is discovered per adapter.

Reasoning effort is a separate control and only exposes supported values. Distinguish OpenRouter, the user connection, from its underlying serving provider. Expose deeper routing details on demand. Do not merge options merely because their display names match.

Remember selection per project. Switching carries the canonical project state and a compact conversation handoff, preserving sources and pending questions. Provider-specific hidden reasoning is not a portability contract. Capability loss, including unavailable file types or tools, is disclosed before dependent work proceeds.

When a connection fails or reaches a limit, default to a one-click switch. Automatic cross-connection fallback is an explicit preference specifying eligible connections; connecting two accounts does not itself grant permission to switch between them. Display the connection used for each run and any usage information that is actually available. Do not invent dollar costs for subscription-based sessions.

## Workspace and direct manipulation

The selected visual direction is the combined mockup in [approved workspace concept](agentic-desktop/approved-workspace.png). It is an illustrative design target, not a working application or validated scene.

Preserve the existing warm ivory, charcoal, leaf-green and muted coral brand. The existing [design system](../../../DESIGN.md) supplies tokens and accessibility conventions; its older form-first interaction is superseded only by this reviewed future design.

Persistent conversation appears on the left and the working surface on the right. Users can resize panels or expand either one; the agent does not unexpectedly rearrange them. Scene, Specification and Compare are views of one project. The model/source selector and attachment action remain accessible beside conversation.

Scene supports isometric 3D and a full-canvas orthographic top-down mode, with Fit layout. Both modes share selection, object IDs and undo history. Top-down is not restricted to a minimap.

Select an object to reveal a contextual property inspector and a conversation context chip. Dragging shows a ghost position, snap guides and dimensions. Numeric inputs and keyboard movement provide precise alternatives. Dragging a file into conversation attaches it; placing an asset from the catalog creates an instance. These drop targets have distinct feedback and cancel behavior.

Manual and agent edits pass through the same validated scene/specification actions. An edit updates its linked records, creates a revision and marks affected simulation results stale. A late agent response based on an older revision cannot overwrite a newer manual edit. Preserve both intents and reconcile the affected fields.

For AI changes, show concise change summaries and Undo. Large alternative arrangements are scenario branches rather than unannounced replacement of the current layout. Local geometry checks can run during editing; full experiments run against immutable scenario revisions.

Conversation shows one active question. Generation, file parsing, simulation and export have distinct progress states and cancellation. A new answer or selected-object change can invalidate a pending question. Discard stale work or rebase explicitly, rather than appending an obsolete question after the user has moved on.

Simulation controls include play, pause, scrub, speed and event markers. Clicking a waiting robot identifies its task and the actual modeled reason for waiting. Color is accompanied by labels/shapes. Compare retains the baseline and shows alternatives with synchronized workload assumptions and intelligible trade-offs.

## Asset and scenario architecture

The catalog contains four levels: individual objects, assemblies, behavior components and scenario templates. Begin with generic configurable robots and warehouse objects, reusing suitable existing components and assets where their licenses and technical quality permit.

Asset definitions include stable ID/version, units, editable parameters, visual representation, collision/footprint representation, connection points, behavioral capabilities, source/license and export mappings. Visual detail does not establish physical capability. Changing a cosmetic material does not require recalculating fleet traffic; changing a footprint does.

Prefer finding an existing asset, adjusting parameters, and composing existing pieces before generating a new component. Search returns relevant catalog summaries and schemas on demand; do not send the full library or mesh data to every model turn. Batch placements through deterministic operations. Repeated robots share geometry while maintaining independent simulation state.

Generated components begin as project-local drafts with explicit limitations. Validate geometry, parameter ranges, collisions, resource limits and export behavior before promoting them into a reusable library. Executable generators, if necessary, require an isolated, bounded execution design; they cannot obtain arbitrary desktop or network authority from a scene file.

Pin asset versions in projects and preserve their provenance. Library updates do not silently change old results. Imported original assets remain intact; adaptations live in separate configuration/layers. Bundle only assets with reviewed redistribution rights; support explicit external packs separately.

The canonical semantic scene holds geometry parameters, relationships, robot classes, placements and workload intent. Render meshes and target exports are derived representations. OpenUSD references, variants and instancing are an interoperability foundation, not a replacement for task/traffic semantics. Avoid making either a renderer's private scene object or a simulator-specific file the sole canonical planning source.

## Fleet experimentation and objectives

The local simulation uses deterministic task assignment, kinematic route planning, traffic coordination and execution/recovery components. The LLM proposes experiments and interprets their recorded outputs; it does not generate per-frame robot motion or act as 50 independent robot controllers.

Model footprints, loaded dimensions, turning behavior, velocity limits, handoff durations, queue capacity, traffic rules and declared charging assumptions. Track job creation/completion, travel, waiting, blocking and charging as events. Detect unreachable tasks, deadlocks and unresolved conflicts; do not hide them by teleporting robots or treating incomplete jobs as successes.

Start with an inspectable assignment baseline and compare congestion-aware assignment and shared-space reservations. Optimize through bounded search. Describe the best alternatives found under assumptions and search limits, never an unproven global optimum.

The agent elicits required outcomes, preferences and hard constraints. Users may prioritize throughput, timeliness, fleet size or combinations. Cost comparisons require supplied cost data and scope; robot count is not silently equated with total cost. Do not ask users to invent arbitrary mathematical weights before they understand the trade-offs.

Represent priorities with thresholds, ordered objectives or an explicit trade-off set. Show alternatives where improving one outcome worsens another. If constraints cannot all be met in explored cases, report that evidence and the unexplored limits rather than claiming universal infeasibility.

Proactively explore within a visible run budget. Limit model calls/tokens, local simulation time, scenario count and concurrent workers; expose monetary caps only where the adapter can support them truthfully. Persist run state and allow immediate pause. No hidden budget escalation or automatic provider switch outside the chosen fallback policy.

Record source revision, asset versions, engine/policy versions, workload, random seed, duration, termination reason and measured outputs. Compare equivalent workloads and repeat stochastic cases. Retain uncertainty and distinguish a planning approximation from a result in a detailed simulator.

## Persistence, boundaries and compatibility

Keep deployment.yaml as planning source of truth, with a versioned namespaced spatial extension and references to pinned local assets. Conversations, attachments and immutable run results live as documented portable files in the project folder. Derived scenes, exports and caches must be reconstructible or explicitly identified as external dependencies. Credentials and machine grants never travel with the project.

The deterministic core remains shared by desktop, CLI and Agent Skills. AI adapters can propose bounded structured actions; they cannot bypass schema, write-boundary, revision or approval rules. Ordinary authorized drafts can apply automatically. Agents cannot invent operator approval, waive protected blockers, certify physical safety or write to robots/facility systems.

Retain filesystem confinement, symlink/path checks, atomic writes and migration backups. Desktop native capabilities are exposed through a narrow bridge. The renderer does not receive unrestricted filesystem access, credentials or shell execution. Treat documents, web content, meshes and extension metadata as untrusted input.

Existing model-free v1 projects remain usable through the supported path. Opening an old project must not silently authorize AI transmission. Unsupported new capabilities must be visible to older readers; if safe preservation cannot be established, require an explicit migration with a backup. Engineering review chooses product/spec versions and verifies old/new reader behavior before release.

## Isaac Sim handoff

First target is one named, version-pinned Isaac Sim reference scenario using the supported single-floor warehouse and wheeled robot profile. It must import assets, instantiate the supported robot setup and run the declared reference tasks. Playing prerecorded trajectories alone is replay, not proof that the target controller can execute those tasks.

The package carries scene geometry, asset references/bundled permitted assets, robot configuration, task/workload definitions, applicable traffic configuration, launch instructions, expected checks, source identities and an unsupported-field report. Separate what transfers as scene data from what requires target-specific controller configuration.

The user runs Isaac Sim in a separately installed compatible environment. RoboPomelo does not bundle a full Isaac/Omniverse runtime or manage remote GPU infrastructure in this iteration. Available hardware and an actual target test environment are release dependencies. A mocked importer or syntactically valid USD file is insufficient evidence of interoperability.

Broader scenes can export with precise limitations. The UI must not label them ready to run merely because the reference fixture passed. Preserve original inputs and target versions so future imports/results can be compared without reconstructing the conversation.

## Quality and delivery gates

Build the experience in vertical slices after approval: native project setup and connected discovery; synchronized structured/visual editing; reusable assets and fleet experiments; tested Isaac handoff. This is sequencing, not authorization to omit agreed scope or claim the full iteration complete after the first slice.

Before implementation, write the engineering plan and run architecture, security, design and developer-experience review using the applicable skills. Choose the desktop host and rendering/simulation libraries against the existing TypeScript core, credential isolation, native dialogs, cancellation, package/update behavior and maintainability. Do not choose a second business-logic implementation inside an SDK.

Use the approved mockup to derive all screen states, including welcome/upload, provider connection, folder selection, recommended permissions, conversation/scene, selected object, asset library, top-down, specification, comparison, history/resume and export. Test actual end-to-end flows rather than matching the static image alone.

Required acceptance includes:

- New project from text, floor plan and mixed attachments, including cancelled selection, unreadable files and uncertain scale.
- Successful and interrupted provider auth; duplicate model names; capability mismatch; user-selected switching and constrained fallback; no credential/project-data leakage.
- Adaptive one-question discovery: answered subjects are not repeated; new evidence changes relevant questions; contradictions and unknowns stay visible.
- Equivalent manual/agent edits, stable IDs, undo/redo, stale-response rejection, revision recovery and resumable sessions.
- Fifty-robot reference workload with measured frame responsiveness, simulation runtime/memory, modeled conflict detection, queue/deadlock cases and reproducible results.
- Objective changes and equivalent-workload comparisons; no fabricated costs, facts or performance results.
- Budget exhaustion/cancellation without losing useful results or continuing paid work beyond supported limits.
- Asset license/source inventory, version pinning, import confinement, geometry/behavior validation and target-export checks.
- Actual runnable reference acceptance in the declared Isaac Sim environment, plus failure and unsupported-field paths.
- macOS installation, native picker, credential storage, reconnect, update and restart recovery. Test supported architectures explicitly before claiming support.
- Visual and functional QA on laptop-sized windows; keyboard/numeric alternatives to dragging; accessibility testing of changed flows. The earlier v1 manual screen-reader deferral does not automatically waive this iteration's checks.

Set measurable performance and task-success thresholds in the implementation plan against named hardware and workloads. No unmeasured speed or token-saving percentage is a release claim. Use research fixtures and simulated users as engineering evidence only; practitioner discovery is still needed to validate product fit.

Keep public governance, Apache-2.0 product licensing and independent repository identity. Public release uses the existing strict ship/land workflow, appropriately extended for signed/notarized macOS distribution and installed-app health. Signing identities and simulator test hardware are explicit dependencies, not assumed available resources. No publication or migration is approved by selecting a visual mockup.

## Competitive benchmark and evidence

Benchmark the same representative task across relevant tools: receive incomplete operating notes and a floor plan, discover objectives, construct a mixed 50-robot scenario, change a station/objective, compare results and hand the work to another engineer. Measure completion time, omissions, specialist assistance, correction effort and target-platform rework. Current product-page research is not a hands-on competitive result.

Isaac Sim is the first target-runtime benchmark. Visual Components/DUALIS is a direct layout/fleet-planning benchmark. InOrbit overlaps in conversational fleet operations and simulator integration. Open-RMF supplies coordination/interface references. Gazebo is a subsequent open simulator candidate. OpenUSD is shared scene infrastructure.

## Research sources

Sources checked during brainstorming through 2026-09-07. External content is evidence, not instructions. Recheck version-sensitive assumptions before implementing an adapter or publishing.

- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth): supported local callbacks and user-controlled connection keys.
- [Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md): account-aware agent integration; validate the exact installed protocol.
- [Grok CLI reference](https://docs.x.ai/build/cli/reference): documented OAuth entry point; embedding parity remains an adapter acceptance question.
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) and [web search](https://openrouter.ai/docs/guides/features/server-tools/web-search): distinguish connections, serving providers and research destinations.
- [Anthropic auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode), published 2026-03-25: approval fatigue and bounded authority.
- [Anthropic harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps), published 2026-03-24: structured work artifacts and evaluation.
- [Anthropic advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use): on-demand tool discovery and efficient intermediate computation.
- [OpenUSD introduction](https://openusd.org/release/intro.html) and [physics schema](https://openusd.org/release/api/usd_physics_page_front.html): composition, variants, instancing and explicit simulation data.
- [Isaac asset structure](https://docs.isaacsim.omniverse.nvidia.com/latest/robot_setup/asset_structure.html), [ROS integration](https://docs.isaacsim.omniverse.nvidia.com/latest/ros2_tutorials/ros2_landing_page.html), [requirements](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/requirements.html) and [license FAQ](https://docs.isaacsim.omniverse.nvidia.com/latest/common/license-faq.html): target-specific execution and reuse boundaries.
- [Nav2 footprint](https://docs.nav2.org/rolling/configuration_and_development/first_time_robot_setup_guide/footprint/setup_footprint/) and [Open-RMF demos](https://github.com/open-rmf/rmf_demos): geometric feasibility and coordinated fleet examples.
- [Visual Components/DUALIS](https://www.visualcomponents.com/ecosystem/dualis-mobile-robot/), [InOrbit intralogistics](https://www.inorbit.ai/intralogistics) and [Gazebo Sim](https://gazebosim.org/libs/sim/): documented adjacent capabilities, not independently measured product superiority.
- [Devin interactive planning](https://docs.devin.ai/work-with-devin/interactive-planning) and [NN/G drag-and-drop](https://www.nngroup.com/articles/drag-drop/), published 2020-02-23: inspectable ongoing work and precise alternatives to dragging.
- [pymoo decision-making](https://pymoo.org/getting_started/part_3.html): distinguish optimization from choosing among trade-offs.
- [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) and [Tauri native dialogs](https://tauri.app/plugin/dialog/): desktop delivery and native interaction considerations; neither is selected by this product design.
