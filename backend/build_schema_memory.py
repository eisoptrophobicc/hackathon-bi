import json
from pathlib import Path
import sqlite3
from schema_loader import get_columns
from schema_classifier import classify_schema

BASE_DIR = Path(__file__).resolve().parents[1]
DB_FILE = BASE_DIR / "backend" /"youtube_content.db"
columns = get_columns(DB_FILE, "youtube_videos_staging")

def get_categorical_examples(db_path, table, columns):

    conn = sqlite3.connect(db_path)
    examples = {}

    for col in columns:

        query = f"SELECT DISTINCT {col} FROM {table} LIMIT 10"

        try:
            values = [r[0] for r in conn.execute(query).fetchall()]

            if values and isinstance(values[0], str):
                examples[col] = values

        except:
            pass

    conn.close()

    return examples

examples = get_categorical_examples(DB_FILE, "youtube_videos_staging", columns)

schema = classify_schema(columns)

schema["columns"] = columns
schema["categorical_examples"] = examples

schema_path = BASE_DIR / "backend" / "schema_memory.json"
with open(schema_path, "w") as f:
    json.dump(schema, f, indent=2)

print(schema)

