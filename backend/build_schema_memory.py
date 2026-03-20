import json
import sqlite3
from pathlib import Path
from dotenv import load_dotenv
from schema_loader import get_columns
from genai_client import get_genai_client

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]
DB_FILE = BASE_DIR / "backend" / "youtube_content.db"
TABLE = "youtube_videos_staging"
SCHEMA_PATH = BASE_DIR / "backend" / "schema_memory.json"

def get_column_types(db_path, table):

    conn = sqlite3.connect(db_path)
    cursor = conn.execute(f"PRAGMA table_info({table})")

    column_types = {}

    for row in cursor.fetchall():
        column_types[row[1]] = row[2]

    conn.close()

    return column_types

def get_examples(db_path, table, columns):

    conn = sqlite3.connect(db_path)

    examples = {}

    for col in columns:

        try:
            query = f"SELECT DISTINCT {col} FROM {table} LIMIT 5"
            values = [r[0] for r in conn.execute(query).fetchall()]

            examples[col] = values

        except:
            pass

    conn.close()

    return examples

def classify_schema_llm(columns, column_types, examples):
    client = get_genai_client()

    schema_info = []

    for col in columns:

        schema_info.append({
            "column": col,
            "type": column_types.get(col, "TEXT"),
            "examples": examples.get(col, [])
        })

    prompt = f"""
                Classify database columns into semantic roles.

                Roles:
                metric -> numeric value used for aggregation
                dimension -> categorical grouping column
                datetime -> date or timestamp column
                id -> identifier column
                text -> long text field not suitable for grouping

                Columns:

                {json.dumps(schema_info, indent=2)}

                Return JSON mapping column -> role.

                Example output:

                {{
                "views":"metric",
                "region":"dimension",
                "publish_time":"datetime",
                "video_id":"id"
                }}
            """

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    text = response.text.strip()

    if "```" in text:
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}") + 1

    return json.loads(text[start:end])

def build_schema():

    columns = get_columns(DB_FILE, TABLE)

    column_types = get_column_types(DB_FILE, TABLE)

    examples = get_examples(DB_FILE, TABLE, columns)

    roles = classify_schema_llm(columns, column_types, examples)

    semantic_columns = {}

    for col in columns:

        entry = {
            "type": column_types.get(col, "TEXT"),
            "role": roles.get(col, "dimension")
        }

        if col in examples:
            entry["examples"] = examples[col]

        semantic_columns[col] = entry

    schema = {
        "table": TABLE,
        "columns": semantic_columns
    }

    with open(SCHEMA_PATH, "w") as f:
        json.dump(schema, f, indent=2)

    print("Schema memory built.")
    print(json.dumps(schema, indent=2))

if __name__ == "__main__":
    build_schema()
