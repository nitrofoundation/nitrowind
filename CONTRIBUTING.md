# Contributing to Nitrowind

Thanks for helping make native Tailwind styling for React Native better.

## Setup

Nitrowind uses Node.js 20 or newer, Corepack, and Yarn 4.

```sh
git clone git@github.com:AshwithJoylan/nitrowind.git
cd nitrowind
corepack enable
yarn install --immutable
```

The repository is a Yarn workspace:

| Area | Location |
| --- | --- |
| Native CSS engine | `packages/nitrocss` |
| Tailwind and Metro integration | `packages/nitrowind` |
| Agent skills and generator | `packages/nitrowind-skills` |
| Documentation site | `apps/nitrowind-docs` |
| React Native example | `apps/example` |

## Make a change

Keep pull requests focused. Add or update tests when behavior changes, and update the documentation when a public API, supported utility, configuration option, or workflow changes.

For native binding changes in `packages/nitrocss`, regenerate the bindings before committing:

```sh
yarn nitrogen
```

Validate iOS and Android changes in the example app when they affect the native engine, installation, or platform behavior.

## Verify your work

Run the checks relevant to the packages you changed:

```sh
yarn typecheck:packages
yarn test:packages
yarn build:packages
yarn docs:build
```

The package checks cover the libraries that are published to npm. The documentation build checks the Docusaurus site. For a React Native app change, also run the example app on the platform you changed.

## Deploy documentation

Documentation is a static site served with Docker, with no GitHub Actions deployment. Start it locally at [http://localhost:8080](http://localhost:8080):

```sh
yarn docs:docker:up
```

Deploy a locally built static release to the NitroPush VPS with SSH:

```sh
NITROPUSH_VPS_HOST=docs.example.com \
NITROPUSH_DOCS_URL=https://docs.example.com \
yarn docs:deploy
```

Use `yarn docs:docker:logs` to follow the local server logs and `yarn docs:docker:down` to stop it. See `apps/nitrowind-docs/README.md` for all VPS deployment settings.

## Pull requests

Use a clear title that describes the user-visible effect. In the pull request body, explain the problem, the approach, and how you verified it. Include screenshots or recordings for visual documentation and example-app changes.

Do not commit generated build output, local Android or iOS build directories, credentials, or `.env` files.

## Releases

Maintainers release the public packages together through the `Release packages` GitHub Actions workflow. It versions, builds, tags, and publishes `@nitrofoundation/nitrocss`, `@nitrofoundation/nitrowind`, and `@nitrofoundation/nitrowind-skills`; apps are private and are not published.
