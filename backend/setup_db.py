import pandas as pd
import sqlite3
import chardet
import re
import io
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
CSV_FILE = BASE_DIR / "backend" / "YouTube Content Creation.csv"
DB_FILE = BASE_DIR / "backend" /"youtube_content.db"
TABLE_NAME = "youtube_videos"

DEBUG = False

def debug(msg):
    if DEBUG:
        print(f"[DEBUG] {msg}")

# Detect encoding of the file
def detect_encoding(filepath):

    with open(filepath, "rb") as f:
        raw = f.read(100000)

    if not raw:
        raise ValueError("CSV file is empty")

    result = chardet.detect(raw)
    encoding = result["encoding"] or "utf-8"

    debug(f"Detected encoding: {encoding}")

    return encoding

# Extract CSV content from the file
# Handles HTML <pre>, garbage before CSV, or normal CSV
def extract_csv_text(filepath):
    
    encoding = detect_encoding(filepath)

    with open(filepath, "r", encoding=encoding, errors="ignore") as f:
        content = f.read()

    # ✅ 1. If HTML <pre> exists → clean it
    match = re.search(r"<pre[^>]*>(.*?)</pre>", content, re.DOTALL)
    if match:
        debug("CSV extracted from HTML <pre>")
        return match.group(1)

    # ✅ 2. NEW: Check if file already looks like a valid CSV
    lines = content.splitlines()

    if len(lines) > 3:
        first_cols = len(lines[0].split(","))
        second_cols = len(lines[1].split(","))
        third_cols = len(lines[2].split(","))

        # If first 3 rows are consistent → assume clean CSV
        if first_cols > 3 and first_cols == second_cols == third_cols:
            debug("Clean CSV detected → skipping extraction logic")
            return content
        
        # ✅ Try parsing as-is FIRST (header-safe check)
    try:
        test_df = pd.read_csv(
            io.StringIO(content),
            engine="python",
            nrows=5
        )

        # If pandas reads columns properly → it's already clean
        if len(test_df.columns) > 1:
            debug("Valid CSV detected → skipping cleanup")
            return content

    except Exception:
        pass

    # ⚠️ 3. FALLBACK: your existing detection logic
    debug("No clean structure detected, using fallback extraction")

    for i, line in enumerate(lines):

        cols = line.split(",")

        if len(cols) < 5:
            continue

        consistent_rows = 0

        for j in range(1, 4):

            if i + j >= len(lines):
                break

            if len(lines[i + j].split(",")) == len(cols):
                consistent_rows += 1

        if consistent_rows >= 2:
            return "\n".join(lines[i:])

    raise ValueError("Could not detect CSV structure")

# Load cleaned CSV text into pandas
def load_dataframe(filepath):

    csv_text = extract_csv_text(filepath)

    df = pd.read_csv(io.StringIO(csv_text))

    debug(f"Rows loaded: {len(df)}")

    df = df.dropna(how="all")
    df = df.convert_dtypes()

    return df

# Print dataframe diagnostics
def validate_dataframe(df):

    if not DEBUG:
        return

    print("\n[DEBUG] DataFrame Info")
    print(df.info())

    print("\n[DEBUG] First 5 rows")
    print(df.head())

    print("\n[DEBUG] Null values")
    print(df.isnull().sum())

    print("\n[DEBUG] Sample stats")
    print(df.describe())

    print("\n[DEBUG] Column dtypes")
    print(df.dtypes)

# Write dataframe into SQLite
def write_to_sqlite(df, db_file, table_name):

    conn = sqlite3.connect(str(DB_FILE))

    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    df.to_sql(
        table_name,
        conn,
        if_exists="replace",
        index=False,
        chunksize=500,
        method="multi"
    )
    
    cursor = conn.cursor()
    
    cursor.execute("DROP VIEW IF EXISTS youtube_videos_staging;")
    cursor.execute("""
        CREATE VIEW youtube_videos_staging AS
        SELECT DISTINCT *
        FROM youtube_videos;
        """)
    
    conn.commit()
    
    debug("Staging view created")
    
    print(f"\nData written to SQLite: {db_file}")

    return conn

# Run a couple queries to confirm DB works
def validate_database(conn, table_name):
    
    if not DEBUG:
        return
    
    cursor = conn.cursor()
    
    print("\nTotal rows in database")

    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    print(cursor.fetchone())

    print("\nExample query")

    cursor.execute(f"""
        SELECT category, SUM(views) AS total_views
        FROM {table_name}
        GROUP BY category
        ORDER BY total_views DESC
        LIMIT 5
    """)

    for row in cursor.fetchall():
        print(row)

def ingest_dataframe(df):

    conn = sqlite3.connect(str(DB_FILE))

    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    df.to_sql(
        TABLE_NAME,
        conn,
        if_exists="replace",
        index=False,
        chunksize=500,
        method="multi"
    )

    cursor = conn.cursor()

    cursor.execute("DROP VIEW IF EXISTS youtube_videos_staging")

    cursor.execute("""
        CREATE VIEW youtube_videos_staging AS
        SELECT DISTINCT *
        FROM youtube_videos
    """)

    conn.commit()

    conn.close()

# Full ingestion pipeline
def run_pipeline(csv_file):

    df = load_dataframe(csv_file)

    validate_dataframe(df)

    ingest_dataframe(df)

if __name__ == "__main__":

    run_pipeline(CSV_FILE)