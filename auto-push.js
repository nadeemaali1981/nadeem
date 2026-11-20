// Auto-push watcher: commits and pushes to GitHub automatically after any code edit.
// Render redeploys on every push. Run with:  node auto-push.js   (or double-click start-auto-push.bat)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const DEBOUNCE_MS = 10000; // wait 10s after the last change, so a burst of edits becomes one commit
const IGNORE = /(^|[\\/])(node_modules|\.git|bin)([\\/]|$)|\.(log|db|db-journal|db-wal|db-shm)$|(^|[\\/])\.env$|tunnel_url\.txt$/i;

let timer = null;
let running = false;
let pending = false;

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => resolve({ err, out: (stdout || '') + (stderr || '') }));
  });
}

function stamp() { return new Date().toLocaleString('en-GB'); }

async function syncNow() {
  if (running) { pending = true; return; }
  running = true;
  try {
    await git(['add', '-A']);
    const diff = await git(['diff', '--cached', '--quiet']);
    if (!diff.err) { running = false; return; } // nothing staged
    const msg = `auto: update ${stamp()}`;
    const c = await git(['commit', '-m', msg]);
    if (c.err) { console.log(`[${stamp()}] commit failed:\n${c.out}`); running = false; return; }
    console.log(`[${stamp()}] committed: ${msg}`);

    let p = await git(['push', 'origin', 'main']);
    if (p.err) {
      // remote moved (e.g. upload via github.com) -> integrate then retry once
      console.log(`[${stamp()}] push rejected, syncing with remote...`);
      const pl = await git(['pull', '--no-rebase', '--no-edit', '-X', 'ours', 'origin', 'main']);
      if (pl.err) { console.log(`[${stamp()}] pull failed:\n${pl.out}`); running = false; return; }
      p = await git(['push', 'origin', 'main']);
    }
    console.log(p.err ? `[${stamp()}] PUSH FAILED:\n${p.out}` : `[${stamp()}] pushed to GitHub -> Render will redeploy`);
  } finally {
    running = false;
    if (pending) { pending = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

fs.watch(ROOT, { recursive: true }, (_evt, filename) => {
  if (!filename || IGNORE.test(filename)) return;
  schedule();
});

console.log(`[${stamp()}] Auto-push is ON. Watching ${ROOT}`);
syncNow();
