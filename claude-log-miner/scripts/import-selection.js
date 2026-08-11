import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = parseArgs(process.argv.slice(2));
    const planPath = args.file;
    const clients = (args.clients ?? 'codex,claude-code')
        .split(',')
        .map((client) => client.trim())
        .filter(Boolean);

    if (!planPath) {
        // eslint-disable-next-line no-console
        console.error('Usage: node scripts/import-selection.js --file <plan.json> --clients codex,claude-code');
        process.exit(1);
    }

    const plan = JSON.parse(await readFile(expandHome(planPath), 'utf8'));
    const result = await importSelection({ ...plan, clients });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
}

export async function importSelection(plan) {
    const imported = [];
    const clientsToImport = plan.clients ?? ['codex', 'claude-code'];

    for (const opportunity of plan.opportunities ?? []) {
        for (const client of clientsToImport) {
            const target = skillTarget(client, opportunity.id);
            if (!target) continue;

            await mkdir(target.directory, { recursive: true });
            await writeFile(target.file, buildSkill(opportunity, client), 'utf8');
            imported.push({ client, opportunity: opportunity.id, file: target.file });
        }
    }

    const settingsFile = path.join(homedir(), '.agent-session-miner', 'imported-opportunities.json');
    await mkdir(path.dirname(settingsFile), { recursive: true });
    await writeFile(
        settingsFile,
        JSON.stringify(
            {
                importedAt: new Date().toISOString(),
                clients: clientsToImport,
                opportunities: plan.opportunities ?? [],
                files: imported,
            },
            null,
            2,
        ),
        'utf8',
    );

    return { clients: clientsToImport, imported, settingsFile };
}

function skillTarget(client, id) {
    const safeId = normalizeId(id);
    if (client === 'codex') {
        return {
            directory: path.join(homedir(), '.codex', 'skills', safeId),
            file: path.join(homedir(), '.codex', 'skills', safeId, 'SKILL.md'),
        };
    }
    if (client === 'claude-code') {
        return {
            directory: path.join(homedir(), '.claude', 'skills', safeId),
            file: path.join(homedir(), '.claude', 'skills', safeId, 'SKILL.md'),
        };
    }
    return null;
}

function buildSkill(opportunity, client) {
    return `---
name: ${normalizeId(opportunity.id)}
description: Imported session-mining opportunity for ${opportunity.title}. Use when work matches this recurring signal from agent session logs.
---

# ${opportunity.title}

Imported for ${client} from Agent Session Miner.

## Why This Exists

- Score: ${opportunity.score}
- Effectiveness: ${opportunity.effectiveness ?? 'unrated'}/5
- Sessions: ${opportunity.sessions}
- Agents: ${(opportunity.agents ?? []).join(', ') || 'unknown'}
- Domains: ${(opportunity.domains ?? []).join(', ') || 'unknown'}
- Evidence: ${(opportunity.evidence ?? []).join(', ') || 'none'}
- Recommendation: ${opportunity.recommendation}

## Description

${opportunity.description ?? 'Imported from Agent Session Miner.'}

## Operating Notes

Use this as a placeholder skill for recurring work until it becomes a full custom plugin. When this topic appears, inspect the current repo and relevant local settings first, then decide whether to use an existing connector, an MCP server, an Apify Actor, or a purpose-built plugin.
`;
}

function normalizeId(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

function expandHome(value) {
    if (value === '~') return homedir();
    if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
    return value;
}

function parseArgs(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === '--file') parsed.file = values[index + 1];
        if (value === '--clients') parsed.clients = values[index + 1];
    }
    return parsed;
}
