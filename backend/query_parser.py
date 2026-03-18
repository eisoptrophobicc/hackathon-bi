import json
from pathlib import Path
from dotenv import load_dotenv
import re
from genai_client import get_genai_client

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]
SCHEMA_PATH = BASE_DIR / "backend" / "schema_memory.json"

def load_schema():
    with open(SCHEMA_PATH, "r") as f:
        return json.load(f)

def extract_roles(schema):

    metrics = []
    dimensions = []
    datetimes = []

    for col, meta in schema["columns"].items():

        role = meta.get("role")

        if role == "metric":
            metrics.append(col)

        elif role == "dimension":
            dimensions.append(col)

        elif role == "datetime":
            datetimes.append(col)

    return metrics, dimensions, datetimes

def clean_json(text):

    if not text:
        return {}

    text = text.strip()

    text = re.sub(r"```[a-zA-Z]*", "", text)

    start = text.find("{")

    if start == -1:
        return {}

    brace_count = 0
    end = None

    for i in range(start, len(text)):
        if text[i] == "{":
            brace_count += 1
        elif text[i] == "}":
            brace_count -= 1

            if brace_count == 0:
                end = i
                break

    if end is None:
        return {}

    json_str = text[start:end+1]

    try:
        return json.loads(json_str)
    except Exception as e:
        print("JSON PARSE ERROR:", e)
        print("BAD JSON:", json_str)
        return {}

def validate_plan(plan, metrics, dimensions, datetimes):

    plan.setdefault("metrics", [])
    plan.setdefault("aggregation", "")
    plan.setdefault("group_by", [])
    plan.setdefault("filters", [])
    plan.setdefault("order_by", None)
    plan.setdefault("order", None)
    plan.setdefault("limit", None)
    plan.setdefault("calculation", None)

    valid_columns = set(metrics + dimensions + datetimes)

    plan["metrics"] = [
        m for m in plan["metrics"]
        if m in metrics
    ]

    plan["group_by"] = [
        g for g in plan["group_by"]
        if g in dimensions
    ]

    valid_filters = []

    for f in plan["filters"]:

        if not isinstance(f, dict):
            continue

        col = f.get("column")
        op = f.get("op")
        value = f.get("value")

        if col not in valid_columns:
            continue

        if op not in ["=", "IN", ">", "<", ">=", "<=", "BETWEEN", "LIKE"]:
            continue

        if value is None:
            continue

        valid_filters.append({
            "column": col,
            "op": op,
            "value": value
        })

    plan["filters"] = valid_filters

    if plan["order_by"] not in valid_columns:
        plan["order_by"] = None
        plan["order"] = None

    if plan["order"] not in ["ASC", "DESC"]:
        plan["order"] = None

    if plan["limit"] is not None:
        try:
            plan["limit"] = int(plan["limit"])
        except:
            plan["limit"] = None

    if plan["group_by"] and not plan["aggregation"]:
        plan["aggregation"] = "SUM"

    calc = plan.get("calculation")

    if calc:

        if not isinstance(calc, dict):
            plan["calculation"] = None
            return plan

        calc_type = calc.get("type")

        if calc_type not in ["PERCENT_OF_TOTAL", "RATIO"]:
            plan["calculation"] = None
            return plan

        if calc_type == "PERCENT_OF_TOTAL":

            if not plan["group_by"]:
                plan["calculation"] = None

        if calc_type == "RATIO":

            numerator = calc.get("numerator")
            denominator = calc.get("denominator")

            if numerator not in metrics:
                plan["calculation"] = None

            if denominator not in metrics and denominator != "COUNT":
                plan["calculation"] = None

            if len(plan["metrics"]) > 1:
                pass
            else:
                plan["metrics"] = [numerator]

    # allow multiple metrics unless calculation logic requires otherwise
    if plan["calculation"] and plan["calculation"]["type"] == "RATIO":
        plan["metrics"] = [plan["calculation"]["numerator"]]

    return plan

