import os
import django
import requests

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'LogViz.settings')
django.setup()

API_BASE = "http://127.0.0.1:8000/api"

print("=" * 60)
print("API ENDPOINT TESTING")
print("=" * 60)

# Test 1: Get Datasets
print("\n1️⃣  Testing GET /api/datasets/")
try:
    response = requests.get(f"{API_BASE}/datasets/", timeout=5)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Response keys: {list(data.keys()) if isinstance(data, dict) else 'List'}")
        if isinstance(data, dict) and 'results' in data:
            print(f"   Datasets count: {len(data['results'])}")
            if data['results']:
                print(f"   First dataset: {data['results'][0]}")
        elif isinstance(data, list):
            print(f"   Datasets count: {len(data)}")
            if data:
                print(f"   First dataset keys: {list(data[0].keys())}")
                print(f"   First dataset: {data[0]}")
    else:
        print(f"   Error: {response.text[:200]}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 2: Get Graphs for first dataset
print("\n2️⃣  Testing GET /api/datasets/1/graphs/")
try:
    response = requests.get(f"{API_BASE}/datasets/1/graphs/", timeout=5)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Response type: {type(data)}")
        print(f"   Data: {data}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 3: Get Nodes for graph 1
print("\n3️⃣  Testing GET /api/nodes/?graph=1&from_entry=1&to_entry=10")
try:
    response = requests.get(f"{API_BASE}/nodes/?graph=1&from_entry=1&to_entry=10", timeout=5)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, dict) and 'results' in data:
            print(f"   Nodes count: {len(data['results'])}")
            if data['results']:
                print(f"   First node keys: {list(data['results'][0].keys())}")
                print(f"   First node: {data['results'][0]}")
        elif isinstance(data, list):
            print(f"   Nodes count: {len(data)}")
            if data:
                print(f"   First node keys: {list(data[0].keys())}")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 4: Get Edges for graph 1
print("\n4️⃣  Testing GET /api/edges/?graph=1&from_entry=1&to_entry=10")
try:
    response = requests.get(f"{API_BASE}/edges/?graph=1&from_entry=1&to_entry=10", timeout=5)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, dict) and 'results' in data:
            print(f"   Edges count: {len(data['results'])}")
            if data['results']:
                print(f"   First edge keys: {list(data['results'][0].keys())}")
                print(f"   First edge: {data['results'][0]}")
        elif isinstance(data, list):
            print(f"   Edges count: {len(data)}")
            if data:
                print(f"   First edge keys: {list(data[0].keys())}")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
