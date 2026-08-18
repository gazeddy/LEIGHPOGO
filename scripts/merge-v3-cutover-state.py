#!/usr/bin/env python3
import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Merge V3-only production-safe state from a DEV SQLite snapshot "
            "into an already-migrated LIVE candidate database."
        )
    )
    parser.add_argument("--live-db", required=True)
    parser.add_argument("--dev-db", required=True)
    return parser.parse_args()


def table_exists(conn, name):
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (name,),
        ).fetchone()
        is not None
    )


def norm_ign(value):
    return str(value or "").strip().casefold()


def stamp(value):
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)

    if isinstance(value, (int, float)):
        number = float(value)
        if number > 100_000_000_000:
            number /= 1000
        try:
            return datetime.fromtimestamp(number, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return datetime.min.replace(tzinfo=timezone.utc)

    text = str(value).strip()
    if not text:
        return datetime.min.replace(tzinfo=timezone.utc)

    if text.isdigit():
        return stamp(int(text))

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def load_users(conn):
    users = {}
    collisions = {}
    for row in conn.execute('SELECT id, ign FROM "User"'):
        key = norm_ign(row["ign"])
        if not key:
            continue
        if key in users:
            collisions.setdefault(key, [users[key]["ign"]]).append(row["ign"])
        else:
            users[key] = row

    if collisions:
        raise RuntimeError(f"Case-insensitive IGN collisions found: {collisions}")
    return users


def merge_site_settings(live, dev, stats):
    if not (table_exists(live, "SiteSetting") and table_exists(dev, "SiteSetting")):
        return

    existing = {
        row["key"]: row
        for row in live.execute('SELECT key, value, updatedAt FROM "SiteSetting"')
    }

    for item in dev.execute('SELECT key, value, updatedAt FROM "SiteSetting"'):
        current = existing.get(item["key"])
        if current is None:
            live.execute(
                'INSERT INTO "SiteSetting" (key, value, updatedAt) VALUES (?, ?, ?)',
                (item["key"], item["value"], item["updatedAt"]),
            )
            stats["site_settings_added"] += 1
            existing[item["key"]] = item
        elif stamp(item["updatedAt"]) > stamp(current["updatedAt"]):
            live.execute(
                'UPDATE "SiteSetting" SET value=?, updatedAt=? WHERE key=?',
                (item["value"], item["updatedAt"], item["key"]),
            )
            stats["site_settings_updated"] += 1


def merge_ticker_preferences(live, dev, user_map, stats):
    if not (
        table_exists(live, "UserTickerPreference")
        and table_exists(dev, "UserTickerPreference")
    ):
        return

    for dev_user_id, live_user_id in user_map.items():
        existing = {
            row["tickerType"]: row
            for row in live.execute(
                'SELECT id, tickerType, enabled FROM "UserTickerPreference" WHERE ownerId=?',
                (live_user_id,),
            )
        }

        for item in dev.execute(
            'SELECT tickerType, enabled FROM "UserTickerPreference" WHERE ownerId=?',
            (dev_user_id,),
        ):
            current = existing.get(item["tickerType"])
            if current is None:
                live.execute(
                    'INSERT INTO "UserTickerPreference" (ownerId, tickerType, enabled) '
                    'VALUES (?, ?, ?)',
                    (live_user_id, item["tickerType"], item["enabled"]),
                )
                stats["ticker_preferences_added"] += 1
            elif int(current["enabled"]) != int(item["enabled"]):
                # Ticker preferences are V3-only and have no updatedAt column. During
                # the one-time V3 cutover, the DEV value is therefore authoritative.
                live.execute(
                    'UPDATE "UserTickerPreference" SET enabled=? WHERE id=?',
                    (item["enabled"], current["id"]),
                )
                stats["ticker_preferences_updated"] += 1


def main():
    args = parse_args()
    live_path = Path(args.live_db).resolve()
    dev_path = Path(args.dev_db).resolve()

    if live_path == dev_path:
        raise RuntimeError("LIVE and DEV database paths must be different.")
    if not live_path.is_file() or not dev_path.is_file():
        raise RuntimeError("Both LIVE and DEV database snapshots must exist.")

    live = sqlite3.connect(live_path)
    dev = sqlite3.connect(dev_path)
    live.row_factory = sqlite3.Row
    dev.row_factory = sqlite3.Row
    live.execute("PRAGMA foreign_keys=ON")
    dev.execute("PRAGMA query_only=ON")

    stats = {
        "site_settings_added": 0,
        "site_settings_updated": 0,
        "ticker_preferences_added": 0,
        "ticker_preferences_updated": 0,
    }

    try:
        if not table_exists(live, "User") or not table_exists(dev, "User"):
            raise RuntimeError("Both databases must contain the User table.")

        live_users = load_users(live)
        dev_users = load_users(dev)
        matched_keys = sorted(set(live_users) & set(dev_users))
        user_map = {
            dev_users[key]["id"]: live_users[key]["id"] for key in matched_keys
        }

        live.execute("BEGIN IMMEDIATE")
        merge_site_settings(live, dev, stats)
        merge_ticker_preferences(live, dev, user_map, stats)
        live.commit()

        integrity = live.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {integrity}")

        fk_errors = list(live.execute("PRAGMA foreign_key_check"))
        if fk_errors:
            raise RuntimeError(
                f"SQLite foreign_key_check found {len(fk_errors)} violation(s)."
            )

        print(f"Matched users for V3 state: {len(matched_keys)}")
        for key in sorted(stats):
            print(f"{key}: {stats[key]}")
        print("Excluded by design: PushSubscription, UsageEvent, RaidBossProfile, RaidRotation")
    except Exception:
        live.rollback()
        raise
    finally:
        dev.close()
        live.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
