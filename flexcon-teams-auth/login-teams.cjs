// Flexcon — one-time (and periodic) Teams session provisioning, run INSIDE the bot
// image via `VEXA_MODE=login` (see entrypoint.sh). A human signs into Teams as the
// service account over VNC (:6080), MFA and all; the authenticated Chromium profile is
// then pushed to S3/MinIO so every spawned bot restores it (capture-bridge.ts
// syncBrowserDataFromS3) and joins as a known Entra user.
//
// CJS + createRequire against the bot package: @vexa/remote-browser is a pnpm
// workspace package, resolvable only from a dependent's dir — not from /app root.
'use strict';

const { createRequire } = require('module');
const req = createRequire('/app/core/meetings/services/bot/package.json');
const rb = req('@vexa/remote-browser');

const s3 = {
  // Contract: the SAME value the bot invocation later carries as userdataS3Path.
  userdataS3Path: process.env.USERDATA_S3_PATH || 'sessions/teams/automation',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3Bucket: process.env.S3_BUCKET || 'vexa',
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
};

for (const k of ['s3Endpoint', 's3AccessKey', 's3SecretKey']) {
  if (!s3[k]) { console.error(`[login-teams] missing required env for ${k}`); process.exit(2); }
}

const timeoutMin = Number(process.env.LOGIN_TIMEOUT_MIN || 10);

(async () => {
  console.log('[login-teams] opening teams.microsoft.com — sign in via VNC (http://localhost:6080/vnc.html), incl. MFA.');
  console.log(`[login-teams] profileDir=${rb.BROWSER_DATA_DIR}  timeout=${timeoutMin}min  target=s3://${s3.s3Bucket}/${s3.userdataS3Path}`);

  const status = await rb.provisionLogin({
    platform: 'teams',              // registered AuthPlatform: ESTSAUTH* cookies, login.microsoftonline.com markers
    profileDir: rb.BROWSER_DATA_DIR,
    timeoutMs: timeoutMin * 60_000,
    keepOpenMs: 5000,               // hold briefly so the signed-in Teams is visible in VNC
  });

  console.log('[login-teams] status:', JSON.stringify(status));
  if (!status.loggedIn) {
    console.error('[login-teams] NOT logged in — aborting, nothing pushed to S3.');
    process.exit(1);
  }

  console.log(`[login-teams] pushing authenticated profile → s3://${s3.s3Bucket}/${s3.userdataS3Path}/browser-data`);
  // Use the official wrapper: it writes to `${userdataS3Path}/browser-data`, the SAME key
  // syncBrowserDataFromS3 restores from at bot launch (raw s3Sync misses the suffix).
  rb.syncBrowserDataToS3(s3);
  console.log('[login-teams] DONE. Spawn bots with authenticated:true + this userdataS3Path to restore it.');
  process.exit(0);
})().catch((e) => { console.error('[login-teams] fatal:', e); process.exit(1); });
