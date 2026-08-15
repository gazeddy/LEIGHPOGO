#!/usr/bin/env python3
import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

RUNTIME_JSON = {
    "event-overrides.json": ("eventID", "updatedAt"),
    "event-type-rules.json": ("eventType", "updatedAt"),
    "local-events.json": ("id", "updatedAt"),
    "pokemon-availability-overrides.json": ("dexNumber", "updatedAt"),
}


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Merge user/admin data from a DEV V2 SQLite snapshot into a "
            "migrated LIVE candidate database."
        )
    )
    parser.add_argument("--live-db", required=True)
    parser.add_argument("--dev-db", required=True)
    parser.add_argument("--live-data-dir")
    parser.add_argument("--dev-data-dir")
    parser.add_argument("--output-data-dir")
    return parser.parse_args()


def norm_ign(value):
    return str(value or "").strip().casefold()


def canonical_friend_code(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return digits if len(digits) == 12 else None


def stamp(value):
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)

    text = str(value).strip()
    if not text:
        return datetime.min.replace(tzinfo=timezone.utc)

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def newer(left, right):
    return stamp(left) > stamp(right)


def table_exists(conn, name):
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (name,),
        ).fetchone()
        is not None
    )


def rows(conn, sql, params=()):
    return list(conn.execute(sql, params).fetchall())


def one(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()


def insert_row(conn, table, data):
    columns = list(data)
    placeholders = ", ".join("?" for _ in columns)
    names = ", ".join(f'"{column}"' for column in columns)
    conn.execute(
        f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})',
        tuple(data[column] for column in columns),
    )
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_by_id(conn, table, row_id, data):
    assignments = ", ".join(f'"{column}"=?' for column in data)
    conn.execute(
        f'UPDATE "{table}" SET {assignments} WHERE id=?',
        (*[data[column] for column in data], row_id),
    )


def load_users(conn):
    result = {}
    collisions = {}

    for row in rows(conn, 'SELECT id, ign FROM "User"'):
        key = norm_ign(row["ign"])
        if not key:
            continue

        if key in result:
            collisions.setdefault(key, [result[key]["ign"]]).append(row["ign"])
        else:
            result[key] = row

    if collisions:
        raise RuntimeError(f"Case-insensitive IGN collisions found: {collisions}")

    return result


def merge_entries(live, dev, user_map, stats):
    if not (table_exists(live, "Entry") and table_exists(dev, "Entry")):
        return

    for dev_user_id, live_user_id in user_map.items():
        by_key = {}
        for item in rows(
            live,
            'SELECT * FROM "Entry" WHERE ownerId=? ORDER BY createdAt ASC, id ASC',
            (live_user_id,),
        ):
            code = canonical_friend_code(item["code"])
            key = (
                ("code", code)
                if code
                else (
                    "invalid",
                    str(item["trainerName"] or "").strip().casefold(),
                    str(item["code"] or "").strip(),
                )
            )
            current = by_key.get(key)
            if current is None or newer(item["updatedAt"], current["updatedAt"]):
                by_key[key] = item

        for item in rows(
            dev,
            'SELECT * FROM "Entry" WHERE ownerId=? ORDER BY createdAt ASC, id ASC',
            (dev_user_id,),
        ):
            code = canonical_friend_code(item["code"])
            key = (
                ("code", code)
                if code
                else (
                    "invalid",
                    str(item["trainerName"] or "").strip().casefold(),
                    str(item["code"] or "").strip(),
                )
            )
            current = by_key.get(key)
            payload = {
                "trainerName": item["trainerName"],
                "code": code or item["code"],
                "team": item["team"],
                "updatedAt": item["updatedAt"],
            }

            if current is None:
                new_id = insert_row(
                    live,
                    "Entry",
                    {
                        **payload,
                        "ownerId": live_user_id,
                        "createdAt": item["createdAt"],
                    },
                )
                by_key[key] = one(live, 'SELECT * FROM "Entry" WHERE id=?', (new_id,))
                stats["entries_added"] += 1
            elif newer(item["updatedAt"], current["updatedAt"]):
                update_by_id(live, "Entry", current["id"], payload)
                by_key[key] = one(
                    live,
                    'SELECT * FROM "Entry" WHERE id=?',
                    (current["id"],),
                )
                stats["entries_updated"] += 1


