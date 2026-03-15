import json
from pathlib import Path
from query_parser import load_schema

BASE_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_FILE = BASE_DIR / "backend" / "template_memory.json"

# LOAD TEMPLATE MEMORY
def load_templates():

    if not TEMPLATE_FILE.exists():
        with open(TEMPLATE_FILE, "w") as f:
            json.dump([], f)
        return []

    with open(TEMPLATE_FILE, "r") as f:
        return json.load(f)

# VALIDATE FILTER VALUES
def validate_filter_values(filters):

    schema = load_schema()

    categorical_examples = schema.get("categorical_examples", {})

    for column, value in filters.items():

        if column not in categorical_examples:
            continue

        valid_values = categorical_examples[column]

        if value not in valid_values:
            print(f"INVALID FILTER VALUE: {column} = {value}")
            return False

    return True

# BUILD TEMPLATE PATTERN
def build_pattern(intent):

    pattern = {
        "aggregation": intent["aggregation"],
        "metric": "{metric}",
        "filters": {}
    }

    # group_by
    if intent["group_by"]:
        pattern["group_by"] = "{dimension}"
    else:
        pattern["group_by"] = None

    # filters
    for k in intent["filters"]:
        pattern["filters"][k] = "{" + k + "}"

    # ranking fields
    if intent["order_by"]:
        pattern["order_by"] = "{metric}"
        pattern["order"] = intent["order"]

    if intent["limit"]:
        pattern["limit"] = intent["limit"]

    return pattern

# MATCH TEMPLATE PATTERN
def match_pattern(intent, pattern):
    if intent["aggregation"] != pattern["aggregation"]:
        return False

    # group_by match
    if pattern["group_by"] == "{dimension}":
        if intent["group_by"] is None:
            return False
    else:
        if intent["group_by"] != pattern["group_by"]:
            return False

    # filters must match structure
    if set(intent["filters"].keys()) != set(pattern["filters"].keys()):
        return False

    # limit check
    if "limit" in pattern:
        if intent["limit"] != pattern["limit"]:
            return False

    # order check
    if "order" in pattern:
        if intent["order"] != pattern["order"]:
            return False

    # order_by check
    if "order_by" in pattern:
        if intent["order_by"] is None:
            return False

    return True

# FIND TEMPLATE
def find_template(intent):

    # normalize filters FIRST
    if not validate_filter_values(intent["filters"]):
        print("TEMPLATE BYPASSED: invalid filter value")
        return None

    templates = load_templates()

    for t in templates:

        if match_pattern(intent, t["intent_pattern"]):

            print("SOURCE: TEMPLATE CACHE")

            return generate_sql_from_pattern(t, intent)

    return None

# GENERATE SQL FROM TEMPLATE
def generate_sql_from_pattern(template, intent):

    metrics = intent.get("metrics", [])

    # fallback for old format
    if not metrics and "metric" in intent:
        metrics = [intent["metric"]]

    agg = intent["aggregation"]

    # build aggregated metric list
    metric_sql = ", ".join([f"{agg}({m})" for m in metrics])

    variables = {}

    # dimension
    if intent["group_by"]:
        variables["dimension"] = intent["group_by"]

    # filters
    for k, v in intent["filters"].items():
        variables[k] = v

    sql = template["sql_template"]

    # expand aggregated metrics
    sql = sql.replace(f"{agg}({{metric}})", metric_sql)

    # replace other placeholders
    for key, value in variables.items():
        sql = sql.replace("{" + key + "}", str(value))

    # ORDER BY
    if intent.get("order") and intent.get("order_by"):

        metric_for_order = metrics[0]
        sql += f" ORDER BY {agg}({metric_for_order}) {intent['order']}"

    # LIMIT
    if intent.get("limit"):
        sql += f" LIMIT {intent['limit']}"

    # safety check
    if "{" in sql or "}" in sql:
        raise ValueError("Unresolved template variables")

    return sql

# STORE TEMPLATE
def store_template(intent, sql):

    # DO NOT STORE BAD FILTERS
    if not validate_filter_values(intent["filters"]):
        print("TEMPLATE NOT STORED: invalid filter value")
        return

    templates = load_templates()

    pattern = build_pattern(intent)

    sql_template = sql

    # replace filter values
    for key in intent["filters"]:
        value = intent["filters"][key]
        sql_template = sql_template.replace(value, "{" + key + "}")

    # replace metric
    metrics = intent.get("metrics", [])

    if not metrics and "metric" in intent:
        metrics = [intent["metric"]]

    # replace aggregated metrics with a single placeholder
    for m in metrics:
        sql_template = sql_template.replace(f"{intent['aggregation']}({m})", f"{intent['aggregation']}({{metric}})")

    # collapse duplicates if multi-metric query generated them
    upper_sql = sql_template.upper()
    parts = upper_sql.split("SELECT")[1].split("FROM")[0]

    if parts.count("{metric}") > 1:
        sql_template = f"SELECT {{dimension}}, {intent['aggregation']}({{metric}}) FROM youtube_videos_staging GROUP BY {{dimension}}"

    # replace dimension
    if intent["group_by"]:
        sql_template = sql_template.replace(intent["group_by"], "{dimension}")

    # replace metric in order_by
    if intent["order_by"] and metrics:
        metric = metrics[0]
        sql_template = sql_template.replace(metric, "{metric}")

    # avoid duplicate patterns
    for t in templates:
        if t["intent_pattern"] == pattern:
            return

    templates.append({
        "intent_pattern": pattern,
        "sql_template": sql_template
    })

    with open(TEMPLATE_FILE, "w") as f:
        json.dump(templates, f, indent=2)

    print("TEMPLATE STORED")