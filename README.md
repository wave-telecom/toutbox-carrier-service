# @wave-tech/toutbox-carrier

A TypeScript library wrapping Toutbox's own HTTP API (a third-party chip-logistics vendor). It knows
nothing beyond Toutbox's own wire format: request/response shapes, status-code mapping, occurrence
codes. It has no HTTP server, no database, and no knowledge of any consumer's own domain — it is
called in-process by whoever integrates with Toutbox (today, `tim-network-adapter`).

## Tech stack

| Concern         | Tool                    |
| --------------- | ----------------------- |
| Runtime         | Node.js >= 22           |
| Package manager | npm                     |
| Validation      | Zod (webhook payload)   |
| Tests           | Vitest                  |
| Linting         | ESLint (flat config)    |
| Shared utils    | `@wave-tech/framework`  |

## Installing

```bash
npm install @wave-tech/toutbox-carrier
```

Before the first npm publish (see [Publishing a new version](#publishing-a-new-version) below),
install directly from GitHub instead:

```bash
npm install github:wave-telecom/toutbox-carrier-service
```

`dist/` isn't committed (it's gitignored), so a plain git checkout has no build output on its own.
`npm install` on a git dependency runs this package's own `prepare` script before linking it —
`prepare` here runs `npm run build`, so installing from GitHub still ends up with a built package,
exactly like installing from the registry would. Pin a specific commit/tag
(`github:wave-telecom/toutbox-carrier-service#<sha-or-tag>`) once you need a stable reference rather
than always tracking `main`.

## Usage

Each operation is a small class taking a fully Toutbox-shaped payload and returning a
`Result<T, ToutboxOperationError>` from `@wave-tech/framework/core`. Building that payload — and
deciding what belongs in it — is the caller's job; this library only talks to Toutbox.

```ts
import {
  ToutboxHttpClient,
  ToutboxCreateDeliveryOrder,
  type ToutboxCreateOrderPayload,
} from '@wave-tech/toutbox-carrier';

const httpClient = new ToutboxHttpClient(process.env.TOUTBOX_BASE_URL!, process.env.TOUTBOX_API_KEY!);
const createDeliveryOrder = new ToutboxCreateDeliveryOrder(httpClient);

const payload: ToutboxCreateOrderPayload = {
  /* ... every field Toutbox's own POST /api/v1/External/Order requires ... */
};

const result = await createDeliveryOrder.execute(payload);
if (result.ok) {
  console.log(result.value.estimatedDelivery, result.value.slaDays);
} else {
  console.error(result.error.status, result.error.message);
}
```

### What's exported

- **`ToutboxHttpClient`** — transport only: base URL, the static `Authorization` header Toutbox
  expects. Throws only on a genuine transport failure, never for a non-2xx status.
- **`ToutboxCreateDeliveryOrder`** / `ToutboxCreateOrderPayload` / `ToutboxCreateOrderResponse` /
  `ToutboxCreateOrderResult` — `POST /api/v1/External/Order`.
- **`ToutboxCancelDeliveryOrder`** / `ToutboxCancelOrderResponse` / `ToutboxCancelOrderResult` —
  `PUT /api/v1/Parcel/SuspendOrCancel/Single`. Toutbox only ever acknowledges the request; a
  successful call always resolves to `{ status: 'CANCELLING' }` — actual completion arrives later via
  the delivery-status webhook.
- **`ToutboxQuoteShipping`** / `ToutboxQuoteRequest` / `ToutboxQuoteResponse` / `ToutboxQuoteResult` —
  `POST /api/v1/Courier/CostAndDeliveryTime`.
- **`toutboxDeliveryWebhookBodySchema`** / `ToutboxDeliveryWebhookBody` /
  `ToutboxDeliveryWebhookDelivery` — the Zod schema and types for Toutbox's own delivery-status
  webhook payload. Parsing the incoming request and calling back into a consumer's own system is the
  caller's responsibility, not this library's.
- **`mapOccurrenceCode`** / `TOUTBOX_OCCURRENCE_STATUS_MAP` / `ToutboxOccurrenceStatus` — the
  De↔Para between Toutbox's own `codOcorrencia` values and a generic delivery status.
- **`ToutboxOperationError`** — `{ status, message }`, this library's own failure shape.

## Architecture

One layer, no HTTP, no framework beyond `@wave-tech/framework`:

```
src/
├── index.ts                     # public barrel — the only import path consumers should use
├── toutbox-http-client.ts       # transport only
├── toutbox-operation-error.ts
├── usecases/
│   ├── create-delivery-order/
│   ├── cancel-delivery-order/
│   └── quote-shipping/
└── webhook/                     # schema/types + occurrence-code reference data only
```

Each use case owns exactly one Toutbox endpoint end to end (request shape, response shape,
status-code mapping) — there is no shared "Toutbox client" god-class, and `toutbox-http-client.ts`
never grows business-shaped methods.

### Adding an operation

1. Add its request/response types under `usecases/<name>/`.
2. Implement a class taking a `ToutboxHttpClient` and exposing `execute(...)`, owning the real
   status-code mapping.
3. Export the class and its types from `src/index.ts`.
4. Add a unit test against a fake `ToutboxHttpClient` (`{ post: async () => ({ status, body }) }`) —
   see any existing `*.test.ts` for the pattern.

## Commands

| Task       | Command               |
| ---------- | --------------------- |
| Install    | `npm install`         |
| Build      | `npm run build`       |
| Tests      | `npm test`            |
| Coverage   | `npm run test:coverage` |
| Lint       | `npm run lint`        |
| Type-check | `npm run typecheck`   |

## Quality gates

`npm install` installs the Git hooks in `.husky/` (via the `prepare` script):

| Hook         | Runs                                        |
| ------------ | -------------------------------------------- |
| `pre-commit` | `npm run lint` + `npm run typecheck`         |
| `commit-msg` | The Conventional Commits + emoji convention  |
| `pre-push`   | `npm test`                                   |

CI (`.github/workflows/ci.yml`) runs lint, type-check, build and tests with coverage on every push
and pull request to `main`. `.github/workflows/npm-publish.yml` publishes a new version to the public
npm registry whenever a GitHub release is created.

## Publishing a new version

`@wave-tech/toutbox-carrier` publishes via npm's **OIDC Trusted Publishing** — same mechanism
`@wave-tech/framework` uses (see its own `npm-publish.yml`): no `NPM_TOKEN`/secret anywhere, just
`permissions: id-token: write` and `npm publish --provenance`.

**One-time setup required before the very first release, since this is a brand-new package name**:
someone with admin on the `@wave-tech` npm org needs to register this repository + this workflow
file as this package's trusted publisher on npmjs.com. Depending on what npm currently supports for
a name that's never been published, that may require publishing `v1.0.0` manually once first (`npm
publish` with a personal login), then attaching the trusted publisher in that package's npmjs.com
settings — or it may allow registering a "pending" trusted publisher for the name before it exists.
Confirm which applies before relying on step 3 below; `npm-publish.yml` will fail with an auth error
until this is done.

1. Bump `version` in `package.json` following semver (any change to an exported type or a use case's
   behavior is a major version, since consumers compile against these types directly).
2. Merge to `main`.
3. Create a GitHub release from `main` — this triggers `npm-publish.yml`, which lints, type-checks,
   tests, builds and runs `npm publish --provenance`.

## Testing

Every use case is tested against a fake `ToutboxHttpClient` (a plain object implementing `post`/
`put`) — no real HTTP call, no WireMock, no database. Test files live next to the code they cover
(`foo.ts` + `foo.test.ts`).

```bash
npm test
```

## License

Apache-2.0
