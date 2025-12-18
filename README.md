# LEIGHPOGO

## Updating the database for new user fields
The latest schema adds `team` and `friendCode` to the `User` model. Apply the Prisma migration so your database includes these columns:

### Local development
1. Install dependencies (installs Prisma CLI):
   ```bash
   npm install
   ```
2. Apply migrations and regenerate the client against your development database:
   ```bash
   npx prisma migrate dev
   ```
   This runs the pending migration (e.g. `20251218154957_add_team_and_friendcode`) and updates `node_modules/@prisma/client`.

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
Set `team` to `"MYSTIC" | "INSTINCT" | "VALOR"` and `friendCode` to a sanitized string matching the new schema constraints.
