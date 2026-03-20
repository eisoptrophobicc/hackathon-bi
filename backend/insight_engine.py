import json
from dotenv import load_dotenv
from genai_client import get_genai_client

load_dotenv()


def generate_insight(intent, data):
    client = get_genai_client()

    if not data:
        return None

    preview = data[:10]  # prevent huge prompts

    prompt = f"""
You are a business intelligence analyst.

A query was executed with this structured intent:

{json.dumps(intent, indent=2)}

The query returned this data:

{json.dumps(preview, indent=2)}

Write a short insight summarizing the key takeaway.

Rules:
- Maximum 2 sentences
- Mention the most important value or trend
- Do NOT invent numbers
- Only use numbers that appear in the data
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    if not response.text:
        return None

    return response.text.strip()
