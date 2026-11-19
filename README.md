# Mangasteen official sources

The default source repository for the [Mangasteen](https://mangasteen.codertheory.dev)
manga reader. The app offers it as **"Official sources (recommended)"** during onboarding and on
the Extensions screen; users can also add any other repository built from the
[extension template](https://github.com/codertheory/Mangasteen-extension-template).

## What belongs here

Only sources for platforms whose terms permit third-party clients. Every source documents its
basis below, and any source without one is out of scope for this repository — that is the point
of it. Nothing is bundled into the app: the app fetches this repository exactly like any other.

| Source | Basis | Content policy |
| --- | --- | --- |
| `mangadex` | [MangaDex public API](https://api.mangadex.org/docs/); MangaDex explicitly allows third-party clients subject to its API rules (descriptive User-Agent, rate limits, no ads, credit scanlation groups). | `pornographic` rating is never requested. `erotica` is tagged **Adult** and `suggestive` tagged **Suggestive** so the app's Spicy Filter can hide them. Licensed titles that only carry external (publisher) chapters show an empty chapter list. |
| `pepper-and-carrot` | [Pepper&Carrot](https://www.peppercarrot.com) by David Revoy, [CC BY 4.0](https://www.peppercarrot.com/en/license/index.html); the site documents a public [episode index and image paths](https://www.peppercarrot.com/en/documentation/130_API.html) for apps. | All ages. English only: one series, one chapter per episode. The author prohibits AI derivation; pages are shown unmodified. |
| `xkcd` | [xkcd](https://xkcd.com) by Randall Munroe, [CC BY-NC 2.5](https://xkcd.com/license.html); the author documents a [JSON interface](https://xkcd.com/json.html) for automated use, and `robots.txt` allows the archive and comic pages. | All ages. One series, one chapter per comic. Non-commercial licence: keep the app free of ads and paid features for this source. |

## Credits and attribution

- **Pepper&Carrot**: "Pepper&Carrot by David Revoy, www.peppercarrot.com, CC BY 4.0"
  (<https://creativecommons.org/licenses/by/4.0/>). Webcomics, translations and artworks are CC BY 4.0
  unless noted otherwise; the author states that AI derivation is prohibited. Licence page:
  <https://www.peppercarrot.com/en/license/index.html>. Each episode's final page is its credits page
  and is always included. Three episode pages are animated GIFs the index does not flag (`GIF_PAGES` in
  `main.js`); when a new episode lands, probe its pages and update the list.
- **xkcd**: "xkcd.com by Randall Munroe, CC BY-NC 2.5" (<https://creativecommons.org/licenses/by-nc/2.5/>).
  Free to reuse non-commercially with credit and a link back (<https://xkcd.com/license.html>). Alt text
  is not exposed (the chapter list comes from one archive request; alt text is only in each comic's JSON).

## Layout

```
sources/<id>/main.js          the source (plain JS, runs in the app's QuickJS sandbox)
sources/<id>/extension.json   manifest: name, version, hostAllowlist, rate limit, cache policy
sources/<id>/icon.png         bundled icon
sources/<id>/fixtures/        recorded HTTP responses + golden outputs for offline tests
tools/record-fixtures.js      re-records fixtures from the live API
```

## Signing

Every `main.js` is Ed25519-signed against [`publickey.pem`](./publickey.pem) at the repo root (the
same key as the community repo). The app verifies the signature on every sync and rejects a
source whose signature doesn't match, so **after editing any `main.js`, run `npm run sign` before
committing** (private key: `~/.mangasteen-signing-key.pem`, or `MANGASTEEN_SIGNING_KEY`).

## Developing

```bash
npm install
npm run local        # run the source against the live API
npm test             # replay recorded fixtures offline and compare to golden outputs
npm run typecheck    # check main.js against the host contract (host-globals.d.ts)
npm run record       # re-record fixtures after changing request URLs; commit the result
npm run sign         # re-sign sources/*/main.js (required after any main.js change)
```

Bump `version` in `extension.json` on every change — the app uses it to detect updates.

## index.json

`index.json` at the repository root lists every source in `sources/`: its path, name, version, the files in its folder and a hash of those files. Mangasteen reads it from `raw.githubusercontent.com`, so a refresh takes one request and only downloads the sources whose hash changed. Folders such as `fixtures/` are not listed and never downloaded.

After changing a source, run `npm run index` to regenerate the file and commit it. `npm run sign` runs the index step after signing, so the signature files are included in the hash. A GitHub Actions check fails when the committed `index.json` does not match a fresh run.

## License

MIT, same as the template. Source scripts talk to third-party services under those services'
own terms; see the table above.

## Contact

Questions about a source or this repository: support@codertheory.dev.
