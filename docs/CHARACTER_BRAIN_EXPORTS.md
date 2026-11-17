# Mason and Westy: Portable Character Brains

## Where they live

The canonical Mason and Westy personalities, histories, reviews, source links and approved development live in the East v. West database and the Newsletter Admin Bot Brain Center.

Newsletter Admin > Personality > Bot Brain Center provides one-click downloads for the currently selected host and season.

Newsletter Admin > External Newsletter Writing Room shows all four weekly export controls in one place.

## Weekly workflow

1. In the External Newsletter Writing Room, select the season, week and episode type.
2. Download Mason Active Brain (.md) and Westy Active Brain (.md). Download them again after memory or approved-development changes.
3. Download the Compact Episode Source Pack (.json). This retains league facts, rosters, moves, draft, rules and targeted continuity, while excluding redundant, older host memory.
4. In ChatGPT, keep the Writing Room (.md) as project instructions. Upload the **two Active Brains plus the Compact Episode Source Pack** for each newsletter.
5. Write and review the newsletter, then upload the finished PDF to the website. Publication is a separate admin action, and publishing updates the character's retained memories for future exports.

There is no automatic access from ChatGPT to the website. Generating a new Active Brain file does not automatically modify a previously uploaded file.

## Active Brain vs. Full Brain

| Artifact | Purpose | Recommended usage |
| --- | --- | --- |
| Mason Active Brain (.md) | Current personality, distinct beliefs, approved lessons, voice examples, recent relationship summaries | Upload for regular newsletters |
| Westy Active Brain (.md) | Westy's separately attributed current identity, viewpoints and learning | Upload for regular newsletters |
| Compact Episode Source Pack (.json) | Current league facts and selected receipts relevant to a new issue | Upload with both Active Brains |
| Writing Room (.md) | Shared editorial rules, issue formats and writing discipline | Keep in ChatGPT project, refresh after changes |
| Mason Full Brain (.json) | Full currently retained 2026 character record, ledger, admin reviews and source issue manifest | Backup and occasional historical deep dive |
| Westy Full Brain (.json) | Same for Westy, without making Mason's history his own | Backup and occasional historical deep dive |
| Complete Episode Source Pack (.json) | Original full newsletter fact/continuity export | Deep-dive research and compatibility |

Active Brain files are deliberately limited, but they include source receipt IDs so an older take can be traced back.

## Limits and integrity

- Full means all *currently retained* brain data for that host and season. The underlying stored ledger is bounded, so it does not promise unlimited lifetime storage.
- The original newsletter PDFs are **not embedded** in Full Brain backups. They remain saved on the website and are linked through the published issue manifest.
- Downloads require the existing administrator cookie and cannot be accessed anonymously.
- Full Brain files may grow large. They are not designed to be uploaded for routine writing.
- The response includes an SHA-256 content digest in `X-Brain-Content-SHA256` for future backup verification.
- These are structured memory/prompt artifacts, not trained language-model weights, autonomous agents or model fine-tunes. Independent AI actions still require a model invocation.
- The exports never publish, grade, mutate, or send Discord messages.

## Technical routes

- `GET /api/admin/newsletter/brain-export?bot=mason&depth=active&format=md&season=2026`
- `GET /api/admin/newsletter/brain-export?bot=westy&depth=active&format=md&season=2026`
- `GET /api/admin/newsletter/brain-export?bot=mason&depth=full&format=json&season=2026`
- `GET /api/admin/newsletter/brain-export?bot=westy&depth=full&format=json&season=2026`
- `GET /api/admin/newsletter/external-export?kind=source-pack&packSize=compact&season=2026&week=10&episodeType=regular`
- `packSize=full` retains the existing complete Source Pack behavior.
