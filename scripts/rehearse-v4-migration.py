#!/usr/bin/env python3
"""Read-only V3 -> V4-primary migration rehearsal; NEVER cuts over either service.

Creates verified point-in-time SQLite backups of both active sites and merges
V3 records ONLY into a disposable copy of the V4 backup. Original databases
and service states are never modified. Aborts on differences requiring review.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

DEFAULT_V4 = pathlib.Path("/projects/V4")
DEFAULT_V3 = pathlib.Path("/projects/LIVE")
DEFAULT_BACKUPS = pathlib.Path("/projects/backups/leighpogo/v4-rehearsals")
FINGERPRINT_TABLES = ("User", "GiftBatch", "GiftCode", "GiftClaimAudit")


def stop(message):
    raise RuntimeError(message)


def get_sqlite_path(project, override=None):
    project = project.resolve()
    if override:
        db = pathlib.Path(override).resolve()
    else:
        env = project / ".env"
        if not env.is_file():
            stop(f"Missing {env} (specify --v3-db or --v4-db explicitly)")
        # Deliberately do not import the environment or source .env in a shell.
        url = None
        for line in env.read_text().splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[7:].strip()
            if line.startswith("DATABASE_URL="):
                url = line.partition("=")[2].strip().strip('"').strip("'")
        if not url or not url.startswith("file:"):
            stop(f"Missing/invalid SQLite DATABASE_URL in {env}")
        raw = url[5:].split("?", 1)[0]
        if not raw or raw == ":memory:":
            stop(f"SQLite DATABASE_URL in {env} is not a persistent file")
        db = pathlib.Path(raw)
        if not db.is_absolute():
            # Prisma paths are relative to prisma/schema.prisma.
            db = project / "prisma" / db
        db = db.resolve()
    if not db.is_relative_to(project):
        stop(f"Refusing database outside designated checkout: {db}")
    if not db.is_file() or db.stat().st_size == 0:
        stop(f"Missing/empty SQLite database: {db}")
    return db


def online_backup(source_path, output_path):
    # mode=ro prevents accidental creation or writes to the active source.
    source = sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True, timeout=30)
    try:
        destination = sqlite3.connect(output_path)
        try:
            source.backup(destination, pages=256, sleep=0.15)
            destination.commit()
        finally:
            destination.close()
    finally:
        source.close()
    output_path.chmod(0o600)
    validate(output_path)


def validate(db_path):
    with sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchone()
        if integrity != ("ok",):
            stop(f"SQLite integrity check failed for {db_path}: {integrity}")
        violations = db.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            stop(f"Foreign key violations in {db_path}: {len(violations)}")


def snapshot_digest(db_path, table):
    with sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        exists = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        if not exists:
            stop(f"Required V4 table missing: {table}. Apply the V4 gift-audit update first.")
        rows = [dict(row) for row in db.execute(f'SELECT * FROM "{table}"')]
        rows.sort(key=lambda item: json.dumps(item, sort_keys=True, default=str))
        serialized = json.dumps(rows, sort_keys=True, default=str).encode()
        return {"rows": len(rows), "sha256": hashlib.sha256(serialized).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--v4-dir", type=pathlib.Path, default=DEFAULT_V4)
    parser.add_argument("--v3-dir", type=pathlib.Path, default=DEFAULT_V3)
    parser.add_argument("--v4-db", type=pathlib.Path, help="Explicit V4 DB (must be within V4 checkout)")
    parser.add_argument("--v3-db", type=pathlib.Path, help="Explicit V3 DB (must be within LIVE checkout)")
    parser.add_argument("--backup-root", type=pathlib.Path, default=DEFAULT_BACKUPS)
    parser.add_argument("--allow-password-conflicts", action="store_true",
                        help="Only after explicitly reviewing mismatched passwords and roles")
    args = parser.parse_args()

    v4_dir, v3_dir = args.v4_dir.resolve(), args.v3_dir.resolve()
    if v3_dir == v4_dir or v3_dir.is_relative_to(v4_dir) or v4_dir.is_relative_to(v3_dir):
        stop("V3 and V4 checkouts must be separate")
    script_path = v4_dir / "scripts" / "merge-v3-into-v4.py"
    if not script_path.is_file():
        stop(f"V4 merge script not found: {script_path}")

    v4_db = get_sqlite_path(v4_dir, args.v4_db)
    v3_db = get_sqlite_path(v3_dir, args.v3_db)
    if v4_db == v3_db:
        stop("V3 and V4 database paths must differ")

    root = args.backup_root.resolve()
    if root.is_relative_to(v4_dir) or root.is_relative_to(v3_dir):
        stop("Rehearsal backups must be outside both checkouts")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = root / f"rehearsal-{stamp}-{os.getpid()}"
    run_dir.mkdir(mode=0o700)
    v4_snapshot = run_dir / "v4-source.sqlite3"
    v3_snapshot = run_dir / "v3-source.sqlite3"
    candidate = run_dir / "v4-primary-candidate.sqlite3"
    report = run_dir / "merge-report.json"
    overview_path = run_dir / "rehearsal-status.json"
    status = {"result": "started", "v3_source": str(v3_db), "v4_source": str(v4_db),
              "candidate": str(candidate), "v3_snapshot": str(v3_snapshot),
              "v4_snapshot": str(v4_snapshot), "report": str(report)}
    try:
        print(f"Rehearsal output: {run_dir}", flush=True)
        print("Creating online V4 snapshot (original untouched)...", flush=True)
        online_backup(v4_db, v4_snapshot)
        print("Creating online V3 snapshot (original untouched)...", flush=True)
        online_backup(v3_db, v3_snapshot)
        original = {name: snapshot_digest(v4_snapshot, name) for name in FINGERPRINT_TABLES}
        # Backup again rather than a raw file copy for consistent destination state.
        online_backup(v4_snapshot, candidate)

        command = [sys.executable, str(script_path),
                   "--v4-candidate", str(candidate),
                   "--v3-snapshot", str(v3_snapshot),
                   "--report", str(report)]
        if args.allow_password_conflicts:
            command.append("--allow-password-conflicts")
        print("Merging V3 into DISPOSABLE V4 candidate only...", flush=True)
        result = subprocess.run(command, text=True, capture_output=True)
        status["merger_stdout"] = result.stdout[-12000:]
        status["merger_stderr"] = result.stderr[-12000:]
        if result.returncode:
            stop("V3/V4 merger refused or failed: " + (result.stderr.strip() or result.stdout.strip()))
        validate(candidate)
        after = {name: snapshot_digest(candidate, name) for name in FINGERPRINT_TABLES}
        with report.open() as report_file:
            merge_details = json.load(report_file)
        second = merge_details.get("second_identity_consolidation")
        if not second or second.get("ign") != "bigjewnine":
            stop("Missing explicitly approved Bigjewnine reconciliation report")
        big_survivor = second["survivor"]
        big_removed = set(second["absorbed_v4_ids"])
        allowed_owner_changes = {duplicate: big_survivor for duplicate in big_removed}
        allowed_owner_changes[39] = 8
        for table in FINGERPRINT_TABLES:
            if table == "User":
                with sqlite3.connect(v4_snapshot) as before_db, sqlite3.connect(candidate) as after_db:
                    before_db.row_factory = after_db.row_factory = sqlite3.Row
                    columns = [row[1] for row in before_db.execute('PRAGMA table_info("User")')]
                    select = ",".join('"' + c + '"' for c in columns)
                    for entry in before_db.execute(f'SELECT {select} FROM "User"'):
                        match = after_db.execute(f'SELECT {select} FROM "User" WHERE "id"=?', (entry["id"],)).fetchone()
                        if entry["id"] == 39 or entry["id"] in big_removed:
                            if match is not None:
                                stop(f"Approved duplicate V4 user {entry['id']} was not merged")
                            continue
                        if match is None:
                            stop(f"V4 user {entry['id']} unexpectedly removed")
                        expected = dict(entry)
                        if entry["id"] == 8:
                            expected["role"] = "admin"
                        if entry["id"] == big_survivor:
                            expected["role"] = second["role"]
                        if dict(match) != expected:
                            stop(f"Existing V4 user altered unexpectedly: user ID {entry['id']}")
                    aliases = after_db.execute(
                        "SELECT id FROM User WHERE lower(trim(ign))='pigtailedboxer'"
                    ).fetchall()
                    if [row[0] for row in aliases] != [8]:
                        stop("Approved player did not consolidate to precisely V4 user 8")
                    big_aliases = after_db.execute(
                        "SELECT id FROM User WHERE lower(trim(ign))='bigjewnine'"
                    ).fetchall()
                    if [row[0] for row in big_aliases] != [big_survivor]:
                        stop("Bigjewnine did not consolidate to the approved V4 survivor")
            elif table == "GiftCode":
                with sqlite3.connect(v4_snapshot) as before_db, sqlite3.connect(candidate) as after_db:
                    before_db.row_factory = after_db.row_factory = sqlite3.Row
                    original_codes = {
                        row["id"]: dict(row) for row in before_db.execute('SELECT * FROM "GiftCode"')
                    }
                    merged_codes = {
                        row["id"]: dict(row) for row in after_db.execute('SELECT * FROM "GiftCode"')
                    }
                    if original_codes.keys() != merged_codes.keys():
                        stop("Existing gift code IDs changed")
                    for code_id, entry in original_codes.items():
                        if entry["ownerId"] in allowed_owner_changes:
                            entry["ownerId"] = allowed_owner_changes[entry["ownerId"]]
                        if entry != merged_codes[code_id]:
                            stop(f"GiftCode {code_id} was unexpectedly altered")
            elif original[table] != after[table]:
                stop(f"V4 {table} changed unexpectedly during merge")
        status.update(result="PASS", original_v4=original, merged=after)
        print("PASS: approved Pigtailedboxer and Bigjewnine aliases reconciled in candidate only.")
        print("Bigjewnine V4 survivor:", big_survivor, "merged V4 IDs:", sorted(big_removed))
        print("PASS: protected gift data unchanged (except approved owner remaps), integrity and foreign keys valid.")
        print("Merge report:", report)
    except Exception as exc:
        status.update(result="FAIL", error=str(exc))
        print("REHEARSAL FAILED:", exc, file=sys.stderr)
        print("Sources were not modified. Review files in:", run_dir, file=sys.stderr)
        raise
    finally:
        overview_path.write_text(json.dumps(status, indent=2) + "\n")
        overview_path.chmod(0o600)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
