/**
 * Local test runner for Mangasteen source extensions.
 *
 * Polyfills the globals the app injects at runtime (httpGet / ksoupSelect / crypto / clearCookies)
 * using Node libraries, then evals your `main.js` so the same code runs in both environments.
 *
 * Usage:
 *   npm run local       – live mode: real HTTP, verbose request/response logging
 *   npm run test        – offline mode: replay fixtures from `sources/<source>/fixtures/`
 *                         and compare outputs to `fixtures/expected/*.json` (golden testing)
 *
 * Pass `-- mangago` (or any source name) after the script to switch which source is loaded.
 */

const axios      = require('axios');
const cheerio    = require('cheerio');
const nodeCrypto = require('node:crypto');
const fs         = require('fs');
const path       = require('path');

const args      = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags     = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const SOURCE    = args[0] || 'mangadex';
const OFFLINE   = flags.has('--fixtures');
const FIXTURES  = path.join(__dirname, 'sources', SOURCE, 'fixtures');

// ---------------------------------------------------------------------------
// Load the source's extension.json so we can mirror production's hostAllowlist
// firewall locally. No manifest → no enforcement (trust-mode), same as the host.
// ---------------------------------------------------------------------------
const MANIFEST_PATH = path.join(__dirname, 'sources', SOURCE, 'extension.json');
let HOST_ALLOWLIST = [];
if (fs.existsSync(MANIFEST_PATH)) {
    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        if (Array.isArray(manifest.hostAllowlist)) HOST_ALLOWLIST = manifest.hostAllowlist;
    } catch (e) {
        console.error(`Invalid ${MANIFEST_PATH}:`, e.message);
    }
}

function hostAllowed(urlStr) {
    if (HOST_ALLOWLIST.length === 0) return true;
    let host;
    try { host = new URL(urlStr).hostname; } catch (_) { return false; }
    return HOST_ALLOWLIST.some(entry => {
        if (entry.startsWith('.')) {
            const suffix = entry.slice(1);
            return host === suffix || host.endsWith(entry);
        }
        return host === entry;
    });
}

// ---------------------------------------------------------------------------
// Cookie jar — matches native per-source behavior.
// ---------------------------------------------------------------------------
const localCookieJar = new Map();

function readCookieHeader(url) {
    try {
        const { host } = new URL(url);
        const jar = localCookieJar.get(host);
        if (!jar || jar.size === 0) return null;
        return Array.from(jar.entries()).map(([n, v]) => `${n}=${v}`).join('; ');
    } catch (_) { return null; }
}

function persistSetCookies(url, setCookieHeaders) {
    if (!setCookieHeaders) return;
    try {
        const { host } = new URL(url);
        let jar = localCookieJar.get(host);
        if (!jar) { jar = new Map(); localCookieJar.set(host, jar); }
        const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        for (const h of list) {
            const first = h.split(';', 1)[0];
            const eq = first.indexOf('=');
            if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
        }
    } catch (_) {}
}

// ---------------------------------------------------------------------------
// Fixture loader — fixtures/manifest.json maps URLs to response body files.
// Each entry: { "url": "...", "response": "<filename>", "status"?: 200 }.
// The runner returns the first exact-URL match; 404-equivalent if no match.
// ---------------------------------------------------------------------------
function loadFixtures() {
    const manifestPath = path.join(FIXTURES, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
        console.error('Invalid fixtures/manifest.json:', e.message);
        return [];
    }
}

const fixtureEntries = OFFLINE ? loadFixtures() : [];

// ---------------------------------------------------------------------------
// globalThis.httpGet
// ---------------------------------------------------------------------------
globalThis.httpGet = async function (url, options = {}) {
    if (!hostAllowed(url)) {
        throw new Error(
            `Host not allowed: ${url}. Add its host to extension.json#hostAllowlist ` +
            `(or clear the list to disable enforcement).`
        );
    }
    if (OFFLINE) {
        const match = fixtureEntries.find(entry => {
            const method = (entry.method || 'GET').toUpperCase();
            const requestMethod = (options.method || 'GET').toUpperCase();
            return entry.url === url && method === requestMethod;
        });
        if (!match) {
            const err = new Error(`No fixture for ${url}. Add one to sources/${SOURCE}/fixtures/manifest.json.`);
            console.error(err.message);
            return { body: '', url, status: 404 };
        }
        const body = fs.readFileSync(path.join(FIXTURES, match.response), 'utf8');
        return { body, url, status: match.status || 200 };
    }

    console.log('Fetching:', url, options.params ? JSON.stringify(options.params) : '');

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options.headers || {}),
    };

    const hasCookie = Object.keys(headers).some(k => k.toLowerCase() === 'cookie');
    if (!hasCookie) {
        const cookieHeader = readCookieHeader(url);
        if (cookieHeader) headers['Cookie'] = cookieHeader;
    }

    const config = { headers, params: options.params };
    const response = await axios.get(url, config);

    const setCookie = response.headers && (response.headers['set-cookie'] || response.headers['Set-Cookie']);
    if (setCookie) persistSetCookies(response.config.url ?? url, setCookie);

    return {
        body:   typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data),
        url:    response.config.url ?? url,
        status: response.status,
    };
};

