/// <reference path="../mangadex/host-globals.d.ts" />

/**
 * @name xkcd
 * @version 1.0.0
 * @lang en
 * @iconUrl https://xkcd.com/s/919f27.ico
 *
 * xkcd by Randall Munroe (https://xkcd.com), "A webcomic of romance, sarcasm, math, and language".
 * Licensed under Creative Commons Attribution-NonCommercial 2.5 (https://xkcd.com/license.html):
 * free to reuse non-commercially as long as the source is credited. Credit: "xkcd.com by Randall
 * Munroe, CC BY-NC 2.5". The author documents a JSON interface for automated use
 * (https://xkcd.com/json.html).
 *
 * Model: one series, one chapter per comic (one page each). The chapter list comes from the
 * site's own archive page (https://xkcd.com/archive/), a single request that lists every comic
 * with its title and date, so listing never fans out into thousands of JSON requests. A comic's
 * image URL comes from its own `info.0.json` and is fetched only when the reader opens it.
 *
 * Alt text (the hover text) is only in each comic's JSON, so it is not part of the chapter list;
 * the app contract has no field for it on a page.
 */

const SITE = 'https://xkcd.com';
const ARCHIVE_URL = SITE + '/archive/';
const SERIES_URL = SITE + '/archive/';
const COVER = 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg'; // comic #1
const HEADERS = {
    'User-Agent': 'MangaSteen/1.0 (https://mangasteen.codertheory.dev; support@codertheory.dev)',
};

const DESCRIPTION =
    'A webcomic of romance, sarcasm, math, and language, by Randall Munroe. Stick figures, ' +
    'one comic at a time.\n\n' +
    'xkcd.com by Randall Munroe, licensed under CC BY-NC 2.5 ' +
    '(https://creativecommons.org/licenses/by-nc/2.5/, https://xkcd.com/license.html). ' +
    'Non-commercial use only; credit and link back to xkcd.com.';

/** @returns {SourceManga} */
function series() {
    return {
        title: 'xkcd',
        url: SERIES_URL,
        coverUrl: COVER,
        description: DESCRIPTION,
        author: 'Randall Munroe',
        artist: 'Randall Munroe',
        status: 'Ongoing',
        genres: ['Webcomic', 'Comedy', 'Science', 'Humor', 'All Ages'],
        lastUpdate: '0',
    };
}

/** @param {string} s */
function decodeEntities(s) {
    return s
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, '&');
}

/**
 * Epoch ms (UTC) as a numeric string, from the archive's `YYYY-M-D` dates.
 * @param {string} ymd
 * @returns {string}
 */
function epochMs(ymd) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ymd || '');
    if (!m) return '0';
    return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).toFixed(0);
}

/**
 * Parses the archive page; lines look like `<a href="/3323/" title="2026-11-11">Meteor Fear</a>`.
 * @returns {Promise<SourceChapter[]>} newest first (the archive's own order)
 */
async function fetchChapters() {
    const res = await httpGet(ARCHIVE_URL, { headers: HEADERS });
    if (res.status < 200 || res.status >= 300) throw new Error('xkcd archive returned HTTP ' + res.status);
    /** @type {SourceChapter[]} */
    const chapters = [];
    const re = /<a href="\/(\d+)\/" title="([^"]*)">(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(res.body)) !== null) {
        const num = parseInt(m[1], 10);
        chapters.push({
            name: '#' + num + ': ' + decodeEntities(m[3].replace(/<\/?span[^>]*>/g, '')).trim(),
            url: SITE + '/' + num + '/',
            number: num,
            uploadDate: epochMs(m[2]),
        });
    }
    if (chapters.length === 0) throw new Error('xkcd archive had no comics; has the page layout changed?');
    return chapters;
}

/** @param {number} page */
globalThis.getPopularManga = async function getPopularManga(page) {
    return page > 1 ? [] : [series()];
};

/** @param {number} page */
globalThis.getLatestManga = async function getLatestManga(page) {
    return page > 1 ? [] : [series()];
};

/** @param {string} query @param {number} page */
globalThis.searchManga = async function searchManga(query, page) {
    const q = (query || '').trim().toLowerCase();
    if (!q || page > 1) return [];
    const keywords = ['xkcd', 'webcomic', 'munroe', 'randall', 'stick'];
    return keywords.some(k => k.indexOf(q) !== -1 || q.indexOf(k) !== -1) ? [series()] : [];
};

/** @param {string} _url */
globalThis.getMangaDetails = async function getMangaDetails(_url) {
    const chapters = await fetchChapters();
    const manga = series();
    manga.lastUpdate = chapters[0].uploadDate;
    return { manga: manga, chapters: chapters };
};

/** @param {string} _url */
globalThis.getChapterList = async function getChapterList(_url) {
    return fetchChapters();
};

/** @param {string} url */
globalThis.getPageList = async function getPageList(url) {
    const m = /xkcd\.com\/(\d+)/.exec(url || '');
    if (!m) throw new Error('Not an xkcd comic URL: ' + url);
    const res = await httpGet(SITE + '/' + m[1] + '/info.0.json', { headers: HEADERS });
    if (res.status < 200 || res.status >= 300) throw new Error('xkcd #' + m[1] + ' returned HTTP ' + res.status);
    const json = JSON.parse(res.body);
    if (!json || typeof json.img !== 'string' || !json.img) throw new Error('xkcd #' + m[1] + ' has no image');
    return [json.img];
};
