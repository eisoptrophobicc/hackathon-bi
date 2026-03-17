import json
from pathlib import Path
from datetime import datetime, timezone
from query_parser import parse_question
from sql_validator import validate_intent
from sql_generator import generate_sql
from query_executor import execute_query
from template_engine import find_template, store_template
from chart_selector import detect_chart
from insight_engine import generate_insight
from followup_engine import generate_followup_intent

BASE_DIR = Path(__file__).resolve().parents[1]
CACHE_FILE = BASE_DIR / "backend" / "question_cache.json"
BAD_CACHE = BASE_DIR / "backend" / "bad_cache.json"

previous_intent = None

# BAD QUESTION CACHE
def load_bad_cache():

    if not BAD_CACHE.exists():
        with open(BAD_CACHE, "w") as f:
            json.dump({}, f)
        return {}

    with open(BAD_CACHE, "r") as f:
        return json.load(f)


def store_bad_question(question, reason, intent=None):

    cache = load_bad_cache()

    cache[question] = {
        "intent": intent,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    with open(BAD_CACHE, "w") as f:
        json.dump(cache, f, indent=2)


# QUESTION CACHE
def load_question_cache():

    if not CACHE_FILE.exists():
        with open(CACHE_FILE, "w") as f:
            json.dump({}, f)
        return {}

    with open(CACHE_FILE, "r") as f:
        return json.load(f)


def store_question_cache(question, sql, intent=None):

    cache = load_question_cache()

    cache[question] = {
        "sql": sql,
        "intent": intent
    }

    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def merge_intents(previous, new):

    merged = previous.copy()

    for k, v in new.items():

        if v in (None, "", [], {}):
            continue

        if k == "filters":
            merged["filters"] = v
        else:
            merged[k] = v

    return merged

# MAIN QUERY PIPELINE
def run_query(question, mode = "new"):

    global previous_intent
    intent = None

    question = question.lower().strip()

    # BAD QUESTION CACHE
    if mode == "new":

        bad_cache = load_bad_cache()

        if question in bad_cache:

            print("SOURCE: BAD CACHE")

            return {
                "status": "error",
                "type": "bad_question",
                "reason": bad_cache[question]
            }

    # QUESTION CACHE
    if mode == "new":

        cache = load_question_cache()

        if question in cache:

            print("SOURCE: QUESTION CACHE")

            try:

                cache_entry = cache[question]

                sql = cache_entry["sql"]
                intent = cache_entry["intent"]

                df = execute_query(sql)
                
                previous_intent = intent

                if df.empty:
                    return {"status": "no_data"}
                
                data = df.to_dict(orient="records")

                chart = detect_chart(data)

                insight = generate_insight(intent, data)

                return {
                    "status": "success",
                    "data": data,
                    "sql": sql,
                    "chart": chart,
                    "insight": insight
                }

            except Exception as e:

                return {
                    "status": "error",
                    "type": "execution_error",
                    "message": str(e)
                }

    # MAIN PIPELINE
    try:

        # LLM → INTENT
        if mode == "continue" and previous_intent:

            followup_intent = generate_followup_intent(question, previous_intent)
            intent = merge_intents(previous_intent, followup_intent)
            print("MERGED:", intent)

        else:
            intent = parse_question(question)

        if not intent:
            raise ValueError("Query cannot be answered with available data")

        metrics = intent.get("metrics", [])
        aggregation = intent.get("aggregation")

        if not metrics and aggregation != "COUNT":
            raise ValueError("Query cannot be answered with available data")
        
        print("INTENT:", intent)

        validate_intent(intent)
        
        print("INTENT VALIDATED")

        # TEMPLATE ENGINE
        if mode == "new":

            sql = find_template(intent)

            print("SQL:", sql)

            if sql:

                print("SOURCE: TEMPLATE CACHE")

            else:

                print("SOURCE: LLM SQL GENERATOR")

                sql = generate_sql(intent)

                store_template(intent, sql)

        else:

            print("SOURCE: FOLLOWUP SQL GENERATOR")
            sql = generate_sql(intent)

        print("SQL GENERATED:", sql)

        # EXECUTE SQL
        df = execute_query(sql)

        print("QUERY EXECUTED")

        if df.empty:
            return {"status": "no_data"}

        # STORE SUCCESS CACHE
        if mode == "new":

            store_question_cache(question, sql, intent)
        
        data = df.to_dict(orient="records")

        chart = detect_chart(data)

        insight = generate_insight(intent, data)

        previous_intent = intent

        return {
            "status": "success",
            "data": data,
            "sql": sql,
            "chart": chart,
            "insight": insight
        }

    except ValueError as e:

        store_bad_question(question, str(e), intent)

        return {
            "status": "error",
            "type": "validation_error",
            "message": str(e)
        }

    except Exception as e:

        print("SYSTEM ERROR:", e)

        return {
            "status": "error",
            "type": "system_error",
            "message": str(e)
        }