"""
Serializers for Graph data models (Node, Edge, SequenceGroup, ReaprAnnotation).
"""
from rest_framework import serializers
from .models import Node, Edge, EdgeMetadata, SequenceGroup, ReaprAnnotation


class NodeSerializer(serializers.ModelSerializer):
    """
    Serializer for Node model.
    """
    class Meta:
        model = Node
        fields = [
            'id', 'node_id', 'type', 'name', 'pid',
            'resource_key', 'original_uuid', 'attributes'
        ]


class NodeListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for node listings (no attributes).
    """
    class Meta:
        model = Node
        fields = ['id', 'node_id', 'type', 'name', 'pid']


class EdgeMetadataSerializer(serializers.ModelSerializer):
    """
    Serializer for EdgeMetadata.
    """
    class Meta:
        model = EdgeMetadata
        fields = [
            'src_process', 'src_pid', 'dst_resource', 'dst_type', 'original_event'
        ]


class EdgeSerializer(serializers.ModelSerializer):
    """
    Serializer for Edge model with metadata.
    """
    metadata = EdgeMetadataSerializer(read_only=True)
    src_node_id = serializers.CharField(source='src.node_id', read_only=True)
    dst_node_id = serializers.CharField(source='dst.node_id', read_only=True)
    
    class Meta:
        model = Edge
        fields = [
            'id', 'src', 'dst', 'src_node_id', 'dst_node_id',
            'edge_key', 'operation', 'timestamp', 'entry_index',
            'line_id', 'technique', 'result', 'attributes', 'metadata'
        ]


class EdgeListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for edge listings (no metadata/attributes).
    """
    src = serializers.IntegerField(source='src.id', read_only=True)
    dst = serializers.IntegerField(source='dst.id', read_only=True)
    src_node_id = serializers.CharField(source='src.node_id', read_only=True)
    dst_node_id = serializers.CharField(source='dst.node_id', read_only=True)
    
    class Meta:
        model = Edge
        fields = [
            'id', 'src', 'dst', 'src_node_id', 'dst_node_id',
            'operation', 'timestamp', 'entry_index', 'line_id'
        ]


class SequenceGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for SequenceGroup.
    """
    class Meta:
        model = SequenceGroup
        fields = [
            'id', 'pattern_name', 'pattern_color', 'pattern_description',
            'confidence', 'completeness', 'pattern_coverage',
            'target_src', 'target_dst', 'matched_operations',
            'edge_ids', 'start_index', 'end_index', 'created_at'
        ]


class ReaprAnnotationSerializer(serializers.ModelSerializer):
    """
    Serializer for REAPr annotations.
    """
    node_id = serializers.CharField(source='node.node_id', read_only=True, allow_null=True)
    edge_id = serializers.IntegerField(source='edge.id', read_only=True, allow_null=True)
    
    class Meta:
        model = ReaprAnnotation
        fields = [
            'id', 'node', 'edge', 'node_id', 'edge_id',
            'label', 'source', 'is_attack_path', 'malicious_operations', 'created_at'
        ]
