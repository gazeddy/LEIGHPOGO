# V4 permanent promotion (dev sign-ups are real accounts)

**Important:** V4, not V3, is the primary account and QR gift-code database. The previous V3 promotion script is not suitable; it skips dev-only accounts.

## Architecture after cutover

- `https://leighpogo.co.uk` → existing Cloudflare production route → port 3000 → `leighpogo.service` → `/projects/LIVE` checked out from V4 code, serving the merged V4-primary SQLite DB.
- `https://dev.leighpogo.co.uk` → existing test Cloudflare route → port 3001 → `leighpogo-test.service` running a **redirect-only** Node HTTP service; redirects to the production hostname with path and query intact. No second writable database.
- `/projects/V4/prisma/dev.db` is retained untouched as a frozen, pre-cutover reference. **Do not start the old test web app again** without first establishing that its data will not fork from production.

The merged database retains every V4 `User.id`, V4 hashed password, V4 `GiftBatch`, V4 `GiftCode`, gift claim owner, and claim timestamp. It adds V3-only users and remaps all supported user, entry, trade and notification IDs. Every V3 table with data must have an explicit merge policy; otherwise the merge aborts. Matching IGN accounts keep V4 credentials and role; conflicting password hashes or roles stop the merge until reviewed. The `--allow-password-conflicts` option is **not** a substitute for verifying that two same-IGN accounts belong to the same person.

## Preconditions

- Review whether test gift batches/codes should be removed *before* starting; never discard legitimately claimed codes by accident.
- Ensure both services currently work and the Cloudflare tunnel still points the two hostnames to ports 3000 and 3001 respectively.
- Check `/projects/LIVE` and `/projects/V4` really hold the SQLite DBs at `prisma/dev.db`, not nested `prisma/prisma/dev.db`.
- Avoid concurrent deployments while promoting. Notify users of a brief maintenance window.
- Review the 7 `main`-only commits vs the V4 branch before concluding all past hotfixes are present (GitHub branches have diverged). Do not merge `main` into V4 without reviewing conflicts.

## Rehearse without stopping either site

After the merge helpers have been committed to V4:

```bash
cd /projects/V4 && git pull --ff-only origin v4
sudo bash deploy/promote-v4-from-dev.sh --check
```

The check takes SQLite snapshots while the sites remain online, migrates the snapshots in the private backup directory, imports V3 data into a disposable V4 candidate and validates account counts, gift-code fingerprints, integrity and foreign keys. No production or dev site data is modified. It prints the location of `merge-report.json`; review any `v4_prioritised_differences` counts and any role/password conflicts before proceeding.

If an IGN has different credentials between sites, **stop and verify account ownership**. Only after verifying an intentional same-user collision may you pass `--allow-password-conflicts`; this keeps V4 credentials and privileges for matched IGN accounts.

## Promote (maintenance window)

```bash
cd /projects/V4 && git pull --ff-only origin v4
sudo bash deploy/promote-v4-from-dev.sh --promote
```

This stops *both* web services for fresh backups, upgrades a disposable V3 snapshot, merges into a disposable V4 candidate, builds V4 in `/projects/LIVE`, swaps only the production DB, and runs health checks. It sets the production systemd start command to `npm run start:live` (port 3000) and replaces the old test service with an HTTP redirect on port 3001. Original V3 and V4 SQLite backups, runtime files, production `.env`, systemd overrides and Git commit hashes are retained under `/projects/backups/leighpogo/v4-from-dev-<timestamp>`.

If anything fails during promotion, the script attempts to restore the previous live code/database and both pre-cutover services. **Do not run an old-style rollback after members start using V4 production:** it would discard post-promotion sign-ups/claims unless those changes were reconciled first.

## Verify after promotion

1. Visit `https://leighpogo.co.uk` and confirm the V4 pages load.
2. Sign into one account created only on the V4 dev site, and one created only on the original V3 live site; passwords should be unchanged for each respective site.
3. Confirm existing V4 gift batches and their claimed/unclaimed counts, the QR claim link, the 24-hour claim restriction and the unique per-account redemption link.
4. Scan an **older printed QR** using `dev.leighpogo.co.uk` and verify it redirects to the equivalent claim path under `leighpogo.co.uk`, including query parameters. Old dev-domain authentication cookies and push subscriptions cannot be transferred across website origins automatically: members may need to sign in again and enable notifications anew.
5. Inspect trade boards, friend codes, Pokédex, manual event cards, guides, gym aliases and admin roles.
6. Check Cloudflare tunnel routing and external HTTPS, then inspect `journalctl -u leighpogo.service -n 100 --no-pager` and the redirect service logs.

## Further maintenance

`production-v4` in `/projects/LIVE` tracks `origin/v4`; normal production deployment must pull V4 rather than `main` until a reviewed Git branch consolidation. There is only one active application database after migration. Future development should use a **new isolated DB** seeded with anonymised content, not the retired real-user dev DB.
