# toutbox-carrier-service

The network adapter for Toutbox, a third-party chip-logistics vendor. It exposes the
`CarrierProvider`-facing HTTP contract `wave-delivery-api` (and any future BSS module needing the
same carrier) calls, translating each request into Toutbox's own wire format and back.

This is a reusable-beyond-TIM integration: Toutbox is not a TIM system, so this lives in its own
repository — cloned from `wave-api-template` — rather than as a module inside `tim-network-adapter`.
See [ADR 0000](https://github.com/wave-telecom/tim-network-adapter/blob/main/docs/adr/0000-tim-network-adapter-architecture.md)
in `tim-network-adapter` for the full architecture this repository follows.

**Current state: this is a skeleton, with no use case yet.** The HTTP stack, configuration,
authentication, error contract, container and pipelines are in place and tested, while
`application/use-cases/` and `infrastructure/vendor/toutbox/usecases/` carry nothing but the
directory layout. This service owns no database of its own.

## Tech stack

| Concern         | Tool                                        |
| --------------- | ------------------------------------------- |
| Runtime         | Node.js >= 22                               |
| Package manager | npm                                         |
| HTTP server     | Fastify 5                                   |
| Validation      | Zod 4 (`fastify-type-provider-zod`)         |
| Config          | dotenv + Zod schema                         |
| API docs        | OpenAPI 3 (`@fastify/swagger` + Swagger UI) |
| Observability   | New Relic                                   |
| Tests           | Vitest                                      |
| Linting         | ESLint (flat config)                        |
| Shared utils    | `@wave-tech/framework`                      |

## Architecture

Two layers under `src/`, with a strict **inward-only** dependency rule and **no `domain/` layer** —
this is an integration adapter, not a service with a business domain of its own:

```
infrastructure  →  application
```

- **`src/application/use-cases/`** — Each Toutbox operation as a **type**, never a class:
  `ProviderUseCase<TInput, TOutput, TError>` from `@wave-tech/framework/contracts`. The request/
  response/error types come from `@wave-tech/framework/contracts/delivery`, the same shared contract
  package `wave-delivery-api` depends on — nothing is declared locally that the contract already
  exports.
- **`src/infrastructure/vendor/toutbox/`** — `toutbox-http-client.ts` (transport only) and
  `usecases/` (one implementation file per operation, owning the real translation between Wave's
  shape and Toutbox's wire format). The only place Toutbox's actual field names and auth scheme are
  allowed to live.
- **`src/infrastructure/http/`** — Fastify app, auth, OpenAPI, RFC 9457 errors, one route per
  operation.

The composition root is **`src/server.ts`**: it loads config via `loadEnv()`, constructs the
`ToutboxHttpClient` and each Toutbox use case implementation, and passes them to `buildApp(deps)`,
typed as their `application/use-cases/` contract.

```
src/
├── application/
│   └── use-cases/            # (empty) one type per operation, no runtime code
├── infrastructure/
│   ├── config/                # Env loading (Zod-validated)
│   ├── vendor/toutbox/        # (empty) transport client + one implementation per operation
│   └── http/                  # Fastify app, auth, OpenAPI, RFC 9457 errors
│       ├── auth/
│       ├── errors/
│       └── routes/
└── server.ts                  # Composition root
```

### Adding a feature

1. Add the request/response/error types to `@wave-tech/framework/contracts/delivery`, if they don't
   exist yet.
2. Declare the operation's **type** in `application/use-cases/<name>/<name>.ts`.
3. Implement it in `infrastructure/vendor/toutbox/usecases/toutbox-<name>.ts`.
4. Expose it in `infrastructure/http/routes/` and register the route in
   `infrastructure/http/app.ts`.
5. Add a unit test for the Toutbox implementation against a fake `ToutboxHttpClient`.

See `CLAUDE.md` for the full pattern and the reasoning behind it.

## Getting started

### Prerequisites

- Node.js **>= 22** (see `.nvmrc`)

```bash
npm install
cp .env.example .env
npm run dev
```

The API listens on `http://localhost:8080` by default, with Swagger UI at `/docs` and the raw
OpenAPI document at `/docs/json`.

### Docker

```bash
docker compose up --build
```

Brings up two services: `api` and `wiremock` — no database, since this service owns none. See
[External vendor testing (WireMock)](#external-vendor-testing-wiremock) below for what `wiremock`
fakes and how to drive each scenario.

## External vendor testing (WireMock)

`wiremock` fakes Toutbox's own HTTP API — SLA consulta, order creation, cancellation — so this
service can be developed and exercised end-to-end without ever calling `courier.toutbox.com.br` /
`production.toutbox.com.br`. This follows
[ADR 0001](https://github.com/wave-telecom/tim-network-adapter/blob/main/docs/adr/0001-wiremock-external-system-testing.md)
in `tim-network-adapter`: one WireMock image per network adapter repository, built from
`wiremock/Dockerfile.wiremock`, with stub content living under `wiremock/` in this repo — colocated with the
integration code it simulates, not a shared/central mock repo.

`api` points at it via `TOUTBOX_BASE_URL=http://wiremock:8080` (already wired in
`docker-compose.yml`). Once a `ToutboxHttpClient` exists, it must always read its base URL from
config — never a code branch checking "am I talking to WireMock or the real vendor" (ADR 0001,
decision driver 1). Swapping the base URL is the entire integration surface.

### Layout

```
wiremock/
├── mappings/toutbox/<resource>/*.json   # request matchers, one file per scenario
└── __files/toutbox/<resource>/*.json    # response bodies referenced by the matchers above
```

Each `<resource>` folder (`courier`, `orders`, `parcel`) is named after **Toutbox's own endpoint**,
never after one of our own `application/use-cases/` names — see ADR 0001, decision 6. WireMock scans
`mappings/` recursively, so this nesting is organizational only.

### Authentication

Every Toutbox endpoint requires an `Authorization` header carrying the API key (confirmed against
the Courier and Orders Swaggers referenced in the Toutbox integration contract: `name: Authorization`,
`in: header`, no `Bearer` prefix). All stubs below require `Authorization:
local-dev-toutbox-api-key` exactly; omitting the header or sending a different value falls through
to a lower-priority catch-all stub that returns `401`.

Toutbox has no separate token-exchange endpoint to fake — the API key travels on every business
call, so there is no `wiremock/mappings/toutbox/auth/` folder here (unlike the illustrative example
in ADR 0001, which assumes a vendor with its own auth/token flow). If that ever changes, add it the
same way: its own `auth/` subfolder next to `courier/`, `orders/`, `parcel/`.

### Scenarios and how to force them

All examples assume `docker compose up` is running and target `http://localhost:8443` (WireMock's
port), with `-H "Content-Type: application/json" -H "Authorization: local-dev-toutbox-api-key"`.

#### Consulta de SLA — `POST /api/v1/Courier/CostAndDeliveryTime`

Force a scenario via `cepDestino` (or `transportadora` for the 424 case):

| To get | Send |
| ------ | ---- |
| `200` sucesso | any `cepDestino` not listed below |
| `400` CEP de origem/destino inválido | `"cepDestino": "00000000"` |
| `404` SLA/preço não encontrado | `"cepDestino": "99999999"` |
| `424` transportadora/serviço divergente | `"transportadora": 999` |
| `500` erro interno | `"cepDestino": "55555555"` |
| `401` `Authorization` ausente/errado | omit the header, or send a different value |

```bash
curl -X POST http://localhost:8443/api/v1/Courier/CostAndDeliveryTime \
  -H "Content-Type: application/json" -H "Authorization: local-dev-toutbox-api-key" \
  -d '{"transportadora":122,"codigoServico":"100","cepOrigem":"22775057","cepDestino":"00000000","produtos":[]}'
```

#### Criação de pedido — `POST /api/v1/external/orders`

Force a scenario via `itens[0].frete.destinatario.cep`:

| To get | Send `itens[0].frete.destinatario.cep` |
| ------ | --------------------------------------- |
| `200` pedido cadastrado com sucesso | any CEP not listed below |
| `201` cadastrado, mas falha no despacho automático | `"33333333"` |
| `400` erro ao cadastrar (ex.: transportadora não configurada) | `"00000000"` |
| `409` pedido já existente (duplicidade) | `"11111111"` |
| `500` erro interno | `"22222222"` |
| `401` `Authorization` ausente/errado | omit the header, or send a different value |

> On the real Toutbox API, the `409` duplicate is triggered by a repeated `numeroPedido +
> codigoRastreio` pair (contract §6.2), not by CEP — this mock uses CEP as the trigger for
> consistency with the SLA endpoint above. Once the real `ToutboxHttpClient` exists, the duplicate
> test should resend the same `numeroPedido`/`codigoRastreio` pair, not rely on a magic CEP.

```bash
curl -X POST http://localhost:8443/api/v1/external/orders \
  -H "Content-Type: application/json" -H "Authorization: local-dev-toutbox-api-key" \
  -d '{"itens":[{"frete":{"destinatario":{"cep":"11111111"}}}]}'
```

#### Cancelamento de ordem de envio — `PUT /api/v1/Parcel/SuspendOrCancel/Single`

Force a scenario via `order_id`:

| To get | Send `order_id` |
| ------ | ---------------- |
| `202` aceito, transportadora confirmou (`payload.requestSucceeded: true`) | any `order_id` not listed below |
| `202` aceito, mas transportadora rejeitou (`payload.requestSucceeded: false`) | `"Example-03213"` (Toutbox's own contract example) |
| `400` erro ao cadastrar a solicitação | `"CANCEL-INVALID-01"` |
| `500` erro interno | `"CANCEL-ERROR-01"` |
| `401` `Authorization` ausente/errado | omit the header, or send a different value |

> Cancellation is asynchronous and never guaranteed by the call alone (contract §9) — that's why both
> the "confirmed" and "rejected by carrier" scenarios return the same `202` status; the difference is
> only in `payload.requestSucceeded`. A consumer of this endpoint must inspect the body, not just the
> status code, for this one specifically.

```bash
curl -X PUT http://localhost:8443/api/v1/Parcel/SuspendOrCancel/Single \
  -H "Content-Type: application/json" -H "Authorization: local-dev-toutbox-api-key" \
  -d '{"action":"CE","order_id":"Example-03213","courier_id":89}'
```

### Inspecting WireMock

```bash
curl -s http://localhost:8443/__admin/mappings | jq            # all loaded stubs (17 today)
curl -s http://localhost:8443/__admin/requests | jq             # request history + which stub answered each
curl -s http://localhost:8443/__admin/requests/unmatched | jq   # requests that hit no stub at all
```

WireMock only reads `mappings/`/`__files/` at boot — after editing a stub, recreate the container to
pick it up: `docker compose up -d --force-recreate wiremock`.

## Commands

| Task          | Command                   |
| ------------- | ------------------------- |
| Install       | `npm install`             |
| Dev server    | `npm run dev`             |
| Build         | `npm run build`           |
| Start (prod)  | `npm start`               |
| Tests         | `npm test`                |
| Coverage      | `npm run test:coverage`   |
| Lint          | `npm run lint`            |
| Type-check    | `npm run typecheck`       |

> Production start (`npm start`) loads the New Relic agent via `node -r newrelic dist/server.js`,
> so run `npm run build` first.

## Quality gates

`npm install` installs the Git hooks in `.husky/` (via the `prepare` script), so the same gates CI
runs also run locally:

| Hook         | Runs                                        |
| ------------ | ------------------------------------------- |
| `pre-commit` | `npm run lint` + `npm run typecheck`        |
| `commit-msg` | The Conventional Commits + emoji convention |
| `pre-push`   | `npm test`                                  |

`pre-commit` checks the working tree rather than the staged snapshot, so when splitting a change
with `git add -p` an intermediate commit can pass on the strength of code that is not in it. CI on
the pull request is the full guarantee.

CI (`.github/workflows/ci.yml`) runs lint, type-check, build and tests with coverage on every push
and pull request to `main`. CD (`.github/workflows/cd-dev.yml`) builds and pushes the image to
Artifact Registry after CI goes green on `main`.

## Environment

Copy `.env.example` to `.env`. The Zod schema in `src/infrastructure/config/env.ts` is the source
of truth for which variables are required — add new ones there (e.g. Toutbox's base URL and auth
credentials, once the first use case needs them). `INTERNAL_API_KEY` is required.

## Authentication

Every route except the public paths (`/`, `/management/health`, `/docs`) requires an API key in the
`x-api-key` header, matched against `INTERNAL_API_KEY`.

## Management endpoints

Operational endpoints are served under the `/management` prefix — a platform-wide contract shared
by every Wave API.

| Method | Path                 | Description                      |
| ------ | -------------------- | -------------------------------- |
| GET    | `/`                  | Liveness probe (public)          |
| GET    | `/management/health` | Management health probe (public) |
| GET    | `/docs`              | Swagger UI (public)              |

`GET /management/health` is the single path consumed by Cloud Run `startupProbe`/`livenessProbe`
and load balancer health checks. It is never served at `/health` and never behind auth.

## API documentation

Routes declare their `body`, `params`, `querystring` and `response` schemas as the shared **Zod
schemas** from `@wave-tech/framework/contracts/delivery` — the same objects the use cases parse.
`fastify-type-provider-zod` validates requests, serialises responses and feeds `@fastify/swagger`
with JSON Schema emitted natively by Zod 4, so the OpenAPI document, the runtime validation and the
TypeScript handler types all come from one definition.

## Error handling (RFC 9457)

All HTTP errors follow **RFC 9457 Problem Details**. Every error response is
`application/problem+json` and serialises to `{ type, title, status, detail?, instance?,
...extensions }`. `type` is always an absolute URI under
`https://docs.bemobiwave.com/api-reference/errors/<slug>`, declared in the `ErrorTypes` const.
Errors extend `HttpError` and serialise via `toProblemDetail()`; a single global error handler is
the only place that maps an error to a response.

## Testing

`application/use-cases/` has no runtime code to unit test. The real logic — and its tests — live in
`infrastructure/vendor/toutbox/usecases/`, against a fake `ToutboxHttpClient` (no real HTTP call, no
database). Test files live next to the code they cover (`foo.ts` + `foo.test.ts`).

```bash
npm test
```

## Observability

New Relic is configured in `newrelic.cjs` and driven entirely by environment variables. It is
disabled by default (`NEW_RELIC_ENABLED=false`); set it to `true` and provide
`NEW_RELIC_LICENSE_KEY` to enable reporting. Application logging goes through the framework
`Logger` (`@wave-tech/framework/core`) — never `console.*`.

## License

Apache-2.0
