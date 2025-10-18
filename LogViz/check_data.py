import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'LogViz.settings')
django.setup()

from datasets.models import Dataset
from graphs.models import Graph, Node, Edge

print("=" * 60)
print("DATABASE DATA CHECK")
print("=" * 60)

# Check Datasets
datasets = Dataset.objects.all()
print(f"\n📊 Total Datasets: {datasets.count()}")
for ds in datasets:
    print(f"  - ID: {ds.id}, Name: {ds.name}, Status: {ds.status}")

# Check Graphs
graphs = Graph.objects.all()
print(f"\n📈 Total Graphs: {graphs.count()}")
for g in graphs:
    print(f"  - ID: {g.id}, Dataset: {g.dataset.name}")
    print(f"    Nodes: {g.nodes.count()}, Edges: {g.edges.count()}")

# Check first graph details
if graphs.exists():
    first_graph = graphs.first()
    print(f"\n🔍 First Graph Details (ID: {first_graph.id}):")
    
    # Node types
    from django.db.models import Count
    node_types = first_graph.nodes.values('type').annotate(count=Count('type'))
    print("  Node Types:")
    for nt in node_types:
        print(f"    - {nt['type']}: {nt['count']}")
    
    # Sample nodes
    print("\n  Sample Nodes:")
    for node in first_graph.nodes.all()[:5]:
        print(f"    - {node.node_id}: {node.name} ({node.type})")
    
    # Sample edges
    print("\n  Sample Edges:")
    for edge in first_graph.edges.all()[:5]:
        print(f"    - {edge.src.node_id} --[{edge.operation}]--> {edge.dst.node_id}")

print("\n" + "=" * 60)

# Test API serialization
print("\nTesting API Response Format:")
print("=" * 60)

if datasets.exists():
    first_ds = datasets.first()
    print(f"\nDataset #{first_ds.id}:")
    print(f"  Name: {first_ds.name}")
    print(f"  Status: {first_ds.status}")
    print(f"  Created: {first_ds.created_at}")
    
    # Check if it has graphs
    ds_graphs = Graph.objects.filter(dataset=first_ds)
    print(f"  Graphs: {ds_graphs.count()}")
    
    if ds_graphs.exists():
        first_g = ds_graphs.first()
        print(f"\n  Graph #{first_g.id}:")
        print(f"    Nodes: {first_g.nodes.count()}")
        print(f"    Edges: {first_g.edges.count()}")
        
        # Check if nodes have correct fields
        if first_g.nodes.exists():
            sample_node = first_g.nodes.first()
            print(f"\n  Sample Node:")
            print(f"    node_id: {sample_node.node_id}")
            print(f"    type: {sample_node.type}")
            print(f"    name: {sample_node.name}")
            print(f"    pid: {sample_node.pid}")
            print(f"    original_uuid: {sample_node.original_uuid}")

print("\n" + "=" * 60)
