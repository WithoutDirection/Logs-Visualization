"""
Utility: Check database connectivity and list basic stats.
Usage: python scripts/check_database.py
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'LogViz.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from django.db import connection
from datasets.models import Dataset
from graphs.models import Graph, Node, Edge


def main():
    print("=" * 60)
    print("Database Status Check")
    print("=" * 60)

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            print("✓ Database: OK")
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        sys.exit(1)

    print(f"Datasets: {Dataset.objects.count()}")
    print(f"Graphs:   {Graph.objects.count()}")
    print(f"Nodes:    {Node.objects.count()}")
    print(f"Edges:    {Edge.objects.count()}")


if __name__ == "__main__":
    main()
