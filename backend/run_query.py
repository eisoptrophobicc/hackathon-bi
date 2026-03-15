import json
from pathlib import Path
from query_parser import parse_question
from sql_validator import validate_intent
from sql_generator import generate_sql
from query_executor import execute_query
from template_engine import find_template, store_template

BASE_DIR = Path(__file__).resolve().parents[1]
CACHE_FILE = BASE_DIR / "backend" / "question_cache.json"

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

def run_query(question):

    question = question.lower().strip()

    cache = load_question_cache()

    # check question cache
    if question in cache:
        print("SOURCE: QUESTION CACHE")
        return execute_query(cache[question])

    # LLM → intent
    intent = parse_question(question)
    
    for k, v in intent["filters"].items():
        if isinstance(v, list):
            if len(v) == 1:
                intent["filters"][k] = v[0]

    validate_intent(intent)

    # template match
    sql = find_template(intent)

    if sql:
        print("SOURCE: TEMPLATE")
    else:
        print("SOURCE: LLM")

        sql = generate_sql(intent)

        store_template(intent, sql)

    print("SQL GENERATED:", sql)
    
    try:
        # execute query FIRST
        result = execute_query(sql)

        # only cache if execution succeeded
        if result is not None and not result.empty:
            store_question_cache(question, sql)

        return result
    
    except Exception as e:
        print("SQL ERROR:", e)
        return None