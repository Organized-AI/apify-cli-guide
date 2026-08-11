import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importSelection } from './import-selection.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(currentDirectory, '..');
const port = Number(process.env.PORT ?? 4177);

const server = createServer(async (request, response) => {
    try {
        if (request.method === 'GET' && (request.url === '/' || request.url === '/REPORT.html')) {
            const html = await readFile(path.join(projectRoot, 'storage/key_value_stores/default/REPORT.html'), 'utf8');
            send(response, 200, html, 'text/html; charset=utf-8');
            return;
        }

        if (request.method === 'POST' && request.url === '/import') {
            const body = await readBody(request);
            const plan = JSON.parse(body);
            const result = await importSelection(plan);
            send(response, 200, JSON.stringify(result), 'application/json');
            return;
        }

        send(response, 404, 'Not found', 'text/plain');
    } catch (error) {
        send(response, 500, String(error.stack ?? error), 'text/plain');
    }
});

server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Agent Session Miner report: http://localhost:${port}`);
});

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk) => {
            body += chunk;
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function send(response, status, body, contentType) {
    response.writeHead(status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': 'null',
    });
    response.end(body);
}
