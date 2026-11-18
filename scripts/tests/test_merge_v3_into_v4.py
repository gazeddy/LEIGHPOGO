import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('merge', Path(__file__).resolve().parents[1] / 'merge-v3-into-v4.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE User (id INTEGER PRIMARY KEY AUTOINCREMENT, ign TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT, role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE Entry (id INTEGER PRIMARY KEY AUTOINCREMENT,ownerId INTEGER NOT NULL REFERENCES User(id), trainerName TEXT NOT NULL, code TEXT NOT NULL, team TEXT,createdAt TEXT,updatedAt TEXT);
CREATE TABLE PokedexEntry (id INTEGER PRIMARY KEY AUTOINCREMENT,ownerId INTEGER NOT NULL REFERENCES User(id),dexNumber INTEGER NOT NULL,createdAt TEXT,updatedAt TEXT, UNIQUE(ownerId,dexNumber));
CREATE TABLE TradeListing (id INTEGER PRIMARY KEY AUTOINCREMENT,ownerId INTEGER NOT NULL REFERENCES User(id),createdAt TEXT,updatedAt TEXT,friendshipRequirement TEXT,location TEXT,notes TEXT,status TEXT,expiresAt TEXT);
CREATE TABLE TradeListingItem (id INTEGER PRIMARY KEY AUTOINCREMENT,listingId INTEGER NOT NULL REFERENCES TradeListing(id),direction TEXT,pokemonName TEXT,shiny INT,lucky INT,xxl INT,xxs INT,costume INT,background INT,dynamax INT,gigantamax INT,notes TEXT);
CREATE TABLE FriendCodeGrabNotification (id INTEGER PRIMARY KEY AUTOINCREMENT, ownerId INTEGER REFERENCES User(id),copiedById INTEGER REFERENCES User(id),entryId INTEGER REFERENCES Entry(id),createdAt TEXT,readAt TEXT);
CREATE TABLE UserTickerPreference (id INTEGER PRIMARY KEY AUTOINCREMENT,ownerId INTEGER REFERENCES User(id),tickerType TEXT,enabled INT,UNIQUE(ownerId,tickerType));
CREATE TABLE PushSubscription (id INTEGER PRIMARY KEY AUTOINCREMENT,ownerId INTEGER REFERENCES User(id),endpoint TEXT UNIQUE,p256dh TEXT,auth TEXT,userAgent TEXT,timeZone TEXT,lastRaidHourReminderKey TEXT,createdAt TEXT,updatedAt TEXT);
CREATE TABLE SiteSetting (key TEXT PRIMARY KEY,value TEXT,updatedAt TEXT);
'''
class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.a=Path(self.tmp.name)/'v4-candidate.db'
        self.b=Path(self.tmp.name)/'v3-snapshot.db'
        for p in (self.a,self.b):
            db=sqlite3.connect(p)
            db.executescript(SCHEMA)
            db.commit();db.close()
        with sqlite3.connect(self.a) as db:
            db.executescript('''
INSERT INTO User(id,ign,password,role) VALUES (1,'Shared','hash1','admin'),(2,'DevOnly','hash2','user');
INSERT INTO Entry(id,ownerId,trainerName,code,team,createdAt,updatedAt) VALUES (100,1,'Shared','1234 5678 9012','MYSTIC','2026-01','2026-02');
INSERT INTO PokedexEntry(ownerId,dexNumber) VALUES (1,25);
CREATE TABLE GiftBatch(id TEXT PRIMARY KEY,title TEXT,slug TEXT UNIQUE,expiresAt TEXT);
CREATE TABLE GiftCode(id INTEGER PRIMARY KEY,batchId TEXT REFERENCES GiftBatch(id),code TEXT UNIQUE,ownerId INT REFERENCES User(id),claimedAt TEXT);
INSERT INTO GiftBatch(id,title,slug,expiresAt) VALUES ('batch-dev','Gift','gift','2026-12-12');
INSERT INTO GiftCode(id,batchId,code,ownerId,claimedAt) VALUES (8,'batch-dev','CLAIMED-V4',2,'2026-11-15');
INSERT INTO SiteSetting(key,value) VALUES ('theme','v4');
''')
        with sqlite3.connect(self.b) as db:
            db.executescript('''
INSERT INTO User(id,ign,password,role) VALUES (2,'SHARED','hash1','admin'),(3,'LiveOnly','livepass','user');
INSERT INTO Entry(id,ownerId,trainerName,code,team,createdAt,updatedAt) VALUES (15,2,'Shared','123456789012','MYSTIC','2026-01','2026-03'), (16,3,'LiveOnly','1111 2222 3333','INSTINCT','2026-05','2026-05');
INSERT INTO PokedexEntry(ownerId,dexNumber) VALUES (2,25), (3,50);
INSERT INTO FriendCodeGrabNotification(ownerId,copiedById,entryId,createdAt) VALUES (3,2,15,'2026-11');
INSERT INTO UserTickerPreference(ownerId,tickerType,enabled) VALUES (3,'gyms',0);
INSERT INTO SiteSetting(key,value) VALUES ('theme','v3'),('welcome','yes');
''')
    def open(self):
        a=sqlite3.connect(self.a)
        b=sqlite3.connect(self.b)
        for d in (a,b):d.row_factory=sqlite3.Row
        a.execute('PRAGMA foreign_keys=ON')
        b.execute('PRAGMA query_only=ON')
        return a,b
    def test_merge_remaps_and_preserves_v4_gifts(self):
        a,b=self.open()
        try:
            report=merge.merge(a,b,False)
            self.assertEqual(report['users_after'],3)
            self.assertEqual(report['users_added'],1)
            self.assertTrue(report['gift_codes_unchanged'])
            self.assertEqual(a.execute('SELECT ownerId FROM GiftCode WHERE id=8').fetchone()[0],2)
            self.assertEqual(a.execute('SELECT value FROM SiteSetting WHERE key="theme"').fetchone()[0],'v4')
            self.assertEqual(a.execute('SELECT value FROM SiteSetting WHERE key="welcome"').fetchone()[0],'yes')
            self.assertEqual(a.execute('SELECT COUNT(*) FROM Entry').fetchone()[0],2)
            self.assertEqual(a.execute('SELECT ownerId FROM Entry WHERE code="1111 2222 3333"').fetchone()[0],3)
            self.assertEqual(tuple(a.execute('SELECT ownerId,copiedById,entryId FROM FriendCodeGrabNotification').fetchone()),(3,1,100))
            self.assertEqual(a.execute('PRAGMA foreign_key_check').fetchall(),[])
            # Merge is idempotent.
            again=merge.merge(a,b,False)
            self.assertEqual(again['users_added'],0)
            self.assertEqual(a.execute('SELECT COUNT(*) FROM FriendCodeGrabNotification').fetchone()[0],1)
        finally:a.close();b.close()
    def test_password_conflict_aborts(self):
        a,b=self.open()
        try:
            b.execute('PRAGMA query_only=OFF')
            b.execute('UPDATE User SET password="different" WHERE id=2')
            b.commit(); b.execute('PRAGMA query_only=ON')
            with self.assertRaisesRegex(RuntimeError,'password hashes'):
                merge.merge(a,b,False)
            self.assertEqual(a.execute('SELECT COUNT(*) FROM User').fetchone()[0],2)
        finally:a.close();b.close()
if __name__=='__main__':unittest.main()
