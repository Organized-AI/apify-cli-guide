import { spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];

checkNode();
checkCommand('npm', ['--version'], { required: true });
checkCommand('apify', ['--version'], { required: true });
checkCommand('wrangler', ['--version'], { required: false });

checkCommand('apify', ['info'], {
    required: strict,
    warning: 'Apify CLI is installed but is not authenticated. Run `apify login` before `apify push` or cloud runs.',
});

checkCommand('wrangler', ['whoami'], {
    required: strict,
    warning: 'Wrangler is installed but is not authenticated. Run `wrangler login` before deploying Worker Assets.',
});

for (const warning of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`WARN ${warning}`);
}

if (failures.length) {
    for (const failure of failures) {
        // eslint-disable-next-line no-console
        console.error(`FAIL ${failure}`);
    }
    process.exit(1);
}

// eslint-disable-next-line no-console
console.log(strict ? 'Dependency and auth checks passed.' : 'Dependency checks passed.');

function checkNode() {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 18) {
        failures.push(`Node.js >= 18 is required. Found ${process.version}.`);
        return;
    }
    // eslint-disable-next-line no-console
    console.log(`OK   node ${process.version}`);
}

function checkCommand(command, args, { required, warning } = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    const label = `${command} ${args.join(' ')}`;

    if (result.error?.code === 'ENOENT') {
        const message = `${command} is not installed or not on PATH.`;
        if (required) failures.push(message);
        else warnings.push(message);
        return;
    }

    if (result.status !== 0) {
        const message = warning ?? `${label} failed.`;
        if (required) failures.push(message);
        else warnings.push(message);
        return;
    }

    const output = `${result.stdout}${result.stderr}`.trim().split('\n')[0] ?? 'ok';
    // eslint-disable-next-line no-console
    console.log(`OK   ${label}: ${output}`);
}
