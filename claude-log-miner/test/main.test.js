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
        expect(record.pluginOpportunitySignals).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'apify-cli-tooling',
                    evidence: expect.arrayContaining(['package:apify-cli']),
                }),
            ]),
        );
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
        expect(record.pluginOpportunitySignals).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'shopify-checkout-workflow' }),
                expect.objectContaining({ name: 'checkout-gtm-workflow' }),
            ]),
        );
    });

    it('summarizes plugin opportunities against available capabilities', () => {
        const opportunities = summarizePluginOpportunities(
            [
                {
                    agent: 'codex',
                    pluginOpportunitySignals: [
                        { name: 'shopify-checkout-for-gtm', score: 4 },
                        { name: 'checkout-gtm-workflow', score: 6, evidence: ['phrase:checkout-gtm'] },
                    ],
                    keywordDomains: ['commerce'],
                },
            ],
            {
                installedSkills: ['shopify-checkout-for-gtm'],
                marketplacePlugins: ['github'],
            },
        );

        expect(opportunities.find((opportunity) => opportunity.name === 'shopify-checkout-for-gtm')).toMatchObject({
            name: 'shopify-checkout-for-gtm',
            installedMatch: true,
            recommendation: 'Use or tune existing capability before building custom.',
        });
        expect(opportunities.find((opportunity) => opportunity.name === 'checkout-gtm-workflow')).toMatchObject({
            name: 'checkout-gtm-workflow',
            description: expect.stringContaining('phrase:checkout-gtm'),
            effectiveness: 2,
            installedMatch: false,
            marketplaceMatch: false,
            recommendation: 'Candidate for a custom skill based on 1 matching session(s).',
        });
    });

    it('does not emit canned opportunities when logs do not contain matching evidence', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'unique-session-miner-'));
        const sessionPath = path.join(dir, 'session.jsonl');
        await writeFile(
            sessionPath,
            JSON.stringify({
                timestamp: '2026-08-11T10:00:00.000Z',
                type: 'user',
                message: {
                    role: 'user',
                    content: 'Tune the cobalt billing reconciliation workflow around finops invoices.',
                },
            }),
        );

        const record = await mineSessionFile(sessionPath);
        const names = record.pluginOpportunitySignals.map((signal) => signal.name);

        expect(names).toContain('cobalt-billing-workflow');
        expect(names).not.toContain('apify-actor-ops');
        expect(names).not.toContain('codex-session-intelligence');
    });

    it('resolves JSONL files from a directory path', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'claude-log-miner-'));
        await writeFile(path.join(dir, 'one.jsonl'), '{}\n');
        await writeFile(path.join(dir, 'two.txt'), '{}\n');

        await expect(resolveSessionFiles(dir)).resolves.toEqual([path.join(dir, 'one.jsonl')]);
    });
});
