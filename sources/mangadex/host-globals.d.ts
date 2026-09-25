// Type declarations for globals the Mangasteen host injects into the JS runtime.
// Authors should `import "./host-globals";` (or include this file via tsconfig) to get
// autocomplete + type-checking against the contract.

export {};

declare global {
    // -- HTTP ---------------------------------------------------------------

    interface HttpOptions {
        /** HTTP method. Default: "GET". */
        method?: string;
        /** Request headers. */
        headers?: Record<string, string>;
        /** URL query parameters — appended to the URL, encoded by the host. */
        params?: Record<string, string>;
        /** Raw request body string (e.g. JSON.stringify(...) or form-encoded). */
        body?: string;
    }

    interface HttpResponse {
        /** Response body as a string. */
        body: string;
        /** Final URL after any redirects. */
        url: string;
        /** HTTP status code. */
        status: number;
    }

    /**
     * Make an HTTP request. Cookies are auto-injected/persisted per source unless
     * `options.headers["Cookie"]` is explicitly set.
     */
    function httpGet(url: string, options?: HttpOptions): Promise<HttpResponse>;

    /** Clear this source's cookie jar (log-out flow, broken session, etc.). */
    function clearCookies(): Promise<void>;

    // -- HTML parsing --------------------------------------------------------

    interface KsoupElement {
        /** Visible text content. */
        text: string;
        /** Full outer HTML of the element. */
        outerHtml: string;
        /** Inner HTML of the element. */
        innerHtml: string;
        /** Attribute name → value map. */
        attr: Record<string, string>;
    }

    /** Parse HTML and return all elements matching the CSS selector. */
    function ksoupSelect(html: string, selector: string): KsoupElement[];

    // -- Crypto --------------------------------------------------------------

    interface HostCrypto {
        /** SHA-1 hex digest of the UTF-8 bytes of [input]. */
        sha1(input: string): string;
        /** SHA-256 hex digest. */
        sha256(input: string): string;
        /** SHA-512 hex digest. */
        sha512(input: string): string;
        /** HMAC-SHA256 with a hex-encoded key; hex output. */
        hmacSha256(keyHex: string, message: string): string;
        /** HMAC-SHA256 with a UTF-8 key; hex output. */
        hmacSha256FromUtf8(key: string, message: string): string;
        /** Encode a UTF-8 string as base64. */
        base64Encode(input: string): string;
        /** Decode a base64 string back to UTF-8. */
        base64Decode(input: string): string;
        /**
         * AES-CBC decrypt, returning the plaintext as a UTF-8 string.
         *
         * - [keyHex] must be 32 / 48 / 64 hex chars (AES-128 / -192 / -256).
         * - [ivHex] must be 32 hex chars (16 bytes).
         * - [base64Cipher] must be a multiple of 16 bytes after base64-decoding.
         * - [padding] is `"pkcs7"` (default) or `"none"`. Use `"none"` for sites that
         *   zero-pad (or otherwise do not use PKCS7) and strip the sentinel bytes yourself
         *   in JS.
         *
         * Runs on the platform-native cipher (javax.crypto on Android, CommonCrypto on iOS),
         * so it's dramatically faster than a QuickJS-interpreted AES and is the recommended
         * path for any site that encrypts its page list / chapter payloads.
         */
        aesCbcDecrypt(
            keyHex: string,
            ivHex: string,
            base64Cipher: string,
            padding?: "pkcs7" | "none",
        ): string;
    }

    const crypto: HostCrypto;

    // -- Logging -------------------------------------------------------------

    interface HostConsole {
        /**
         * Writes a line to the host's log, prefixed with the source name.
         * Every call crosses the JS ↔ native boundary, so use sparingly in
         * hot paths.
         */
        log(...args: unknown[]): void;
    }

    const console: HostConsole;

    // -- Source contract (the functions authors must define) -----------------

    interface SourceManga {
        title: string;
        url: string;
        coverUrl?: string;
        description?: string;
        author?: string;
        artist?: string;
        status?: string;
        /**
         * Array of genre names. A comma-separated string is also accepted by
         * the host's lenient deserializer for legacy sources, but new sources
         * should return an array.
         */
        genres?: string[];
        /**
         * Unix epoch milliseconds. Return a number (e.g. `Date.now()`) or a
         * numeric string. Use `0` when unknown — an empty string fails
         * deserialization.
         */
        lastUpdate?: number | string;
    }

    interface SourceChapter {
        name: string;
        url: string;
        /** Chapter number as a float. Use `-1` when unknown. */
        number: number;
        /**
         * Unix epoch milliseconds. Return a number (e.g. `Date.now()`) or a
         * numeric string. Use `0` when unknown — an empty string fails
         * deserialization.
         */
        uploadDate: number | string;
    }

    interface MangaWithChapters {
        manga: SourceManga;
        chapters: SourceChapter[];
    }

    // The six entry points — assign yours to globalThis:
    // globalThis.getPopularManga = async (page) => { ... };
    var getPopularManga: (page: number) => Promise<SourceManga[]>;
    var getLatestManga: (page: number) => Promise<SourceManga[]>;
    var searchManga: (query: string, page: number) => Promise<SourceManga[]>;
    var getMangaDetails: (url: string) => Promise<MangaWithChapters | null>;
    var getChapterList: (url: string) => Promise<SourceChapter[]>;
    var getPageList: (url: string) => Promise<string[]>;
}
