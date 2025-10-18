"""
API views for Dataset and Graph management.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import Dataset, Graph
from .serializers import (
    DatasetSerializer, DatasetListSerializer,
    GraphSerializer, GraphStatsSerializer
)


class DatasetViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Dataset operations.
    Endpoints:
    - GET /api/datasets/ - List all datasets
    - POST /api/datasets/ - Create new dataset
    - GET /api/datasets/{id}/ - Get dataset details
    - PUT/PATCH /api/datasets/{id}/ - Update dataset
    - DELETE /api/datasets/{id}/ - Delete dataset
    - POST /api/datasets/{id}/prepare/ - Trigger data preparation
    - GET /api/datasets/{id}/status/ - Get preparation status
    """
    queryset = Dataset.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return DatasetListSerializer
        return DatasetSerializer
    
    @action(detail=True, methods=['post'])
    def prepare(self, request, pk=None):
        """
        Trigger data preparation for a dataset.
        This will launch a background task (Celery) to convert pkl + metadata to DB.
        """
        dataset = self.get_object()
        
        if dataset.status == 'processing':
            return Response(
                {'error': 'Dataset is already being processed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update status
        dataset.status = 'processing'
        dataset.error_message = ''
        dataset.save()
        
        # TODO: Launch Celery task
        # from .tasks import prepare_dataset_task
        # prepare_dataset_task.delay(dataset.id)
        
        # For now, return pending response
        return Response({
            'message': 'Data preparation started',
            'dataset_id': dataset.id,
            'status': dataset.status
        })
    
    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Get current status of dataset preparation.
        """
        dataset = self.get_object()
        return Response({
            'dataset_id': dataset.id,
            'status': dataset.status,
            'error_message': dataset.error_message,
            'has_graph': hasattr(dataset, 'graph')
        })
    
    @action(detail=True, methods=['get'])
    def graphs(self, request, pk=None):
        """
        Get all graphs for a specific dataset.
        Endpoint: /api/datasets/{id}/graphs/
        """
        dataset = self.get_object()
        graphs = Graph.objects.filter(dataset=dataset)
        serializer = GraphSerializer(graphs, many=True)
        return Response(serializer.data)


class GraphViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Graph operations (read-only).
    Endpoints:
    - GET /api/graphs/ - List all graphs
    - GET /api/graphs/{id}/ - Get graph details
    - GET /api/graphs/{id}/stats/ - Get graph statistics
    """
    queryset = Graph.objects.all()
    serializer_class = GraphSerializer
    
    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """
        Get statistics for a specific graph.
        """
        graph = self.get_object()
        serializer = GraphStatsSerializer(graph)
        return Response(serializer.data)