def merge_pokedex(live, dev, user_map, stats):
    if not (
        table_exists(live, "PokedexEntry") and table_exists(dev, "PokedexEntry")
    ):
        return

    for dev_user_id, live_user_id in user_map.items():
        existing = {
            row["dexNumber"]
            for row in rows(
                live,
                'SELECT dexNumber FROM "PokedexEntry" WHERE ownerId=?',
                (live_user_id,),
            )
        }

        for item in rows(
            dev,
            'SELECT dexNumber, createdAt, updatedAt FROM "PokedexEntry" '
            "WHERE ownerId=?",
            (dev_user_id,),
        ):
            if item["dexNumber"] in existing:
                continue

            insert_row(
                live,
                "PokedexEntry",
                {
                    "dexNumber": item["dexNumber"],
                    "ownerId": live_user_id,
                    "createdAt": item["createdAt"],
                    "updatedAt": item["updatedAt"],
                },
            )
            existing.add(item["dexNumber"])
            stats["pokedex_added"] += 1


def merge_search_strings(live, dev, user_map, stats):
    if not (
        table_exists(live, "SearchString") and table_exists(dev, "SearchString")
    ):
        return

    for dev_user_id, live_user_id in user_map.items():
        by_title = {}
        for item in rows(
            live,
            'SELECT * FROM "SearchString" WHERE ownerId=?',
            (live_user_id,),
        ):
            key = str(item["title"] or "").strip().casefold()
            current = by_title.get(key)
            if current is None or newer(item["updatedAt"], current["updatedAt"]):
                by_title[key] = item

        for item in rows(
            dev,
            'SELECT * FROM "SearchString" WHERE ownerId=?',
            (dev_user_id,),
        ):
            key = str(item["title"] or "").strip().casefold()
            current = by_title.get(key)
            payload = {
                "title": item["title"],
                "query": item["query"],
                "updatedAt": item["updatedAt"],
            }

            if current is None:
                new_id = insert_row(
                    live,
                    "SearchString",
                    {
                        **payload,
                        "ownerId": live_user_id,
                        "createdAt": item["createdAt"],
                    },
                )
                by_title[key] = one(
                    live,
                    'SELECT * FROM "SearchString" WHERE id=?',
                    (new_id,),
                )
                stats["searches_added"] += 1
            elif newer(item["updatedAt"], current["updatedAt"]):
                update_by_id(live, "SearchString", current["id"], payload)
                by_title[key] = one(
                    live,
                    'SELECT * FROM "SearchString" WHERE id=?',
                    (current["id"],),
                )
                stats["searches_updated"] += 1


def listing_key(row):
    return (
        str(row["createdAt"] or ""),
        str(row["location"] or ""),
        str(row["notes"] or ""),
        str(row["friendshipRequirement"] or ""),
    )


def item_key(row):
    return (
        str(row["direction"] or ""),
        str(row["pokemonName"] or "").casefold(),
        int(row["shiny"] or 0),
        int(row["lucky"] or 0),
        int(row["xxl"] or 0),
        int(row["xxs"] or 0),
        int(row["costume"] or 0),
        int(row["background"] or 0),
        int(row["dynamax"] or 0),
        int(row["gigantamax"] or 0),
        str(row["notes"] or ""),
    )


