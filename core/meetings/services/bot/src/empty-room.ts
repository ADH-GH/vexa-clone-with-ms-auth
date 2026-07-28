/**
 * empty-room — Flexcon: the missing `left_alone` implementation for the Teams lane.
 *
 * Upstream v0.12.4 stamps `automaticLeave.everyoneLeftTimeout` into every invocation but
 * nothing ever acts on it (`left_alone` exists only in contracts/comments) — a bot in an
 * emptied room lived until the 4h max-active backstop. This watcher closes that gap for
 * Teams by injecting a synthetic `{action:'leave'}` act — the SAME path a dashboard
 * "Stop bot" takes, so the whole graceful teardown (leave click → flush → terminal
 * lifecycle → exit 0) is reused, not reimplemented.
 *
 * Fail-safe by design:
 *  - ARMS only after admission + a grace period (default 5 min): an auto-joined bot
 *    arrives ~60s BEFORE the meeting starts — without the grace it would count the
 *    pre-start emptiness as "everyone left" and bail before anyone arrives.
 *  - Leaves only after `everyoneLeftTimeout` of CONTINUOUS alone-readings.
 *  - An unreadable signal RESETS the alone-clock (never leave on unknown); the 4h
 *    backstop remains the ultimate guarantee.
 *
 * Alone signals, in preference order (both logged each poll for calibration):
 *  1. The roster ("People") button badge count — parse digits from the button/badge.
 *  2. Live remote WebRTC audio tracks (installRemoteAudioHook mirrors them into
 *     __vexaCapturedRemoteAudioStreams): zero live remote tracks ⇒ nobody else is here.
 */
import type { Page } from '@vexa/remote-browser';
import type { Act } from './contracts.js';
import type { Invocation } from './config.js';
import type { ActsSource } from './ports.js';

const POLL_MS = 10_000;
const DEFAULT_GRACE_MS = 5 * 60_000;      // arm only after admission + 5 min (user rule)
const DEFAULT_EVERYONE_LEFT_MS = 180_000; // if the invocation carries none

interface Reading {
  admitted: boolean;
  count: number | null;                  // best participant count (incl. bot) from the People/roster UI
  liveTracks: number | null;             // live remote audio tracks — a POSITIVE 'not alone' signal only
  cand: Record<string, number | null>;   // all count candidates, logged for selector calibration
}

async function readRoom(page: Page): Promise<Reading> {
  return await page.evaluate(() => {
    const d = (globalThis as any).document;
    const w = (globalThis as any);
    const admitted = !!d.querySelector('button[id="hangup-button"], button[data-tid="hangup-main-btn"], button[aria-label="Leave"]');
    const digits = (v: any): number | null => {
      const m = String(v ?? '').match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };
    // Several participant-count candidates (all logged for calibration). Teams' DOM shifts,
    // so we try a few and pick the first that yields a number.
    const cand: Record<string, number | null> = {};
    // a) People/roster toolbar button — aria-label or text digits
    const peopleBtn = d.querySelector('#people-button, #roster-button, [data-tid="people-menu-button"], [data-tid="roster-button"], [data-tid="people-button"], button[aria-label*="Personen"], button[aria-label*="People"], button[aria-label*="Teilnehmer"], button[aria-label*="articipant"]');
    cand.peopleAria = peopleBtn ? digits(peopleBtn.getAttribute('aria-label')) : null;
    cand.peopleText = peopleBtn ? digits(peopleBtn.textContent) : null;
    // b) roster panel header "In dieser Besprechung (N)" / "In this meeting (N)"
    try {
      const hdr: any = Array.from(d.querySelectorAll('div,span,h1,h2,h3') as any).find((e: any) => {
        const t = String(e.textContent || '');
        return t.length < 50 && /\((\d+)\)/.test(t) && /(Besprechung|meeting)/i.test(t);
      });
      const m: RegExpMatchArray | null = hdr ? String(hdr.textContent || '').match(/\((\d+)\)/) : null;
      cand.rosterHeader = m ? parseInt(m[1], 10) : null;
    } catch { cand.rosterHeader = null; }
    // c) roster list items (only when the People panel is open)
    try {
      const n = d.querySelectorAll('[data-tid="roster-section"] [role="listitem"], [role="tree"] [role="treeitem"]').length;
      cand.rosterItems = n > 0 ? n : null;
    } catch { cand.rosterItems = null; }

    const count = cand.peopleAria ?? cand.rosterHeader ?? cand.peopleText ?? cand.rosterItems ?? null;

    // live remote audio tracks — used ONLY to CONFIRM presence, never absence.
    let liveTracks: number | null = null;
    const streams = w.__vexaCapturedRemoteAudioStreams;
    if (Array.isArray(streams)) {
      liveTracks = streams.filter((s: any) => {
        try { return s && s.getAudioTracks && s.getAudioTracks().some((t: any) => t.readyState === 'live'); }
        catch { return false; }
      }).length;
    }
    return { admitted, count, liveTracks, cand };
  });
}

