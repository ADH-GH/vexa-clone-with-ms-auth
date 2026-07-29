# Battlecard — Upstream Vexa → Flexcon-enhanced Vexa

A before/after of what this fork **plus** the Flexcon post-call pipeline add on top of upstream
[Vexa](https://github.com/Vexa-ai/vexa). Built by **Alf-David Heermann** ([@ADH-GH](https://github.com/ADH-GH),
Flexcon IT) and **Claude** (Anthropic, Opus 4.8) — see [CONTRIBUTORS.md](CONTRIBUTORS.md).

## In one line

Upstream Vexa is a Google-Meet-first transcription bot. This work makes it **Microsoft-Teams-ready,
German-grade, and speaker-accurate**, with an on-prem post-call pipeline that turns a meeting into a
speaker-attributed **German protocol** — automatically.

## Before → After

### Joining & presence (the bot)
| | Upstream Vexa | This fork |
|---|---|---|
| **MS Teams join** | Anonymous guest → stuck in the lobby on strict tenants | **Authenticated Entra user** (automation@), **no lobby**, works where anonymous join is disabled |
| **Session** | `--incognito` wiped the restored profile | Signed-in profile preserved (restored from object storage) |
| **Self-host auth** | Unshippable (no aws CLI, no login entrypoint) | `VEXA_MODE=login` provisioning harness |
| **Empty-room leave** | `everyoneLeftTimeout` configured but **never implemented** | **Live** — leaves via Teams' "waiting for others" banner (roster/audio signals proved unreliable) |
| **Eviction** | False-positive: left live meetings ~1.5 s after joining | Fixed — removal-specific wording + DOM debounce |
| **Compact-mode drift** | Broad chat selector detached the roster | In-call-only selector keeps the full stage |

### Transcription quality
| | Upstream Vexa | This fork / pipeline |
|---|---|---|
| **German STT** | Whisper large-v3-turbo, generic multilingual | **German CT2 finetune** (whisper-large-v3-german) in the post-call path — markedly better on German + domain terms |
| **Hallucinations** | Whisper fills silence with stock phrases, wrong-language drift | **Spoken-language allow-list** (de/en) + **hallucination phrase filter** at the STT egress |
| **Speaker detection** | Detector shipped but **never wired** | Wired — live speaker names from the Teams UI |
| **Speaker attribution** | 262 pseudo-speakers on a 3-person meeting (hint-based only) | **pyannote community-1 diarization** → clean speakers, **mapped to real names** |

### From meeting to protocol (the Flexcon post-call pipeline)
| | Upstream Vexa | This work |
|---|---|---|
| **After the call** | Raw transcript only | **Automatic pipeline**: recording → diarize (speaker-named) → **German protocol** (summary / key points / action items) → **email to the internal participants** |
| **Attribution** | — | Action items attributed to **real people** (diarization + directory) |
| **On-prem** | — | STT + diarization + summarization all self-hosted; audio never leaves the environment |
| **Deploy contract** | — | Fork's new config wired through all deploy surfaces (compose/helm/lite) — **upstream gates green**, PR-ready |

## Proof points (live)
- **262 → 4 speakers** on the real 57-min meeting 23, in **~138 s** on a 14 GB GPU slice; resolved to
  **Alf-David Heermann / Thomas Endler / David Toboll**.
- **493 junk segments dropped** by the language + hallucination filters on one real meeting.
- **No-lobby authenticated join** proven live under the strict Flexcon tenant.
- **End-to-end, hands-free**: invite automation@ → bot records → diarize → German protocol emailed.

## Components
- **This fork** (`vexa-clone-with-ms-auth`) — the Teams-ready, hardened bot + meeting-api.
- **`diarizer`** ([ADH-GH/diarizer](https://github.com/ADH-GH/diarizer)) — standalone post-call diarization
  microservice (German CT2 Whisper + pyannote community-1).
- **Flexcon post-call pipeline** — packaged as the standalone **[Vexa-Flexcon-Meeting-Agent](https://github.com/ADH-GH/Vexa-Flexcon-Meeting-Agent)**
  service (audio → speaker-named transcript → German protocol → delivery).

## Builders
**Alf-David Heermann** ([@ADH-GH](https://github.com/ADH-GH), Flexcon IT GmbH & Co. KG) · **Claude**
(Anthropic, Opus 4.8). See [CONTRIBUTORS.md](CONTRIBUTORS.md).
