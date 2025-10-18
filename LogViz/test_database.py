"""
Database Connection Test Script
Tests if Django can correctly connect to and query the database
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'LogViz.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.db import connection
from datasets.models import Dataset
from graphs.models import Graph, Node, Edge

def test_database_connection():
    """Test basic database connectivity"""
    print("=" * 60)
    print("Django Database Connection Test")
    print("=" * 60)
    print()
    
    # Test 1: Check database connection
    print("✓ Test 1: Database Connection")
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            print(f"  ✓ Database connection successful: {result}")
    except Exception as e:
        print(f"  ✗ Database connection failed: {e}")
        return False
    print()
    
    # Test 2: Check if tables exist
    print("✓ Test 2: Database Tables")
    try:
        tables = connection.introspection.table_names()
        print(f"  ✓ Found {len(tables)} tables")
        app_tables = [t for t in tables if any(prefix in t for prefix in ['datasets_', 'graphs_', 'search_', 'agent_'])]
        print(f"  ✓ App tables: {', '.join(app_tables)}")
    except Exception as e:
        print(f"  ✗ Failed to list tables: {e}")
        return False
    print()
    
    # Test 3: Query datasets
    print("✓ Test 3: Query Datasets")
    try:
        dataset_count = Dataset.objects.count()
        print(f"  ✓ Total datasets in database: {dataset_count}")
        
        if dataset_count > 0:
            datasets = Dataset.objects.all()[:5]
            print(f"  ✓ First {min(5, dataset_count)} datasets:")
            for ds in datasets:
                print(f"    - ID: {ds.id}, Name: {ds.name}, Status: {ds.status}")
        else:
            print(f"  ℹ No datasets found (database is empty)")
    except Exception as e:
        print(f"  ✗ Failed to query datasets: {e}")
        return False
    print()
    
    # Test 4: Query graphs
    print("✓ Test 4: Query Graphs")
    try:
        graph_count = Graph.objects.count()
        print(f"  ✓ Total graphs in database: {graph_count}")
        
        if graph_count > 0:
            graphs = Graph.objects.all()[:5]
            print(f"  ✓ First {min(5, graph_count)} graphs:")
            for g in graphs:
                print(f"    - ID: {g.id}, Dataset: {g.dataset.name if g.dataset else 'None'}")
    except Exception as e:
        print(f"  ✗ Failed to query graphs: {e}")
        return False
    print()
    
    # Test 5: Query nodes
    print("✓ Test 5: Query Nodes")
    try:
        node_count = Node.objects.count()
        print(f"  ✓ Total nodes in database: {node_count}")
        
        if node_count > 0:
            nodes = Node.objects.all()[:5]
            print(f"  ✓ First {min(5, node_count)} nodes:")
            for n in nodes:
                print(f"    - ID: {n.id}, Name: {n.name}, Type: {n.type}")
    except Exception as e:
        print(f"  ✗ Failed to query nodes: {e}")
        return False
    print()
    
    # Test 6: Query edges
    print("✓ Test 6: Query Edges")
    try:
        edge_count = Edge.objects.count()
        print(f"  ✓ Total edges in database: {edge_count}")
        
        if edge_count > 0:
            edges = Edge.objects.all()[:5]
            print(f"  ✓ First {min(5, edge_count)} edges:")
            for e in edges:
                print(f"    - ID: {e.id}, Operation: {e.operation}, Entry: {e.entry_index}")
    except Exception as e:
        print(f"  ✗ Failed to query edges: {e}")
        return False
    print()
    
    # Summary
    print("=" * 60)
    print("✓ All database tests passed!")
    print("=" * 60)
    print()
    print("Database Status:")
    print(f"  - Datasets: {Dataset.objects.count()}")
    print(f"  - Graphs: {Graph.objects.count()}")
    print(f"  - Nodes: {Node.objects.count()}")
    print(f"  - Edges: {Edge.objects.count()}")
    print()
    
    if Dataset.objects.count() == 0:
        print("⚠ Database is empty. To add test data:")
        print("  1. Use Django admin: python manage.py createsuperuser")
        print("  2. Or use Django shell: python manage.py shell")
        print("  3. Or import data from existing JSON files")
    
    return True

if __name__ == '__main__':
    success = test_database_connection()
    sys.exit(0 if success else 1)