// ---------------------------------------------------------------------------
// globalThis.crypto (mirrors native HostCrypto bindings)
// ---------------------------------------------------------------------------
globalThis.crypto = {
    sha1:   (s) => nodeCrypto.createHash('sha1').update(String(s), 'utf8').digest('hex'),
    sha256: (s) => nodeCrypto.createHash('sha256').update(String(s), 'utf8').digest('hex'),
    sha512: (s) => nodeCrypto.createHash('sha512').update(String(s), 'utf8').digest('hex'),
    hmacSha256: (keyHex, msg) =>
        nodeCrypto.createHmac('sha256', Buffer.from(String(keyHex), 'hex')).update(String(msg), 'utf8').digest('hex'),
    hmacSha256FromUtf8: (key, msg) =>
        nodeCrypto.createHmac('sha256', String(key)).update(String(msg), 'utf8').digest('hex'),
    base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    base64Decode: (s) => Buffer.from(String(s), 'base64').toString('utf8'),
    aesCbcDecrypt: (keyHex, ivHex, base64Cipher, padding = 'pkcs7') => {
        const keyBuf = Buffer.from(String(keyHex), 'hex');
        const ivBuf = Buffer.from(String(ivHex), 'hex');
        const algorithm =
            keyBuf.length === 16 ? 'aes-128-cbc' :
            keyBuf.length === 24 ? 'aes-192-cbc' :
            keyBuf.length === 32 ? 'aes-256-cbc' :
            (() => { throw new Error(`aesCbcDecrypt: key must be 16/24/32 bytes, got ${keyBuf.length}`); })();
        if (padding !== 'pkcs7' && padding !== 'none') {
            throw new Error(`aesCbcDecrypt: padding must be "pkcs7" or "none", got "${padding}"`);
        }
        const decipher = nodeCrypto.createDecipheriv(algorithm, keyBuf, ivBuf);
        if (padding === 'none') decipher.setAutoPadding(false);
        const ct = Buffer.from(String(base64Cipher), 'base64');
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    },
};

// ---------------------------------------------------------------------------
// globalThis.clearCookies
// ---------------------------------------------------------------------------
globalThis.clearCookies = async function () {
    localCookieJar.clear();
};

// ---------------------------------------------------------------------------
// globalThis.ksoupSelect
// ---------------------------------------------------------------------------
globalThis.ksoupSelect = function (html, selector) {
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: false }, false);
    const results = [];

    $(selector).each((_, element) => {
        const el   = $(element);
        const attr = {};
        for (const key in element.attribs) {
            attr[key] = element.attribs[key];
        }
        results.push({
            text:      el.text(),
            outerHtml: $.html(element),
            innerHtml: el.html(),
            attr,
        });
    });

    return results;
};

// ---------------------------------------------------------------------------
// Load the extension.
// ---------------------------------------------------------------------------
const SOURCE_PATH = path.join(__dirname, 'sources', SOURCE, 'main.js');
if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Source not found: ${SOURCE_PATH}`);
    process.exit(1);
}
eval(fs.readFileSync(SOURCE_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Golden comparison — if a `<name>.expected.json` exists under fixtures/expected/
// we compare the function's output to it and report pass/fail.
// ---------------------------------------------------------------------------
function expectedFor(name) {
    const p = path.join(FIXTURES, 'expected', `${name}.json`);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (_) { return null; }
}

function compareOrLog(name, actual) {
    const expected = expectedFor(name);
    if (expected == null) {
        console.log(`  (no fixtures/expected/${name}.json — skipping golden check)`);
        return true;
    }
    const ok = JSON.stringify(expected) === JSON.stringify(actual);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) {
        console.log('    expected:', JSON.stringify(expected).slice(0, 200));
        console.log('    actual:  ', JSON.stringify(actual).slice(0, 200));
    }
    return ok;
}

// ---------------------------------------------------------------------------
// Run the declared test cases from fixtures/tests.json (offline mode only),
// or fall back to a manual "exercise everything" pass (live mode).
// ---------------------------------------------------------------------------
(async () => {
    let anyFail = false;

    try {
        if (OFFLINE) {
            const testsPath = path.join(FIXTURES, 'tests.json');
            if (!fs.existsSync(testsPath)) {
                console.log('No fixtures/tests.json — nothing to run.');
                return;
            }
            const tests = JSON.parse(fs.readFileSync(testsPath, 'utf8'));
            console.log(`=== Running ${tests.length} fixture test(s) for ${SOURCE} ===`);
            for (const test of tests) {
                console.log(`- ${test.name} (${test.function})`);
                const fn = globalThis[test.function];
                if (typeof fn !== 'function') {
                    console.log(`  SKIP — ${test.function} is not defined`);
                    continue;
                }
                const result = await fn(...(test.args || []));
                if (!compareOrLog(test.name, result)) anyFail = true;
            }
        } else {
            console.log(`=== Live run for ${SOURCE} (real HTTP) ===`);
            const popular = await getPopularManga(1);
            console.log(`getPopularManga  → ${popular.length} items`);
            if (popular.length) console.log('  first:', popular[0]);

            const latest = await getLatestManga(1);
            console.log(`getLatestManga   → ${latest.length} items`);

            if (popular[0]) {
                const details = await getMangaDetails(popular[0].url);
                console.log(`getMangaDetails  → ${details && details.chapters ? details.chapters.length : 0} chapters`);
            }
        }
    } catch (e) {
        console.error('Runner failed:', e);
        anyFail = true;
    }

    process.exit(anyFail ? 1 : 0);
})();
