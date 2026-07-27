# Flexcon clone — Vexa v0.12.4 + Microsoft Teams authenticated join

This is a **snapshot copy of `Vexa-ai/vexa` at tag `v0.12.4`** plus one Flexcon change:
the Teams bot can join as a **signed-in Entra user** (e.g. `automation@flexcon-it.de`)
instead of an anonymous guest — needed for a strict tenant that disables anonymous join.

Not a GitHub fork (no upstream link); a plain working copy for building + proving. When the
change is proven, submit it upstream as a proper PR from a real fork.

## The change

`core/meetings/modules/join/src/msteams/join.ts` — Step 4 now branches on
`botConfig.authenticated`: when set, it **skips the guest name-entry** and joins under the
signed-in identity (mirrors the existing `googlemeet/join.ts` authenticated branch). One
file, no signature changes. The whole authenticated pipeline it plugs into already exists
in `core/meetings/modules/remote-browser` (VNC login, S3/MinIO session store, Teams as a
registered `AuthPlatform`) and `services/bot/src/capture-bridge.ts` (S3 session restore).

## Build the bot image

```bash
docker build -f core/meetings/services/bot/Dockerfile -t flexcon/vexa-bot:v012-teamsauth .
```
Then point `BROWSER_IMAGE` in the control-plane `.env` at it and recreate.

## Provision the login once (`flexcon-teams-auth/`)

`login-teams.mjs` + `run-teams-login.sh` — run inside the built image, sign in as
`automation@` over VNC (`:6080`, MFA and all); the authenticated profile is pushed to
MinIO so every spawned bot restores it. See `run-teams-login.sh` for the exact command.

## Activate it on a bot

The bot runs authenticated when its `VEXA_BOT_CONFIG` invocation carries
`authenticated: true` + `userdataS3Path` + the MinIO coords (`s3Endpoint/s3Bucket/
s3AccessKey/s3SecretKey`). For a first proof, run one bot manually with a crafted config;
for production, have `meeting-api` stamp those fields onto Teams invocations.

Full plan, patch, and runbook: `flexcon-workbench/tools/vexa/fork-teams-auth/`.
