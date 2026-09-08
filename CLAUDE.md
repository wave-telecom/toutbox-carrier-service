# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repository.

## Project Overview

`@wave-tech/toutbox-carrier` (repository: `toutbox-carrier-service`) is a published npm library
wrapping Toutbox's own HTTP API — a third-party chip-logistics vendor. It is **not** an HTTP service
anymore: it has no server, no routes, no database, and no auth of its own. It exports a small set of
classes and types that a consumer imports and calls in-process.

**This repository used to be a standalone Fastify microservice** implementing the `CarrierService`-
facing HTTP contract directly. It was converted into a library because, in practice, every real use
of Toutbox turned out to be deeply specific to TIM (hardcoded sender/warehouse identity, sales
channel, which resource types are supported, tracking-code derivation) — none of that is actually
Toutbox's own wire format, so keeping it here contradicted the whole point of a reusable-beyond-TIM
integration. That TIM-specific knowledge, and the HTTP layer that used to expose it, now lives in
`tim-network-adapter` (`integrations/toutbox/carrier-service/`), which depends on this package.

**What this library still owns**: Toutbox's own request/response shapes for its three endpoints
(create order, cancel, quote shipping), its delivery-status webhook payload shape, and its
`codOcorrencia` occurrence-code table — genuinely Toutbox's own vocabulary, not TIM's or Wave's.

**What it does not own anymore**: the generic Wave `CarrierCreateDeliveryOrderRequest`/etc. contract
types (those are `wave-delivery-api`'s and `tim-network-adapter`'s concern), any HTTP server or
routes, any auth, any call back into `wave-delivery-api` (the webhook-processing orchestration that
used to live here moved to `tim-network-adapter` in full), and any TIM-specific hardcoded business
data.

## Architecture

One layer — no `application/`, no `domain/`, no HTTP:

```
src/
├── index.ts                     # public barrel — the only import path consumers should use
├── toutbox-http-client.ts       # transport only: base URL, static Authorization header, retry
├── toutbox-operation-error.ts   # { status, message } — this library's own failure shape
├── usecases/
│   ├── create-delivery-order/
│   │   ├── toutbox-create-order-payload.ts   # request/response/result types
│   │   └── toutbox-create-delivery-order.ts  # POST /api/v1/External/Order
│   ├── cancel-delivery-order/
│   │   └── toutbox-cancel-delivery-order.ts  # PUT /api/v1/Parcel/SuspendOrCancel/Single
│   └── quote-shipping/
│       └── toutbox-quote-shipping.ts          # POST /api/v1/Courier/CostAndDeliveryTime
└── webhook/
    ├── toutbox-delivery-webhook-payload.ts    # Zod schema + types for Toutbox's own webhook body
    └── toutbox-occurrence-code.ts             # codOcorrencia <-> generic status De<>Para
```

Each use case class takes a `ToutboxHttpClient` in its constructor and exposes a single
`execute(input): Promise<Result<Output, ToutboxOperationError>>`. There is no shared "Toutbox client"
god-class accumulating every operation — `toutbox-http-client.ts` stays limited to transport (base
URL, auth header) and must never grow a business-shaped method like `createOrder()`.

