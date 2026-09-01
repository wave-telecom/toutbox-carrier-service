# ---------------------------------------------------------------------------
# Builder: install all deps, compile TypeScript.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runner: lean runtime image carrying only what is needed to run the API.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# The npm cache is written into this layer, so it has to go in the same RUN or
# it stays in the image for good.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY newrelic.cjs ./

EXPOSE 8080

CMD ["npm", "start"]
