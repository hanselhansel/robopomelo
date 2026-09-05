import semver from 'semver';
import { launchRuntime, type RuntimeLaunchOptions, type LaunchedRuntime } from './launcher.js';
import type { UpdatePreferences } from '../../../../packages/project-fs/src/settings/updates.js';
import type { SettingsAuthority, UpdatePolicy } from '../../../../packages/project-fs/src/settings/schema.js';
import { RuntimeCache } from './cache.js';
import { PublicReleaseNetwork } from './network.js';
import { assertCompatible, automaticEligible } from './compatibility.js';
import { effectivePolicy, selectRuntime, type RunPolicy } from './selection.js';
import { releaseMetadata } from './metadata.js';
import { RuntimeError } from './errors.js';
import type {
  CompatibilityProbe,
  LaunchOptions,
  RuntimeDescriptor,
  RuntimeStatus,
  UpdateOutcome,
} from './contracts.js';
export interface UpdateServiceOptions {
  bundle: RuntimeDescriptor;
  cache: RuntimeCache;
  preferences: UpdatePreferences;
  network?: PublicReleaseNetwork;
  probe: CompatibilityProbe;
  startupTimeoutMs?: number;
}
export class UpdateService {
  private readonly network: PublicReleaseNetwork;
  constructor(private readonly options: UpdateServiceOptions) {
    this.network = options.network ?? new PublicReleaseNetwork();
  }
  async status(run: RunPolicy = {}): Promise<RuntimeStatus> {
    const policy = effectivePolicy(await this.options.preferences.read(), run),
      pointer = await this.options.cache.pointer();
    if (run.sourceCheckout) {
      assertCompatible(this.options.bundle.manifest, this.options.probe);
      return {
        selection: { version: this.options.bundle.manifest.version, reason: 'bundle' },
        runtime: this.options.bundle,
        policy,
        lastOutcome: pointer.lastOutcome,
      };
    }
    let cached: RuntimeDescriptor[] = [];
    try {
      cached = await this.options.cache.list();
    } catch (error) {
      if (run.explicitVersion || policy.pinnedVersion || policy.rollbackHold) throw error;
    }
    const selection = selectRuntime(
      policy,
      run,
      cached.map((d) => d.manifest.version),
      this.options.bundle.manifest.version,
      pointer.active?.version ?? null,
    );
    let runtime =
      selection.reason === 'cache'
        ? cached.find((d) => d.manifest.version === selection.version)!
        : selection.version === this.options.bundle.manifest.version
          ? this.options.bundle
          : cached.find((d) => d.manifest.version === selection.version)!;
    try {
      assertCompatible(runtime.manifest, this.options.probe);
    } catch (error) {
      if (selection.reason !== 'cache') throw error;
      runtime = this.options.bundle;
      assertCompatible(runtime.manifest, this.options.probe);
      selection.version = runtime.manifest.version;
      selection.reason = 'bundle';
    }
    return { selection, runtime, policy, lastOutcome: pointer.lastOutcome };
  }
  async #check(run: RunPolicy, signal?: AbortSignal): Promise<UpdateOutcome> {
    const current = await this.status(run);
    if (current.policy.offline || run.sourceCheckout)
      return {
        status: 'not-checked',
        version: current.runtime.manifest.version,
        pendingVersion: null,
        message: 'Registry freshness was not checked; using local runtime information.',
      };
    const metadata = await releaseMetadata(this.network, 'latest', signal ? { signal } : {});
    const available =
      !semver.prerelease(metadata.version) && semver.gt(metadata.version, current.runtime.manifest.version);
    const outcome: UpdateOutcome = {
      status: available ? 'available' : 'current',
      version: current.runtime.manifest.version,
      pendingVersion: available ? metadata.version : null,
      message: available
        ? 'A release is available; provenance and compatibility are checked before installation.'
        : 'The selected runtime is current for the public stable version checked.',
    };
    if (!signal?.aborted) await this.options.cache.outcome(outcome);
    return outcome;
  }
  check(run: RunPolicy = {}): Promise<UpdateOutcome> {
    return this.#check(run);
  }
  async #install(
    run: RunPolicy & { version?: string; automatic?: boolean },
    signal?: AbortSignal,
  ): Promise<UpdateOutcome> {
    if (run.sourceCheckout)
      throw new RuntimeError(
        'RUNTIME_UNMANAGED',
        'Source checkout execution does not manage installed runtimes.',
      );
    let current: RuntimeStatus;
    try {
      current = await this.status(run);
    } catch (error) {
      const policy = effectivePolicy(await this.options.preferences.read(), run);
      const requested = policy.rollbackHold?.version ?? policy.pinnedVersion;
      if (
        (error as { code?: string }).code !== 'RUNTIME_UNAVAILABLE' ||
        !run.version ||
        run.version !== requested ||
        run.automatic
      )
        throw error;
      // Installing the missing exact pin is an explicit repair, never a launch fallback.
      current = {
        policy,
        runtime: this.options.bundle,
        selection: { version: this.options.bundle.manifest.version, reason: 'bundle' },
        lastOutcome: null,
      };
    }
    const held = current.policy.rollbackHold?.version ?? current.policy.pinnedVersion;
    if (held && (!run.version || held !== run.version))
      throw new RuntimeError(
        'POLICY_CONFLICT',
        'The requested install conflicts with a pin or rollback hold. Configure or resume the policy explicitly first.',
      );
    let runtime = run.version ? await this.options.cache.get(run.version) : null;
    if (!runtime) {
      if (current.policy.offline)
        throw new RuntimeError(
          'OFFLINE',
          'This exact runtime is not cached; offline mode forbids downloading it.',
        );
      const metadata = await releaseMetadata(this.network, run.version ?? 'latest', signal ? { signal } : {});
      if (
        run.automatic &&
        (semver.prerelease(metadata.version) ||
          semver.major(metadata.version) !== semver.major(current.runtime.manifest.version) ||
          !semver.gt(metadata.version, current.runtime.manifest.version))
      )
        throw new RuntimeError(
          'UPDATE_INELIGIBLE',
          'Automatic updates require a newer stable version in the current major.',
        );
      const attestations = await this.network.json(metadata.attestations, signal ? { signal } : {});
      runtime = await this.options.cache.install(
        metadata,
        (sink) =>
          this.network.consume(metadata.tarball, sink, {
            maxBytes: 64 * 1024 * 1024,
            timeoutMs: 15000,
            ...(signal ? { signal } : {}),
          }),
        attestations,
      );
    }
    assertCompatible(runtime.manifest, this.options.probe);
    if (
      run.automatic &&
      !automaticEligible(runtime.manifest, current.runtime.manifest.version, this.options.probe)
    )
      throw new RuntimeError(
        'UPDATE_INELIGIBLE',
        'Automatic update compatibility policy rejected this release.',
      );
    const latest = await this.options.preferences.read();
    if (latest.generation !== current.policy.generation)
      throw new RuntimeError(
        'POLICY_CHANGED',
        'Update policy changed while the release was being verified. Retry under the current policy.',
      );
    if (signal?.aborted)
      throw new RuntimeError(
        'UPDATE_TIMEOUT',
        'Startup update timed out; the existing runtime remains selected.',
      );
    await this.options.cache.promote(runtime, signal);
    const outcome: UpdateOutcome = {
      status: 'installed',
      version: runtime.manifest.version,
      pendingVersion: null,
      message: 'Verified runtime selected for the next process. Existing sessions retain their runtime.',
    };
    await this.options.cache.outcome(outcome);
    return outcome;
  }
  install(run: RunPolicy & { version?: string; automatic?: boolean } = {}): Promise<UpdateOutcome> {
    return this.#install(run);
  }
  async startup(run: LaunchOptions = {}): Promise<RuntimeStatus> {
    const baseline = await this.status(run);
    if (
      run.readOnly ||
      run.sourceCheckout ||
      run.explicitVersion ||
      baseline.policy.offline ||
      baseline.policy.mode === 'off' ||
      baseline.policy.pinnedVersion ||
      baseline.policy.rollbackHold ||
      run.startupCheck === false
    )
      return baseline;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<RuntimeStatus>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({
          ...baseline,
          lastOutcome: {
            status: 'failed',
            version: baseline.runtime.manifest.version,
            pendingVersion: null,
            message: 'Startup update timed out. Continuing with the verified local runtime.',
          },
        });
      }, this.options.startupTimeoutMs ?? 5000);
    });
    const update = async () => {
      try {
        const outcome = await this.#check(run, controller.signal);
        if (
          baseline.policy.mode === 'auto' &&
          outcome.pendingVersion &&
          !baseline.policy.skippedVersions.includes(outcome.pendingVersion) &&
          semver.major(outcome.pendingVersion) === semver.major(baseline.runtime.manifest.version)
        )
          await this.#install(
            { ...run, version: outcome.pendingVersion, automatic: true },
            controller.signal,
          );
        return await this.status(run);
      } catch {
        return {
          ...baseline,
          lastOutcome: {
            status: 'failed' as const,
            version: baseline.runtime.manifest.version,
            pendingVersion: null,
            message: 'Update checks failed. Continuing with the verified local runtime.',
          },
        };
      }
    };
    try {
      return await Promise.race([update(), deadline]);
    } finally {
      clearTimeout(timer!);
    }
  }
  async rollback(
    run: RunPolicy & { version?: string } = {},
    authority: SettingsAuthority,
  ): Promise<UpdateOutcome> {
    const pointer = await this.options.cache.pointer(),
      version = run.version ?? pointer.previous?.version ?? this.options.bundle.manifest.version;
    const runtime =
      version === this.options.bundle.manifest.version
        ? this.options.bundle
        : await this.options.cache.get(version);
    if (!runtime)
      throw new RuntimeError(
        'RUNTIME_UNAVAILABLE',
        'Rollback target is not available in the verified local cache.',
      );
    assertCompatible(runtime.manifest, this.options.probe);
    await this.options.preferences.hold(
      version,
      pointer.active?.version ?? this.options.bundle.manifest.version,
      authority,
    );
    if (runtime.source === 'bundle') await this.options.cache.selectBundled();
    else await this.options.cache.promote(runtime);
    const outcome: UpdateOutcome = {
      status: 'rolled-back',
      version,
      pendingVersion: null,
      message: 'Rollback hold selected. Automatic launches retain this version until explicit resume.',
    };
    await this.options.cache.outcome(outcome);
    return outcome;
  }
  async launch(argv: string[], run: LaunchOptions & RuntimeLaunchOptions = {}): Promise<LaunchedRuntime> {
    const before = await this.options.cache.pointer();
    const selected = await this.startup(run);
    try {
      return await launchRuntime(selected.runtime, argv, {
        ...run,
        launcherDirectory: this.options.bundle.directory,
        launcherVersion: this.options.bundle.manifest.version,
        bundledRuntimeVersion: this.options.bundle.manifest.version,
      });
    } catch (error) {
      if (selected.runtime.source === 'cache')
        await this.options.cache.restoreSelection(selected.runtime.manifest.version, before.active);
      throw error;
    }
  }
  configure(policy: Partial<UpdatePolicy>, authority: SettingsAuthority) {
    return this.options.preferences.configure(policy, authority);
  }
  resume(authority: SettingsAuthority) {
    return this.options.preferences.resume(authority);
  }
}
