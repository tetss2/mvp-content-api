# Paid Beta Access Layer

This is a minimal manual access layer for paid beta testing. It does not connect Telegram Stars, crypto, cards, invoices, or any external payment provider.

## How Demo Access Works

On first generation access check, the runtime creates a demo entitlement if the user does not already have one.

Default demo entitlement:

```json
{
  "plan": "demo",
  "status": "active",
  "generationLimit": 2,
  "generationUsed": 0,
  "validUntil": null
}
```

The demo limit is intentionally small. The generation is not counted before the model runs. `generationUsed` increments only after a successful generated text response.

## Manual Beta Paid Access

Admin/full-access operators can grant access from Telegram:

```text
/grant_beta USER_ID LIMIT DAYS
```

Example:

```text
/grant_beta 123456789 50 30
```

This creates or replaces the user's entitlement:

- `plan`: `beta_paid`
- `status`: `active`
- `generationLimit`: the supplied `LIMIT`
- `generationUsed`: `0`
- `validUntil`: now plus `DAYS`

It also writes an audit event to `payment_events.jsonl` with type `manual_grant`.

## Revoke Access

Admin/full-access operators can revoke access:

```text
/revoke_beta USER_ID
```

This sets the entitlement status to `revoked` and writes a `manual_revoke` event.

## Check Usage

Admin/full-access operators can inspect a user's entitlement:

```text
/usage USER_ID
```

The response shows:

- user id
- plan
- status
- used / limit
- remaining generations
- valid-until timestamp
- updated timestamp

## Storage Locations

By default, files are stored under `RUNTIME_DATA_ROOT`:

```text
<RUNTIME_DATA_ROOT>/entitlements.json
<RUNTIME_DATA_ROOT>/payment_events.jsonl
```

In Railway beta, use a mounted volume and set:

```env
RUNTIME_DATA_ROOT=/data/beta
```

The files are auto-created on startup if missing.

## Why Telegram Stars Is Not Connected Yet

Telegram Stars hooks already exist elsewhere in the runtime as placeholders, but this layer is intentionally manual:

- it avoids real payment-provider state while beta access is still changing;
- it gives a simple audit trail for manual grants/revokes;
- it keeps the risk surface small while onboarding, retrieval, and expert identity are still being stabilized.

## Before Real Monetization

Before public paid SaaS, add:

- idempotency keys for payment events;
- provider transaction IDs;
- immutable entitlement history;
- refund/revoke reasons;
- admin billing view;
- durable database-backed storage;
- plan catalog versioning;
- explicit media limits and cost caps;
- avatar/voice consent and retention metadata.

## Operational Notes

- Do not store tokens in entitlement files.
- Do not log payment provider secrets.
- Use manual grants only for closed beta.
- Keep paid beta text-first; do not monetize image/audio/video until media consent and cost controls are formalized.
