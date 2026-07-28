/**
 * commands — Flexcon in-meeting chat control for the Teams bot.
 *
 * The bot posts a greeting on join and reacts to chat commands anyone can type:
 *   /botstop    leave the meeting (graceful)      /botstay   stay until everyone left (disable auto-leave)
 *   /botpause   pause transcription (stay)         /botresume resume transcription
 * (/nobot is kept as a /botstop alias.)
 *
 * Teams' chat has no send API (teams-chat.ts is a reader), so we drive the compose box
 * over Playwright. The bot must have the chat panel open (capture-bridge opens it).
 */
import type { Page } from '@vexa/remote-browser';

export const TEAMS_GREETING =
  'Hallo, ich bin der Flexcon Meeting Assistent. Sie können folgende Befehle nutzen: ' +
  '/botstop um meine Transkription zu stoppen, /botpause zum pausieren, /botresume zum fortsetzen.';

// The meeting-chat compose box — data-tid-driven, changes across Teams builds, so several
// candidates. The panel is already open (capture-bridge), so the box is in the DOM.
const COMPOSE_SELECTORS = [
  'div[contenteditable="true"][data-tid="ckeditor-editable"]',
  'div[data-tid="ckeditor"] [contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
  'div[contenteditable="true"][aria-label*="essage"]',
  'div[contenteditable="true"][aria-label*="achricht"]',
  'div[contenteditable="true"][data-tid*="input"]',
];

/** Type a message into the Teams meeting chat and send it. Best-effort (false if no box). */
export async function sendTeamsChatMessage(page: Page, text: string): Promise<boolean> {
  for (const sel of COMPOSE_SELECTORS) {
    try {
      const box = page.locator(sel).first();
      await box.waitFor({ state: 'visible', timeout: 3000 });
      await box.click();
      await page.keyboard.type(text, { delay: 8 });   // key events — CKEditor needs real input
      await page.keyboard.press('Enter');
      return true;
    } catch {
      // try the next candidate selector
    }
  }
  return false;
}
