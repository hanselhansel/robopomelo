# Coordinated release intent

Add a Changeset for a reviewed user-visible change. All six private workspaces belong to one fixed release group. They are implementation boundaries, not independently published products.

CI runs `changeset status` to validate and report the intent. Do not run `changeset version` or `changeset publish` as an additional release writer. The repository ship workflow owns the three-part `VERSION`, private root manifest and root lockfile synchronization. The generated public package is the sole published artifact. Private package versions are internal metadata, not public compatibility guarantees.

The first target is 1.0.0, with 1.0.0-rc.1 verified before stable publication. A Changeset summary is a proposed change record, not proof of registry availability. Retire consumed intent records with the reviewed release notes after release verification. See [the CI contract](../docs/verification/ci-contract.md).
