# East v. West: 13-logo draft broadcast asset system

Development branch: `feature/draft-broadcast-materials-v1`. Not merged or production released.

## Verified source assets

The filenames below were checked against the GitHub repository's existing binary files, not inferred from colors or team names. All 13 resolve. Do not add copies of these PNGs or Epic/Fab source materials to the repository.

| Current franchise | Existing source filename |
|---|---|
| Belltown Raptors | `Belltown Raptors logo.png` |
| Double Trouble | `Double Trouble logo22.png` |
| Elemental Heroes | `Elemental Heroes Logo.png` |
| Mt. Lebanon Cake Eaters | `Cake Eaters Logo Final Version (1)-transparent.png` |
| Belleview Badgers | `Belleview Badgers Primary Logo-transparent.png` |
| BeerNeverBrokeMyHeart | `Beer Never Broke My Heart Logo.png` |
| Detroit Dawgs | `Detroit Dawgs Logo.png` |
| bop pop | `bop pop logo.png` |
| Cascade Marauders | `Cascade Marauders Logo.png` |
| Red Pandas | `Red Pandas Primary Logo (2).png` |
| The Lone Ginger | `Lone Ginger Logo-transparent.png` |
| Bimg Bamg Boomg | `Bimg Bamg Boomg Logo .png` |
| East v. West (league) | `Official East v. West Logo.png` |

Root folder: `public/assets/teams/East v West Logos/`. The current canonical `TEAM_NAMES` list includes Cascade Marauders. Old `Minshew's Maniacs` and `Gardner's Ghost` names resolve to the Cascade logo as historical aliases; **these are not two additional franchises**.

## Architecture

- `src/lib/constants/broadcast-logos.ts`: single canonical manifest, league emblem URL, optional event-logo priority and historical aliases.
- `src/lib/utils/team-utils.ts`: existing public `getTeamLogoPath()` now delegates to this shared mapping; callers outside draft continue working.
- `src/components/draft-overlay/teams.ts`: legacy draft-team adapter also delegates, eliminating outdated direct filename generation.
- `src/components/draft-overlay/BroadcastLogoBadge.tsx` and `.module.css`: reusable lightweight decorative 3D-styled board, clock, hero and watermark logos. Fallback initials if an image cannot load.
- `src/components/draft-overlay/DraftPick3DStage.tsx`: actual WebGL2 3D plaque textured from the **same existing team logo URL** in the hero pick animation, with geometric badge thickness and stage lighting.

CSS pseudo-3D is used for repeated board cells to avoid dozens of WebGL contexts. The large selection reveal uses a real 3D geometry object.

## Integrated surfaces

- Live draft board: all team cells show a consistent framed badge
- Main clock: league/event insignia, current drafting team, next teams
- On-the-clock presentation: compact information bar and broadcast version
- Draft-pick reveal: true textured 3D hero badge
- Trade animation: event/league intro, alert, and team comparison presentation
- Round-open and round-close transitions: event logo if configured, otherwise league mark
- Board watermark: event logo if configured, otherwise league mark

The draft's administrator-configured `eventLogoUrl` still overrides the league mark where present. No draft pick state, transactions, clock timing, or selection logic was modified for this asset migration.

## Verification

- All 13 existing binary source paths were located in the GitHub repository. Some large files return a SHA without inline base64, but their paths and blob identifiers were found.
- A new `tests/broadcast-logo-catalog.test.ts` test checks the canonical 12, the league mark, real local files, old aliases and event overrides.
- **Test has been committed but not executed in a complete local project checkout.**
- Full Next.js/TypeScript build, GSAP integration, screen-size/contrast review and hardware WebGL2 rendering still require verification before merge.
- No production deployment initiated. Vercel preview deployments were disabled at the project level during the earlier work, but verify that policy before further branch writes.

## Fidelity and future work

The 13 logos are all reusable, and their appearance is coordinated across the draft setup. This is **not** 13 individually hand-modelled/extruded logo silhouettes; they are existing PNG artwork on a real 3D plaque for the main cinematic reveal, and framed 2.5D CSS badges elsewhere. Do not introduce 48 WebGL canvases to the board or claim Epic's Unreal materials/particles have been ported in full.

The Epic research remains privately archived in ChatGPT Library at `/East v West/Broadcast Research/`.