def merge_trade_listings(live, dev, user_map, stats):
    listing_map = {}
    required = ("TradeListing", "TradeListingItem")
    if not all(
        table_exists(live, table) and table_exists(dev, table)
        for table in required
    ):
        return listing_map

    for dev_user_id, live_user_id in user_map.items():
        existing = {
            listing_key(row): row
            for row in rows(
                live,
                'SELECT * FROM "TradeListing" WHERE ownerId=?',
                (live_user_id,),
            )
        }

        for item in rows(
            dev,
            'SELECT * FROM "TradeListing" WHERE ownerId=? ORDER BY createdAt, id',
            (dev_user_id,),
        ):
            key = listing_key(item)
            current = existing.get(key)
            payload = {
                "friendshipRequirement": item["friendshipRequirement"],
                "location": item["location"],
                "notes": item["notes"],
                "status": item["status"],
                "updatedAt": item["updatedAt"],
                "expiresAt": item["expiresAt"],
            }

            if current is None:
                live_listing_id = insert_row(
                    live,
                    "TradeListing",
                    {
                        **payload,
                        "ownerId": live_user_id,
                        "createdAt": item["createdAt"],
                    },
                )
                current = one(
                    live,
                    'SELECT * FROM "TradeListing" WHERE id=?',
                    (live_listing_id,),
                )
                existing[key] = current
                stats["trade_listings_added"] += 1
            else:
                live_listing_id = current["id"]
                if newer(item["updatedAt"], current["updatedAt"]):
                    update_by_id(live, "TradeListing", live_listing_id, payload)
                    stats["trade_listings_updated"] += 1

            listing_map[item["id"]] = live_listing_id
            existing_items = {
                item_key(row)
                for row in rows(
                    live,
                    'SELECT * FROM "TradeListingItem" WHERE listingId=?',
                    (live_listing_id,),
                )
            }

            for child in rows(
                dev,
                'SELECT * FROM "TradeListingItem" WHERE listingId=? ORDER BY id',
                (item["id"],),
            ):
                key = item_key(child)
                if key in existing_items:
                    continue

                insert_row(
                    live,
                    "TradeListingItem",
                    {
                        "listingId": live_listing_id,
                        "direction": child["direction"],
                        "pokemonName": child["pokemonName"],
                        "shiny": child["shiny"],
                        "lucky": child["lucky"],
                        "xxl": child["xxl"],
                        "xxs": child["xxs"],
                        "costume": child["costume"],
                        "background": child["background"],
                        "dynamax": child["dynamax"],
                        "gigantamax": child["gigantamax"],
                        "notes": child["notes"],
                    },
                )
                existing_items.add(key)
                stats["trade_items_added"] += 1

    return listing_map


def wanted_key(row):
    return (
        str(row["createdAt"] or ""),
        int(row["dexNumber"]),
        str(row["pokemonName"] or "").casefold(),
    )


def merge_wanted(live, dev, user_map, stats):
    if not (table_exists(live, "WantedTrade") and table_exists(dev, "WantedTrade")):
        return

    fields = [
        "dexNumber",
        "pokemonName",
        "shiny",
        "lucky",
        "xxl",
        "xxs",
        "costume",
        "background",
        "dynamax",
        "gigantamax",
        "notes",
        "updatedAt",
    ]

    for dev_user_id, live_user_id in user_map.items():
        existing = {
            wanted_key(row): row
            for row in rows(
                live,
                'SELECT * FROM "WantedTrade" WHERE ownerId=?',
                (live_user_id,),
            )
        }

        for item in rows(
            dev,
            'SELECT * FROM "WantedTrade" WHERE ownerId=? ORDER BY createdAt, id',
            (dev_user_id,),
        ):
            key = wanted_key(item)
            current = existing.get(key)
            payload = {field: item[field] for field in fields}

            if current is None:
                new_id = insert_row(
                    live,
                    "WantedTrade",
                    {
                        **payload,
                        "ownerId": live_user_id,
                        "createdAt": item["createdAt"],
                    },
                )
                existing[key] = one(
                    live,
                    'SELECT * FROM "WantedTrade" WHERE id=?',
                    (new_id,),
                )
                stats["wanted_added"] += 1
            elif newer(item["updatedAt"], current["updatedAt"]):
                update_by_id(live, "WantedTrade", current["id"], payload)
                stats["wanted_updated"] += 1


