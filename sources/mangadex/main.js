/// <reference path="./host-globals.d.ts" />

/**
 * @name MangaDex
 * @version 1.0.1
 * @lang en
 * @iconUrl https://mangadex.org/pwa/icons/icon-180.png
 *
 * MangaDex via its public API (https://api.mangadex.org/docs/). MangaDex explicitly permits
 * third-party clients; this source follows the API rules: a descriptive User-Agent, the host
 * rate limit (extension.json#maxRequestsPerSecond), no ads, and credit to scanlation groups in
 * chapter names. Pages are served from MangaDex@Home nodes exactly as the API hands them out.
 *
 * Content policy: the `pornographic` content rating is never requested. `erotica` is requested
 * but tagged "Adult" (and `suggestive` tagged "Suggestive") so the app's Spicy Filter can hide it.
 *
 * Note: licensed titles on MangaDex only carry *external* chapters (links to the official
 * publisher). Those are skipped, so such titles show an empty chapter list.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API = 'https://api.mangadex.org';
const SITE = 'https://mangadex.org';
const COVERS = 'https://uploads.mangadex.org/covers';
const LANG = 'en';
const PAGE_SIZE = 20;
const CHAPTER_PAGE_SIZE = 500;
const MAX_CHAPTER_PAGES = 10; // 5 000 chapters — nothing on MangaDex is longer
const MAX_OFFSET = 10000; // MangaDex refuses offset + limit > 10 000
const CONTENT_RATINGS = ['safe', 'suggestive', 'erotica']; // never 'pornographic'
const HEADERS = {
    'User-Agent': 'MangaSteen/1.0 (https://mangasteen.codertheory.dev; support@codertheory.dev)',
    'Accept': 'application/json',
};

// ---------------------------------------------------------------------------
// HTTP / JSON helpers
// ---------------------------------------------------------------------------

/**
 * Builds a query string from ordered pairs so repeated keys (`includes[]`) are preserved and the
 * resulting URL is deterministic — the offline test runner matches fixtures by exact URL.
 * @param {Array<[string, string]>} pairs
 * @returns {string}
 */
function query(pairs) {
    return pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

/**
 * @param {string} path
 * @param {Array<[string, string]>} pairs
 * @returns {Promise<any>} parsed JSON body
 */
async function apiGet(path, pairs) {
    const url = API + path + (pairs.length ? '?' + query(pairs) : '');
    const res = await httpGet(url, { headers: HEADERS });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
        throw new Error('MangaDex ' + path + ' returned HTTP ' + res.status);
    }
    const json = JSON.parse(res.body);
    if (json && json.result && json.result !== 'ok') {
        const detail = json.errors && json.errors[0] ? json.errors[0].detail : 'unknown error';
        throw new Error('MangaDex ' + path + ' failed: ' + detail);
    }
    return json;
}

