"""
Dataset and Graph models for LogViz.
Handles metadata about uploaded datasets and their corresponding graphs.
"""
from django.db import models
from django.utils import timezone
import json


class Dataset(models.Model):
    """
    Represents an uploaded/imported dataset (Procmon logs).
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True, default='')
    
    # Original file paths (if uploaded)
    pkl_file_path = models.CharField(max_length=500, blank=True)
    metadata_file_path = models.CharField(max_length=500, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        db_table = 'datasets'
        
    def __str__(self):
        return f"{self.name} ({self.status})"


class Graph(models.Model):
    """
    Represents a graph generated from a dataset.
    Stores high-level stats and time range information.
    """
    dataset = models.OneToOneField(Dataset, on_delete=models.CASCADE, related_name='graph')
    
    # Statistics
    node_count = models.IntegerField(default=0)
    edge_count = models.IntegerField(default=0)
    
    # Time range (stored as ISO strings or timestamps)
    time_range_start = models.BigIntegerField(null=True, blank=True)  # Unix timestamp
    time_range_end = models.BigIntegerField(null=True, blank=True)
    
    # Entry range (for windowed navigation)
    entry_count = models.IntegerField(default=0)
    
    # Available features (stored as JSON)
    available_features = models.JSONField(default=dict, blank=True)
    # Example: {"reapr_analysis": true, "sequence_patterns": ["Process_Creation", "File_Write"], "node_types": ["Process", "File", "Registry", "Network"]}
    
    # Additional stats (JSON for flexibility)
    stats = models.JSONField(default=dict, blank=True)
    # Example: {"operations": ["RegRead", "CreateFile"], "process_count": 10, ...}
    
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'graphs'
        
    def __str__(self):
        return f"Graph for {self.dataset.name} ({self.node_count} nodes, {self.edge_count} edges)"

    @property
    def time_range(self):
        """Return the graph's time range as [start, end] if available."""
        if self.time_range_start is None or self.time_range_end is None:
            return None
        return [self.time_range_start, self.time_range_end]
