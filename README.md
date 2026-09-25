# MangaSteen official sources

The default source repository for the [MangaSteen](https://mangasteen.codertheory.dev)
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

## Layout

```
sources/<id>/main.js          the source (plain JS, runs in the app's QuickJS sandbox)
sources/<id>/extension.json   manifest: name, version, hostAllowlist, rate limit, cache policy
sources/<id>/icon.png         bundled icon
sources/<id>/fixtures/        recorded HTTP responses + golden outputs for offline tests
tools/record-fixtures.js      re-records fixtures from the live API
```

## Developing

```bash
npm install
npm run local        # run the source against the live API
npm test             # replay recorded fixtures offline and compare to golden outputs
npm run typecheck    # check main.js against the host contract (host-globals.d.ts)
npm run record       # re-record fixtures after changing request URLs; commit the result
```

Bump `version` in `extension.json` on every change — the app uses it to detect updates.

## License

MIT, same as the template. Source scripts talk to third-party services under those services'
own terms; see the table above.

## Contact

Questions about a source or this repository: support@codertheory.dev.
