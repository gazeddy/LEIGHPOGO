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


def users_by_ign(db):
    result = {}
    for r in db_rows(db, "User"):
        key = IGN_KEY(r["ign"])
        if not key or key in result:
            raise RuntimeError(f"Invalid or colliding IGN: {r['ign']!r}")
        result[key] = r
    return result


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

    original_gifts = {table: fingerprint(v4, table) for table in ("GiftBatch", "GiftCode")}
    v4_users = users_by_ign(v4)
    live_users = users_by_ign(live)
    report["users_v4_before"] = len(v4_users)
    report["users_v3_before"] = len(live_users)
    for key, source in live_users.items():
        candidate = v4_users.get(key)
        if candidate is None:
            continue
        report["matched_users"] += 1
        if source["password"] != candidate["password"]:
            report["password_conflicts"].append(source["ign"])
        if source["role"] != candidate["role"]:
            report["role_conflicts"].append({"ign": source["ign"], "v3": source["role"], "v4": candidate["role"]})
    if report["password_conflicts"] and not allow_conflicts:
        raise RuntimeError("Overlapping IGNs have different password hashes: " + ", ".join(report["password_conflicts"]) + ". Verify ownership and rerun only with --allow-password-conflicts; V4 passwords will win.")
    if report["role_conflicts"] and not allow_conflicts:
        raise RuntimeError("Overlapping IGNs have different roles: " + ", ".join(x['ign'] for x in report["role_conflicts"]) + ". Review and rerun only with --allow-password-conflicts; V4 roles will win.")

    ids = {name: {} for name in TABLES}
    users = {}
    v4.execute("BEGIN IMMEDIATE")
    for key, source in live_users.items():
        candidate = v4_users.get(key)
        if candidate:
            users[source["id"]] = candidate["id"]
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
    for table in ("GiftBatch", "GiftCode"):
        unchanged = original_gifts[table] == fingerprint(v4, table)
        report[{"GiftBatch": "gift_batches_unchanged", "GiftCode": "gift_codes_unchanged"}[table]] = unchanged
        if not unchanged:
            raise RuntimeError(f"Gift allocations altered in {table}: aborting")
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
