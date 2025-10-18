"""
Serializers for Dataset and Graph models.
"""
from rest_framework import serializers
from .models import Dataset, Graph


class DatasetSerializer(serializers.ModelSerializer):
    """
    Serializer for Dataset model.
    """
    class Meta:
        model = Dataset
        fields = [
            'id', 'name', 'description', 'created_at', 'updated_at',
            'status', 'error_message', 'pkl_file_path', 'metadata_file_path'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status', 'error_message']


class DatasetListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for dataset listings.
    """
    has_graph = serializers.SerializerMethodField()
    
    class Meta:
        model = Dataset
        fields = ['id', 'name', 'status', 'created_at', 'has_graph']
        
    def get_has_graph(self, obj):
        return hasattr(obj, 'graph')


class GraphSerializer(serializers.ModelSerializer):
    """
    Serializer for Graph model with stats.
    """
    dataset_name = serializers.CharField(source='dataset.name', read_only=True)
    
    class Meta:
        model = Graph
        fields = [
            'id', 'dataset', 'dataset_name', 'node_count', 'edge_count',
            'time_range_start', 'time_range_end', 'entry_count',
            'available_features', 'stats', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class GraphStatsSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for graph statistics only.
    """
    class Meta:
        model = Graph
        fields = [
            'node_count', 'edge_count', 'entry_count',
            'time_range_start', 'time_range_end', 'available_features', 'stats'
        ]
