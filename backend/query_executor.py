import sqlite3
import pandas as pd
from pathlib import Path

def execute_query(sql):

    # locate database
    BASE_DIR = Path(__file__).resolve().parents[1]
    DB_FILE = BASE_DIR / "backend" /"youtube_content.db"
    
    # connect to database
    conn = sqlite3.connect(DB_FILE)

    # execute SQL and load into dataframe
    df = pd.read_sql_query(sql, conn)

    conn.close()

    return df