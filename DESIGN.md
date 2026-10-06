# Rediscovery, ten photos at a time

Today opens directly into a single, full-frame photograph. The continuous media surface has restrained framing; capture metadata and a short selection reason sit outside the image. Favorite, Pass, Later and Undo stay in a predictable place. Immich's UI components and color tokens provide the interface rather than generated mockups. Progress and connection settings are secondary views.

## Observations from sampled commits

These are observations about the sampled code, not claims of authorship or priority.

- [Immich Contact, 179c553](https://github.com/wispdevon/immich-contact/commit/179c553): `public/styles.css` imports Instrument Serif, Manrope and DM Mono; film controls use a paper-toned background and canvas choices include white, gray and black. The album composition preserves photographic care. Retain full-frame presentation here; serif headings, paper palette and acid accents belong to its print-composition context rather than everyday review. These broader palette/layout observations also use the files at that revision, not only changed lines.
- [Spotiverse, 9b5a4a3](https://github.com/wispdevon/Spotiverse/commit/9b5a4a3): `src/style.css` gives both `.lyrics-shell` and `.carousel` the same #303030 surface, removes borders and radii, and sets margin to zero. Adopt that continuous media surface and restrained framing.
- [Sharply, 8c98f29](https://github.com/wispdevon/sharply/commit/8c98f29): `GearCardSkeleton` reserves an aspect-video image region and metadata rows; the trending heading moves outside Suspense. Retain stable loading geometry. Its nested rounded catalog-card surfaces and price fields serve browsing; simplify them for one photograph.

## Workflow and invariants

Six older photos, three recent photos, one deferred photo; fill shortages from eligible samples. Pass cools down 90 days and Later seven days. A decision advances only after persistence and, for Favorite, a confirmed Immich save. Undo checks external favorite state. Counts derive from successful non-undone decisions; empty sessions do not earn streak days. SQLite preserves unfinished sessions across restarts and calendar days. Dates use TZ (Asia/Bangkok by default).

The server owns credentials and proxies previews. Deploy behind a private network or authentication proxy. No notifications, AI ranking or multiple profiles in this version.

## Sidebar integration

The subsequent user request extends the app into Immich: an entry directly after Sharing opens review within the existing main area. Retain the Immich header/sidebar and suppress the companion brand/footer while embedded. Today, Progress and Settings remain available inside the view. Follow the parent theme when set to System, restore the original view on navigation, and close the mobile sidebar after opening. The server gateway preserves original Immich routes and uses the existing owner session to authorize the companion.
