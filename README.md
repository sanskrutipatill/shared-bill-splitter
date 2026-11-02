# SDE Intern Assignment: Shared Bill Splitter

Welcome. In this assignment you build a small bill splitter for a shared home. It has two parts:

1. **Homes and members:** create a home and add members to it.
2. **Bill splitting:** split a bill between the members. Each member pays their own share.

The assignment is small on purpose. We want correct, safe, and clear code. We do not want many features.

## What we look at

- **Your code passes the tests.** The tests decide, not opinion. You get the visible tests. We also run extra tests that you do not see.
- **Your code is safe when things go wrong.** Wrong input, repeated requests, and two requests at the same time must not break your data.
- **Your code is typed.** Use TypeScript. Do not use `any`.
- **You understand your code.** You record a short video and explain it.

Take your time. A careful, correct solution is better than a fast one. We expect 2 to 3 days of real work.

## Stack (required)

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite). The binding is `DB` in `api/wrangler.jsonc`.
- **Web:** React, Vite, TanStack Router
- **Language:** TypeScript on both sides
- **Tests:** Vitest, running inside the Workers runtime
- **Quality:** Biome. `pnpm check` and `pnpm typecheck` must pass.

You choose the rest (styling, form library, validation library). Pick tools you can explain.

## The task

The assignment has two parts. Do Part 1 first. Part 2 builds on it.

**Database.** Write the schema as SQL migration files in `api/migrations/`. For example `0001_init.sql`. The tests apply every file in this folder. Your schema must have **at least 3 named constraints** that protect the data. For example a foreign key, a `CHECK`, or a `UNIQUE` key. Be ready to explain what each constraint stops.

**Errors.** Every error response is JSON: `{ "error": "message" }`.

## Part 1: Homes and members

Create a home and add members to it. The order in which members are added matters in Part 2.

#### `POST /api/homes`

- Request: `{ "name": string }`
- Success: `201` `{ id, name }`

#### `POST /api/homes/:homeId/members`

- Request: `{ "name": string }`
- Success: `201` `{ id, homeId, name }`
- Errors: `404` home not found

Visible tests: `api/test/homes.test.ts`.

## Part 2: Bill splitting

Add a bill to a home, split it between the members, and let each member pay their share.

All amounts are whole **cents** (integers). `100` cents is 1 dollar. Never use decimals for money.

#### `POST /api/homes/:homeId/bills`

- Request: `{ "title": string, "totalCents": number }`
- Success: `201` `{ id, homeId, title, totalCents, shares: [{ id, memberId, amountCents, paidAt: null }] }`
- Errors: `404` home not found. `422` total is not a positive whole number, or the home has no members.

#### `POST /api/bills/:billId/shares/:shareId/pay`

- Request: header `Idempotency-Key`
- Success: `200` `{ id, memberId, amountCents, paidAt }`
- Errors: `400` key missing. `404` bill or share not found. `409` share already paid with a different key.

#### `GET /api/homes/:homeId/balances`

- Success: `200` `{ balances: [{ memberId, name, outstandingCents }] }`
- Errors: `404` home not found

**Rules**

- **Split.** A bill is split between all members of the home. The shares always add up to `totalCents`. If the amount does not divide evenly, the extra cents go to the members one by one, in the order the members were added to the home. Example: 1000 cents between 3 members gives `334`, `333`, `333`.
- **Pay.** Paying marks one share as paid and sets `paidAt`. If the same `Idempotency-Key` is sent again for the same share, answer `200` with the same result. Do not pay twice. If two requests pay the same share at the same time, only one may succeed.
- **Balances.** `outstandingCents` is the sum of the member's unpaid shares, across all bills of the home. List the members in the order they were added.

Visible tests: `api/test/bills.test.ts` and `api/test/payments.test.ts`.

#### Web page

Build one page that:

- shows the bills of a home and the shares of each bill,
- lets a member pay a share,
- shows clear **loading**, **empty**, and **error** states,
- keeps the share unpaid and shows an error if the payment fails.

The page must not crash when the API answers with an error or is slow.

## Cases you must handle

You must handle these cases and talk about them in your video:

1. A home with no members.
2. An amount that is zero, negative, or not a whole number.
3. An amount that does not divide evenly.
4. The same payment request sent twice.
5. Two members paying the same share at the same time.
6. A bill or share that does not exist.
7. The API answers with a 500 error or is slow. The web page must not crash.

## Run it

This is a pnpm workspace. Install once at the root.

```bash
pnpm install
pnpm dev          # api on :8787 and web on :5173
```

Open http://localhost:5173. The starter page shows a title. `/api/health` returns `{ "status": "ok" }`.

