import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const actorRoot = path.join(currentDirectory, '..');
const repoRoot = path.join(actorRoot, '..');
const reportFile = path.join(actorRoot, 'storage/key_value_stores/default/REPORT.html');
const targets = [
    path.join(repoRoot, 'public/workshop/agent-session-miner.html'),
    path.join(repoRoot, 'public/workshop/agent-session-miner/index.html'),
];

try {
    await stat(reportFile);
} catch {
    // eslint-disable-next-line no-console
    console.error('REPORT.html was not found. Run `apify run --purge` first.');
    process.exit(1);
}

for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(reportFile, target);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${path.relative(repoRoot, target)}`);
}
