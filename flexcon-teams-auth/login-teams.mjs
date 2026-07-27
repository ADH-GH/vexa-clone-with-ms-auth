// One-time (and periodic) Teams session provisioning for the Vexa bot.
//
// Run this INSIDE the forked vexa-bot image — it ships Chromium + Xvfb + x11vnc +
// websockify/noVNC + the `aws` CLI that s3Sync shells out to. A human signs into Teams
// as automation@flexcon-it.de over VNC (:6080), MFA and all; the authenticated Chromium
// profile is then pushed to MinIO so every spawned bot restores it and joins as a known
// Entra user. See run-teams-login.sh for the wrapper, and README.md for the flow.
//
// Uses only the documented @vexa/remote-browser exports:
//   provisionLogin(), s3Sync(), BROWSER_DATA_DIR, BROWSER_CACHE_EXCLUDES

import {
  provisionLogin,
  s3Sync,
  BROWSER_DATA_DIR,
  BROWSER_CACHE_EXCLUDES,
} from '@vexa/remote-browser';

const s3 = {
  // where the profile lives in the bucket — the SAME value the bot invocation sets as userdataS3Path
  userdataS3Path: process.env.USERDATA_S3_PATH || 'sessions/teams/automation',
  s3Endpoint:     process.env.S3_ENDPOINT,        // MinIO endpoint reachable from the container
  s3Bucket:       process.env.S3_BUCKET || 'vexa',
  s3AccessKey:    process.env.S3_ACCESS_KEY,
  s3SecretKey:    process.env.S3_SECRET_KEY,
};

for (const [k, v] of Object.entries({ s3Endpoint: s3.s3Endpoint, s3AccessKey: s3.s3AccessKey, s3SecretKey: s3.s3SecretKey })) {
  if (!v) { console.error(`[login-teams] missing env for ${k}`); process.exit(2); }
}

console.log('[login-teams] opening teams.microsoft.com over VNC (:6080) — sign in as automation@flexcon-it.de (incl. MFA).');
const status = await provisionLogin({
  platform: 'teams',            // registered in remote-browser: cookies ESTSAUTH*, login.microsoftonline.com
  profileDir: BROWSER_DATA_DIR, // the persistent-context dir the bot also restores into
  timeoutMs: 10 * 60_000,       // 10 min for the human login + MFA
  keepOpenMs: 4000,             // hold briefly so you can eyeball the signed-in Teams
});

console.log('[login-teams] status:', JSON.stringify(status));
if (!status.loggedIn) {
  console.error('[login-teams] NOT logged in — aborting, nothing pushed to S3.');
  process.exit(1);
}

console.log(`[login-teams] pushing authenticated profile → s3://${s3.s3Bucket}/${s3.userdataS3Path}`);
s3Sync(BROWSER_DATA_DIR, s3.userdataS3Path, s3, 'up', BROWSER_CACHE_EXCLUDES);
console.log('[login-teams] done. Bots spawned with authenticated:true + this userdataS3Path will restore it.');
