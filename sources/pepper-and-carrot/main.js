/// <reference path="../mangadex/host-globals.d.ts" />

/**
 * @name Pepper&Carrot
 * @version 1.0.0
 * @lang en
 * @iconUrl https://www.peppercarrot.com/core/img/favicon.png
 *
 * Pepper&Carrot by David Revoy (https://www.peppercarrot.com), an open-source webcomic.
 * Webcomics, translations and artworks are licensed under Creative Commons Attribution 4.0
 * International (CC BY 4.0) unless otherwise noted: https://www.peppercarrot.com/en/license/index.html
 * Credit: "Pepper&Carrot by David Revoy, www.peppercarrot.com, CC BY 4.0". The author also states
 * that AI derivation is prohibited; this source only displays the comic unmodified.
 *
 * Data comes from the site's documented episode index
 * (https://www.peppercarrot.com/en/documentation/130_API.html), which lists every episode and the
 * languages it is fully translated into. Model: one series, one chapter per episode, English only
 * (the app has no per-source language setting, and one series per language would flood the
 * catalogue with ~70 near-identical entries).
 *
 * Every episode's last page is the credits page for that episode; it is kept so the per-episode
 * credit and licence line stay visible to the reader.
 */

const SITE = 'https://www.peppercarrot.com';
const SOURCES = 'https://www.peppercarrot.com/0_sources';
const INDEX_URL = 'https://peppercarrot.com/0_sources/episodes.json';
const LANG = 'en';
const SERIES_URL = SITE + '/en/webcomics/index.html';
const HEADERS = {
    'User-Agent': 'MangaSteen/1.0 (https://mangasteen.codertheory.dev; support@codertheory.dev)',
    'Accept': 'application/json',
};

/**
 * The index does not say which pages are animated GIFs (the API docs allow `jpg` or `gif`). These
 * are the ones found by probing every page of every episode on 2026-11-11; re-probe when a new
 * episode is added (see the README).
 * @type {Record<string, number[]>}
 */
const GIF_PAGES = {
    'ep04_Stroke-of-genius': [5],
    'ep12_Autumn-Clearout': [6],
    'ep28_The-Festivities': [2],
};

const DESCRIPTION =
    'Pepper is a young witch in training who lives with her cat Carrot in the fantasy world of Hereva. ' +
    'An all-ages, open-source webcomic.\n\n' +
    'Pepper&Carrot by David Revoy, www.peppercarrot.com, licensed under CC BY 4.0 ' +
    '(https://creativecommons.org/licenses/by/4.0/). AI derivation prohibited.';

/**
 * @typedef {{ name: string, total_pages: number, translated_languages: string[] }} Episode
 */

/**
 * @returns {Promise<Episode[]>} English-available episodes, oldest first
 */
async function fetchEpisodes() {
    const res = await httpGet(INDEX_URL, { headers: HEADERS });
    if (res.status < 200 || res.status >= 300) {
        throw new Error('Pepper&Carrot episode index returned HTTP ' + res.status);
    }
    const json = JSON.parse(res.body);
    if (!Array.isArray(json)) throw new Error('Pepper&Carrot episode index has an unexpected shape');
    return json.filter((/** @type {Episode} */ e) =>
        e && typeof e.name === 'string' && Array.isArray(e.translated_languages) &&
        e.translated_languages.indexOf(LANG) !== -1);
}

/**
 * @param {string} dir e.g. `ep24_The-Unity-Tree`
 * @returns {{ number: number, title: string }}
 */
function parseDir(dir) {
    const m = /^ep(\d+)_(.*)$/.exec(dir);
    if (!m) return { number: -1, title: dir.replace(/-/g, ' ') };
    return { number: parseInt(m[1], 10), title: m[2].replace(/-/g, ' ') };
}

/**
 * @param {string} dir
 * @returns {string}
 */
function coverOf(dir) {
    const n = parseDir(dir).number;
    return SOURCES + '/' + dir + '/low-res/' + LANG + '_Pepper-and-Carrot_by-David-Revoy_E' + pad(n) + '.jpg';
}

/** @param {number} n */
function pad(n) {
    return n < 10 ? '0' + n : String(n);
}

/**
 * @param {Episode[]} episodes
 * @returns {SourceManga}
 */
function toManga(episodes) {
    const first = episodes[0];
    return {
        title: 'Pepper&Carrot',
        url: SERIES_URL,
        coverUrl: first ? coverOf(first.name) : '',
        description: DESCRIPTION,
        author: 'David Revoy',
        artist: 'David Revoy',
        status: 'Ongoing',
        genres: ['Fantasy', 'Comedy', 'Webcomic', 'Open Source', 'All Ages'],
        lastUpdate: '0',
    };
}

/**
 * @param {Episode[]} episodes oldest first
 * @returns {SourceChapter[]} newest first
 */
function toChapters(episodes) {
    return episodes.map(e => {
        const p = parseDir(e.name);
        return {
            name: 'Episode ' + p.number + ': ' + p.title,
            url: SITE + '/' + LANG + '/webcomic/' + e.name + '.html',
            number: p.number,
            uploadDate: '0', // the episode index carries no dates
        };
    }).reverse();
}

/** @param {string} url */
function dirFromUrl(url) {
    const m = /(ep\d+_[A-Za-z0-9-]+)/.exec(url || '');
    if (!m) throw new Error('Not a Pepper&Carrot episode URL: ' + url);
    return m[1];
}

/** @param {string} query */
function matches(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return false;
    return ['pepper', 'carrot', 'hereva', 'witch', 'revoy', 'webcomic'].some(k => k.indexOf(q) !== -1 || q.indexOf(k) !== -1);
}

/** There is only one series, so every listing is that series on page 1. */
async function singleSeries(/** @type {number} */ page) {
    if (page > 1) return [];
    return [toManga(await fetchEpisodes())];
}

/** @param {number} page */
globalThis.getPopularManga = async function getPopularManga(page) {
    return singleSeries(page);
};

/** @param {number} page */
globalThis.getLatestManga = async function getLatestManga(page) {
    return singleSeries(page);
};

/** @param {string} query @param {number} page */
globalThis.searchManga = async function searchManga(query, page) {
    if (!matches(query)) return [];
    return singleSeries(page);
};

/** @param {string} _url */
globalThis.getMangaDetails = async function getMangaDetails(_url) {
    const episodes = await fetchEpisodes();
    return { manga: toManga(episodes), chapters: toChapters(episodes) };
};

/** @param {string} _url */
globalThis.getChapterList = async function getChapterList(_url) {
    return toChapters(await fetchEpisodes());
};

/** @param {string} url */
globalThis.getPageList = async function getPageList(url) {
    const dir = dirFromUrl(url);
    const episodes = await fetchEpisodes();
    const episode = episodes.find(e => e.name === dir);
    if (!episode) throw new Error('Pepper&Carrot episode not found in the index: ' + dir);
    const n = pad(parseDir(dir).number);
    const pages = [];
    // P00 .. P<total_pages>; the last one is the credits page (the index excludes it from the count).
    const gifs = GIF_PAGES[dir] || [];
    for (let i = 0; i <= episode.total_pages; i++) {
        const ext = gifs.indexOf(i) !== -1 ? '.gif' : '.jpg';
        pages.push(SOURCES + '/' + dir + '/low-res/' + LANG + '_Pepper-and-Carrot_by-David-Revoy_E' + n + 'P' + pad(i) + ext);
    }
    return pages;
};