def build_prompt(question, schema):

    metrics, dimensions, datetimes = extract_roles(schema)

    role_map = {
                    col: {
                        "role": meta["role"],
                        "examples": meta.get("examples", [])
                    }
                    for col, meta in schema["columns"].items()
                }

    prompt = f"""
You are an analytics query planner.

Your job is to convert a natural language analytics question into a structured query plan.

You MUST strictly use ONLY the provided schema.

SCHEMA

Columns with roles and example values:

{json.dumps(role_map)}

STRICT RULES

1. You may ONLY use columns listed in the schema.
2. Never invent column names.
3. Never invent filter values.
4. Filter values must come from the column examples when available.
5. If a value cannot reasonably map to any example value, do NOT create that filter.
6. If the question refers to concepts not represented in the schema, return an empty plan.

COLUMN ROLES

metric columns
- numeric values that may be aggregated
- only these may appear in "metrics"

dimension columns
- categorical attributes used for grouping or filtering

datetime columns
- used for time filtering

id columns
- unique identifiers
- never used as metrics or grouping columns

DERIVED METRIC LOGIC

Some user concepts represent combinations of multiple metrics.
In such case use the metric with the highest relevance to the quetion. If multiple metrics are explicitly mentioned, include all of them.
You may derive metrics ONLY if all required metric columns exist.

Examples:

engagement → likes + comments + views → views 
interaction → likes + comments → comments
total reactions → likes + comments + shares + likes

Rules:

- Only combine metric columns present in the schema.
- Never invent new columns.
- If the concept cannot be derived, return an empty plan.

VALUE NORMALIZATION RULE

If a column contains example values in the schema, those examples represent the exact values stored in the database.

When generating filter values:

1. Look at the example values for the column.
2. Determine which example corresponds to the user's meaning.
3. Copy that example value exactly.

Do not rewrite, modify, pluralize, or paraphrase example values.
Only use values that appear exactly in the example list.

FILTER VALUE CONSTRAINT

If a column includes example values in the schema, those examples represent the ONLY valid values that exist in the database.

When generating a filter for such a column:

- MAKE SURE TO LOOK AT THE COLUMN EXAMPLES.
- The filter value MUST be exactly like one of the example values.
- Do not output natural language variants.
- Do not output synonyms.
- Do not output full names if the examples use codes.

You MUST select the closest matching value from the example list.

CALCULATION TYPES

PERCENT_OF_TOTAL

Triggered by words:
percentage
percent
%

Requires grouping.

RATIO

Triggered by patterns:
per
ratio
rate

When a user expresses a metric per another metric, create a ratio calculation.

Rules:

1. The numerator must be a metric column.
2. The denominator must be either:
   - another metric column, OR
   - COUNT if the user refers to rows or entities.

Examples of row-based phrases include:

per item
per record
per entry
per row

In such cases use:

"denominator": "COUNT"

Output format:

"calculation": {{
"type": "RATIO",
"numerator": "metric",
"denominator": "metric" or "COUNT"
}}

MAPPING LOGIC

Aggregation

average, mean → AVG  
sum, total → SUM  
count, number of → COUNT  
maximum, highest → MAX  
minimum, lowest → MIN  

Ranking

top, best, highest → order DESC  
least, lowest, worst → order ASC  

Grouping

phrases like:

by region  
per category  
broken down by language  

→ add the dimension column to group_by.

TIME FILTERS

If the user refers to time (year, month, ranges):

Use a column with role "datetime".

Examples:

{{"column":"<datetime_column>","op":"BETWEEN","value":["YYYY-MM-DD","YYYY-MM-DD"]}}

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

DEFAULT BEHAVIOR

If grouping exists but aggregation missing → use SUM.

If ranking is requested and multiple metrics exist → order by the first metric.

Never produce LIMIT without ORDER BY.

INVALID OR VAGUE QUESTIONS

If the question:

- cannot be mapped to schema columns
- contains unsupported concepts
- does not clearly indicate a metric

return an empty plan:

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

USER QUESTION:

{question}
"""

    return prompt, metrics, dimensions, datetimes

def parse_question(question):
    client = get_genai_client()

    schema = load_schema()

    prompt, metrics, dimensions, datetimes = build_prompt(question, schema)

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    print("RAW:", response.text)
    plan = clean_json(response.text)

    plan = validate_plan(plan, metrics, dimensions, datetimes)
    print(plan)
    return plan
