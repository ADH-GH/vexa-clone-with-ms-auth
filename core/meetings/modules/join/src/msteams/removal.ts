import { Page } from "playwright";
import { log } from "../_host";
// removal is now detected by DOM presence of the call controls, not text (see below).

// The in-meeting call controls — their PRESENCE in the DOM means "still in the meeting".
const TEAMS_CALL_CONTROLS =
  'button[id="hangup-button"], button[data-tid="hangup-main-btn"], button[aria-label="Leave"], button[aria-label="Verlassen"]';

// Check if the bot has been removed from the meeting.
//
// DOM-PRESENCE based, NOT text based. The old text indicators ("Meeting ended",
// "removed from this meeting", bare [role="alert"]) caused false-positive evictions:
// a transient toast, and — once the /nobot chat panel was open — the chat thread's
// HISTORY (accumulated "Meeting ended" system messages from prior calls) both matched.
// The hangup control existing in the DOM is definitive and immune to page copy. We use
// count() (not isVisible) so an auto-hidden/faded toolbar isn't misread as removed; the
// 2-poll debounce in the monitor guards a transient re-render gap.
export async function checkForTeamsRemoval(page: Page): Promise<boolean> {
  try {
    const controls = await page.locator(TEAMS_CALL_CONTROLS).count();
    return controls === 0; // no call controls in the DOM ⇒ removed / meeting ended
  } catch (error: any) {
    log(`Error checking for Teams removal: ${error.message}`);
    return false; // unknown → not removed (fail-safe)
  }
}

// Start periodic removal monitoring from Node.js side
export function startTeamsRemovalMonitor(page: Page, onRemoval?: () => void | Promise<void>): () => void {
  log("Starting periodic Teams removal monitoring...");
  let removalDetected = false;

  // Require the indicator to PERSIST across consecutive polls before acting. A real
  // removal screen stays up; a transient toast clears next tick. This is the second guard
  // (after the removal-specific selectors) against false-positive evictions.
  let consecutive = 0;
  const removalCheckInterval = setInterval(async () => {
    try {
      const isRemoved = await checkForTeamsRemoval(page);
      if (!isRemoved) {
        if (consecutive > 0) log("Removal indicator cleared before confirmation — was transient, ignoring.");
        consecutive = 0;
        return;
      }
      consecutive += 1;
      if (consecutive < 2) {
        log(`Removal indicator seen (${consecutive}/2) — confirming on next poll before leaving...`);
        return;
      }
      if (!removalDetected) {
        removalDetected = true; // Prevent duplicate detection
        log("🚨 Teams removal CONFIRMED (2 consecutive polls). Initiating graceful shutdown...");
        clearInterval(removalCheckInterval);

        try {
          // Attempt to click Rejoin/Dismiss to close the modal gracefully
          await page.evaluate(() => {
            const clickIfVisible = (el: HTMLElement | null) => {
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (rect.width > 0 && rect.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden') {
                el.click();
              }
            };
            const btns = Array.from(document.querySelectorAll('button')) as HTMLElement[];
            for (const b of btns) {
              const t = (b.textContent || b.innerText || '').trim().toLowerCase();
              const a = (b.getAttribute('aria-label') || '').toLowerCase();
              if (t === 'dismiss' || a.includes('dismiss')) { clickIfVisible(b); break; }
            }
          });
        } catch {}

        // Signal removal to caller
        try { await onRemoval?.(); } catch {}
      }
    } catch (error: any) {
      log(`Error during removal check: ${error.message}`);
    }
  }, 1500);

  // Return cleanup function
  return () => {
    clearInterval(removalCheckInterval);
  };
}
