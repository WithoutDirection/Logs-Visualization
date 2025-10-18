"""
Graph analysis tools for LLM agent.

Provides tools that the agent can use to query and analyze the graph.
"""
from typing import Dict, List, Any, Optional
from django.db.models import Q, Count
from graphs.models import Node, Edge, SequenceGroup, ReaprAnnotation
from graphs.serializers import (
    NodeListSerializer, EdgeListSerializer,
    SequenceGroupSerializer, ReaprAnnotationSerializer
)


class GraphTools:
    """Collection of tools for graph analysis."""
    
    def __init__(self, graph_id: int):
        """
        Initialize tools with graph context.
        
        Args:
            graph_id: ID of the graph to analyze
        """
        self.graph_id = graph_id
    
    def search_nodes(
        self,
        node_type: Optional[str] = None,
        name_contains: Optional[str] = None,
        pid: Optional[int] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Search for nodes in the graph.
        
        Args:
            node_type: Filter by node type (process/resource)
            name_contains: Filter by name containing string
            pid: Filter by process ID
            limit: Max results to return
            
        Returns:
            List of node dictionaries
        """
        q = Q(graph_id=self.graph_id)
        
        if node_type:
            q &= Q(type=node_type)
        if name_contains:
            q &= Q(name__icontains=name_contains)
        if pid is not None:
            q &= Q(pid=pid)
        
        nodes = Node.objects.filter(q)[:limit]
        return NodeListSerializer(nodes, many=True).data
    
    def search_edges(
        self,
        operation: Optional[str] = None,
        from_entry: Optional[int] = None,
        to_entry: Optional[int] = None,
        process_name: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Search for edges in the graph.
        
        Args:
            operation: Filter by operation name
            from_entry: Starting entry index
            to_entry: Ending entry index
            process_name: Filter by process name
            limit: Max results to return
            
        Returns:
            List of edge dictionaries
        """
        q = Q(graph_id=self.graph_id)
        
        if operation:
            q &= Q(operation__icontains=operation)
        if from_entry is not None:
            q &= Q(entry_index__gte=from_entry)
        if to_entry is not None:
            q &= Q(entry_index__lte=to_entry)
        if process_name:
            q &= Q(metadata__src_process__icontains=process_name)
        
        edges = Edge.objects.filter(q).select_related('src', 'dst', 'metadata')[:limit]
        return EdgeListSerializer(edges, many=True).data
    
    def get_node_neighbors(
        self,
        node_id: int,
        direction: str = 'both'
    ) -> Dict[str, Any]:
        """
        Get neighboring nodes and connecting edges.
        
        Args:
            node_id: ID of the node
            direction: 'in', 'out', or 'both'
            
        Returns:
            Dictionary with 'nodes' and 'edges' lists
        """
        edges = []
        
        if direction in ('out', 'both'):
            out_edges = Edge.objects.filter(
                src_id=node_id,
                graph_id=self.graph_id
            ).select_related('src', 'dst', 'metadata')
            edges.extend(out_edges)
        
        if direction in ('in', 'both'):
            in_edges = Edge.objects.filter(
                dst_id=node_id,
                graph_id=self.graph_id
            ).select_related('src', 'dst', 'metadata')
            edges.extend(in_edges)
        
        # Get all connected node IDs
        node_ids = set([node_id])
        for edge in edges:
            node_ids.add(edge.src_id)
            node_ids.add(edge.dst_id)
        
        nodes = Node.objects.filter(id__in=node_ids, graph_id=self.graph_id)
        
        return {
            'nodes': NodeListSerializer(nodes, many=True).data,
            'edges': EdgeListSerializer(edges, many=True).data
        }
    
    def get_sequences(
        self,
        min_confidence: float = 0.5,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get detected sequences (patterns) in the graph.
        
        Args:
            min_confidence: Minimum confidence score
            limit: Max results to return
            
        Returns:
            List of sequence group dictionaries
        """
        sequences = SequenceGroup.objects.filter(
            graph_id=self.graph_id,
            confidence__gte=min_confidence
        ).order_by('-confidence')[:limit]
        
        return SequenceGroupSerializer(sequences, many=True).data
    
    def get_reapr_annotations(
        self,
        label: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get REAPr annotations (attack path labels).
        
        Args:
            label: Filter by label
            limit: Max results to return
            
        Returns:
            List of REAPr annotation dictionaries
        """
        q = Q(graph_id=self.graph_id)
        
        if label:
            q &= Q(label__icontains=label)
        
        annotations = ReaprAnnotation.objects.filter(q)[:limit]
        return ReaprAnnotationSerializer(annotations, many=True).data
    
    def get_graph_stats(self) -> Dict[str, Any]:
        """
        Get summary statistics about the graph.
        
        Returns:
            Dictionary with graph statistics
        """
        from datasets.models import Graph
        
        try:
            graph = Graph.objects.get(id=self.graph_id)
            
            # Get counts
            node_counts = Node.objects.filter(graph_id=self.graph_id).values('type').annotate(count=Count('id'))
            edge_count = Edge.objects.filter(graph_id=self.graph_id).count()
            sequence_count = SequenceGroup.objects.filter(graph_id=self.graph_id).count()
            reapr_count = ReaprAnnotation.objects.filter(graph_id=self.graph_id).count()
            
            # Get operation distribution
            top_operations = Edge.objects.filter(graph_id=self.graph_id).values('operation').annotate(
                count=Count('id')
            ).order_by('-count')[:10]
            
            return {
                'graph_id': self.graph_id,
                'entry_count': graph.entry_count,
                'time_range': graph.time_range,
                'nodes_by_type': {item['type']: item['count'] for item in node_counts},
                'edge_count': edge_count,
                'sequence_count': sequence_count,
                'reapr_annotation_count': reapr_count,
                'top_operations': list(top_operations),
                'available_features': graph.available_features,
                'stats': graph.stats
            }
        except Graph.DoesNotExist:
            raise ValueError(f"Graph {self.graph_id} not found")
    
    def get_available_tools(self) -> List[Dict[str, str]]:
        """
        Get list of available tools and their descriptions.
        
        Returns:
            List of tool descriptions
        """
        return [
            {
                'name': 'search_nodes',
                'description': 'Search for nodes by type, name, or PID',
                'parameters': 'node_type, name_contains, pid, limit'
            },
            {
                'name': 'search_edges',
                'description': 'Search for edges by operation, time window, or process',
                'parameters': 'operation, from_entry, to_entry, process_name, limit'
            },
            {
                'name': 'get_node_neighbors',
                'description': 'Get neighboring nodes and edges for a given node',
                'parameters': 'node_id, direction'
            },
            {
                'name': 'get_sequences',
                'description': 'Get detected behavioral sequences/patterns',
                'parameters': 'min_confidence, limit'
            },
            {
                'name': 'get_reapr_annotations',
                'description': 'Get REAPr attack path annotations',
                'parameters': 'label, limit'
            },
            {
                'name': 'get_graph_stats',
                'description': 'Get summary statistics about the graph',
                'parameters': 'none'
            }
        ]
