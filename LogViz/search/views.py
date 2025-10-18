"""
Search views for query language parsing and graph search.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from graphs.models import Node, Edge
from graphs.serializers import NodeSerializer, EdgeSerializer
from .services.query_parser import QueryParser


class SearchView(APIView):
    """
    Search API that parses query language and returns matching nodes/edges.
    
    Query Syntax:
    - op:<operation>  - Filter by edge operation (e.g., op:RegOpenKey)
    - process:<name>  - Filter by process name
    - pid:<id>        - Filter by process ID
    - type:<type>     - Filter by node type (process/resource)
    - Multiple terms are AND-ed together
    
    Query Parameters:
    - q: Search query string
    - graph_id: ID of the graph to search in
    - expand: Whether to expand causal chains (default: false)
    - from_entry: Starting entry index for windowing
    - to_entry: Ending entry index for windowing
    - limit: Max results to return (default: 100)
    """
    
    def post(self, request):
        query_string = request.data.get('q', '')
        graph_id = request.data.get('graph_id')
        expand = request.data.get('expand', False)
        from_entry = request.data.get('from_entry')
        to_entry = request.data.get('to_entry')
        limit = request.data.get('limit', 100)
        
        if not query_string:
            return Response(
                {'error': 'Query string is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not graph_id:
            return Response(
                {'error': 'graph_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Parse the query string
            parser = QueryParser(query_string)
            filters = parser.parse()
            
            # Build base query
            node_q = Q(graph_id=graph_id)
            edge_q = Q(graph_id=graph_id)
            
            # Apply filters
            if 'operation' in filters:
                edge_q &= Q(operation__icontains=filters['operation'])
            
            if 'process' in filters:
                node_q &= Q(name__icontains=filters['process'], type='process')
                edge_q &= Q(metadata__process_name__icontains=filters['process'])
            
            if 'pid' in filters:
                node_q &= Q(pid=filters['pid'])
                edge_q &= Q(metadata__pid=filters['pid'])
            
            if 'type' in filters:
                node_q &= Q(type=filters['type'])
            
            # Apply entry windowing
            if from_entry is not None:
                edge_q &= Q(entry_index__gte=from_entry)
            if to_entry is not None:
                edge_q &= Q(entry_index__lte=to_entry)
            
            # Query nodes and edges
            nodes = Node.objects.filter(node_q).distinct()[:limit]
            edges = Edge.objects.filter(edge_q).select_related('source', 'target', 'metadata').distinct()[:limit]
            
            # Expand causal chains if requested
            if expand:
                node_ids = set(nodes.values_list('id', flat=True))
                edge_ids = set(edges.values_list('id', flat=True))
                
                # Find edges connected to matching nodes
                related_edges = Edge.objects.filter(
                    Q(source_id__in=node_ids) | Q(target_id__in=node_ids),
                    graph_id=graph_id
                ).exclude(id__in=edge_ids).select_related('source', 'target', 'metadata')[:limit]
                
                # Find nodes connected by matching edges
                edge_node_ids = set()
                for edge in edges:
                    edge_node_ids.add(edge.source_id)
                    edge_node_ids.add(edge.target_id)
                for edge in related_edges:
                    edge_node_ids.add(edge.source_id)
                    edge_node_ids.add(edge.target_id)
                
                related_nodes = Node.objects.filter(
                    id__in=edge_node_ids,
                    graph_id=graph_id
                ).exclude(id__in=node_ids)
                
                # Combine results
                nodes = list(nodes) + list(related_nodes)
                edges = list(edges) + list(related_edges)
            
            # Serialize results
            return Response({
                'nodes': NodeSerializer(nodes, many=True).data,
                'edges': EdgeSerializer(edges, many=True).data,
                'count': {
                    'nodes': len(nodes),
                    'edges': len(edges)
                }
            })
            
        except ValueError as e:
            return Response(
                {'error': f'Invalid query: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Search failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
