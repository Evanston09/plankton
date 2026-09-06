# Releasing to npm

The public packages `@evanston/plankton` and `@evanston/plankton-core` are released together with Changesets.

Add a changeset with each publishable change and commit it with the implementation:

```sh
pnpm changeset
```

To release the accumulated changesets, run:

```sh
pnpm check
pnpm changeset version
```

Review the generated package manifest and changelog updates, then commit and push them. Publish from an interactive terminal so npm can prompt for authentication when required:

```sh
pnpm changeset publish
```

Changesets creates tags named `name@X.X.X`, or `vX.X.X` in a single-package repository. Push the generated tags to the git remote:

```sh
git push --follow-tags
```

The release is complete. Repeat this process after adding more changesets.
