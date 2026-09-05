# Releasing to npm

The CLI is published as `@evanston/plankton`; its API dependency is `@evanston/plankton-core`. Both are public scoped packages. The CLI release is version 0.2.1.

## Prepare and verify

1. Check npm's existing versions and choose unused versions for the packages being released. For a coordinated release, update both package manifests, the CLI's `--version` value and its test, the changelog, and the version-specific documentation.
2. Run `pnpm install --frozen-lockfile` and `pnpm check` from the repository root. The packages must be built before packing; only compiled `dist`, README and LICENSE files are included alongside the manifest.
3. Pack with pnpm so the CLI's `workspace:^` core dependency becomes a normal npm version range:

```sh
mkdir -p /tmp/plankton-release
pnpm --dir packages/core pack --pack-destination /tmp/plankton-release
pnpm --dir packages/cli pack --pack-destination /tmp/plankton-release
```

Inspect both archives before publishing. Confirm the versions, the CLI's `bin` entry and shebang, public access, and the resolved core dependency. Check that no credentials, reference checkout, tests or node_modules are included. Install the two local archives into a temporary project and exercise `plankton --version`, help and invalid-argument output.

## Publish and confirm

Authenticate with `npm login` if necessary; `npm whoami` confirms the publisher. Publish the reviewed archives, core first. Substitute the actual versions and archive names for future releases:

```sh
npm publish /tmp/plankton-release/evanston-plankton-core-0.2.1.tgz --access public --tag latest
npm view @evanston/plankton-core@0.2.1 version
npm publish /tmp/plankton-release/evanston-plankton-0.2.1.tgz --access public --tag latest
npm view @evanston/plankton@latest version bin dependencies --json
```

Use npm's interactive authentication or OTP flow when required; credentials do not belong in source or chat. The two publications are separate operations. If CLI publication fails after core succeeds, finish publishing the CLI using the same reviewed archive; do not attempt to republish the existing core version.

Finally, install `@evanston/plankton@latest` into a fresh temporary prefix and check the installed executable's version, help and JSON errors. Verify npm's `latest` tags and registry integrity values against the reviewed archives. Update the repository documentation and changelog to match the release. Source installation remains documented in [development](development.md).