**The anti-corruption boundary runs the other way now compared to the old service.** Before, this
repository translated *Wave's* generic contract into Toutbox's wire format. Now it does no
translation at all — the caller is responsible for handing over an already-Toutbox-shaped payload
(see each `usecases/<name>/` file's exported request type), and this library's only job is the HTTP
call and status-code mapping. Never add a mapping function here that takes a non-Toutbox-shaped
input (a `CarrierCreateDeliveryOrderRequest`, a domain entity, anything with Wave- or TIM-specific
field names) — that mapping belongs in the consumer.

## When adding an operation

1. Create `usecases/<name>/toutbox-<name>.ts` (with a sibling `toutbox-<name>-payload.ts` if the
   request/response shape is large enough to warrant its own file, following
   `create-delivery-order`'s pattern).
2. Export a request type, a response type (the raw envelope Toutbox answers with) and a result type
   (the normalized, minimal shape a caller actually needs) from that file.
3. Implement a class `Toutbox<Name>` with a constructor taking `ToutboxHttpClient` and an
   `execute(request)` method — same shape as the three existing use cases.
4. Export the class and its types from `src/index.ts`.
5. Add `toutbox-<name>.test.ts` next to the implementation, against a fake `ToutboxHttpClient`
   (`{ post: async () => ({ status, body }) }` or `put:` likewise) — see any existing test for the
   pattern. Cover: the happy path, the vendor's own client-error passthrough (4xx it forwards as-is),
   and the "anything unexpected maps to 502" case.

## What NOT to do

- Don't accept a non-Toutbox-shaped input anywhere in `usecases/` — no `CarrierCreateDeliveryOrderRequest`,
  no domain entity, no TIM-specific field. If a caller needs mapping from its own shape into a
  Toutbox payload, that mapping is the caller's code, not this library's.
- Don't add an HTTP server, a route, or a web framework dependency back into this repository — it is
  a library, imported and called in-process.
- Don't add a call back into `wave-delivery-api` (or any other consumer) — this library never calls
  out to anything except Toutbox's own API.
- Don't let `toutbox-http-client.ts` grow business-shaped methods — that belongs in `usecases/`.
- Don't bypass Zod for the webhook payload schema.
- Don't use `console.*` or add a second logging framework — always `Logger` from
  `@wave-tech/framework/core`.
- Don't hand-copy a Toutbox field name into a translated/renamed property — the wire-format types
  keep Toutbox's own Portuguese field names verbatim (`numeroPedido`, `frete`, `transportadora`,
  `destinatario`, `remetente`, `tomador`, `entregas`, `codOcorrencia`, ...); only the TypeScript
  identifiers we ourselves name (interfaces, classes) are written in English.
- Don't bump `version` in `package.json` without considering semver: any change to an exported type
  or a use case's observable behavior is a breaking (major) change, since consumers compile directly
  against these types.

## Mandatory completion gates

Every implementation must pass these gates before the task is reported as done. No exceptions.

- **Lint:** run `npm run lint`. If it fails, fix the root cause — do not disable rules, do not
  `--no-verify`.
- **Type-check:** run `npm run typecheck`.
- **Build:** run `npm run build` — this is a published package; a type that fails to emit a `.d.ts`
  is a broken release.
- **Tests:** run `npm test`. All tests must pass.

These gates are enforced twice: locally by the Git hooks in `.husky/` (installed by the `prepare`
script on `npm install`) and in CI by `.github/workflows/ci.yml` on every push and pull request to
`main`. `pre-commit` runs lint + type-check, `commit-msg` validates the commit convention, `pre-push`
runs the tests. **Never bypass them with `--no-verify`** — fix the root cause.

## Commands

**npm is the package manager for this repo**, as it is across every Wave repository, and
`package-lock.json` is committed. Never introduce a second package manager.

| Task          | Command                 |
| ------------- | ------------------------ |
| Install       | `npm install`             |
| Build         | `npm run build`           |
| Tests         | `npm test`                |
| Coverage      | `npm run test:coverage`   |
| Lint          | `npm run lint`            |
| Type-check    | `npm run typecheck`       |

Always run `npm run lint`, `npm run typecheck` and `npm test` before declaring a task done.

## Observability, logging

Log via the framework `Logger` (`@wave-tech/framework/core`) — never `console.*`, and never a second
logging framework. Include `getHookCorrelationId()` in every log's `meta` around an outbound Toutbox
call, so a request/response pair can be traced back to whatever triggered it in the caller's own
system — this library doesn't establish the correlation context itself (there's no inbound HTTP
request here to establish it from), it only reads whatever the caller's process already set.

## Testing strategy

- Every use case is tested against a fake `ToutboxHttpClient` (a plain object implementing `post`/
  `put`), asserting the exact outbound body/path and the response-to-`Result` mapping directly — no
  real HTTP call, no WireMock, no database.
- Test files live alongside the code: `foo.ts` + `foo.test.ts`.
- For any new operation, cover: the happy path, the vendor's documented client-error responses
  (passed through as-is), and the "unexpected status / network failure → 502" fallback.

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

### Commit granularity

Commits should tell the story of how a change was built — never squash a whole feature into a single
catch-all commit. Split the work into small, coherent commits, each scoped to one context.

- **Each commit should stand on its own**: it compiles, lints and passes tests in isolation, so the
  history stays bisectable.
- Prefer several focused commits over one large one.

Prefer creating new commits over `--amend`. Do not push or open PRs unless the user explicitly asks.
