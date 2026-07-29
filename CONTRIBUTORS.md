# Contributors — Microsoft Teams readiness for Vexa

This fork exists to make **[Vexa](https://github.com/Vexa-ai/vexa)** production-ready on **Microsoft
Teams**: a transcription bot that joins as an **authenticated Entra (Azure AD) user** — no lobby, works
under strict tenants that disable anonymous join — plus the upstream fixes that path revealed. The intent
is to fold this back upstream so any Vexa deployment can be Microsoft-ready.

## People

- **Alf-David Heermann** — Flexcon IT GmbH & Co. KG ([@ADH-GH](https://github.com/ADH-GH))
  Direction, tenant/Entra + infrastructure, session provisioning, and live end-to-end testing.
- **Claude** — Anthropic, via [Claude Code](https://claude.com/claude-code) (Opus 4.8)
  Fork implementation, diagnosis, and the fixes below. Credited as co-author on the commits.

## Changes & wins (short list)

- ✅ **Authenticated Entra/Teams join** — bot joins as a signed-in org user, **no lobby**, works under
  strict tenants that disable anonymous join (restores a session from S3).
- ✅ **Session preserved** — strip `--incognito` for authenticated bots (it wiped the restored profile).
- ✅ **Self-host auth path shippable** — AWS CLI + a `VEXA_MODE=login` VNC login entrypoint.
- ✅ **Named speakers** — wired the Teams active-speaker detector that upstream shipped but never ran.
- ✅ **German-grade STT + diarisation** (post-call) — German CT2 Whisper finetune + pyannote
  community-1 diarisation turns fragmented hint-based speakers into clean speakers **mapped to real
  names** (a 3-person meeting: 262 pseudo-speakers -> 4 named speakers).
- ✅ **Empty-room auto-leave** — `left_alone` implemented via Teams' "Waiting for others to join…"
  stage banner (roster/audio signals go stale); leaves cleanly (hangup → exit 0).
- ✅ **No false eviction** — removal now needs removal-specific wording + a DOM-presence check
  (a bare `[role="alert"]` was matching every toast).
- ✅ **No compact-mode drift** — in-call-only chat selector keeps the call on the full stage (a broad
  selector was opening the Chat *app* and detaching the roster).
- ✅ **Cleaner transcripts** — spoken-language allow-list (`de,en`) + hallucination phrase filter at the
  STT egress, killing Whisper's silence artifacts (e.g. "Спасибо за просмотр!"); added a German `de.txt`.
- ✅ **STT-path diagnostics** — per-call bytes/status/segments + pyannote-boundary logging.
- ✅ **In-meeting chat commands + German greeting** — `/botstop` `/botpause` `/botresume` `/botstay`.
- ✅ **Post-processing pipeline** (Flexcon integration) — completed meetings are handed over to a store
  (dedupe/audit); on-prem chunked LLM summaries + mailer run downstream.

## What "Microsoft-ready" required (the upstream findings)

1. **Authenticated Teams join branch** — `msteams/join.ts` had no signed-in path; the anonymous
   name-fill flow was unconditional. Added a branch that joins as a restored, signed-in user.
2. **`--incognito` wiped the restored session** — `capture-bridge.ts` merged `getJoinBrowserArgs()`
   (which contains `--incognito`) unconditionally, discarding the exact profile just restored from S3.
   Stripped for authenticated bots.
3. **Self-host bot image couldn't run the auth path** — no `aws` CLI (silent empty S3 restore) and no
   way to provision a login. Added AWS CLI + a `VEXA_MODE=login` VNC entrypoint.
4. **Teams active-speaker detector never wired** — shipped but never instantiated; now bundled + running.
5. **`left_alone` configured but unimplemented** — `everyoneLeftTimeout` was stamped but nothing acted on
   it. Added an empty-room watcher driven by Teams' own "Waiting for others to join…" stage banner
   (the roster/audio-track signals go stale when a room empties).
6. **Eviction false-positive** — a bare `[role="alert"]` removal indicator matched every transient toast,
   evicting live bots seconds after joining. Fixed to removal-specific wording + a DOM-presence check.

Additional hardening on the Teams lane: compact-mode prevention (in-call-only chat selector), a spoken-
language allow-list + hallucination phrase filter at the STT egress (Whisper silence artifacts), and
STT-path diagnostics.

See `tools/vexa/fork-teams-auth/README.md` (in the Flexcon workbench) for the operating runbook.
