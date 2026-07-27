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
  badgeCount: number | null;   // roster-button badge (participants incl. the bot)
  liveTracks: number | null;   // live remote audio tracks (excl. the bot)
}

async function readRoom(page: Page): Promise<Reading> {
  return await page.evaluate(() => {
    const d = (globalThis as any).document;
    const w = (globalThis as any);
    const admitted = !!d.querySelector('button[id="hangup-button"], button[data-tid="hangup-main-btn"], button[aria-label="Leave"]');
    // s1: the People/roster button badge. Try the button's aria-label digits first,
    // then any badge-ish descendant. null = not found (fail-safe).
    let badgeCount: number | null = null;
    const roster = d.querySelector('#roster-button, [data-tid="roster-button"], button[aria-label*="articipant"], button[aria-label*="eilnehmer"], button[aria-label*="ersonen"], button[aria-label*="eople"]');
    if (roster) {
      const fromLabel = String(roster.getAttribute('aria-label') || '').match(/\d+/);
      if (fromLabel) badgeCount = parseInt(fromLabel[0], 10);
      if (badgeCount === null) {
        const badge = roster.querySelector('[class*="badge" i], [data-tid*="badge" i], [class*="toggle-number" i]');
        const fromBadge = badge && String(badge.textContent || '').match(/\d+/);
        if (fromBadge) badgeCount = parseInt(fromBadge[0], 10);
      }
    }
    // s2: live remote audio tracks (the capture hook's stream mirror).
    let liveTracks: number | null = null;
    const streams = w.__vexaCapturedRemoteAudioStreams;
    if (Array.isArray(streams)) {
      liveTracks = streams.filter((s: any) => {
        try { return s && s.getAudioTracks && s.getAudioTracks().some((t: any) => t.readyState === 'live'); }
        catch { return false; }
      }).length;
    }
    return { admitted, badgeCount, liveTracks };
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
          // Prefer the badge (definitive); fall back to live remote tracks; unknown → not alone.
          const alone = r.badgeCount !== null ? r.badgeCount <= 1
            : r.liveTracks !== null ? r.liveTracks === 0
            : false;
          if (now - lastLog > 60_000) {
            lastLog = now;
            log(`[EmptyRoom] badge=${r.badgeCount ?? '?'} liveTracks=${r.liveTracks ?? '?'} alone=${alone} armed=${now >= admittedAt + graceMs} aloneFor=${aloneSince ? Math.round((now - aloneSince) / 1000) : 0}s`);
          }
          if (now < admittedAt + graceMs) { aloneSince = 0; return; }  // grace: never leave early
          if (!alone) { aloneSince = 0; return; }
          if (!aloneSince) aloneSince = now;
          if (now - aloneSince >= leaveAfterMs) {
            fired = true;
            clearInterval(timer);
            log(`[EmptyRoom] alone for ${Math.round((now - aloneSince) / 1000)}s (badge=${r.badgeCount ?? '?'} liveTracks=${r.liveTracks ?? '?'}) — leaving (left_alone)`);
            void Promise.resolve(handler({ action: 'leave' } as Act)).catch((e) => log(`[EmptyRoom] leave act rejected: ${String(e)}`));
          }
        })();
      }, pollMs);
      return () => { clearInterval(timer); unsub(); };
    },
  };
}
