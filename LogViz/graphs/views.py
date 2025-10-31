"""
API views for graph data (Nodes, Edges, Sequences, REAPr).
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from .models import Node, Edge, SequenceGroup, ReaprAnnotation
from datasets.models import Graph as DatasetGraph
from .serializers import (
    NodeSerializer, NodeListSerializer,
    EdgeSerializer, EdgeListSerializer,
    SequenceGroupSerializer, ReaprAnnotationSerializer
)


class NodeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Node operations.
    Endpoints:
    - GET /api/nodes/?graph=<id> - List nodes for a graph
    - GET /api/nodes/?graph=<id>&type=process - Filter by type
    - GET /api/nodes/{id}/ - Get node details
    """
    queryset = Node.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['graph', 'type', 'pid']
    search_fields = ['name', 'node_id', 'resource_key']
    ordering_fields = ['id', 'name', 'type']
    ordering = ['id']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return NodeListSerializer
        return NodeSerializer


class EdgeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Edge operations.
    Endpoints:
    - GET /api/edges/?graph=<id> - List edges for a graph
    - GET /api/edges/?graph=<id>&operation=RegRead - Filter by operation
    - GET /api/edges/?graph=<id>&entry_index__gte=0&entry_index__lte=100 - Window range
    - GET /api/edges/{id}/ - Get edge details
    """
    queryset = Edge.objects.select_related('src', 'dst', 'metadata').all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['graph', 'operation', 'src', 'dst']
    search_fields = ['operation', 'line_id', 'technique']
    ordering_fields = ['timestamp', 'entry_index']
    ordering = ['entry_index']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return EdgeListSerializer
        return EdgeSerializer
    
    def get_queryset(self):
        """
        Optionally filter by entry_index range for windowed viewing.
        """
        queryset = super().get_queryset()
        
        # Entry window filtering
        from_entry = self.request.query_params.get('from_entry', None)
        to_entry = self.request.query_params.get('to_entry', None)
        
        if from_entry is not None:
            queryset = queryset.filter(entry_index__gte=int(from_entry))
        if to_entry is not None:
            queryset = queryset.filter(entry_index__lte=int(to_entry))
            
        return queryset

    @action(detail=True, methods=['post'], url_path='reapr-tag')
    def add_reapr_tag(self, request, pk=None):
        """Create or update REAPr annotations based on an edge selection."""
        edge = self.get_object()
        role = (request.data or {}).get('role')
        if role not in {'source', 'destination'}:
            return Response({'error': 'Invalid role. Use "source" or "destination".'}, status=status.HTTP_400_BAD_REQUEST)

        annotations = []

        # Always mark the selected edge as part of the attack path
        edge_annotation, _ = ReaprAnnotation.objects.update_or_create(
            graph=edge.graph,
            edge=edge,
            source='manual-selection-edge',
            defaults={
                'label': 'malicious',
                'is_attack_path': True,
            }
        )
        annotations.append(edge_annotation)

        # Map role to node label
        if role == 'source':
            target_node = edge.src
            label = 'root_cause'
            source_label = 'manual-selection-src'
        else:
            target_node = edge.dst
            label = 'impact'
            source_label = 'manual-selection-dst'

        node_annotation, _ = ReaprAnnotation.objects.update_or_create(
            graph=edge.graph,
            node=target_node,
            source=source_label,
            defaults={
                'label': label,
                'edge': edge,
                'is_attack_path': True,
            }
        )
        annotations.append(node_annotation)

        serializer = ReaprAnnotationSerializer(annotations, many=True)
        return Response({'role': role, 'annotations': serializer.data}, status=status.HTTP_200_OK)


class SequenceGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for SequenceGroup operations.
    Endpoints:
    - GET /api/sequences/?graph=<id> - List sequence groups for a graph
    - GET /api/sequences/?graph=<id>&confidence__gte=0.5 - Filter by confidence
    - GET /api/sequences/{id}/ - Get sequence details
    """
    queryset = SequenceGroup.objects.all()
    serializer_class = SequenceGroupSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['graph', 'pattern_name']
    ordering_fields = ['confidence', 'created_at']
    ordering = ['-confidence']


class ReaprAnnotationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for REAPr annotations.
    Endpoints:
    - GET /api/reapr/?graph=<id> - List annotations for a graph
    - GET /api/reapr/?graph=<id>&label=malicious - Filter by label
    - GET /api/reapr/{id}/ - Get annotation details
    """
    queryset = ReaprAnnotation.objects.select_related('node', 'edge').all()
    serializer_class = ReaprAnnotationSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['graph', 'label', 'is_attack_path']
    ordering = ['id']

    @action(detail=False, methods=['post'], url_path='clear')
    def clear_annotations(self, request):
        """Clear all REAPr annotations for a given graph.

        Expected payload: { "graph": <graph_id> }
        """
        graph_id = (request.data or {}).get('graph') or request.query_params.get('graph')
        if not graph_id:
            return Response({'error': 'Missing required parameter: graph'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            graph_id_int = int(graph_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid graph id'}, status=status.HTTP_400_BAD_REQUEST)

        qs = ReaprAnnotation.objects.filter(graph_id=graph_id_int)
        deleted_count = qs.count()
        qs.delete()

        # Best-effort: update graph.available_features to reflect absence of annotations
        try:
            g = DatasetGraph.objects.filter(id=graph_id_int).first()
            if g:
                features = dict(g.available_features or {})
                # Maintain backwards compat keys that may be checked by UI
                features['reapr_analysis'] = False
                features['has_reapr_annotations'] = False
                g.available_features = features
                g.save(update_fields=['available_features', 'updated_at'])
        except Exception:
            # Non-fatal if feature update fails
            pass

        return Response({'graph': graph_id_int, 'deleted': deleted_count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='compute')
    def compute_annotations(self, request):
        """Compute REAPr labels from existing seed annotations.

        Process-only propagation:
        - Forward reach from root_cause nodes
        - Backward reach from impact nodes (reverse edges)
        Derived labels:
        - root_cause: seed nodes
        - impact: seed nodes
        - malicious: nodes in intersection (forward ∩ backward)
        - contaminated: nodes in forward reach excluding root/malicious/impact
        Attack-path edges: edges (process→process) where src ∈ forward and dst ∈ backward.
        """
        graph_id = (request.data or {}).get('graph') or request.query_params.get('graph')
        if not graph_id:
            return Response({'error': 'Missing required parameter: graph'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            graph_id = int(graph_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid graph id'}, status=status.HTTP_400_BAD_REQUEST)

        # Seeds
        seed_qs = ReaprAnnotation.objects.filter(graph_id=graph_id, node__isnull=False, label__in=['root_cause', 'impact']).select_related('node')
        root_nodes = {ann.node_id for ann in seed_qs if ann.label == 'root_cause'}
        impact_nodes = {ann.node_id for ann in seed_qs if ann.label == 'impact'}

        if not root_nodes or not impact_nodes:
            return Response({'error': 'Need at least one root_cause and one impact seed to compute'}, status=status.HTTP_400_BAD_REQUEST)

        # Build process-only adjacency
        proc_nodes = Node.objects.filter(graph_id=graph_id, type='process').values_list('id', flat=True)
        proc_set = set(proc_nodes)

        edges_qs = Edge.objects.filter(graph_id=graph_id, src_id__in=proc_set, dst_id__in=proc_set).values('id', 'src_id', 'dst_id')

        fwd_adj = {}
        rev_adj = {}
        for e in edges_qs:
            s = e['src_id']
            t = e['dst_id']
            fwd_adj.setdefault(s, []).append(t)
            rev_adj.setdefault(t, []).append(s)

        def bfs(starts, adj):
            visited = set()
            stack = list(starts)
            while stack:
                n = stack.pop(0)
                if n in visited:
                    continue
                visited.add(n)
                for m in adj.get(n, []):
                    if m not in visited:
                        stack.append(m)
            return visited

        fwd = bfs(root_nodes, fwd_adj) if root_nodes else set()
        back = bfs(impact_nodes, rev_adj) if impact_nodes else set()

        malicious = (fwd & back)
        contaminated = (fwd - malicious - root_nodes - impact_nodes)

        # Prepare writes: remove previous compute-* annotations (only) to avoid duplicates
        ReaprAnnotation.objects.filter(graph_id=graph_id, source__startswith='compute-').delete()

        created = []

        def put_node_labels(node_ids, label):
            bulk = [ReaprAnnotation(graph_id=graph_id, node_id=nid, label=label, source='compute-v1') for nid in node_ids]
            if bulk:
                ReaprAnnotation.objects.bulk_create(bulk, ignore_conflicts=True)
                created.extend(bulk)

        put_node_labels(root_nodes, 'root_cause')
        put_node_labels(impact_nodes, 'impact')
        put_node_labels(malicious, 'malicious')
        put_node_labels(contaminated, 'contaminated')

        # Attack-path edges: src in fwd and dst in back
        attack_edges = Edge.objects.filter(
            graph_id=graph_id,
            src_id__in=fwd if fwd else [-1],
            dst_id__in=back if back else [-1]
        ).values_list('id', flat=True)

        edge_bulk = [ReaprAnnotation(graph_id=graph_id, edge_id=eid, label='malicious', source='compute-v1', is_attack_path=True) for eid in attack_edges]
        if edge_bulk:
            ReaprAnnotation.objects.bulk_create(edge_bulk, ignore_conflicts=True)
            created.extend(edge_bulk)

        # Best-effort: update graph feature flags
        try:
            g = DatasetGraph.objects.filter(id=graph_id).first()
            if g:
                features = dict(g.available_features or {})
                features['reapr_analysis'] = True
                features['has_reapr_annotations'] = True
                g.available_features = features
                g.save(update_fields=['available_features', 'updated_at'])
        except Exception:
            pass

        return Response({
            'graph': graph_id,
            'created': len(created),
            'summary': {
                'root_cause_nodes': len(root_nodes),
                'impact_nodes': len(impact_nodes),
                'malicious_nodes': len(malicious),
                'contaminated_nodes': len(contaminated),
                'attack_path_edges': len(attack_edges),
            }
        }, status=status.HTTP_200_OK)
