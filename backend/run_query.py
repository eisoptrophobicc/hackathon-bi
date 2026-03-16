import json
from pathlib import Path
from datetime import datetime
from query_parser import parse_question
from sql_validator import validate_intent
from sql_generator import generate_sql
from query_executor import execute_query
from template_engine import find_template, store_template

BASE_DIR = Path(__file__).resolve().parents[1]
CACHE_FILE = BASE_DIR / "backend" / "question_cache.json"
BAD_CACHE = BASE_DIR / "backend" / "bad_cache.json"


# ------------------------------
# BAD QUESTION CACHE
# ------------------------------

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
        "timestamp": datetime.utcnow().isoformat()
    }

    with open(BAD_CACHE, "w") as f:
        json.dump(cache, f, indent=2)


# ------------------------------
# QUESTION CACHE
# ------------------------------

def load_question_cache():

    if not CACHE_FILE.exists():
        with open(CACHE_FILE, "w") as f:
            json.dump({}, f)
        return {}

    with open(CACHE_FILE, "r") as f:
        return json.load(f)


def store_question_cache(question, sql):

    cache = load_question_cache()

    cache[question] = sql

    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


# ------------------------------
# MAIN QUERY PIPELINE
# ------------------------------

def run_query(question):

    question = question.lower().strip()

    # ------------------------------
    # BAD QUESTION CACHE
    # ------------------------------

    bad_cache = load_bad_cache()

    if question in bad_cache:

        print("SOURCE: BAD CACHE")

        return {
            "status": "error",
            "type": "bad_question",
            "reason": bad_cache[question]
        }

    # ------------------------------
    # QUESTION CACHE
    # ------------------------------

    cache = load_question_cache()

    if question in cache:

        print("SOURCE: QUESTION CACHE")

        try:

            df = execute_query(cache[question])

            if df.empty:
                return {"status": "no_data"}

            return {
                "status": "success",
                "data": df.to_dict(orient="records"),
                "sql": cache[question]
            }

        except Exception as e:

            return {
                "status": "error",
                "type": "execution_error",
                "message": str(e)
            }

    # ------------------------------
    # MAIN PIPELINE
    # ------------------------------

    try:

        # ------------------
        # LLM → INTENT
        # ------------------

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
        # ------------------
        # TEMPLATE ENGINE
        # ------------------

        sql = find_template(intent)


        print("SQL:", sql)

        if sql:

            print("SOURCE: TEMPLATE CACHE")

        else:

            print("SOURCE: LLM SQL GENERATOR")

            sql = generate_sql(intent)

            store_template(intent, sql)

        print("SQL GENERATED:", sql)

        # ------------------
        # EXECUTE SQL
        # ------------------

        df = execute_query(sql)

        print("QUERY EXECUTED")

        if df.empty:
            return {"status": "no_data"}

        # ------------------
        # STORE SUCCESS CACHE
        # ------------------

        store_question_cache(question, sql)

        return {
            "status": "success",
            "data": df.to_dict(orient="records"),
            "sql": sql
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