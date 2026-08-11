import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { mineSessionFile, resolveSessionFiles, summarizePluginOpportunities } from '../src/session-miner.js';

describe('agent session miner', () => {
    it('extracts a session-level taxonomy from JSONL logs', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'claude-log-miner-'));
        const sessionPath = path.join(dir, 'session.jsonl');
        await writeFile(
            sessionPath,
            [
                JSON.stringify({
                    timestamp: '2026-08-11T10:00:00.000Z',
                    type: 'user',
                    message: {
                        role: 'user',
                        content: 'Install apify with npm install -g apify-cli and edit src/main.js',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-08-11T10:01:00.000Z',
                    message: {
                        role: 'assistant',
                        content: [
                            { type: 'tool_use', name: 'mcp__github__search_issues', input: { q: 'apify actor' } },
                        ],
                    },
                }),
            ].join('\n'),
        );

        const record = await mineSessionFile(sessionPath);

        expect(record.sessionId).toBe('session');
        expect(record.messageCounts.user).toBe(1);
        expect(record.messageCounts.assistant).toBe(1);
        expect(record.tools).toContainEqual({ name: 'mcp__github__search_issues', count: 1 });
        expect(record.mcpServers).toContainEqual({ name: 'github', count: 1 });
        expect(record.packages).toContain('apify-cli');
        expect(record.fileExtensions).toContain('.js');
        expect(record.keywordDomains).toEqual(expect.arrayContaining(['aiAgents', 'apify', 'github']));
        expect(record.pluginOpportunitySignals.map((signal) => signal.name)).toContain('apify-actor-ops');
    });

    it('extracts Codex metadata and plugin creation signals', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'codex-session-miner-'));
        const sessionPath = path.join(dir, 'codex-session.jsonl');
        await writeFile(
            sessionPath,
            [
                JSON.stringify({
                    timestamp: '2026-08-11T10:00:00.000Z',
                    type: 'session_meta',
                    payload: {
                        cwd: '/Users/example/project',
                        originator: 'Codex Desktop',
                        cli_version: '1.8.0',
                        source: 'desktop',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-08-11T10:01:00.000Z',
                    type: 'response_item',
                    payload: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: 'Build a custom Codex plugin for Shopify checkout GTM and Stape workflows.',
                            },
                        ],
                    },
                }),
            ].join('\n'),
        );

        const record = await mineSessionFile(sessionPath);

        expect(record.agent).toBe('codex');
        expect(record.originator).toBe('Codex Desktop');
        expect(record.cwd).toBe('/Users/example/project');
        expect(record.messageCounts.user).toBe(1);
        expect(record.keywordDomains).toEqual(expect.arrayContaining(['aiAgents', 'commerce']));
        expect(record.pluginOpportunitySignals.map((signal) => signal.name)).toEqual(
            expect.arrayContaining(['codex-session-intelligence', 'shopify-checkout-for-gtm']),
        );
    });

    it('summarizes plugin opportunities against available capabilities', () => {
        const opportunities = summarizePluginOpportunities(
            [
                {
                    agent: 'codex',
                    pluginOpportunitySignals: [
                        { name: 'shopify-checkout-for-gtm', score: 3 },
                        { name: 'codex-session-intelligence', score: 2 },
                    ],
                },
            ],
            {
                installedSkills: ['shopify-checkout-for-gtm'],
                marketplacePlugins: ['github'],
            },
        );

        expect(opportunities[0]).toMatchObject({
            name: 'shopify-checkout-for-gtm',
            installedMatch: true,
            recommendation: 'Use or tune existing capability before building custom.',
        });
        expect(opportunities[1]).toMatchObject({
            name: 'codex-session-intelligence',
            installedMatch: false,
            marketplaceMatch: false,
            recommendation: 'Candidate for a custom Codex plugin or skill.',
        });
    });

    it('resolves JSONL files from a directory path', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'claude-log-miner-'));
        await writeFile(path.join(dir, 'one.jsonl'), '{}\n');
        await writeFile(path.join(dir, 'two.txt'), '{}\n');

        await expect(resolveSessionFiles(dir)).resolves.toEqual([path.join(dir, 'one.jsonl')]);
    });
});
