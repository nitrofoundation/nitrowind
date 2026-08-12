FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY apps/docs/package.json apps/docs/package.json
COPY apps/example/package.json apps/example/package.json
COPY apps/nitrowind-docs/package.json apps/nitrowind-docs/package.json
COPY packages/nitrocss/package.json packages/nitrocss/package.json
COPY packages/nitrowind/package.json packages/nitrowind/package.json
COPY packages/nitrowind-skills/package.json packages/nitrowind-skills/package.json

RUN yarn install --immutable

COPY apps/docs apps/docs

RUN yarn workspace docs build

FROM caddy:2.10-alpine

COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /workspace/apps/docs/dist /usr/share/caddy

EXPOSE 8080
