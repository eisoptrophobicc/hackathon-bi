import json
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

def classify_schema(columns):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    print(columns)
    prompt = f"""
                You are a database analyst.

                You MUST classify ONLY the columns provided below.
                Do NOT invent or add any new column names.

                Columns:
                {", ".join(columns)}

                Rules:
                - metrics = numeric values that can be aggregated (SUM, AVG, etc.)
                - dimensions = categorical or grouping/filtering fields
                - you may ONLY use the column names listed above

                Return STRICT JSON only.

                Example format:
                {{
                "metrics": [],
                "dimensions": []
                }}
            """

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    text = response.text

    # debug print to see what Gemini actually returned
    print("MODEL OUTPUT:\n", text)

    if not text:
        raise Exception("Model returned empty response")

    # remove markdown blocks if present
    text = text.strip()
    if "```" in text:
        text = text.replace("```json", "").replace("```", "").strip()

    # extract JSON safely
    start = text.find("{")
    end = text.rfind("}") + 1
    json_str = text[start:end]

    schema = json.loads(json_str)

    return schema