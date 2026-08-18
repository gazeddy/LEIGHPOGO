#!/usr/bin/env python3
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MERGER = ROOT / "scripts" / "merge-v3-cutover-state.py"


def create_db(path, users, site_setting=None, ticker_preferences=()):
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        PRAGMA foreign_keys=ON;
        CREATE TABLE User (
            id INTEGER PRIMARY KEY,
            ign TEXT NOT NULL UNIQUE
        );
        CREATE TABLE SiteSetting (
            key TEXT NOT NULL PRIMARY KEY,
            value TEXT NOT NULL,
            updatedAt DATETIME NOT NULL
        );
        CREATE TABLE UserTickerPreference (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ownerId INTEGER NOT NULL,
            tickerType TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY (ownerId) REFERENCES User(id) ON DELETE CASCADE,
            UNIQUE(ownerId, tickerType)
        );
        """
    )
    conn.executemany("INSERT INTO User (id, ign) VALUES (?, ?)", users)
    if site_setting:
        conn.execute(
            "INSERT INTO SiteSetting (key, value, updatedAt) VALUES (?, ?, ?)",
            site_setting,
        )
    conn.executemany(
        "INSERT INTO UserTickerPreference (ownerId, tickerType, enabled) VALUES (?, ?, ?)",
        ticker_preferences,
    )
    conn.commit()
    conn.close()


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        live_db = tmp / "live.db"
        dev_db = tmp / "dev.db"

        create_db(
            live_db,
            [(1, "Angryspanner"), (2, "LiveOnly")],
            ("campfireUrl", "https://live.example/old", "2026-08-17T10:00:00+00:00"),
            [(1, "events", 1)],
        )
        create_db(
            dev_db,
            [(20, "angryspanner"), (30, "DevOnly")],
            ("campfireUrl", "https://dev.example/new", "2026-08-18T10:00:00+00:00"),
            [(20, "events", 0), (20, "raids", 0)],
        )

        subprocess.run(
            [
                sys.executable,
                str(MERGER),
                "--live-db",
                str(live_db),
                "--dev-db",
                str(dev_db),
            ],
            check=True,
        )

        conn = sqlite3.connect(live_db)
        conn.row_factory = sqlite3.Row

        users = conn.execute("SELECT ign FROM User ORDER BY id").fetchall()
        assert [row["ign"] for row in users] == ["Angryspanner", "LiveOnly"]

        setting = conn.execute(
            "SELECT value FROM SiteSetting WHERE key='campfireUrl'"
        ).fetchone()
        assert setting["value"] == "https://dev.example/new"

        prefs = conn.execute(
            "SELECT tickerType, enabled FROM UserTickerPreference "
            "WHERE ownerId=1 ORDER BY tickerType"
        ).fetchall()
        assert [(row["tickerType"], row["enabled"]) for row in prefs] == [
            ("events", 0),
            ("raids", 0),
        ]

        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        conn.close()

    print("V3 cutover state merge test passed")


if __name__ == "__main__":
    main()
