# Validation evidence

Validated on 2026-10-07 with Node 22, pnpm 10.18.3, the production SvelteKit Node build, and Playwright Chromium. The in-app Browser runtime initialized but returned `Browser is not available: iab`; its browser list was empty. Playwright was used as the fallback permitted by the frontend builder skill.

## Automated checks

| Check                                | Result                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| Prettier formatting                  | Pass                                                        |
| Svelte/TypeScript checks             | Pass, zero errors and warnings                              |
| Focused unit and transport tests     | Pass, 31 tests                                              |
| Production build                     | Pass                                                        |
| Browser workflow                     | Pass, production build plus HTTP Immich fixture             |
| Docker Compose configuration         | Pass with placeholder fixture values                        |
| Live Immich server                   | Read-only connection, search and previews verified on 3.2.0 |
| Docker image build and container run | Integrated images built and running healthy on ARM64        |

Node 22 emits its expected experimental SQLite warning. Vite treats `node:sqlite` as an external built-in for the server bundle; the production Node server exercised it successfully in browser tests. These are server build/runtime notices, not browser app errors.

## Focused coverage

`tests/service.test.ts` covers 6/3/1 quotas, duplicate candidates, distinct capture days, missing categories, small/empty libraries, visibility exclusions, local midnight and leap-year boundaries, cooldown expiry, SQLite reopening, favorite writes, denied writes, retry deduplication, applied timeouts, unsent interrupted writes, external changes, deletion, concurrent operations, small-batch completion, streak boundaries, completion after midnight and local persistence failures.

`tests/transport.test.ts` checks v3.2 random-filter contracts, exact boolean favorite updates, a server-only API key header, and sanitized transport/configuration errors.

## Browser evidence

The tested flow was **Today → preview failure/retry → denied Favorite → successful retry → Undo → keyboard Favorite → Later → refresh/resume → Settings/theme/connection → mobile review → completion → Progress → Undo completion**.

| Browser check                             | Evidence                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page identity                             | Title and Today heading match the application at http://127.0.0.1:4310                                                                                                                                                    |
| Meaningful content / no framework overlay | Photograph, metadata, navigation and actual Immich buttons rendered; all workflow assertions passed                                                                                                                       |
| Console health                            | No uncaught errors or unexpected console errors; deliberately injected HTTP 503 preview and 403 save failures are expected                                                                                                |
| Preview framing                           | Loaded natural image dimensions; computed `object-fit: contain`                                                                                                                                                           |
| Interaction proof                         | Decision totals progress from 0 to 10; denied write keeps 0; Undo removes a decision and restores remote favorite; Progress shows 10 reviewed, 1 favorite, 1 streak day                                                   |
| Desktop                                   | 1440 × 1000, light and dark screenshots visually inspected                                                                                                                                                                |
| Mobile                                    | 390 × 844, no horizontal overflow; photo, metadata and two-column touch controls visually inspected                                                                                                                       |
| Keyboard / accessibility                  | F shortcut and Tab focus verified; native buttons support Enter/Space, visible focus and 48px control height                                                                                                              |
| Themes / motion                           | Light, dark and live system-theme changes asserted; reduced-motion media enabled in the test                                                                                                                              |
| Credential boundary                       | Today response excludes API key and upstream credential headers; client build scan excludes credential values and upstream authentication headers (environment variable names intentionally appear in setup instructions) |
| Mutation boundary                         | Cross-origin JSON mutation rejected with 403; invalid payload rejected with 400                                                                                                                                           |

## Visual review

The user's specification explicitly opts out of generated mockups and calls for actual Immich components. Visual verification therefore uses the specification and the sampled-commit evidence in `DESIGN.md`, rather than an image-generated concept.

Five inspected details: full photograph framing with no crop; continuous neutral media surface; actual Immich button shape/colors in both themes; readable date/location and selection reason outside the photograph; stable desktop layout and mobile controls without overflow. The active navigation is highlighted. The initial muted heading and incorrect dark palette were corrected to use Immich's theme-aware neutral tokens. Capture metadata in screenshots is fictional fixture data.

Committed screenshots use NASA's Earthrise image AS08-14-2383. Production never stores photo files. Default tests use a deterministic SVG and need no network image download. The screenshots are repeatable with `FIXTURE_PHOTO=/path/to/earthrise.jpg pnpm test:browser`.

- [Today desktop](screenshots/today-desktop.png)
- [Today dark](screenshots/today-dark.png)
- [Today mobile](screenshots/today-mobile.png)
- [Completion mobile](screenshots/completed-mobile.png)
- [Progress mobile](screenshots/progress-mobile.png)

## Remaining verification

Read-only random search and preview access succeeded against a configured Immich 3.2.0 instance. This exposed a runtime compatibility restriction absent from the schema-only check: deprecated `withDeleted` cannot be combined with `filter`. Removed that option and strengthened the fixture and transport regression checks. Trash remains excluded through the new `trashedAt` filter. Exercise Favorite and Undo against the live instance through the review UI; validation did not change any live photo. The integrated Docker images run on ARM64; the existing SQLite history was migrated into a Node-owned persistent volume and survives gateway recreation. Other browsers and large live libraries have not been tested. Run a single app instance per SQLite database. Immich's verified favorite endpoint has no conditional-update argument, so external changes between the last read and write remain a race; recovery treats an already-matching target favorite boolean as success.

## Embedded sidebar verification

The gateway suite covers HTML injection, anonymous and other-account rejection, owner authorization, unchanged request methods/paths, binary proxying and raw WebSocket upgrade/traffic and rejection of network-path proxy targets. The integration browser test covers the entry immediately below Sharing, an embedded Favorite and Progress count, theme synchronization, original content restoration, back/forward, mobile sidebar dismissal, refresh/resume and logout cleanup. Both production builds pass.

- [Integrated desktop](screenshots/integrated-desktop.png)
- [Integrated mobile](screenshots/integrated-mobile.png)

The deployed ARM64 gateway passes owner-authenticated connection and batch reads; unauthenticated companion access returns 401. Its sidebar injection is verified through the Pi's Caddy and LAN gateway. The public workstation Caddy change is prepared and awaits local administrator access. Real browser-session rendering and live Favorite/Undo remain unverified; browser interaction evidence uses fixtures and no live assets were modified during validation.
