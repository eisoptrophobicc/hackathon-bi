import json
from pathlib import Path
from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

def load_schema():
    # load schema memory created 
    BASE_DIR = Path(__file__).resolve().parents[1]
    schema_path = BASE_DIR / "backend" / "schema_memory.json"

    with open(schema_path, "r") as f:
        return json.load(f)

def parse_question(question):

    schema = load_schema()

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    prompt = f"""
            You are a BI query interpreter.

            Your task is to convert a natural language analytics question into a structured query intent.

            Use ONLY the schema information provided.

            Schema Information

            Metrics:
            {schema["metrics"]}

            Dimensions:
            {schema["dimensions"]}

            Columns:
            {schema["columns"]}

            Example categorical values:
            {schema["categorical_examples"]}

            General Rules

            - metrics must ONLY contain values from the Metrics list.
            - metrics must ALWAYS be returned as a list.
            - group_by must ONLY contain values from the Dimensions list.
            - filters must ONLY use Dimensions as keys.
            - aggregation must be one of: AVG, SUM, COUNT, MAX, MIN.
            - Do NOT invent metrics or dimensions that are not present in the schema.
            - Filters must use values that appear in categorical examples. If a value is not present do not create the filter.

            Aggregation Logic

            - "average", "mean" → AVG
            - "total" → SUM
            - "count", "number of" → COUNT

            Default behavior:
            - If grouping by a dimension and no aggregation is specified → use SUM.

            Ranking Logic

            - "most", "highest", "top", "best" → order DESC and limit 1
            - "least", "lowest", "worst" → order ASC and limit 1

            Important Constraints

            - Never produce LIMIT without ORDER BY.
            - If ranking is requested but multiple metrics are present, choose the first metric for ordering.
            - If the user refers to a concept not explicitly present in the schema, select the closest available metric(s) from the schema rather than inventing new ones.

            Grouping Logic

            - If the question contains "by <dimension>", set group_by to that dimension.
            
            Think through the query logically before producing the final JSON, but only output the JSON.

            Output Format

            Return ONLY JSON in the following structure:

            {{
            "metrics": [],
            "aggregation": "",
            "group_by": null,
            "filters": {{}},
            "order_by": null,
            "order": null,
            "limit": null
            }}

            Do not include explanations or additional text.

            User Question:
            {question}
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
