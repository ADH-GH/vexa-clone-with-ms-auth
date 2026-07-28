# flexcon-teams-auth — one-time Teams session provisioning

Provisions the signed-in `automation@flexcon-it.de` browser session the authenticated Teams bot
restores from S3/MinIO. Run once, and again whenever Entra Conditional Access expires the session.

- **`login-teams.cjs`** — the login harness. Launches the bot image with `VEXA_MODE=login`, opens a
  noVNC session (`:6080`); a human signs in as `automation@` (with MFA); the resulting browser profile
  is pushed to MinIO at `vexa/sessions/teams/automation/browser-data` via `syncBrowserDataToS3`.
- **`run-teams-login.sh`** — convenience wrapper around the above.

The bot then joins Microsoft Teams as that known Entra user — **no lobby**, works under strict tenants
that disable anonymous join. Full runbook: `tools/vexa/fork-teams-auth/README.md` in the Flexcon workbench.
