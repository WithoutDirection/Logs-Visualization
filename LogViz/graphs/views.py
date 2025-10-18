"""
API views for graph data (Nodes, Edges, Sequences, REAPr).
"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from .models import Node, Edge, SequenceGroup, ReaprAnnotation
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


class ReaprAnnotationViewSet(viewsets.ReadOnlyModelViewSet):
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
