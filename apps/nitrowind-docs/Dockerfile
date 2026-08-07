FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches .yarn/patches
COPY apps/example/package.json apps/example/package.json
COPY apps/nitrowind-docs/package.json apps/nitrowind-docs/package.json
COPY packages/nitro-css/package.json packages/nitro-css/package.json
COPY packages//nitrowind/package.json packages//nitrowind/package.json
COPY packages/nitrowind-skills/package.json packages/nitrowind-skills/package.json

RUN yarn install --immutable

COPY apps/nitrowind-docs apps/nitrowind-docs

ARG DOCS_URL=http://localhost:8080
ARG DOCS_BASE_URL=/

RUN DOCS_URL="${DOCS_URL}" DOCS_BASE_URL="${DOCS_BASE_URL}" yarn workspace @nitrofoundation/nitrowind-docs build

FROM caddy:2.10-alpine

COPY apps/nitrowind-docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /workspace/apps/nitrowind-docs/build /usr/share/caddy

EXPOSE 8080
