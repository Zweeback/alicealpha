#!/usr/bin/env node
// Alice Desktop-Client: pairs THIS computer with an Alice server's
// Desktop-Gateway. It polls for proposals, shows each one to the person at
// this desktop and executes it only after a local "ja". It never runs shell
// commands: every action maps to one fixed program with argument arrays.
//
//   ALICE_DESKTOP_CLIENT_TOKEN=... node tools/alice-desktop-client.mjs \
//     --server http://127.0.0.1:8787 [--once] [--dry-run] [--name surface]
//
// --dry-run approves/rejects normally but only prints what it would do and
// reports the result as "failed" with observation "dry-run", so no fake
// success enters the provenance journal.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

// Fixed program per platform; no lookup by caller-supplied keys.
export function openCommand(platform, url) {
  switch (platform) {
    case 'win32': return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
    case 'darwin': return ['open', [url]];
    case 'linux': return ['xdg-open', [url]];
    default: return null;
  }
}

export function clipboardCommand(platform) {
  switch (platform) {
    case 'win32': return ['clip.exe', []];
    case 'darwin': return ['pbcopy', []];
    case 'linux': return ['xclip', ['-selection', 'clipboard']];
    default: return null;
  }
}

function run(spawnImpl, command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'], shell: false, windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`))));
    if (input !== undefined) child.stdin.end(input);
  });
}

export function createExecutor({ platform = process.platform, spawnImpl = spawn, print = console.log, dryRun = false } = {}) {
  return async function execute(proposal) {
    const { action, params } = proposal;
    if (dryRun) {
      print(`[dry-run] ${action} ${JSON.stringify(params)}`);
      return { status: 'failed', observation: 'dry-run: nicht ausgeführt' };
    }
    if (action === 'note.show') {
      print(`\n  Notiz von Alice:\n  ${params.text.replace(/\n/g, '\n  ')}\n`);
      return { status: 'succeeded', observation: 'Notiz im Terminal angezeigt' };
    }
    if (action === 'url.open') {
      const url = new URL(params.url);
      if (url.protocol !== 'https:') throw new Error('desktop-url-https-only');
      const entry = openCommand(platform, url.href);
      if (!entry) throw new Error(`Plattform ${platform} nicht unterstützt`);
      const [command, args] = entry;
      await run(spawnImpl, command, args);
      return { status: 'succeeded', observation: `${command} gestartet (Exit 0); ob die Seite lädt, prüft der Client nicht` };
    }
    if (action === 'clipboard.write') {
      const entry = clipboardCommand(platform);
      if (!entry) throw new Error(`Plattform ${platform} nicht unterstützt`);
      await run(spawnImpl, entry[0], entry[1], params.text);
      return { status: 'succeeded', observation: `${entry[0]} beendet (Exit 0)` };
    }
    throw new Error(`Aktion ${action} ist im Client nicht freigegeben`);
  };
}

export function describeProposal(proposal) {
  const lines = [
    '',
    `Alice möchte: ${proposal.label} (${proposal.action}, Risiko ${proposal.risk})`,
    `  Parameter: ${JSON.stringify(proposal.params)}`,
    `  Begründung (Angabe des Vorschlagenden, ungeprüft): ${proposal.reason || '–'}`,
    `  Quelle (Angabe des Absenders, ungeprüft – keine verifizierte Identität): ${proposal.source?.kind || '–'}${proposal.source?.ref ? ' · ' + proposal.source.ref : ''}`,
    `  Payload-SHA-256: ${proposal.payload_sha256}`,
    `  Läuft ab: ${proposal.expires_at}`,
  ];
  return lines.join('\n');
}

export function createClient({ server, token, name = 'desktop', fetchImpl = fetch } = {}) {
  if (!server) throw new Error('--server fehlt');
  if (!token || token.length < 16) throw new Error('ALICE_DESKTOP_CLIENT_TOKEN fehlt oder ist kürzer als 16 Zeichen');
  const base = server.replace(/\/$/, '') + '/api/desktop/client';
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-alice-desktop-client': name };
  async function call(path, body) {
    const response = await fetchImpl(base + path, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  return {
    next: () => call('/next'),
    decide: (proposal, decision, actor) => call(`/proposals/${encodeURIComponent(proposal.id)}/decision`, { decision, actor, payload_sha256: proposal.payload_sha256 }),
    report: (proposal, result) => call(`/proposals/${encodeURIComponent(proposal.id)}/result`, { ...result, payload_sha256: proposal.payload_sha256 }),
  };
}

// One poll cycle: fetch → ask the human → (execute) → report. Returns what happened.
export async function processOnce({ client, ask, execute, actor, print = console.log }) {
  const proposal = await client.next();
  if (!proposal) return { handled: false };
  print(describeProposal(proposal));
  const answer = String(await ask('Ausführen? [ja/NEIN] ')).trim().toLowerCase();
  const approved = answer === 'ja' || answer === 'j' || answer === 'y' || answer === 'yes';
  await client.decide(proposal, approved ? 'approved' : 'rejected', actor);
  if (!approved) {
    print('Abgelehnt – nichts ausgeführt.');
    return { handled: true, id: proposal.id, decision: 'rejected' };
  }
  let result;
  try {
    result = await execute(proposal);
  } catch (error) {
    result = { status: 'failed', observation: String(error?.message || error).slice(0, 300) };
  }
  await client.report(proposal, result);
  print(result.status === 'succeeded' ? `Erledigt: ${result.observation}` : `Nicht ausgeführt: ${result.observation}`);
  return { handled: true, id: proposal.id, decision: 'approved', result };
}

// Buffered line reader: piped answers are not lost, and end of input
// (closed terminal/pipe) answers '' which counts as "nein".
export function createLineReader(emitter, write = () => undefined) {
  const buffered = [];
  const waiting = [];
  let closed = false;
  emitter.on('line', (line) => (waiting.length ? waiting.shift()(line) : buffered.push(line)));
  emitter.on('close', () => {
    closed = true;
    while (waiting.length) waiting.shift()('');
  });
  return (question) => {
    write(question);
    if (buffered.length) return Promise.resolve(buffered.shift());
    if (closed) return Promise.resolve('');
    return new Promise((resolve) => waiting.push(resolve));
  };
}

function argValue(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const server = argValue(argv, '--server', process.env.ALICE_SERVER_URL || 'http://127.0.0.1:8787');
  const name = argValue(argv, '--name', process.env.COMPUTERNAME || process.env.HOSTNAME || 'desktop');
  const actor = 'human:' + String(argValue(argv, '--human', process.env.USERNAME || process.env.USER || 'owner')).replace(/[^\w.@-]/g, '').slice(0, 64);
  const client = createClient({ server, token: process.env.ALICE_DESKTOP_CLIENT_TOKEN, name });
  const execute = createExecutor({ dryRun: argv.includes('--dry-run') });
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  const ask = createLineReader(rl, (text) => process.stdout.write(text));
  console.log(`Alice Desktop-Client verbunden mit ${server} als ${name}; Freigaben als ${actor}. Strg+C beendet.`);
  try {
    do {
      try {
        const outcome = await processOnce({ client, ask, execute, actor });
        if (!outcome.handled && !argv.includes('--once')) await new Promise((r) => setTimeout(r, 3000));
      } catch (error) {
        console.error('Gateway-Fehler:', error?.message || error);
        if (argv.includes('--once')) process.exitCode = 1;
        else await new Promise((r) => setTimeout(r, 5000));
      }
    } while (!argv.includes('--once'));
  } finally {
    rl.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