/** Wrap an ActsSource so a Teams empty room injects `{action:'leave'}` after the timeouts. */
export function withEmptyRoomWatcher(
  source: ActsSource,
  page: Page,
  inv: Invocation,
  log: (m: string) => void,
  opts?: { graceMs?: number; pollMs?: number },
): ActsSource {
  const graceMs = opts?.graceMs ?? DEFAULT_GRACE_MS;
  const pollMs = opts?.pollMs ?? POLL_MS;
  const leaveAfterMs = inv.automaticLeave?.everyoneLeftTimeout ?? DEFAULT_EVERYONE_LEFT_MS;
  return {
    subscribe(handler) {
      const unsub = source.subscribe(handler);
      let admittedAt = 0;
      let aloneSince = 0;
      let fired = false;
      let lastLog = 0;
      const timer = setInterval(() => {
        void (async () => {
          if (fired) return;
          let r: Reading;
          try { r = await readRoom(page); }
          catch { aloneSince = 0; return; }               // page not ready/navigating → unknown → reset
          if (!r.admitted) { aloneSince = 0; return; }    // pre-join / lobby — not our phase
          if (!admittedAt) {
            admittedAt = Date.now();
            log(`[EmptyRoom] admitted — arming in ${Math.round(graceMs / 1000)}s (everyoneLeftTimeout=${Math.round(leaveAfterMs / 1000)}s)`);
          }
          const now = Date.now();
          // Fail-safe: a live remote audio track proves someone is here; an unreadable count
          // NEVER means alone (a muted human emits no track) — only a real count<=1 does.
          const alone = (r.liveTracks ?? 0) > 0 ? false
            : r.count !== null ? r.count <= 1
            : false;
          if (now - lastLog > 60_000) {
            lastLog = now;
            log(`[EmptyRoom] count=${r.count ?? '?'} cand=${JSON.stringify(r.cand)} liveTracks=${r.liveTracks ?? '?'} alone=${alone} armed=${now >= admittedAt + graceMs} aloneFor=${aloneSince ? Math.round((now - aloneSince) / 1000) : 0}s`);
          }
          if (now < admittedAt + graceMs) { aloneSince = 0; return; }  // grace: never leave early
          if (!alone) { aloneSince = 0; return; }
          if (!aloneSince) aloneSince = now;
          if (now - aloneSince >= leaveAfterMs) {
            fired = true;
            clearInterval(timer);
            log(`[EmptyRoom] alone for ${Math.round((now - aloneSince) / 1000)}s (count=${r.count ?? '?'} liveTracks=${r.liveTracks ?? '?'}) — leaving (left_alone)`);
            void Promise.resolve(handler({ action: 'leave' } as Act)).catch((e) => log(`[EmptyRoom] leave act rejected: ${String(e)}`));
          }
        })();
      }, pollMs);
      return () => { clearInterval(timer); unsub(); };
    },
  };
}
