# Releasing to npm

The CLI is published as `@evanston/plankton`; its API dependency is `@evanston/plankton-core`. Both are public scoped packages. The current release is version 0.3.3.

## Record the change

Every publishable change must include a Changesets file under `.changeset`. For a coordinated patch release, select both packages:

```sh
pnpm changeset
```

Choose `patch` for `@evanston/plankton` and `@evanston/plankton-core`, then write a user-facing summary. Commit the implementation and its changeset together. Run `pnpm install --frozen-lockfile` and `pnpm check` from the repository root before preparing the release.

## Prepare the version

Start from a clean `main` branch containing the changeset. Confirm that the intended version is not already published and that npm recognizes the publishing account:

```sh
npm view @evanston/plankton-core@0.3.4 version
npm view @evanston/plankton@0.3.4 version
npm whoami
```

An `E404` from each version lookup confirms that the version is unused. Replace `0.3.4` throughout these examples with the version being prepared.

Apply the changeset:

```sh
pnpm changeset version
```

Changesets updates both package manifests and changelogs and removes the consumed changeset. Update version-specific references in `docs/cli.md`, `docs/compatibility.md`, `docs/releasing.md`, and `packages/core/README.md`. Review the complete diff and run `pnpm check` again.

Commit the generated version and documentation changes as `Release 0.3.4`, then push `main` before publishing.

## Inspect the packages

The packages must be built before packing. Pack with pnpm so the CLI's `workspace:^` core dependency becomes a normal npm version range:

```sh
release_dir="$(mktemp -d /tmp/plankton-release.XXXXXX)"
pnpm --dir packages/core pack --pack-destination "$release_dir"
pnpm --dir packages/cli pack --pack-destination "$release_dir"
```

Inspect both archives before publishing. Confirm their versions, file lists, public access, the CLI's `bin` entry and shebang, and its resolved dependency on the new core version. The archives should contain only compiled `dist`, README, LICENSE, and package manifest files. They must not contain credentials, reference checkouts, tests, or `node_modules`.

Install both archives into a fresh temporary prefix and exercise `plankton --version`, `plankton --help`, and JSON invalid-argument output. These archives verify the package contents; `changeset publish` packs the same workspace packages for publication.

## Publish and tag

Publish both packages through Changesets from an interactive terminal:

```sh
pnpm changeset publish
```

The npm registry may display a browser authentication URL. Complete that flow and select the option to skip 2FA for five minutes so both packages can publish in the same run. Do not put credentials or one-time passwords in source or chat.

Changesets detects package versions already present in the registry, publishes the remaining versions, and creates local git tags named `@evanston/plankton@0.3.4` and `@evanston/plankton-core@0.3.4`. If publication stops after one package succeeds, rerun `pnpm changeset publish`; it will skip the published package and continue with the other one.

Verify the registry and tag targets, then push the generated tags:

```sh
npm view @evanston/plankton-core@latest version dist.integrity --json
npm view @evanston/plankton@latest version bin dependencies dist.integrity --json
git log -1 --decorate
git push origin refs/tags/@evanston/plankton@0.3.4 refs/tags/@evanston/plankton-core@0.3.4
```

Both `latest` versions must match the release, the CLI dependency must name the same core version range, and both tags must point to the release commit. Finally, install `@evanston/plankton@latest` into a fresh temporary prefix and repeat the version, help, and JSON error smoke tests. Source installation remains documented in [development](development.md).
