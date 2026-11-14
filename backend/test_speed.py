import os, time
os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY", "your_gemini_api_key_here")

from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

prompt = (
    "Title: Auth failure\n"
    "Description: Users cannot log in. Requests time out.\n"
    "Service: Auth Service\n"
    'Return {"summary":"string","service":"string","category":"string","severity":"Medium","severity_reason":"string"}'
)

# Try models that are available
for model_name in ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3-flash-preview"]:
    print(f"\nTesting {model_name} with thinking_budget=0 ...")
    t0 = time.time()
    try:
        cfg = types.GenerateContentConfig(
            system_instruction="You are an IT analyst. Reply ONLY with valid JSON, no markdown.",
            response_mime_type="application/json",
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )
        res = client.models.generate_content(model=model_name, contents=prompt, config=cfg)
        elapsed = time.time() - t0
        print(f"  SUCCESS in {elapsed:.2f}s -> {res.text[:200]}")
        break
    except Exception as e:
        elapsed = time.time() - t0
        err = str(e)[:300]
        print(f"  FAILED in {elapsed:.2f}s: {type(e).__name__}: {err}")
