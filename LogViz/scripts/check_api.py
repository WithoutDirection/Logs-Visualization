"""
Utility: Simple API smoke tests for local dev server.
Usage: python scripts/check_api.py
"""
import os
import django
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'LogViz.settings')
django.setup()

API_BASE = "http://127.0.0.1:8000/api"

def main():
    print("=" * 60)
    print("API ENDPOINT SMOKE TESTS")
    print("=" * 60)

    endpoints = [
        ("GET", f"{API_BASE}/datasets/"),
        ("GET", f"{API_BASE}/datasets/1/graphs/"),
        ("GET", f"{API_BASE}/nodes/?graph=1&from_entry=1&to_entry=10"),
        ("GET", f"{API_BASE}/edges/?graph=1&from_entry=1&to_entry=10"),
    ]

    for method, url in endpoints:
        print(f"\n→ {method} {url}")
        try:
            resp = requests.request(method, url, timeout=5)
            print("  Status:", resp.status_code)
            if resp.headers.get("content-type", "").startswith("application/json"):
                data = resp.json()
                if isinstance(data, dict):
                    print("  Keys:", list(data.keys()))
                elif isinstance(data, list):
                    print("  Items:", len(data))
            else:
                print("  Body:", resp.text[:200])
        except Exception as e:
            print("  ❌ Error:", e)

if __name__ == "__main__":
    main()
