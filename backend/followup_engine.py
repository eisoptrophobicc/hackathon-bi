import json
import re
from pathlib import Path
from dotenv import load_dotenv

from query_parser import load_schema, extract_roles, clean_json, validate_plan
from genai_client import get_genai_client

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]


def build_followup_prompt(question, previous_intent, schema):

    role_map = {
        col: {
            "role": meta["role"],
            "examples": meta.get("examples", [])
        }
        for col, meta in schema["columns"].items()
    }

    prompt = f"""
You are an analytics follow-up query planner.

Your job is to MODIFY an existing structured query plan based on a user's follow-up question.

You MUST strictly use ONLY the provided schema.

SCHEMA

Columns with roles and example values:

{json.dumps(role_map)}

PREVIOUS QUERY PLAN

{json.dumps(previous_intent, indent=2)}

FOLLOW-UP MODIFICATION RULES

The previous query plan represents the user's existing query.

The user has asked a follow-up question. Modify the previous plan accordingly.

Rules:

1. Preserve all fields from the previous plan unless the follow-up clearly changes them.
2. Only modify fields relevant to the follow-up question.
3. If the follow-up adds a filter, modify the filters field.
4. If the follow-up changes ranking (e.g., "top 5"), modify order/order_by/limit.
5. If the follow-up adds grouping (e.g., "by category"), modify group_by.
6. If the follow-up changes the metric entirely, replace the metric and aggregation.
7. Do NOT remove filters or grouping unless the user explicitly asks to remove them.

STRICT RULES

1. You may ONLY use columns listed in the schema.
2. Never invent column names.
3. Never invent filter values.
4. Filter values must come from the column examples when available.
5. If a value cannot reasonably map to any example value, do NOT create that filter.

COLUMN ROLES

metric columns
- numeric values that may be aggregated
- only these may appear in "metrics"

dimension columns
- categorical attributes used for grouping or filtering

datetime columns
- used for time filtering

VALUE NORMALIZATION RULE

If a column contains example values in the schema, those examples represent the exact values stored in the database.

When generating filter values:

1. Look at the example values for the column.
2. Determine which example corresponds to the user's meaning.
3. Copy that example value exactly.

Do NOT rewrite or paraphrase example values.

Only use values that appear exactly in the example list.

FILTER STRUCTURE

Filters must follow this structure:

{{"column":"column","op":"operator","value":"value"}}

Allowed operators:

=
IN
>
<
>=
<=
BETWEEN
LIKE

OUTPUT FORMAT

Return ONLY valid JSON.

Structure:

{{
"metrics": [],
"aggregation": "",
"group_by": [],
"filters": [],
"order_by": null,
"order": null,
"limit": null,
"calculation": null
}}

Do not include explanations.

FOLLOW-UP QUESTION:

{question}
"""

    return prompt


def generate_followup_intent(question, previous_intent):
    client = get_genai_client()

    schema = load_schema()

    metrics, dimensions, datetimes = extract_roles(schema)

    prompt = build_followup_prompt(question, previous_intent, schema)

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    print("FOLLOWUP RAW:", response.text)

    plan = clean_json(response.text)

    plan = validate_plan(plan, metrics, dimensions, datetimes)

    print("FOLLOWUP INTENT:", plan)

    return plan
