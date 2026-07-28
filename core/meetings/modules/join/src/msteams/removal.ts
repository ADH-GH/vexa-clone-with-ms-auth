import { Page } from "playwright";
import { log } from "../_host";
import { teamsRemovalIndicators } from "./selectors";

// Function to check if bot has been removed from the meeting
export async function checkForTeamsRemoval(page: Page): Promise<boolean> {
  try {
    // Check for removal indicators
    for (const selector of teamsRemovalIndicators) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          log(`🚨 Teams removal detected: Found removal indicator "${selector}"`);
          return true;
        }
      } catch (e) {
        // Continue checking other selectors
        continue;
      }
    }
    return false;
  } catch (error: any) {
    log(`Error checking for Teams removal: ${error.message}`);
    return false;
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
