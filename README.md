# LEIGHPOGO

## Database layout

Trainer team and friend-code data belongs to the `Entry` model. The `User` model contains authentication and ownership data only.

The Prisma schema and migration history now describe the same layout:

- `User`: account identity, password, role and relations
- `Entry`: trainer name, friend code and team
- `SearchString`: saved searches
- `PokedexEntry`: per-user Pokédex records

## Rehearsing the V3-to-V4 primary migration (no cutover)

Once the gift claim audit migration is deployed to V4, run the *read-only*
migration rehearsal from the V4 branch:

```bash
cd /projects/V4 && git pull --ff-only origin v4 && python3 scripts/rehearse-v4-migration.py
```

The Python script reads the SQLite `DATABASE_URL` from each checkout
(default `/projects/V4` and `/projects/LIVE`; relative paths resolve
against each checkout's `prisma/` directory), takes **online SQLite
backups** of both databases, and creates a **disposable V4-primary candidate**
from the V4 snapshot. It invokes `scripts/merge-v3-into-v4.py` against the
candidate only. Neither active database is migrated, swapped, modified or
restored, and neither systemd service is stopped or restarted.

The rehearsal checks SQLite integrity and foreign keys, validates V4
accounts are unchanged, and verifies unchanged `GiftBatch`, `GiftCode`,
and `GiftClaimAudit` tables. It saves `merge-report.json` and
`rehearsal-status.json` under:
`/projects/backups/leighpogo/v4-rehearsals/rehearsal-<timestamp>-<pid>/`.

**Approved one-player consolidation:** This rehearsal explicitly recognises
`Pigtailedboxer` from V4 account IDs `8` and `39`, and V3 account
IDs `8` and `35`, as the same trainer. Only on the disposable candidate,
it keeps V4 user `8`, moves V4 account `39`'s linked records to that
account, maps V3 IDs `8` and `35` to it, and sets the surviving role to
`admin` (because V3 user `35` is a confirmed administrator). It retains
the existing V4 user `8` password hash; the administrator can reset the
password separately. The independent gift claim audit's historic original
account IDs remain unmodified. This is an exact-ID allowlist, not a general
rule to silently combine similarly named accounts. Unresolvable unique-data
conflicts stop the rehearsal rather than discard data.

**Second approved consolidation:** `Bigjewnine` is also confirmed as
one player. The rehearsal discovers the matching V3/V4 account IDs from
fresh SQLite snapshots, and accepts at most three case/space-insensitive
matches in either source. It requires matching accounts in both sources,
preserves the lowest existing V4 account ID and its password, remaps other
V4 account references and every matching V3 source ID, and retains admin
privileges if an approved record already has them. It validates the exact
surviving ID, the complete existing V4 user rows, issued gift-code
allocations and the unchanged gift audit. Unexpected counts, revoked
accounts, ownership-uniqueness conflicts or other unexpected IGNs abort
rather than silently changing accounts. All consolidation is performed on
the *disposable* rehearsal candidate only.

**Conflicts fail closed.** Overlapping users with different passwords or
roles need manual ownership review before repeating the rehearsal with
`--allow-password-conflicts`, which keeps V4 credentials and roles.
Missing tables, unknown populated V3 tables, or other incompatible schema
also stop the rehearsal for explicit resolution. A failed rehearsal does
not touch either production or development database. Do not attempt the
actual cutover until the report is reviewed and conflicts addressed.

Useful overrides: `--v3-dir`, `--v4-dir`, `--v3-db`, `--v4-db`,
`--backup-root`; database overrides must still point *inside* their
respective checkouts. The process must have read permission for both
SQLite databases and write access to the backup destination. This
rehearsal does not yet merge non-SQLite runtime content (uploaded guide
images, event overrides, gym files), so those must be handled by the
subsequent production cutover procedure.

## Promoting tested V4 to LIVE

**Destructive production operation — requires a recent successful rehearsal and a
maintenance window.** The dedicated V4 cutover script is
`deploy/promote-v4-to-live.sh`; never run the old V2 cutover script for V4.
It requires the two explicit arguments `--activate --allow-password-conflicts`
to make the choice to retain V4 credentials explicit. It accepts no arbitrary
database or service paths. Verify production's `leighpogo.service` launches
the LIVE checkout on port 3000 before using it.

From the V4 checkout:

```bash
cd /projects/V4 && git pull --ff-only origin v4 && bash -n deploy/promote-v4-to-live.sh && sudo bash deploy/promote-v4-to-live.sh --activate --allow-password-conflicts
```

The cutover checks for current GitHub V4 source, clean checkouts, both running
services and distinct SQLite paths. It stops *both* sites before taking final
validated SQLite snapshots, saving complete runtime `data`, `content` and
`public/uploads` trees and both `.env` files under
`/projects/backups/leighpogo/v4-cutovers/`. It reruns the approved V4-primary
merger on a copy of those final snapshots, verifying gifts and audit records
remain intact, and retains a JSON merge report. Password conflicts preserve
V4 credentials. The existing V4 accounts and IDs take precedence; approved
case-insensitive account consolidations remain limited to the known players.

Only after a valid candidate exists does it switch the LIVE checkout to the
exact V4 Git commit, create a production environment from the tested V4 one
(with `NEXTAUTH_URL=https://leighpogo.co.uk` and the *existing LIVE database
path*), install/test/build V4, install the merged candidate DB, overlay
runtime files V4-first (V3-only paths retained), validate Prisma status,
and check the production HTTP endpoint. Errors trigger a best-effort rollback
of LIVE code, database, runtime files and environment from saved snapshots,
plus restoration of both original services. **Verify a restored site manually
after an error.** A rollback can never guarantee recovery from external
writes or effects outside these directories.

On success, `leighpogo-test.service` remains **stopped** to prevent
new signups and gift claims on a now-stale development database. The original
V4 database remains untouched and backed up. Redirect the old V4 test
hostname to the production site and generate fresh QR codes so community
scans continue working; a test-host QR link will otherwise fail. Review
production secrets, push credentials, Cloudflare tunnels and other
external configuration before starting. The production source checkout is
left detached at the verified V4 commit; the GitHub `main` branch is **not**
automatically changed. Promote or reconcile `main` as a separate,
post-verification operation so a future LIVE deployment does not revert V4.

## V4 updates with automatic SQLite backup

For the V4 development service only, run:

```bash
cd /projects/V4 && bash deploy/update-v4.sh
```

The script resolves `DATABASE_URL` from the V4 environment, confirms the
database file belongs to `/projects/V4`, and uses Python's SQLite online
backup API to take a consistent snapshot while the site is running. It runs
`PRAGMA integrity_check` on the snapshot and **aborts before updating code
or applying Prisma migrations** if the backup is missing or invalid.

Backups default to `/projects/backups/leighpogo/v4-updates` with restricted
permissions and timestamped names. The verified snapshot is retained even
when a subsequent update step fails; no automatic deletion or rotation is
performed. Set `BACKUP_DIR` to a different writable location if needed.

After the backup, the script pulls the `v4` branch with fast-forward-only,
runs `npm ci`, applies committed Prisma migrations, regenerates the client,
runs tests and the build, then restarts **only**
`leighpogo-test.service`. It stops immediately on errors. No automatic
database rollback is attempted, because applying a rollback safely may
require stopping the service and reconciling any subsequent writes.
Restore from a snapshot only after stopping the service and checking the
required recovery steps.

For the initial installation of this script, pull the `v4` branch once
to obtain the file; merely pulling code does not run migrations. After that,
use the single command above for future V4 updates.

## Installing application updates

Installing dependencies regenerates the Prisma client but does **not** apply database migrations automatically:

```bash
npm ci
npm run build
```

This makes normal code-only deployments safe for the existing SQLite database.

## Checking database migration status

Run this before applying any database migration:

```bash
npm run db:status
```

## Applying approved migrations

Database migrations are now an explicit deployment step:

```bash
npm run db:deploy
```

Take a SQLite backup before applying a new migration in production. `db:deploy` only applies migration files already committed to the repository; it does not create migrations or reset the database.

## V2 LIVE cutover

The V2 cutover must preserve data entered into both the current LIVE site and the TEST/DEV V2 site. Do not replace the LIVE SQLite database with the TEST database and do not manually combine numeric user IDs.

After the final `develop` revision has been merged into `main`, run the tracked cutover script from the up-to-date TEST checkout:

```bash
sudo bash deploy/migrate-v2-to-live.sh
```

Defaults:

- LIVE checkout: `/projects/LIVE`
- TEST/DEV checkout: `/projects/TEST`
- LIVE service: `leighpogo.service`
- TEST service: `leighpogo-test.service`
- SQLite database in each checkout: `prisma/prisma/dev.db`
- Cutover backups: `/projects/backups/leighpogo/v2-cutover-<timestamp>`

The script fetches current GitHub refs and aborts unless TEST is exactly at `origin/develop` and that develop revision is already contained in `origin/main`. Immediately before database migration it stops both services, checkpoints SQLite and takes final `.backup` snapshots of both databases, plus the runtime event/gym JSON, guide Markdown, guide uploads and LIVE environment file. This makes the snapshots the freshest consistent data available from both running sites.

It never tests Prisma migrations against the real LIVE database. Instead it:

1. creates a candidate database from the final LIVE snapshot;
2. applies the committed Prisma migrations to that candidate;
3. matches users by case-insensitive IGN, never by numeric ID;
4. keeps LIVE account/password/role data authoritative;
5. unions Pokédex progress from LIVE and DEV;
6. merges friend-code entries, saved searches, trade listings/items, wanted trades and trade notifications for users present in both databases;
7. merges Pokémon availability/regional overrides plus runtime event overrides, event-type rules, local events and gym state;
8. overlays DEV guide content/uploads onto the preserved LIVE copies;
9. runs SQLite `integrity_check` and `foreign_key_check`;
10. swaps the validated candidate into LIVE only after all checks pass.

DEV-only accounts are reported and deliberately skipped so test accounts are not silently created in production. A merge report is saved alongside the snapshots. If the cutover fails after LIVE has been changed, the script restores the pre-cutover LIVE database/code/runtime data and returns the services to their previous running state.

The script requires `git`, `npm`, `python3`, `sqlite3`, `rsync` and `systemd` on the server. Environment/path overrides are available through `LIVE_DIR`, `DEV_DIR`, `LIVE_DB`, `DEV_DB`, `LIVE_SERVICE`, `DEV_SERVICE` and `BACKUP_ROOT`.

## Local schema development

When intentionally changing the Prisma schema during development:

```bash
npx prisma migrate dev
```

Do not use `prisma migrate reset` against the production database.

## Guide image storage

Admin guide images are stored under `public/uploads/guides` by default. The folder contents are ignored by Git so `git pull`, `npm ci` and application builds do not remove uploaded pictures. Back this directory up alongside the guide Markdown files. Set `GUIDE_UPLOADS_DIRECTORY` and `GUIDE_UPLOADS_URL_PREFIX` only when using a different persistent storage location.

## Renaming the systemd services

After deploying this update, rename and verify both application services with:

```bash
sudo bash deploy/rename-systemd-services.sh
```

The script starts and verifies `leighpogo.service` and `leighpogo-test.service` before disabling and deleting `pokego-backend.service` and `pokego-test.service`. If a replacement fails to start, the old service is left in place.
