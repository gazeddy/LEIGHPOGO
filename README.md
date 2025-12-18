# LEIGHPOGO

## Updating the database for entry-based team data
The latest schema moves the `team` field to the `Entry` model (and removes `team`/`friendCode` from `User`). Apply the Prisma migration so your database reflects this layout:

### Local development
1. Install dependencies (installs Prisma CLI):
   ```bash
   npm install
   ```
2. Apply migrations and regenerate the client against your development database:
   ```bash
   npx prisma migrate dev
   ```
   This runs the pending migration (e.g. `20251218162628_move_team_to_entry`) and updates `node_modules/@prisma/client`.

### Production or deployed environments
The project already runs `prisma migrate deploy` during `npm install` (via `postinstall`). If you need to run it manually:
```bash
npx prisma migrate deploy
```
This applies any pending migrations without creating new ones.

### Seeding existing users (optional)
If you want default values for current users, add a seed script in `prisma/seed.js` and run:
```bash
npx prisma db seed
```
Set `team` on each entry to `"MYSTIC" | "INSTINCT" | "VALOR"` to match the new schema constraints.
