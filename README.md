# LEIGHPOGO

## Database layout

Trainer team and friend-code data belongs to the `Entry` model. The `User` model contains authentication and ownership data only.

The Prisma schema and migration history now describe the same layout:

- `User`: account identity, password, role and relations
- `Entry`: trainer name, friend code and team
- `SearchString`: saved searches
- `PokedexEntry`: per-user Pokédex records

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
