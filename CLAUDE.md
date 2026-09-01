# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repository.

## Project Overview

`toutbox-carrier-service` is the network adapter for Toutbox, a third-party chip-logistics vendor.
It is a reusable-beyond-TIM integration in Wave's network adapter architecture: Toutbox is not a TIM
system, so it lives in its own repository (cloned from `wave-api-template`) rather than as a module
inside `tim-network-adapter`. It exposes the `CarrierProvider`-facing HTTP contract that
`wave-delivery-api` (and any future BSS module needing the same carrier) calls, and translates each
request into Toutbox's own wire format and back.

**Current state: this is a skeleton.** No use case exists yet — `application/use-cases/` and
`infrastructure/vendor/toutbox/usecases/` are empty. The infrastructure is in place: Fastify app, Zod
validation, OpenAPI, API key auth, RFC 9457 error handling, env config, Docker — ready for the first
operation (e.g. `CarrierCreateDeliveryOrder`) to be added.

The full rationale for this repository's shape — why it has no `domain/` layer, why
`application/use-cases/` holds types and not classes, why there is no single `ToutboxClient`
god-class — is decided in
[ADR 0000](https://github.com/wave-telecom/tim-network-adapter/blob/main/docs/adr/0000-tim-network-adapter-architecture.md)
in `tim-network-adapter`. Read it before adding the first use case; this file summarizes its
consequences for day-to-day work here, not the reasoning behind them.
[ADR 0001](https://github.com/wave-telecom/tim-network-adapter/blob/main/docs/adr/0001-wiremock-external-system-testing.md)
in the same repo governs the `wiremock/` directory (see
[External vendor testing](#external-vendor-testing-wiremock) below) — a separate concern from ADR
0000's Pact provider verification, even though the same running WireMock instance ends up serving
both.

Technically it is a TypeScript REST API built on Fastify, following Clean Architecture without a
`domain/` layer. Validation is done with Zod, observability with New Relic, tests with Vitest, and
shared internal building blocks come from `@wave-tech/framework`. This service owns no database of
its own — it is a stateless gateway, not a system of record.

## Architecture

Two layers under `src/`, with a strict inward-only dependency rule and **no `domain/` layer** — this
is an integration adapter, not a service with a business domain of its own:

```
infrastructure  →  application
```

- `src/application/use-cases/` — Each Toutbox operation is declared as a **type**, never a class:
  `type CarrierCreateDeliveryOrder = ProviderUseCase<TInput, TOutput, TError>`, with
  `ProviderUseCase` imported from `@wave-tech/framework/contracts`. The request/response/error types
  themselves (`CarrierCreateDeliveryOrderRequest`, `CarrierDeliveryOrderResponse`,
  `CarrierDeliveryOrderError`, ...) are *not* declared here either — they're imported from
  `@wave-tech/framework/contracts/delivery`, the shared contract package `wave-delivery-api` also
  depends on. This folder contributes **no runtime code**: just a type alias per operation, colocated
  with nothing else, because there's nothing else to test in isolation here.
- `src/infrastructure/vendor/toutbox/` — `toutbox-http-client.ts` (transport only: base URL, auth/
  token caching, retry — zero business/mapping logic) and `usecases/` (one implementation file per
  operation, e.g. `toutbox-create-delivery-order.ts`, each `implements` its corresponding
  `application/use-cases/` type). This is the **only** place Toutbox's actual wire format, field
  names, and auth scheme are allowed to live.
- `src/infrastructure/http/` — Fastify app, auth, OpenAPI, RFC 9457 errors, and one route per
  operation under `routes/`, each binding directly to one use case.

The composition root is `src/server.ts`: it loads config via `loadEnv()`, constructs the
`ToutboxHttpClient` and each Toutbox use case implementation, and passes them to `buildApp(deps)`
(`src/infrastructure/http/app.ts`), typed as their `application/use-cases/` contract — nothing outside
`server.ts` knows or needs to know that the concrete implementation is Toutbox-specific.

## When adding the first (or a new) use case

1. Add the request/response/error types for the operation to
   `@wave-tech/framework/contracts/delivery` (or the relevant domain), if they don't exist yet — see
   ADR 0000, decision C, for the schema-first authoring pattern and the `Carrier`-prefixed naming
   convention.
2. Declare the operation's **type** in `src/application/use-cases/<name>/<name>.ts`:
   `type Carrier<Name> = ProviderUseCase<CarrierXRequest, CarrierXResponse, CarrierXError>`. No class,
   no logic — this file is the contract only.
3. Implement it in `src/infrastructure/vendor/toutbox/usecases/toutbox-<name>.ts`: a class
   `implements Carrier<Name>`, owning the real translation between Wave's shape and Toutbox's wire
   format, built on `ToutboxHttpClient`.
4. Expose it in `src/infrastructure/http/routes/<name>-route.ts` — a route plugin **factory**
   (`fooRoute(deps) => FastifyPluginAsync`) that validates the request with the shared schema and
   calls the use case's `.execute(...)`.
5. Wire the concrete implementation to the route in `src/server.ts` and register it in
   `src/infrastructure/http/app.ts`.
6. Add a unit test for the Toutbox implementation (`toutbox-<name>.test.ts`), against a fake
   `ToutboxHttpClient` — this is where the real logic lives, so this is where its test lives.

Key patterns:

- **No proxy classes in `application/`.** If a use case's entire body would be one line delegating to
  another object, it isn't doing orchestration — it's ceremony. `application/` here never grows a
  class for this reason: there's nothing to instantiate.
- **No single `ToutboxClient` god-class.** Each operation is its own implementation file under
  `infrastructure/vendor/toutbox/usecases/`. `toutbox-http-client.ts` stays limited to transport
  concerns (base URL, auth, retry) — it must never grow business-shaped methods like
  `createShipment()`.
- A route plugin that needs a use case is a **factory returning the plugin**
  (`fooRoute(deps) => FastifyPluginAsync`, registered as `app.register(fooRoute({ ... }))`), never a
  plugin taking Fastify options directly. A plugin with no deps (`managementRoutes`) stays a bare
  `async function(app)`.
- Zod "parse, don't validate" — the shared request schema validates the HTTP request body; the
  parsed input is trusted downstream.

## HTTP API

The API contract conventions below — authentication, operational endpoints, documentation, error
format — are the same cross-repo standard every `wave-*-api` service follows. Keep them identical.
This service has no list endpoints today, so the pagination/ordering conventions those templates
document don't apply here — add them back (from `wave-api-template`) only if a listing operation is
actually needed.

- **Create-shaped endpoints**: respond `201 Created` and return the new resource's id in the
  `Location` response header.
- **Operational endpoints:** served under the `/management` prefix — see
  [Management endpoints](#management-endpoints-platform-wide-standard).

### Authentication

Every route except the public paths (`/`, `/management/health`, `/docs`) requires an API key in the
`x-api-key` header, matched against `INTERNAL_API_KEY`. Auth is registered via
`registerApiKeyAuth(app, { apiKey })` (`http/auth/api-key-auth.ts`) as a global `onRequest` hook; the
OpenAPI spec (`http/openapi.ts`) declares the matching `apiKey` security scheme. When adding public
endpoints, extend the `publicPaths` list.

### Management endpoints (platform-wide standard)

Every Wave API exposes its operational endpoints under the `/management` prefix. This is a
platform-wide contract shared by all `wave-*-api` services — do not deviate here either.

- **Health probe**: `GET /management/health`, always **public** (exempt from the API key / auth
  middleware — it is one of the `publicPaths` listed under [Authentication](#authentication)). It is
  the single path consumed by Cloud Run `startupProbe`/`livenessProbe` (defined in
  `wave-foundation-iac`) and load balancer health checks.
- Never serve the probe at `/health` or any other path, and never put it behind auth.

### API documentation (OpenAPI)

An OpenAPI 3 document is generated from the routes' **Zod schemas** (the same shared schemas from
`@wave-tech/framework/contracts/delivery`) and served by `@fastify/swagger`, registered in
`http/openapi.ts`. Swagger UI is served at `/docs`, the raw spec at `/docs/json`.

**Zod is the single source of truth.** A route declares its `body`, `params`, `querystring` and
`response` entries as the shared Zod schemas directly. `fastify-type-provider-zod` wires this up:
`setValidatorCompiler`/`setSerializerCompiler` (Fastify validates/serialises with Zod instead of Ajv),
`transform: jsonSchemaTransform` (Zod 4 emits JSON Schema natively), and `transformObject` (publishes
any schema tagged `.meta({ id: 'Name' })` under `components.schemas`).

**Register routes as plugins** (`app.register(fooRoute)`), never synchronously on the root instance.
`@fastify/swagger` collects routes through an `onRoute` hook installed when its own plugin boots, so a
route added before that runs is invisible to the generator. `registerOpenApi(app)` is called first in
`buildApp` for the same reason.

**Do not** register schemas with `app.addSchema(...)` and reference them via a hand-written `$ref`
string, and do not hand-write JSON Schema in a route — share a schema by importing the Zod object.

### Error handling — RFC 9457 (`application/problem+json`)

All HTTP errors follow **RFC 9457 Problem Details**. This is a cross-repo Wave standard.

- Every error response is `application/problem+json` and serialises to
  `{ type, title, status, detail?, instance?, ...extensions }`.
- `type` is always an absolute URI under `https://docs.bemobiwave.com/api-reference/errors/<slug>` —
  declared in the `ErrorTypes` const and never a bare slug.
- All HTTP errors extend `HttpError` and serialise via `toProblemDetail()`. Concrete subclasses fix
  `status` and `type`; nothing else builds an error body.
- A single global error handler is the only place that maps an error to a response. It handles
  `HttpError`, Zod request-validation failures, a bare `ZodError`, response serialisation failures,
  and everything else (→ 500, generic detail — never leak messages or stacks).
- A Toutbox use case implementation returns `Result<T, CarrierDeliveryOrderError>` — its route maps a
  `failure(...)` result to the right `HttpError` subclass (via `toStatusCode`/similar), the same way
  the response body maps a `success(...)` result to its 2xx response. **Never** `throw new
  Error('…')` and never hand-roll an error body in a route handler.
- Files: `src/infrastructure/http/errors/http-error.ts` (`ErrorTypes`, `ProblemDetail`, `HttpError` +
  subclasses), `src/infrastructure/http/errors/problem-detail.schema.ts` (the Zod
  `problemDetailSchema`), `src/infrastructure/http/error-handler.ts` (`errorHandler` +
  `notFoundHandler`, both registered in `src/infrastructure/http/app.ts`).

## Mandatory completion gates

Every implementation must pass these gates before the task is reported as done. No exceptions.

- **Lint:** run `npm run lint`. If it fails, fix the root cause — do not disable rules, do not
  `--no-verify`.
- **Tests:** run `npm test`. All tests must pass.
- **Edge cases:** for any state-machine, async, or error-handling change, the test suite must
  explicitly cover:
  - Idempotent re-calls on the target/terminal state (no-op succeeds).
  - Invalid transitions rejected with the appropriate error (HTTP 422).
  - Rollback / error-escalation paths.
  - Async callback/webhook endpoints handling both success and failure payloads.

If a test or lint failure is unrelated to the change, surface it explicitly instead of silently
ignoring it.

These gates are enforced twice: locally by the Git hooks in `.husky/` (installed by the `prepare`
script on `npm install`) and in CI by `.github/workflows/ci.yml` on every push and pull request to
`main`. `pre-commit` runs lint + type-check, `commit-msg` validates the commit convention,
`pre-push` runs the tests. **Never bypass them with `--no-verify`** — fix the root cause.

## Commands

**npm is the package manager for this repo**, as it is across every Wave backend, and
`package-lock.json` is committed. Never introduce a second package manager.

| Task          | Command                 |
| ------------- | ------------------------ |
| Install       | `npm install`             |
| Dev server    | `npm run dev`             |
| Build         | `npm run build`           |
| Start (prod)  | `npm start`               |
| Tests         | `npm test`                |
| Coverage      | `npm run test:coverage`   |
| Lint          | `npm run lint`            |
| Type-check    | `npm run typecheck`       |

Always run `npm run lint` and `npm test` before declaring a task done.

## Docker

`docker compose up --build` brings up two services: `api` and `wiremock` — no database, since this
service owns none.

The `Dockerfile` is multi-stage (`builder` → `runner`) and the container is started directly with
`npm start` (`node -r newrelic dist/server.js`). The image does **not** need an entrypoint script —
do not add a `docker-entrypoint.sh`.

## External vendor testing (WireMock)

`wiremock/Dockerfile.wiremock` builds a second image, from its sibling `mappings/` + `__files/`, that
fakes Toutbox's own HTTP API. This is [ADR 0001](https://github.com/wave-telecom/tim-network-adapter/blob/main/docs/adr/0001-wiremock-external-system-testing.md)
in `tim-network-adapter` — read it before adding or restructuring a stub. The same image serves
local development (`docker compose up`, `api`'s `TOUTBOX_BASE_URL` already points at it), CI, and
(incidentally) ADR 0000's Pact provider verification — one set of mappings, never duplicated.

Rules that matter when touching `wiremock/`:

- **A stub folder is named after Toutbox's own endpoint** (`courier`, `orders`, `parcel`), never
  after one of our `application/use-cases/` names (ADR 0001, decision 6). A single use case calling
  two vendor endpoints still produces two stubs, one per vendor resource.
- **`ToutboxHttpClient` must never know WireMock exists.** It only ever reads `TOUTBOX_BASE_URL`
  from config (ADR 0001, driver 1) — no `if (NODE_ENV === 'test')` branch pointing at WireMock by
  name.
- **Fake the vendor's auth too, not just business endpoints** (ADR 0001, decision 7) — otherwise a
  real client never gets past its own auth step to reach the stub under test. Toutbox's auth is a
  static API key on the `Authorization` header of every business call (no separate token exchange),
  so here that means every business stub's `request.headers.Authorization` requires the sentinel
  key, plus a low-priority catch-all per resource returning `401` for anything else — not a
  dedicated `auth/` folder. Add a real `auth/` folder only if Toutbox ever grows an actual
  token-exchange endpoint.
- Full scenario tables (which sentinel field/value forces which status) and how to run it locally
  live in [`README.md`](README.md#external-vendor-testing-wiremock), not duplicated here.

## Environment

Copy `.env.example` to `.env`. The Zod schema in `src/infrastructure/config/env.ts` is the source of
truth for which variables are required — add new ones there (e.g. `TOUTBOX_BASE_URL` and Toutbox
auth credentials, once the first use case needs them; `docker-compose.yml`'s `api` service already
sets `TOUTBOX_BASE_URL` for local dev, pointing at `wiremock`, ahead of any code consuming it).
`INTERNAL_API_KEY` is required.

## Observability, logging & request context

Logging and correlation use **New Relic** plus the `Logger` and hook helpers from
`@wave-tech/framework/core`.

- **Always log via the framework `Logger`** — never `console.*`, and never a second logging framework.
- **Initialize it once, in the composition root** (`src/server.ts`):
  `Logger.initialize(env.NEW_RELIC_APP_NAME)`. Nothing should log before that call.
- **Fastify's built-in Pino logger stays off** (`Fastify({ logger: false })` in
  `src/infrastructure/http/app.ts`). Request/response lines come from the `onRequest`/`onResponse`
  hooks in that same file; errors come from the global error handler.
- **Message static, context in `meta`.** `Logger.info('Delivery order created', { toutboxOrderId })`,
  not a template string — the JSON fields are what make logs queryable.

**Correlation id.** Every inbound request runs inside a hook context that captures (or generates) the
correlation id and logs request/response, wired as a global `onRequest`/`onResponse` hook pair in
`src/infrastructure/http/app.ts`. Toutbox is an external vendor, not another Wave API — its own API
has no notion of Wave's `x-correlation-id`, so there is nothing to propagate outbound the way a
Wave-to-Wave call would. Still include the correlation id in every log line around the outbound
Toutbox call (via `getHookCorrelationId()` in the `Logger` call's `meta`), so a Toutbox request/
response pair can be traced back to the inbound `wave-delivery-api` request that triggered it.

## Testing Strategy

- `application/use-cases/` has no runtime code, so there is nothing to unit test there — a type alias
  needs no test.
- The real logic — and its tests — live in `infrastructure/vendor/toutbox/usecases/`: a
  `toutbox-<name>.test.ts` against a fake `ToutboxHttpClient` (`{ post: async () => ({ ok: true,
  value: rawToutboxFixture }) }`), asserting the Toutbox-shape ↔ Wave-shape mapping directly.
- Test files live alongside the code: `foo.ts` + `foo.test.ts`.
- For any new use case, add: happy path, the vendor-error mapping path, and (if async) the
  rollback/error-callback path.

## What NOT to do

- Don't add a `domain/` layer — see ADR 0000 for why this repository doesn't have one. If genuine
  cross-operation business rules Wave owns independently of Toutbox accumulate, that's the signal to
  introduce one; it isn't a default.
- Don't write a class in `application/use-cases/` — it's types only.
- Don't let `toutbox-http-client.ts` grow business-shaped methods (`createShipment()`, etc.) — that
  belongs in `infrastructure/vendor/toutbox/usecases/`.
- Don't hand-roll a request/response type — import it from `@wave-tech/framework/contracts/delivery`
  and derive nothing locally that the shared contract already exports.
- Don't bypass Zod for input parsing.
- Don't hand-write JSON Schema in a route, and don't register schemas via `app.addSchema` / `$ref`.
- Don't use `console.*` or add a second logging framework.
- Don't introduce a new dependency without checking whether `@wave-tech/framework` already provides
  it — import its building blocks from subpaths such as `@wave-tech/framework/core`.
- Don't expose a bare `/health` (or any other path) for the health probe — it is always
  `GET /management/health`.
- Don't add a Docker entrypoint script.
- Don't swap in a different package manager or commit a second lockfile.
- Don't branch code on "am I talking to WireMock" (`if (NODE_ENV === 'test') ...` pointing at a
  fake base URL). `ToutboxHttpClient` only ever reads `TOUTBOX_BASE_URL` from config — see
  [External vendor testing](#external-vendor-testing-wiremock).
- Don't name a `wiremock/mappings/toutbox/` folder after one of our own use cases — name it after
  the Toutbox endpoint it fakes (`courier`, `orders`, `parcel`).

## Git / commits

We strictly follow [Conventional Commits](https://www.conventionalcommits.org/) augmented with
specific emojis. Every commit message must follow this format:

`<emoji> <type>: <short description>`

### Commit Types & Emojis

| Type              | Emoji          | Keyword    | Use Case                                              |
| :---------------- | :------------: | :--------- | :---------------------------------------------------- |
| **Feature**       | :sparkles:     | `feat`     | Adding a new feature or capability.                   |
| **Bugfix**        | :bug:          | `fix`      | Solving a bug or issue.                               |
| **Documentation** | :books:        | `docs`     | Changes to README, tech specs, or rule files.         |
| **Test**          | :test_tube:    | `test`     | Adding, updating, or fixing unit tests.               |
| **Refactor**      | :recycle:      | `refactor` | Code changes that neither fix a bug nor add a feature.|
| **Performance**   | :zap:          | `perf`     | Code changes that improve performance.                |
| **Build/Deps**    | :package:      | `build`    | Changes to package.json, dependencies, or build tools.|
| **Chore**         | :wrench:       | `chore`    | Config updates, scaffolding, minor non-code tasks.    |
| **CI**            | :bricks:       | `ci`       | Changes to CI/CD configuration files and scripts.     |
| **Cleanup**       | :broom:        | `cleanup`  | Removing commented code, unused variables, formatting.|
| **Remove**        | :wastebasket:  | `remove`   | Deleting obsolete files, directories, or features.    |

### Examples

- `:sparkles: feat: add CarrierCreateDeliveryOrder use case`
- `:bug: fix: map Toutbox 409 to DUPLICATE_ORDER instead of UNKNOWN`
- `:books: docs: document the Toutbox auth flow`
- `:test_tube: test: add unit tests for ToutboxCreateDeliveryOrder`
- `:recycle: refactor: extract Toutbox status-code mapping table`

### Commit granularity

Commits should tell the story of how a change was built — never squash a whole feature into a single
catch-all commit. Split the work into small, coherent commits, each scoped to one context (a layer, a
resource, a concern).

- **By context, then by file, then by line when needed.**
- **Each commit should stand on its own**: it compiles, lints and passes tests in isolation, so the
  history stays bisectable.
- **Order commits along the dependency direction** (application → infrastructure → HTTP), or one
  self-contained vertical slice per operation.
- Prefer several focused commits over one large one.

Prefer creating new commits over `--amend`. Do not push or open PRs unless the user explicitly asks.
