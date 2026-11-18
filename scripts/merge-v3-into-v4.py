#!/usr/bin/env python3
"""Safely merge a V3 SQLite snapshot into a *disposable* V4 candidate DB.

V4 accounts, numeric IDs, gift-code allocations and account credentials remain
primary. This tool will not run against either site's default dev.db file.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

TABLES = [
    "Entry", "SearchString", "PokedexEntry", "PokedexImportJob",
    "PokedexQueueAlert", "UserTickerPreference", "PrivacyAcceptance",
    "TradeListing", "TradeListingItem", "WantedTrade", "TradeNotification",
    "FriendCodeGrabNotification", "UsageEvent", "PushSubscription",
    "AccountRevocation", "PokemonAvailabilityOverride", "PokemonRegionalOverride",
    "RaidBossProfile", "RaidRotation", "SiteSetting",
]
IGN_KEY = lambda value: (value or "").strip().casefold()


def table_exists(db, table):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def table_cols(db, table):
    return {r["name"] for r in db.execute(f'PRAGMA table_info("{table}")')}


def db_rows(db, table):
    return db.execute(f'SELECT * FROM "{table}"').fetchall()


def fingerprint(db, table):
    if not table_exists(db, table):
        return None
    records = [dict(r) for r in db_rows(db, table)]
    records.sort(key=lambda v: json.dumps(v, sort_keys=True, default=str))
    return hashlib.sha256(json.dumps(records, sort_keys=True, default=str).encode()).hexdigest()


def insert(db, table, payload):
    keys = list(payload)
    if not keys:
        raise RuntimeError(f"Cannot insert empty {table} record")
    cols = ", ".join('"' + k + '"' for k in keys)
    placeholders = ", ".join('?' for _ in keys)
    db.execute(f'INSERT INTO "{table}" ({cols}) VALUES ({placeholders})', tuple(payload[k] for k in keys))
    return db.execute('SELECT last_insert_rowid()').fetchone()[0]


def key_for(table, r):
    if table == "Entry":
        digits = re.sub(r"\D", "", str(r["code"] or ""))
        return (r["ownerId"], "code", digits) if len(digits) == 12 else (r["ownerId"], "raw", r["trainerName"], r["code"])
    if table == "SearchString":
        return (r["ownerId"], r["title"], r["query"])
    if table == "PokedexEntry":
        return (r["ownerId"], r["dexNumber"])
    if table == "PokedexImportJob":
        return (r["ownerId"], r["createdAt"], r["totalImages"])
    if table == "PokedexQueueAlert":
        return (r["ownerId"],)
    if table == "UserTickerPreference":
        return (r["ownerId"], r["tickerType"])
    if table == "PrivacyAcceptance":
        return (r["ownerId"], r["policyVersion"])
    if table == "TradeListing":
        return (r["ownerId"], r["createdAt"], r["friendshipRequirement"], r["location"], r["notes"])
    if table == "TradeListingItem":
        return (r["listingId"], r["direction"], r["pokemonName"], r["shiny"], r["lucky"], r["xxl"], r["xxs"], r["costume"], r["background"], r["dynamax"], r["gigantamax"], r["notes"])
    if table == "WantedTrade":
        return (r["ownerId"], r["createdAt"], r["dexNumber"], r["pokemonName"])
    if table == "TradeNotification":
        return (r["ownerId"], r["listingId"], r["pokemonName"])
    if table == "FriendCodeGrabNotification":
        return (r["ownerId"], r["copiedById"], r["entryId"], r["createdAt"])
    if table == "UsageEvent":
        return (r["ownerId"], r["type"], r["createdAt"], r["path"], r["device"], r["metadata"])
    if table == "PushSubscription":
        return (r["endpoint"],)
    if table == "AccountRevocation":
        return (r["userId"],)
    if table in ("PokemonAvailabilityOverride", "PokemonRegionalOverride"):
        return (r["dexNumber"],)
    if table == "RaidBossProfile":
        return (r["key"],)
    if table == "RaidRotation":
        return (r["eventId"],)
    if table == "SiteSetting":
        return (r["key"],)
    raise RuntimeError(f"No merge policy for {table}")


def remap_fk(table, r, users, ids):
    # Always allocate fresh IDs for source-only records, never use source IDs.
    fk = {"ownerId": "User", "copiedById": "User", "listingId": "TradeListing", "entryId": "Entry", "userId": "User"}
    for col, referenced in fk.items():
        if col in r and r[col] is not None:
            if referenced == "User" and col not in ("ownerId", "copiedById", "userId"):
                continue
            if col == "userId" and table != "AccountRevocation":
                continue
            if col == "entryId" and table != "FriendCodeGrabNotification":
                continue
            if col == "listingId" and table not in ("TradeListingItem", "TradeNotification"):
                continue
            if col == "copiedById" and table != "FriendCodeGrabNotification":
                continue
            mapping = users if referenced == "User" else ids[referenced]
            if r[col] not in mapping:
                raise RuntimeError(f"Cannot remap {table}.{col} source ID {r[col]}: refusing data loss")
            r[col] = mapping[r[col]]
    return r


# Only this identity has been confirmed by the administrator.
# The source databases are never edited, only the disposable V4 candidate.
IDENTITY_KEY = "pigtailedboxer"
V4_ALIAS_IDS = {8, 39}
V3_ALIAS_IDS = {8, 35}
SURVIVOR_ID = 8
SAFE_MEMBERSHIP_KEYS = {
    "PokedexEntry": ("dexNumber",),
    "PrivacyAcceptance": ("policyVersion",),
    "UserTickerPreference": ("tickerType",),
    "PokedexQueueAlert": (),
}


# Second specifically authorised player. Resolve source IDs from actual
# snapshots rather than guessing their numbers. Never generalise to other IGNs.
SECOND_IDENTITY_KEY = "bigjewnine"


def identity_groups(db):
    groups = {}
    for row in db_rows(db, "User"):
        key = IGN_KEY(row["ign"])
        if not key:
            raise RuntimeError(f"Invalid IGN on user ID {row['id']}")
        groups.setdefault(key, []).append(row)
    return groups


def users_by_ign(db, label):
    result = {}
    for key, rows in identity_groups(db).items():
        if len(rows) > 1:
            actual = {row["id"] for row in rows}
            if key == IDENTITY_KEY:
                allowed = V4_ALIAS_IDS if label == "V4" else V3_ALIAS_IDS
                if actual != allowed:
                    raise RuntimeError(f"{label}: Pigtailedboxer IDs changed: {sorted(actual)}")
                survivor = SURVIVOR_ID
            elif key == SECOND_IDENTITY_KEY and len(rows) <= 3:
                survivor = min(actual)
            else:
                raise RuntimeError(
                    f"{label}: unapproved IGN collision for {key!r} "
                    f"with user IDs {sorted(actual)}"
                )
            result[key] = next(row for row in rows if row["id"] == survivor)
        else:
            result[key] = rows[0]
    return result

def user_fk_columns(db):
    result = {}
    for record in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ):
        table = record[0]
        columns = [
            item[3] for item in db.execute(f'PRAGMA foreign_key_list("{table}")')
            if item[2] == "User"
        ]
        if columns:
            result[table] = columns
    return result


def consolidate_v4_identity(db, report):
    primary = db.execute('SELECT ign FROM "User" WHERE id=?', (SURVIVOR_ID,)).fetchone()
    alias = db.execute('SELECT ign FROM "User" WHERE id=39').fetchone()
    if not primary or not alias or any(
        IGN_KEY(row["ign"]) != IDENTITY_KEY for row in (primary, alias)
    ):
        raise RuntimeError("Approved V4 identity IDs/IGNs changed; refusing merge")
    for user_id in V4_ALIAS_IDS:
        if db.execute('SELECT 1 FROM "AccountRevocation" WHERE userId=?', (user_id,)).fetchone():
            raise RuntimeError(f"V4 identity {user_id} has an account revocation; manual review needed")

    report["identity_consolidation"] = {
        "ign": IDENTITY_KEY, "survivor": SURVIVOR_ID, "absorbed_v4_id": 39,
        "mapped_v3_ids": sorted(V3_ALIAS_IDS), "password_kept_from_v4_id": SURVIVOR_ID,
        "role": "admin", "transferred": {}, "deduplicated_memberships": {},
    }
    result = report["identity_consolidation"]
    refs = user_fk_columns(db)
    for table, columns in refs.items():
        if table == "User":
            raise RuntimeError("Unexpected User self-reference")
        for column in columns:
            rows = db.execute(
                f'SELECT rowid AS _record_rowid, * FROM "{table}" WHERE "{column}"=?',
                (39,)
            ).fetchall()
            for row in rows:
                try:
                    db.execute(
                        f'UPDATE "{table}" SET "{column}"=? WHERE rowid=?',
                        (SURVIVOR_ID, row["_record_rowid"])
                    )
                    result["transferred"][table] = result["transferred"].get(table, 0) + 1
                except sqlite3.IntegrityError as exc:
                    if table not in SAFE_MEMBERSHIP_KEYS or column != "ownerId":
                        raise RuntimeError(
                            f"Unsafe collision in {table}.{column} for duplicate user 39: {exc}"
                        ) from exc
                    keys = SAFE_MEMBERSHIP_KEYS[table]
                    where = ' AND '.join(['"ownerId"=?'] + [f'"{key}"=?' for key in keys])
                    params = (SURVIVOR_ID,) + tuple(row[key] for key in keys)
                    existing = db.execute(
                        f'SELECT * FROM "{table}" WHERE {where}', params
                    ).fetchone()
                    if existing is None:
                        raise RuntimeError(f"Conflicting {table} row not found") from exc
                    if table == "UserTickerPreference" and row["enabled"] != existing["enabled"]:
                        raise RuntimeError("Conflicting ticker preferences; review manually") from exc
                    # Only duplicate owner-scoped memberships are discarded.
                    # The complete originals remain in the saved V4 snapshot.
                    db.execute(
                        f'DELETE FROM "{table}" WHERE rowid=?', (row["_record_rowid"],)
                    )
                    result["deduplicated_memberships"][table] = (
                        result["deduplicated_memberships"].get(table, 0) + 1
                    )
    for table, columns in refs.items():
        for column in columns:
            if db.execute(
                f'SELECT 1 FROM "{table}" WHERE "{column}"=39 LIMIT 1'
            ).fetchone():
                raise RuntimeError(f"Unmigrated user reference: {table}.{column}")
    db.execute('DELETE FROM "User" WHERE id=39')
    db.execute('UPDATE "User" SET role=? WHERE id=?', ("admin", SURVIVOR_ID))



def consolidate_second_identity(v4, live, report):
    v4_rows = identity_groups(v4).get(SECOND_IDENTITY_KEY, [])
    v3_rows = identity_groups(live).get(SECOND_IDENTITY_KEY, [])
    if not v4_rows or not v3_rows:
        raise RuntimeError("Bigjewnine must exist in both snapshots for approved identity mapping")
    if len(v4_rows) > 3 or len(v3_rows) > 3 or len(v4_rows) + len(v3_rows) < 3:
        raise RuntimeError(
            "Unexpected Bigjewnine account counts: V4={} V3={}; review IDs before merging".format(
                len(v4_rows), len(v3_rows)
            )
        )
    primary = min(v4_rows, key=lambda row: row["id"])
    survivor = primary["id"]
    duplicates = sorted((row["id"] for row in v4_rows if row["id"] != survivor))
    for row in v4_rows:
        if v4.execute('SELECT 1 FROM "AccountRevocation" WHERE userId=?',
                      (row["id"],)).fetchone():
            raise RuntimeError(f"Bigjewnine V4 account {row['id']} is revoked; manual review required")
    if table_exists(live, "AccountRevocation"):
        for row in v3_rows:
            if live.execute('SELECT 1 FROM "AccountRevocation" WHERE userId=?',
                            (row["id"],)).fetchone():
                raise RuntimeError(f"Bigjewnine V3 account {row['id']} is revoked; manual review required")

    has_admin = any(row["role"] == "admin" for row in v4_rows + v3_rows)
    role = "admin" if has_admin else primary["role"]
    summary = {
        "ign": SECOND_IDENTITY_KEY,
        "survivor": survivor,
        "absorbed_v4_ids": duplicates,
        "mapped_v3_ids": sorted(row["id"] for row in v3_rows),
        "password_kept_from_v4_id": survivor,
        "role": role,
        "transferred": {}, "deduplicated_memberships": {},
    }
    report["second_identity_consolidation"] = summary
    for duplicate in duplicates:
        move_user_references(v4, duplicate, survivor, summary)
        v4.execute('DELETE FROM "User" WHERE id=?', (duplicate,))
    if has_admin and primary["role"] != "admin":
        v4.execute('UPDATE "User" SET role=? WHERE id=?', ("admin", survivor))
    return survivor, duplicates, [row["id"] for row in v3_rows]


def move_user_references(db, duplicate, survivor, report):
    refs = user_fk_columns(db)
    for table, columns in refs.items():
        if table == "User":
            raise RuntimeError("Unexpected User self-reference")
        for column in columns:
            rows = db.execute(
                f'SELECT rowid AS _record_rowid, * FROM "{table}" WHERE "{column}"=?',
                (duplicate,)
            ).fetchall()
            for row in rows:
                try:
                    db.execute(
                        f'UPDATE "{table}" SET "{column}"=? WHERE rowid=?',
                        (survivor, row["_record_rowid"])
                    )
                    report["transferred"][table] = report["transferred"].get(table, 0) + 1
                except sqlite3.IntegrityError as exc:
                    if table not in SAFE_MEMBERSHIP_KEYS or column != "ownerId":
                        raise RuntimeError(
                            f"Unsafe duplicate {table}.{column} while merging account "
                            f"{duplicate} to {survivor}: {exc}"
                        ) from exc
                    keys = SAFE_MEMBERSHIP_KEYS[table]
                    where = ' AND '.join(['"ownerId"=?'] + [f'"{key}"=?' for key in keys])
                    params = (survivor,) + tuple(row[key] for key in keys)
                    existing = db.execute(f'SELECT * FROM "{table}" WHERE {where}', params).fetchone()
                    if existing is None:
                        raise RuntimeError(f"Conflicting {table} membership missing") from exc
                    if table == "UserTickerPreference" and row["enabled"] != existing["enabled"]:
                        raise RuntimeError("Conflicting ticker preferences: manual review needed") from exc
                    db.execute(f'DELETE FROM "{table}" WHERE rowid=?', (row["_record_rowid"],))
                    report["deduplicated_memberships"][table] = (
                        report["deduplicated_memberships"].get(table, 0) + 1
                    )
    for table, columns in refs.items():
        for column in columns:
            if db.execute(
                f'SELECT 1 FROM "{table}" WHERE "{column}"=? LIMIT 1', (duplicate,)
            ).fetchone():
                raise RuntimeError(f"Unmigrated user reference: {table}.{column}={duplicate}")


def merge(v4, live, allow_conflicts):
    report = {"users_v4_before": 0, "users_v3_before": 0, "users_added": 0,
              "matched_users": 0, "password_conflicts": [], "role_conflicts": [],
              "tables": {}, "gift_batches_unchanged": False, "gift_codes_unchanged": False}
    for table in ("User", *TABLES, "GiftBatch", "GiftCode"):
        if table_exists(live, table) and not table_exists(v4, table):
            raise RuntimeError(f"V4 candidate missing V3 table: {table}")
    for table in ("GiftBatch", "GiftCode"):
        if table_exists(live, table) and db_rows(live, table):
            raise RuntimeError(f"Unexpected gift-code data on V3 side ({table}); requires explicit merge policy")

    source_known = set(TABLES) | {"User", "_prisma_migrations", "sqlite_sequence"}
    for row in live.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
        table = row[0]
        if table not in source_known and db_rows(live, table):
            raise RuntimeError(f"Non-empty unrecognised V3 table: {table} (refusing data loss)")

    original_gifts = {table: fingerprint(v4, table) for table in ("GiftBatch", "GiftClaimAudit")}
    # Compare every original code row after normalising only the approved
    # absorbed owner ID; all codes, dates and batches must remain unchanged.
    original_code_rows = {
        row["id"]: dict(row) for row in db_rows(v4, "GiftCode")
    }
    v4_users = users_by_ign(v4, "V4")
    live_users = users_by_ign(live, "V3")
    big_v4_original_ids = sorted(row["id"] for row in identity_groups(v4).get(SECOND_IDENTITY_KEY, []))
    report["users_v4_before"] = v4.execute('SELECT count(*) FROM "User"').fetchone()[0]
    report["users_v3_before"] = live.execute('SELECT count(*) FROM "User"').fetchone()[0]
    expected_admin = live.execute('SELECT role, ign FROM "User" WHERE id=35').fetchone()
    if (not expected_admin or expected_admin["role"] != "admin"
            or IGN_KEY(expected_admin["ign"]) != IDENTITY_KEY):
        raise RuntimeError("V3 user 35 is no longer the approved admin identity")
    for user_id in V3_ALIAS_IDS:
        if table_exists(live, "AccountRevocation") and live.execute(
            'SELECT 1 FROM "AccountRevocation" WHERE userId=?', (user_id,)
        ).fetchone():
            raise RuntimeError(f"V3 identity {user_id} has account revocation; manual review required")
    for key, source in live_users.items():
        candidate = v4_users.get(key)
        if candidate is None:
            continue
        report["matched_users"] += 1
        if source["password"] != candidate["password"] and key not in (IDENTITY_KEY, SECOND_IDENTITY_KEY):
            report["password_conflicts"].append(source["ign"])
        if source["role"] != candidate["role"] and key not in (IDENTITY_KEY, SECOND_IDENTITY_KEY):
            report["role_conflicts"].append({"ign": source["ign"], "v3": source["role"], "v4": candidate["role"]})
    if report["password_conflicts"] and not allow_conflicts:
        raise RuntimeError("Overlapping IGNs have different password hashes: " + ", ".join(report["password_conflicts"]) + ". Verify ownership and rerun only with --allow-password-conflicts; V4 passwords will win.")
    if report["role_conflicts"] and not allow_conflicts:
        raise RuntimeError("Overlapping IGNs have different roles: " + ", ".join(x['ign'] for x in report["role_conflicts"]) + ". Review and rerun only with --allow-password-conflicts; V4 roles will win.")

    ids = {name: {} for name in TABLES}
    users = {}
    v4.execute("BEGIN IMMEDIATE")
    consolidate_v4_identity(v4, report)
    big_survivor, big_duplicates, big_v3_ids = consolidate_second_identity(v4, live, report)
    for key, source in live_users.items():
        candidate = v4_users.get(key)
        if candidate:
            users[source["id"]] = candidate["id"]
            if key == IDENTITY_KEY:
                # Both V3 source accounts belong to the approved player.
                users[35] = SURVIVOR_ID
            elif key == SECOND_IDENTITY_KEY:
                for old_user_id in big_v3_ids:
                    users[old_user_id] = big_survivor
        else:
            payload = {k: source[k] for k in source.keys() if k != "id"}
            users[source["id"]] = insert(v4, "User", payload)
            report["users_added"] += 1

    for table in TABLES:
        if not table_exists(live, table):
            continue
        source_cols, target_cols = table_cols(live, table), table_cols(v4, table)
        unknown_cols = source_cols - target_cols
        if unknown_cols:
            raise RuntimeError(f"V3 {table} columns missing in V4: {sorted(unknown_cols)}")
        index = {}
        for existing in db_rows(v4, table):
            key = key_for(table, existing)
            index.setdefault(key, existing)
        counts = Counter()
        for old in db_rows(live, table):
            payload = remap_fk(table, dict(old), users, ids)
            key = key_for(table, payload)
            current = index.get(key)
            if current is not None:
                counts["matched"] += 1
                if any(current[k] != payload[k] for k in payload if k != "id"):
                    counts["v4_prioritised_differences"] += 1
                if table == "PushSubscription" and current["ownerId"] != payload["ownerId"]:
                    raise RuntimeError("Push endpoint belongs to different users between V3 and V4")
                if "id" in old.keys():
                    ids[table][old["id"]] = current["id"]
                continue
            row = {k: val for k, val in payload.items() if k != "id"}
            new_id = insert(v4, table, row)
            counts["added"] += 1
            if "id" in old.keys():
                ids[table][old["id"]] = new_id
            # Mirror row after insertion (safely includes allocated IDs and defaults).
            current = v4.execute(f'SELECT * FROM "{table}" WHERE rowid=?', (new_id,)).fetchone()
            index[key] = current
        report["tables"][table] = dict(counts)

    actual_users = v4.execute('SELECT COUNT(*) FROM "User"').fetchone()[0]
    expected_users = len(v4_users) + len(live_users) - report["matched_users"]
    if actual_users != expected_users:
        raise RuntimeError(f"User count mismatch: expected {expected_users}, got {actual_users}")
    if v4.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise RuntimeError("V4 candidate failed SQLite integrity_check")
    violations = v4.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise RuntimeError(f"V4 candidate has {len(violations)} foreign-key violations")
    for table in ("GiftBatch", "GiftClaimAudit"):
        unchanged = original_gifts[table] == fingerprint(v4, table)
        report[{"GiftBatch": "gift_batches_unchanged", "GiftClaimAudit": "gift_audit_unchanged"}[table]] = unchanged
        if not unchanged:
            raise RuntimeError(f"Protected {table} table was altered: aborting")
    final_codes = {row["id"]: dict(row) for row in db_rows(v4, "GiftCode")}
    if set(original_code_rows) != set(final_codes):
        raise RuntimeError("Gift code records added or removed")
    for code_id, original in original_code_rows.items():
        after = final_codes[code_id]
        if original["ownerId"] == 39:
            original["ownerId"] = SURVIVOR_ID
        if original["ownerId"] in big_duplicates:
            original["ownerId"] = big_survivor
        if after != original:
            raise RuntimeError(f"Gift code {code_id} changed unexpectedly")
    report["gift_codes_unchanged_except_approved_owner"] = True
    report["second_identity_consolidation"]["original_v4_ids"] = big_v4_original_ids
    v4.commit()
    report["users_after"] = actual_users
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--v4-candidate", required=True, type=Path)
    p.add_argument("--v3-snapshot", required=True, type=Path)
    p.add_argument("--report", type=Path)
    p.add_argument("--allow-password-conflicts", action="store_true", help="ONLY after reviewing matching IGN ownership/role discrepancies")
    args = p.parse_args()
    for path in (args.v4_candidate, args.v3_snapshot):
        if not path.is_file() or path.name == "dev.db":
            p.error(f"Expected an existing disposable snapshot/candidate, not an active dev.db: {path}")
    if args.v4_candidate.resolve() == args.v3_snapshot.resolve():
        p.error("Candidate and source must be different files")
    v4, v3 = [sqlite3.connect(p) for p in (args.v4_candidate, args.v3_snapshot)]
    for db in (v4, v3):
        db.row_factory = sqlite3.Row
    v4.execute("PRAGMA foreign_keys=ON")
    v3.execute("PRAGMA query_only=ON")
    try:
        report = merge(v4, v3, args.allow_password_conflicts)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
    except Exception:
        v4.rollback()
        raise
    finally:
        v4.close()
        v3.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        raise SystemExit(f"ERROR: {exc}")