def merge_notifications(live, dev, user_map, listing_map, stats):
    if not (
        table_exists(live, "TradeNotification")
        and table_exists(dev, "TradeNotification")
    ):
        return

    for item in rows(
        dev,
        'SELECT * FROM "TradeNotification" ORDER BY createdAt, id',
    ):
        live_owner_id = user_map.get(item["ownerId"])
        live_listing_id = listing_map.get(item["listingId"])
        if not live_owner_id or not live_listing_id:
            continue

        current = one(
            live,
            'SELECT * FROM "TradeNotification" '
            "WHERE ownerId=? AND listingId=? AND pokemonName=?",
            (live_owner_id, live_listing_id, item["pokemonName"]),
        )
        payload = {
            "type": item["type"],
            "pokemonName": item["pokemonName"],
            "modifierSummary": item["modifierSummary"],
            "matchedTrainerSummary": item["matchedTrainerSummary"],
            "matchedTrainerCount": item["matchedTrainerCount"],
            "readAt": item["readAt"],
        }

        if current is None:
            insert_row(
                live,
                "TradeNotification",
                {
                    **payload,
                    "ownerId": live_owner_id,
                    "listingId": live_listing_id,
                    "createdAt": item["createdAt"],
                },
            )
            stats["notifications_added"] += 1
        else:
            merged_read = current["readAt"]
            if item["readAt"] and (
                not merged_read or newer(item["readAt"], merged_read)
            ):
                merged_read = item["readAt"]
            update_by_id(
                live,
                "TradeNotification",
                current["id"],
                {**payload, "readAt": merged_read},
            )
            stats["notifications_updated"] += 1


def merge_override_table(
    live,
    dev,
    table,
    key_column,
    fields,
    stat_prefix,
    stats,
):
    if not (table_exists(live, table) and table_exists(dev, table)):
        return

    existing = {
        row[key_column]: row for row in rows(live, f'SELECT * FROM "{table}"')
    }

    for item in rows(dev, f'SELECT * FROM "{table}"'):
        current = existing.get(item[key_column])
        payload = {field: item[field] for field in fields}

        if current is None:
            insert_row(
                live,
                table,
                {
                    **payload,
                    key_column: item[key_column],
                    "createdAt": item["createdAt"],
                    "updatedAt": item["updatedAt"],
                },
            )
            stats[f"{stat_prefix}_added"] += 1
        elif newer(item["updatedAt"], current["updatedAt"]):
            update_by_id(
                live,
                table,
                current["id"],
                {**payload, "updatedAt": item["updatedAt"]},
            )
            stats[f"{stat_prefix}_updated"] += 1


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in {path}: {exc}") from exc


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def merge_keyed_lists(live_list, dev_list, key_name, updated_name):
    merged = {}
    order = []

    for source in (live_list, dev_list):
        if not isinstance(source, list):
            continue
        for item in source:
            if not isinstance(item, dict) or key_name not in item:
                continue
            key = str(item[key_name])
            if key not in merged:
                merged[key] = item
                order.append(key)
            elif newer(item.get(updated_name), merged[key].get(updated_name)):
                merged[key] = item

    return [merged[key] for key in order]


def report_time(report):
    if not isinstance(report, dict):
        return None
    return report.get("reviewedAt") or report.get("reportedAt")


def merge_gyms(live_state, dev_state):
    if not isinstance(live_state, dict):
        live_state = {}
    if not isinstance(dev_state, dict):
        dev_state = {}

    live_imported = live_state.get("importedAt")
    dev_imported = dev_state.get("importedAt")
    dev_preferred = newer(dev_imported, live_imported)
    gyms = {}

    live_gyms = live_state.get("gyms", [])
    if isinstance(live_gyms, list):
        for item in live_gyms:
            if isinstance(item, dict) and item.get("id"):
                gyms[str(item["id"])] = item

    dev_gyms = dev_state.get("gyms", [])
    if isinstance(dev_gyms, list):
        for item in dev_gyms:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            key = str(item["id"])
            if key not in gyms:
                gyms[key] = item
                continue

            live_item = gyms[key]
            preferred, other = (
                (item, live_item) if dev_preferred else (live_item, item)
            )
            combined = {**other, **preferred}
            if not combined.get("alias"):
                combined["alias"] = item.get("alias") or live_item.get("alias")
            gyms[key] = combined

    reports = {}
    for source in (
        live_state.get("removalReports", []),
        dev_state.get("removalReports", []),
    ):
        if not isinstance(source, list):
            continue
        for item in source:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            key = str(item["id"])
            current = reports.get(key)
            if current is None or newer(report_time(item), report_time(current)):
                reports[key] = item

    preferred = dev_state if dev_preferred else live_state
    other = live_state if dev_preferred else dev_state
    return {
        "version": 1,
        "importedAt": preferred.get("importedAt") or other.get("importedAt"),
        "sourceFile": preferred.get("sourceFile") or other.get("sourceFile"),
        "gyms": list(gyms.values()),
        "removalReports": list(reports.values()),
    }


