"""Read-only provenance inventory. Hashes files and writes only a SQLite register.

Usage (Colab): see drive_inventory.ipynb. Never modifies, moves or deletes source files.
"""
import hashlib
import os
import sqlite3
import sys
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mtime REAL NOT NULL,
  sha256 TEXT,
  error TEXT,
  scanned_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS files_sha ON files(sha256);
"""


def sha256_of(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def scan(root, db_path, max_seconds=None):
    """Resumable: unchanged files (same size and mtime) are skipped. Returns True if finished."""
    root = os.path.abspath(root)
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    start = time.time()
    done = 0
    for dirpath, _, names in os.walk(root):
        for name in names:
            path = os.path.join(dirpath, name)
            if os.path.abspath(path) == os.path.abspath(db_path):
                continue
            if max_seconds and time.time() - start > max_seconds:
                con.commit()
                con.close()
                return False
            try:
                st = os.stat(path)
                row = con.execute('SELECT size, mtime, sha256 FROM files WHERE path=?', (path,)).fetchone()
                if row and row[0] == st.st_size and row[1] == st.st_mtime and row[2]:
                    continue
                digest, err = sha256_of(path), None
            except OSError as e:
                st, digest, err = None, None, str(e)
            con.execute(
                'INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?)',
                (path, st.st_size if st else 0, st.st_mtime if st else 0, digest, err, time.time()),
            )
            done += 1
            if done % 200 == 0:
                con.commit()
    con.commit()
    con.close()
    return True


def duplicates(db_path):
    con = sqlite3.connect(db_path)
    rows = con.execute(
        'SELECT sha256, COUNT(*), GROUP_CONCAT(path, " | ") FROM files '
        'WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC'
    ).fetchall()
    con.close()
    return rows


if __name__ == '__main__':
    finished = scan(sys.argv[1], sys.argv[2])
    print('finished' if finished else 'partial')
