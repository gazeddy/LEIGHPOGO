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

## Local schema development

When intentionally changing the Prisma schema during development:

```bash
npx prisma migrate dev
```

Do not use `prisma migrate reset` against the production database.
