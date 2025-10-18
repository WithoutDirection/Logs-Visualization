"""
Graph data models: Nodes, Edges, Metadata, Sequence Groups, and REAPr Annotations.
These models store the actual graph structure and analysis results.
"""
from django.db import models
from django.utils import timezone
from datasets.models import Graph


class Node(models.Model):
    """
    Represents a node in the graph (Process, File, Registry, or Network).
    """
    NODE_TYPES = [
        ('process', 'Process'),
        ('file', 'File'),
        ('registry', 'Registry'),
        ('network', 'Network'),
    ]
    
    graph = models.ForeignKey(Graph, on_delete=models.CASCADE, related_name='nodes')
    node_id = models.CharField(max_length=255, db_index=True)  # e.g., "cmd.exe_1234"
    
    # Node properties
    type = models.CharField(max_length=20, choices=NODE_TYPES, db_index=True)
    name = models.CharField(max_length=500)
    pid = models.IntegerField(null=True, blank=True, db_index=True)
    
    # For file/registry/network nodes
    resource_key = models.TextField(blank=True, default='')  # Full path or address
    
    # Original UUID from source data (if applicable)
    original_uuid = models.CharField(max_length=100, blank=True)
    
    # Additional attributes (JSON for flexibility)
    attributes = models.JSONField(default=dict, blank=True)
    
    class Meta:
        db_table = 'nodes'
        unique_together = ['graph', 'node_id']
        indexes = [
            models.Index(fields=['graph', 'type']),
            models.Index(fields=['graph', 'pid']),
        ]
        
    def __str__(self):
        return f"{self.type}: {self.name}"


class Edge(models.Model):
    """
    Represents an edge (event/operation) between two nodes.
    One event = one edge in the MultiDiGraph.
    """
    graph = models.ForeignKey(Graph, on_delete=models.CASCADE, related_name='edges')
    
    # Source and destination
    src = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='outgoing_edges')
    dst = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='incoming_edges')
    
    # Edge key for multi-edges (same src/dst pair)
    edge_key = models.IntegerField(default=0)
    
    # Edge properties
    operation = models.CharField(max_length=100, db_index=True)  # RegRead, CreateFile, etc.
    timestamp = models.BigIntegerField(db_index=True)  # Unix timestamp or seconds
    entry_index = models.IntegerField(db_index=True)  # Chronological order
    
    # Metadata
    line_id = models.CharField(max_length=50, blank=True, db_index=True)
    technique = models.CharField(max_length=200, blank=True)  # MITRE ATT&CK or label
    result = models.CharField(max_length=50, blank=True)  # SUCCESS, FAILURE, etc.
    
    # Additional attributes (JSON)
    attributes = models.JSONField(default=dict, blank=True)
    
    class Meta:
        db_table = 'edges'
        indexes = [
            models.Index(fields=['graph', 'operation']),
            models.Index(fields=['graph', 'timestamp']),
            models.Index(fields=['graph', 'entry_index']),
            models.Index(fields=['graph', 'src', 'dst']),
        ]
        
    def __str__(self):
        return f"{self.src.node_id} --{self.operation}--> {self.dst.node_id}"


class EdgeMetadata(models.Model):
    """
    Additional metadata for edges (technique details, process info, etc.).
    Separated to keep Edge model lean.
    """
    edge = models.OneToOneField(Edge, on_delete=models.CASCADE, related_name='metadata')
    
    # Process info
    src_process = models.CharField(max_length=255, blank=True)
    src_pid = models.IntegerField(null=True, blank=True)
    
    # Resource info
    dst_resource = models.TextField(blank=True)
    dst_type = models.CharField(max_length=50, blank=True)
    
    # Full original event data (if needed)
    original_event = models.JSONField(default=dict, blank=True)
    
    class Meta:
        db_table = 'edge_metadata'


class SequenceGroup(models.Model):
    """
    Represents a detected sequence pattern group.
    """
    graph = models.ForeignKey(Graph, on_delete=models.CASCADE, related_name='sequence_groups')
    
    # Pattern info
    pattern_name = models.CharField(max_length=100, db_index=True)
    pattern_color = models.CharField(max_length=7)  # Hex color
    pattern_description = models.TextField()
    
    # Confidence and matching
    confidence = models.FloatField(db_index=True)
    completeness = models.FloatField(default=0.0)
    pattern_coverage = models.FloatField(default=0.0)
    
    # Target pair (src, dst)
    target_src = models.CharField(max_length=255)
    target_dst = models.CharField(max_length=255)
    
    # Matched operations
    matched_operations = models.JSONField(default=list)
    
    # Edges in this group (store IDs)
    edge_ids = models.JSONField(default=list)  # List of edge IDs
    
    # Time range
    start_index = models.IntegerField()
    end_index = models.IntegerField()
    
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'sequence_groups'
        indexes = [
            models.Index(fields=['graph', 'pattern_name']),
            models.Index(fields=['graph', 'confidence']),
        ]
        
    def __str__(self):
        return f"{self.pattern_name} (conf: {self.confidence:.2f})"


class ReaprAnnotation(models.Model):
    """
    REAPr-style annotations for nodes and edges.
    Marks root causes, malicious nodes, contaminated paths, etc.
    """
    LABEL_CHOICES = [
        ('root_cause', 'Root Cause'),
        ('malicious', 'Malicious'),
        ('contaminated', 'Contaminated'),
        ('impact', 'Impact'),
        ('benign', 'Benign'),
    ]
    
    graph = models.ForeignKey(Graph, on_delete=models.CASCADE, related_name='reapr_annotations')
    
    # Can annotate either a node or an edge
    node = models.ForeignKey(Node, on_delete=models.CASCADE, null=True, blank=True, related_name='reapr_annotations')
    edge = models.ForeignKey(Edge, on_delete=models.CASCADE, null=True, blank=True, related_name='reapr_annotations')
    
    label = models.CharField(max_length=20, choices=LABEL_CHOICES, db_index=True)
    source = models.CharField(max_length=100, blank=True)  # e.g., "line_id:123" or "prediction_file"
    
    # Additional info
    is_attack_path = models.BooleanField(default=False)
    malicious_operations = models.JSONField(default=list, blank=True)
    
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'reapr_annotations'
        indexes = [
            models.Index(fields=['graph', 'label']),
            models.Index(fields=['node']),
            models.Index(fields=['edge']),
        ]
