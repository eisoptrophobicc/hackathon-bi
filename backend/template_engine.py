import json
from pathlib import Path
from query_parser import load_schema
import re

BASE_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_FILE = BASE_DIR / "backend" / "template_memory.json"


def load_templates():

    if not TEMPLATE_FILE.exists():
        with open(TEMPLATE_FILE, "w") as f:
            json.dump([], f)
        return []

    with open(TEMPLATE_FILE, "r") as f:
        return json.load(f)


def normalize_intent(intent):

    normalized = intent.copy()

    normalized["group_by"] = sorted(intent.get("group_by", []))

    normalized["filters"] = sorted(
        intent.get("filters", []),
        key=lambda f: f.get("column")
    )

    return normalized


def validate_filter_values(filters):

    schema = load_schema()

    categorical_examples = {}

    for col, meta in schema["columns"].items():
        if "examples" in meta:
            categorical_examples[col] = meta["examples"]

    for f in filters:

        column = f.get("column")
        value = f.get("value")

        if column not in categorical_examples:
            continue

        valid_values = categorical_examples[column]

        if isinstance(value, list):
            for v in value:
                if v not in valid_values:
                    print(f"INVALID FILTER VALUE: {column} = {v}")
                    return False
        else:
            if value not in valid_values:
                print(f"INVALID FILTER VALUE: {column} = {value}")
                return False

    return True


def build_pattern(intent):

    pattern = {
        "aggregation": intent.get("aggregation"),
        "metric": "{metric}",
        "filters": {},
        "group_by": "{dimension}" if intent.get("group_by") else None
    }

    for f in intent.get("filters", []):
        col = f["column"]
        pattern["filters"][col] = "{" + col + "}"

    if intent.get("order_by"):
        pattern["order_by"] = "{metric}"
        pattern["order"] = intent.get("order")

    if intent.get("limit"):
        pattern["limit"] = intent["limit"]

    return pattern


def match_pattern(intent, pattern):

    if intent.get("aggregation") != pattern.get("aggregation"):
        return False

    if pattern["group_by"] == "{dimension}":
        if not intent.get("group_by"):
            return False
    else:
        if intent.get("group_by") != pattern.get("group_by"):
            return False

    intent_filter_cols = {f["column"] for f in intent.get("filters", [])}
    pattern_filter_cols = set(pattern["filters"].keys())

    if intent_filter_cols != pattern_filter_cols:
        return False

    if "limit" in pattern:
        if intent.get("limit") != pattern["limit"]:
            return False

    if "order" in pattern:
        if intent.get("order") != pattern["order"]:
            return False

    if "order_by" in pattern:
        if not intent.get("order_by"):
            return False

    return True


def find_template(intent):

    if intent.get("calculation"):
        return None

    if len(intent.get("metrics", [])) > 1:
        return None

    normalized_intent = normalize_intent(intent)

    if not validate_filter_values(normalized_intent.get("filters", [])):
        print("TEMPLATE BYPASSED: invalid filter value")
        return None

    templates = load_templates()

    for t in templates:

        if match_pattern(normalized_intent, t["intent_pattern"]):

            print("SOURCE: TEMPLATE CACHE")

            return generate_sql_from_pattern(t, normalized_intent)

    return None


def generate_sql_from_pattern(template, intent):

    metrics = intent.get("metrics", [])
    agg = intent.get("aggregation")

    if metrics:
        metric_sql = ", ".join([f"{agg}({m})" for m in metrics])
    else:
        metric_sql = "COUNT(*)"

    variables = {}

    if intent.get("group_by"):
        variables["dimension"] = intent["group_by"][0]

    for f in intent.get("filters", []):
        variables[f["column"]] = f["value"]

    sql = template["sql_template"]

    sql = sql.replace(f"{agg}({{metric}})", metric_sql)

    if metrics:
        sql = sql.replace("{metric}", metrics[0])

    if "dimension" in variables:
        sql = sql.replace("{dimension}", variables["dimension"])

    for key, value in variables.items():
        sql = sql.replace("{" + key + "}", str(value))

    if intent.get("order") and intent.get("order_by") and "ORDER BY" not in sql.upper():
        metric_for_order = metrics[0] if metrics else "*"
        sql += f" ORDER BY {agg}({metric_for_order}) {intent['order']}"

    if intent.get("limit"):
        sql += f" LIMIT {intent['limit']}"

    if re.search(r"\{.+?\}", sql):
        print("BROKEN TEMPLATE:", sql)
        raise ValueError("Unresolved template variables")

    return sql


def store_template(intent, sql):

    if intent.get("calculation"):
        return

    if len(intent.get("metrics", [])) > 1:
        return

    if not validate_filter_values(intent.get("filters", [])):
        print("TEMPLATE NOT STORED: invalid filter value")
        return

    templates = load_templates()

    pattern = build_pattern(intent)

    sql_template = sql

    for f in intent.get("filters", []):
        key = f["column"]
        value = str(f["value"])
        sql_template = sql_template.replace(value, "{" + key + "}")

    metrics = intent.get("metrics", [])
    agg = intent.get("aggregation")

    for m in metrics:
        sql_template = sql_template.replace(
            f"{agg}({m})",
            f"{agg}({{metric}})"
        )

    if intent.get("group_by"):
        sql_template = sql_template.replace(
            intent["group_by"][0],
            "{dimension}"
        )

    if intent.get("order_by") and metrics:
        sql_template = sql_template.replace(
            metrics[0],
            "{metric}"
        )

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