/** @returns {Array<[string, string]>} */
function contentRatingPairs() {
    return CONTENT_RATINGS.map(r => /** @type {[string, string]} */ (['contentRating[]', r]));
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Picks a localized string: preferred language, then romanized Japanese, then anything.
 * @param {Record<string, string> | null | undefined} localized
 * @returns {string}
 */
function pickText(localized) {
    if (!localized) return '';
    if (localized[LANG]) return localized[LANG];
    if (localized['ja-ro']) return localized['ja-ro'];
    const first = Object.values(localized)[0];
    return typeof first === 'string' ? first : '';
}

/**
 * @param {any} attributes
 * @returns {string}
 */
function titleOf(attributes) {
    const title = attributes.title || {};
    if (title[LANG]) return title[LANG];
    const alts = Array.isArray(attributes.altTitles) ? attributes.altTitles : [];
    for (const alt of alts) {
        if (alt && alt[LANG]) return alt[LANG];
    }
    return pickText(title);
}

/**
 * @param {any[]} relationships
 * @param {string} type
 * @returns {any[]}
 */
function relationshipsOf(relationships, type) {
    return (relationships || []).filter(r => r && r.type === type);
}

/**
 * @param {any[]} relationships
 * @param {string} type
 * @returns {string} comma-joined `attributes.name` of every relationship of that type
 */
function namesOf(relationships, type) {
    return relationshipsOf(relationships, type)
        .map(r => (r.attributes && r.attributes.name) || '')
        .filter(Boolean)
        .join(', ');
}

/**
 * @param {string} mangaId
 * @param {any[]} relationships
 * @param {number} size 256 for listings, 512 for details
 * @returns {string}
 */
function coverOf(mangaId, relationships, size) {
    const cover = relationshipsOf(relationships, 'cover_art')[0];
    const fileName = cover && cover.attributes && cover.attributes.fileName;
    return fileName ? COVERS + '/' + mangaId + '/' + fileName + '.' + size + '.jpg' : '';
}

/**
 * @param {string | null | undefined} status
 * @returns {string}
 */
function statusOf(status) {
    switch (status) {
        case 'ongoing': return 'Ongoing';
        case 'completed': return 'Completed';
        case 'hiatus': return 'Hiatus';
        case 'cancelled': return 'Cancelled';
        default: return 'Unknown';
    }
}

/**
 * Genre/theme/content-warning tags plus a rating-derived tag. `erotica` becomes "Adult" so the
 * app's Spicy Filter (18+ / Adult / Smut) catches it; `suggestive` is surfaced as "Suggestive".
 * @param {any} attributes
 * @returns {string[]}
 */
function genresOf(attributes) {
    const out = [];
    const tags = Array.isArray(attributes.tags) ? attributes.tags : [];
    for (const tag of tags) {
        const a = tag && tag.attributes;
        if (!a) continue;
        const group = a.group;
        if (group !== 'genre' && group !== 'theme' && group !== 'content') continue;
        const name = a.name && (a.name[LANG] || pickText(a.name));
        if (name) out.push(name);
    }
    if (attributes.contentRating === 'erotica') out.push('Adult');
    else if (attributes.contentRating === 'suggestive') out.push('Suggestive');
    return out;
}

/**
 * Epoch milliseconds as a numeric *string*. The host's JS bridge turns any number wider than an
 * Int into a Double and renders it in exponent form (`1.786811671E12`), which its Long fields
 * reject; a numeric string decodes cleanly on every shipped app version (MANGASTEEN-39).
 * @param {string | null | undefined} iso
 * @returns {string} epoch ms, "0" when unknown
 */
function epochMs(iso) {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? t.toFixed(0) : '0';
}

/**
 * @param {any} m a `manga` entity from the API
 * @param {number} coverSize
 * @returns {SourceManga}
 */
function toManga(m, coverSize) {
    const a = m.attributes || {};
    return {
        title: titleOf(a),
        url: SITE + '/title/' + m.id,
        coverUrl: coverOf(m.id, m.relationships, coverSize),
        description: pickText(a.description),
        author: namesOf(m.relationships, 'author'),
        artist: namesOf(m.relationships, 'artist'),
        status: statusOf(a.status),
        genres: genresOf(a),
        lastUpdate: epochMs(a.updatedAt),
    };
}

/**
 * @param {any} c a `chapter` entity from the feed
 * @returns {SourceChapter}
 */
function toChapter(c) {
    const a = c.attributes || {};
    const parts = [];
    if (a.volume) parts.push('Vol. ' + a.volume);
    if (a.chapter) parts.push('Ch. ' + a.chapter);
    let name = parts.join(' ') || 'Oneshot';
    if (a.title) name += ' - ' + a.title;
    const group = namesOf(c.relationships, 'scanlation_group');
    if (group) name += ' [' + group + ']';
    const number = a.chapter ? parseFloat(a.chapter) : NaN;
    return {
        name: name,
        url: SITE + '/chapter/' + c.id,
        number: Number.isFinite(number) ? number : -1,
        uploadDate: epochMs(a.publishAt || a.readableAt),
    };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Accepts `https://mangadex.org/title/<uuid>[/slug]`, `/chapter/<uuid>`, or a bare uuid.
 * @param {string} url
 * @returns {string}
 */
function idFromUrl(url) {
    const match = UUID.exec(url || '');
    if (!match) throw new Error('Not a MangaDex URL: ' + url);
    return match[0].toLowerCase();
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/**
 * @param {number} page 1-based
 * @param {Array<[string, string]>} extra order / filter pairs
 * @returns {Promise<SourceManga[]>}
 */
async function listManga(page, extra) {
    const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
    if (offset + PAGE_SIZE > MAX_OFFSET) return [];
    const json = await apiGet('/manga', [
        ['limit', String(PAGE_SIZE)],
        ['offset', String(offset)],
        ['includes[]', 'cover_art'],
        ['includes[]', 'author'],
        ['includes[]', 'artist'],
        ...contentRatingPairs(),
        ['hasAvailableChapters', 'true'],
        ['availableTranslatedLanguage[]', LANG],
        ...extra,
    ]);
    const data = json && Array.isArray(json.data) ? json.data : [];
    return data.map((/** @type {any} */ m) => toManga(m, 256));
}

/** @param {number} page */
globalThis.getPopularManga = async function getPopularManga(page) {
    return listManga(page, [['order[followedCount]', 'desc']]);
};

/** @param {number} page */
globalThis.getLatestManga = async function getLatestManga(page) {
    return listManga(page, [['order[latestUploadedChapter]', 'desc']]);
};

/** @param {string} query @param {number} page */
globalThis.searchManga = async function searchManga(query, page) {
    const q = (query || '').trim();
    if (!q) return [];
    return listManga(page, [['title', q], ['order[relevance]', 'desc']]);
};

// ---------------------------------------------------------------------------
// Details / chapters / pages
// ---------------------------------------------------------------------------

/**
 * Walks the chapter feed for one title. External chapters (licensed titles that only link to
 * the publisher) are skipped — they have no pages MangaDex can serve.
 * @param {string} mangaId
 * @returns {Promise<SourceChapter[]>}
 */
async function fetchChapters(mangaId) {
    /** @type {SourceChapter[]} */
    const chapters = [];
    for (let pageIndex = 0; pageIndex < MAX_CHAPTER_PAGES; pageIndex++) {
        const offset = pageIndex * CHAPTER_PAGE_SIZE;
        const json = await apiGet('/manga/' + mangaId + '/feed', [
            ['limit', String(CHAPTER_PAGE_SIZE)],
            ['offset', String(offset)],
            ['translatedLanguage[]', LANG],
            ['order[volume]', 'desc'],
            ['order[chapter]', 'desc'],
            ['includes[]', 'scanlation_group'],
            ...contentRatingPairs(),
        ]);
        const data = json && Array.isArray(json.data) ? json.data : [];
        for (const c of data) {
            const a = c.attributes || {};
            if (a.externalUrl) continue;
            chapters.push(toChapter(c));
        }
        const total = json && typeof json.total === 'number' ? json.total : 0;
        if (data.length === 0 || offset + data.length >= total) break;
    }
    return chapters;
}

/** @param {string} url */
globalThis.getMangaDetails = async function getMangaDetails(url) {
    const id = idFromUrl(url);
    const json = await apiGet('/manga/' + id, [
        ['includes[]', 'cover_art'],
        ['includes[]', 'author'],
        ['includes[]', 'artist'],
    ]);
    if (!json || !json.data) return null;
    const manga = toManga(json.data, 512);
    const chapters = await fetchChapters(id);
    return { manga: manga, chapters: chapters };
};

/** @param {string} url */
globalThis.getChapterList = async function getChapterList(url) {
    return fetchChapters(idFromUrl(url));
};

/** @param {string} url */
globalThis.getPageList = async function getPageList(url) {
    const id = idFromUrl(url);
    const json = await apiGet('/at-home/server/' + id, []);
    if (!json || !json.chapter) throw new Error('MangaDex returned no page server for chapter ' + id);
    const base = json.baseUrl;
    const hash = json.chapter.hash;
    const files = Array.isArray(json.chapter.data) ? json.chapter.data : [];
    return files.map((/** @type {string} */ f) => base + '/data/' + hash + '/' + f);
};