def merge_runtime_data(live_dir, dev_dir, output_dir, stats):
    if not output_dir:
        return

    live_dir = Path(live_dir) if live_dir else None
    dev_dir = Path(dev_dir) if dev_dir else None
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    for filename, (key, updated) in RUNTIME_JSON.items():
        live_path = live_dir / filename if live_dir else Path("/nonexistent")
        dev_path = dev_dir / filename if dev_dir else Path("/nonexistent")
        if not live_path.exists() and not dev_path.exists():
            continue

        merged = merge_keyed_lists(
            read_json(live_path, []),
            read_json(dev_path, []),
            key,
            updated,
        )
        write_json(output / filename, merged)
        stats["runtime_files_merged"] += 1

    live_gym = live_dir / "gyms.json" if live_dir else Path("/nonexistent")
    dev_gym = dev_dir / "gyms.json" if dev_dir else Path("/nonexistent")
    if live_gym.exists() or dev_gym.exists():
        write_json(
            output / "gyms.json",
            merge_gyms(read_json(live_gym, {}), read_json(dev_gym, {})),
        )
        stats["runtime_files_merged"] += 1


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
        "entries_added": 0,
        "entries_updated": 0,
        "pokedex_added": 0,
        "searches_added": 0,
        "searches_updated": 0,
        "trade_listings_added": 0,
        "trade_listings_updated": 0,
        "trade_items_added": 0,
        "wanted_added": 0,
        "wanted_updated": 0,
        "notifications_added": 0,
        "notifications_updated": 0,
        "availability_added": 0,
        "availability_updated": 0,
        "regional_added": 0,
        "regional_updated": 0,
        "runtime_files_merged": 0,
    }

    try:
        for table in ("User", "Entry", "SearchString", "PokedexEntry"):
            if not table_exists(live, table):
                raise RuntimeError(
                    f"LIVE candidate is missing required table {table}; "
                    "run Prisma migrations first."
                )

        live_users = load_users(live)
        dev_users = load_users(dev)
        matched_keys = sorted(set(live_users) & set(dev_users))
        user_map = {
            dev_users[key]["id"]: live_users[key]["id"] for key in matched_keys
        }
        dev_only = sorted(
            dev_users[key]["ign"] for key in set(dev_users) - set(live_users)
        )

        live.execute("BEGIN IMMEDIATE")
        merge_entries(live, dev, user_map, stats)
        merge_pokedex(live, dev, user_map, stats)
        merge_search_strings(live, dev, user_map, stats)
        listing_map = merge_trade_listings(live, dev, user_map, stats)
        merge_wanted(live, dev, user_map, stats)
        merge_notifications(live, dev, user_map, listing_map, stats)
        merge_override_table(
            live,
            dev,
            "PokemonAvailabilityOverride",
            "dexNumber",
            ["released", "note"],
            "availability",
            stats,
        )
        merge_override_table(
            live,
            dev,
            "PokemonRegionalOverride",
            "dexNumber",
            ["isRegional", "regions", "note"],
            "regional",
            stats,
        )
        live.commit()

        merge_runtime_data(
            args.live_data_dir,
            args.dev_data_dir,
            args.output_data_dir,
            stats,
        )

        integrity = live.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {integrity}")

        foreign_key_errors = rows(live, "PRAGMA foreign_key_check")
        if foreign_key_errors:
            raise RuntimeError(
                "SQLite foreign_key_check found "
                f"{len(foreign_key_errors)} violation(s)."
            )

        print(f"Matched users: {len(matched_keys)}")
        print(f"DEV-only users skipped: {len(dev_only)}")
        if dev_only:
            print("  " + ", ".join(dev_only))
        for key in sorted(stats):
            print(f"{key}: {stats[key]}")
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