```bash
pnpm test         # run the visible tests in api/test
pnpm check        # Biome: format and lint. Must pass.
pnpm check:fix    # fix what Biome can fix
pnpm typecheck    # tsc on both packages. Must pass.
pnpm build        # production build of the web app
```

`pnpm dev` applies your migrations to a local database before it starts the API.

If pnpm says some build scripts were ignored, run `pnpm approve-builds` and allow `esbuild` and `workerd`.

When you change `api/wrangler.jsonc`, refresh the `Env` types:

```bash
pnpm --filter bill-splitter-api cf-typegen
```

## Rules for the tests

- The visible tests are in `api/test`. They start with a failing result. Your job is to make them pass.
- Do **not** change the visible tests or `api/test/helpers.ts`. We compare them with the original.
- We run extra tests after you submit. They test the cases in "Cases you must handle" more closely.

## AI policy

You can use AI tools. Tell us which ones and where in your answers on the form.
You must understand every line you submit. We check this with your video and in a live call. "The AI wrote it" is not an answer.

## How to submit

1. Click **Use this template**, then **Create a new repository**. Make the repository **public**.
2. Build your solution in your new repository. Small, clear commits are welcome.
3. Update this README with a short section called **Decisions**. Write 3 decisions you made and why.
4. Record a video of **3 minutes or less** (Loom or unlisted YouTube). Show the architecture, the data flow, and one trade-off you made. Make sure anyone with the link can view it.
5. Paste the repository link and the video link in the application form.

We will run `pnpm install && pnpm check && pnpm typecheck && pnpm test` on your repository.

## Decisions

### 1. In-Row Payment State and Atomic Conditional Update for Idempotency

Instead of introducing a separate payments ledger table, we store `paid_at` and `idempotency_key` directly on the `shares` table and process payments with an atomic conditional update:
```sql
UPDATE shares
SET paid_at = ?, idempotency_key = ?
WHERE id = ? AND bill_id = ? AND paid_at IS NULL
```
Because Cloudflare D1 (SQLite) executes writes sequentially under a write transaction, this approach ensures that:
- When two concurrent requests attempt to pay the exact same share, only one will match `paid_at IS NULL` and return `meta.changes === 1`.
- The competing request observes `meta.changes === 0`. It then reads the share's state: if the existing `idempotency_key` matches its header, it safely returns 200 with the original payment timestamp; if the key differs, it responds with a 409 Conflict.
- This design satisfies strict idempotency and concurrency requirements without requiring distributed locks, distributed transactions, or external state stores.

### 2. Physical Insertion Order Tracking via SQLite Row IDs and Batch Atomicity

The specification requires that extra remainder cents be distributed to members in the exact order they joined, and balance listings must maintain this order.
- In SQLite, every standard table includes an internal 64-bit integer `rowid` that is monotonic on insert. Querying members with `ORDER BY rowid ASC` preserves physical creation order deterministically across queries.
- When creating a bill and splitting its shares, we bundle the `INSERT INTO bills` statement and all corresponding `INSERT INTO shares` statements into a single `db.batch([...])` call. Cloudflare D1 executes batch operations inside an atomic transaction, ensuring that a bill and its shares either commit completely or roll back entirely, preventing orphaned bills or incomplete splits.

### 3. Dual-Layer Invariants (Database Schema Constraints + Application Validation)

To ensure data integrity under invalid inputs and edge cases, invariants are enforced at two distinct layers:
- The database migration defines named constraints:
  - `fk_members_home`, `fk_bills_home`, `fk_shares_bill`, `fk_shares_member`: Prevent orphan records on deletion or invalid references.
  - `chk_bills_total_cents_positive` and `chk_shares_amount_cents_positive`: Guarantee monetary values are positive integers at the storage engine level.
  - `chk_homes_name_not_empty` and `chk_members_name_not_empty`: Guard against blank or whitespace-only names.
- The Hono API layer validates incoming requests before querying the database, returning consistent, typed JSON errors (`{ "error": "message" }`) with appropriate HTTP status codes (e.g., 422 for non-positive or non-integer cents and homes without members, 404 for missing entities, and 400 for missing idempotency keys). This ensures client feedback is explicit and predictable while keeping storage corruption impossible.



## Decisions

### 1. Store Money as Integer Cents
All monetary values are stored as integers in cents instead of floating-point decimals. This avoids rounding errors and ensures accurate bill calculations.

### 2. Distribute Remaining Cents by Member Order
Bills are divided equally among all home members. Any remaining cents are distributed one by one in the order members were added, ensuring that the total shares always equal the original bill amount.

### 3. Ensure Safe and Idempotent Payments
Payments use an idempotency key to prevent duplicate processing. Database-level safeguards and atomic updates protect payment records from concurrent requests and maintain data consistency.