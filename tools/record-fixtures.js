/**
 * Records HTTP fixtures for a source by running every case in `fixtures/tests.json` against
 * the live API and saving each response body + the function's output as golden files.
 *
 *   npm run record            # re-records sources/mangadex/fixtures/*
 *
 * The offline runner (`npm test`) then replays these with no network. Re-run this whenever the
 * source's request URLs change; commit the result.
 */
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('node:crypto');

const SOURCE = process.argv[2] || 'mangadex';
const ROOT = path.join(__dirname, '..', 'sources', SOURCE);
const FIXTURES = path.join(ROOT, 'fixtures');
const EXPECTED = path.join(FIXTURES, 'expected');
fs.mkdirSync(EXPECTED, { recursive: true });

/** @type {Array<{url: string, method: string, response: string, status: number}>} */
const manifest = [];

globalThis.httpGet = async function (url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const res = await fetch(url, { method, headers: options.headers || {}, body: options.body });
    const body = await res.text();
    const file = 'http-' + nodeCrypto.createHash('sha1').update(method + ' ' + url).digest('hex').slice(0, 12) + '.json';
    if (!manifest.some(e => e.url === url && e.method === method)) {
        fs.writeFileSync(path.join(FIXTURES, file), body);
        manifest.push({ url, method, response: file, status: res.status });
    }
    return { body, url: res.url || url, status: res.status };
};
globalThis.ksoupSelect = () => { throw new Error('ksoupSelect is not used by this source'); };
globalThis.clearCookies = async () => {};
globalThis.crypto = {};
globalThis.console = console;

eval(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'));

(async () => {
    // Wipe previous recordings so stale files don't linger.
    for (const f of fs.readdirSync(FIXTURES)) if (f.startsWith('http-')) fs.unlinkSync(path.join(FIXTURES, f));
    const tests = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'tests.json'), 'utf8'));
    for (const test of tests) {
        const result = await globalThis[test.function](...(test.args || []));
        fs.writeFileSync(path.join(EXPECTED, test.name + '.json'), JSON.stringify(result, null, 2) + '\n');
        console.log(`recorded ${test.name}: ${Array.isArray(result) ? result.length + ' items' : typeof result}`);
    }
    fs.writeFileSync(path.join(FIXTURES, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${manifest.length} HTTP fixture(s) written`);
})().catch(e => { console.error(e); process.exit(1); });
