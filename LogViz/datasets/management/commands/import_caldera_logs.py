"""
Django Management Command: import_caldera_logs

This command imports Caldera ability statistics CSV files into the Django database.
It processes log files similar to graph.ipynb, creating:
- Dataset for each CSV file
- Graph structure with nodes and edges
- Attack sequence pattern detection
- Edge metadata for detailed analysis

Usage:
    python manage.py import_caldera_logs [--limit N] [--skip-existing]
"""

import os
import csv
import json
import uuid
import re
from datetime import datetime
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.conf import settings

from datasets.models import Dataset
from graphs.models import Graph, Node, Edge


class Command(BaseCommand):
    help = 'Import Caldera ability statistics CSV files into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit the number of CSV files to import (for testing)'
        )
        parser.add_argument(
            '--skip-existing',
            action='store_true',
            help='Skip datasets that already exist in the database'
        )
        parser.add_argument(
            '--csv-dir',
            type=str,
            default=None,
            help='Path to CSV directory (default: ../Caldera_Ability_Statistics)'
        )

    def handle(self, *args, **options):
        limit = options['limit']
        skip_existing = options['skip_existing']
        csv_dir = options['csv_dir']
        
        # Determine CSV directory path
        if csv_dir:
            caldera_dir = Path(csv_dir)
        else:
            # Default: go up from Django project root to find Caldera_Ability_Statistics
            base_dir = Path(settings.BASE_DIR).parent
            caldera_dir = base_dir / 'Caldera_Ability_Statistics'
        
        if not caldera_dir.exists():
            raise CommandError(f'CSV directory not found: {caldera_dir}')
        
        self.stdout.write(self.style.SUCCESS(f'📁 CSV Directory: {caldera_dir}'))
        
        # Find all CSV files
        csv_files = sorted(caldera_dir.glob('*.csv'))
        
        # Filter out *_raw_events_with_lineid.csv files (processed versions)
        csv_files = [f for f in csv_files if not f.name.endswith('_raw_events_with_lineid.csv')]
        
        if limit:
            csv_files = csv_files[:limit]
            self.stdout.write(self.style.WARNING(f'🔢 Limited to {limit} files'))
        
        self.stdout.write(f'Found {len(csv_files)} CSV files to process\n')
        
        # Process each CSV file
        success_count = 0
        skip_count = 0
        error_count = 0
        
        for idx, csv_file in enumerate(csv_files, 1):
            ability_id = csv_file.stem  # Filename without extension
            
            self.stdout.write(f'\n[{idx}/{len(csv_files)}] Processing: {ability_id}')
            
            # Check if dataset already exists
            if skip_existing and Dataset.objects.filter(name=ability_id).exists():
                self.stdout.write(self.style.WARNING(f'  ⏭️  Skipped (already exists)'))
                skip_count += 1
                continue
            
            try:
                self._import_csv_file(csv_file, ability_id, skip_existing)
                success_count += 1
                self.stdout.write(self.style.SUCCESS(f'  ✅ Imported successfully'))
            except Exception as e:
                error_count += 1
                error_msg = str(e)
                if 'already completed with data' in error_msg:
                    self.stdout.write(self.style.WARNING(f'  ⏭️  Skipped (already completed)'))
                    skip_count += 1
                else:
                    self.stdout.write(self.style.ERROR(f'  ❌ Error: {error_msg}'))
                if options['verbosity'] >= 2:
                    import traceback
                    self.stdout.write(traceback.format_exc())
        
        # Summary
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write(self.style.SUCCESS(f'✅ Successfully imported: {success_count}'))
        if skip_count:
            self.stdout.write(self.style.WARNING(f'⏭️  Skipped (existing): {skip_count}'))
        if error_count:
            self.stdout.write(self.style.ERROR(f'❌ Failed: {error_count}'))
        self.stdout.write('=' * 80)

    def _import_csv_file(self, csv_file, ability_id, skip_existing=False):
        """Import a single CSV file into the database"""
        
        # Read CSV with encoding handling
        rows = self._read_csv_with_encoding(csv_file)
        
        if not rows:
            raise ValueError('No data rows found in CSV')
        
        # Create or update dataset
        dataset, created = Dataset.objects.get_or_create(
            name=ability_id,
            defaults={
                'description': f'Caldera ability log: {ability_id}',
            }
        )
        
        # Check if already completed and skip if requested
        if skip_existing and dataset.status == 'completed':
            # Check if graph has data
            try:
                graph = Graph.objects.get(dataset=dataset)
                if graph.node_count > 0 and graph.edge_count > 0:
                    raise ValueError('Dataset already completed with data - skipping')
            except Graph.DoesNotExist:
                pass  # No graph, need to import
        
        # Update dataset metadata before processing
        dataset.description = f'Caldera ability log: {ability_id}'
        dataset.status = 'processing'
        dataset.error_message = ''
        dataset.save(update_fields=['description', 'status', 'error_message', 'updated_at'])

        graph = None
        node_cache = {}
        edges_data = []

        try:
            with transaction.atomic():
                # Create graph for this dataset
                graph, graph_created = Graph.objects.get_or_create(dataset=dataset)
                
                # Only delete existing data if graph already had data
                if not graph_created:
                    existing_edge_count = Edge.objects.filter(graph=graph).count()
                    if existing_edge_count > 0:
                        self.stdout.write(f'  🗑️  Deleting {existing_edge_count} existing edges...')
                        Edge.objects.filter(graph=graph).delete()
                    
                    existing_node_count = Node.objects.filter(graph=graph).count()
                    if existing_node_count > 0:
                        self.stdout.write(f'  🗑️  Deleting {existing_node_count} existing nodes...')
                        Node.objects.filter(graph=graph).delete()
                
                # Process events and create nodes/edges
                node_cache = {}
                edges_data = []
                
                self.stdout.write(f'  📊 Processing {len(rows)} events...')
                
                for i, row in enumerate(rows, 1):
                    try:
                        # Parse row into event structure
                        event_data = self._parse_csv_row(row, i)
                        
                        if not event_data:
                            continue
                        
                        # Create source node (Process)
                        src_node = self._get_or_create_node(
                            graph, 
                            node_cache, 
                            event_data['src_uuid'],
                            event_data['src_name'],
                            'Process',
                            event_data['src_pid']
                        )
                        
                        # Create destination node (File/Registry/Network/Process)
                        if event_data['dst_uuid'] != event_data['src_uuid']:
                            dst_node = self._get_or_create_node(
                                graph,
                                node_cache,
                                event_data['dst_uuid'],
                                event_data['dst_name'],
                                event_data.get('dst_type', 'Process'),
                                event_data.get('dst_pid'),
                                event_data.get('dst_resource')
                            )
                        else:
                            dst_node = src_node
                        
                        # Store edge data for bulk creation
                        edges_data.append({
                            'edge': {
                                'graph': graph,
                                'src': src_node,
                                'dst': dst_node,
                                'operation': event_data.get('operation') or 'unknown',
                                'timestamp': event_data.get('timestamp'),
                                'entry_index': event_data.get('entry_index', i),
                                'line_id': str(event_data.get('line_id', i)),
                                'result': event_data.get('result') or '',
                            },
                            'metadata': {
                                'src_process': event_data.get('src_name') or '',
                                'src_pid': event_data.get('src_pid'),
                                'dst_resource': (event_data.get('dst_resource') or ''),
                                'dst_type': (event_data.get('dst_type') or ''),
                                'original_event': {
                                    'detail': event_data.get('detail') or '',
                                    'event_class': event_data.get('event_class') or '',
                                }
                            }
                        })
                        
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(
                            f'    ⚠️  Row {i} parse error: {str(e)}'
                        ))
                        continue
                
                # Bulk create edges and their metadata
                if edges_data:
                    from graphs.models import EdgeMetadata
                    
                    # Create Edge objects
                    edges_to_create = [Edge(**ed['edge']) for ed in edges_data]
                    created_edges = Edge.objects.bulk_create(edges_to_create, batch_size=1000)
                    self.stdout.write(f'  ✅ Created {len(created_edges)} edges')
                    
                    # Create EdgeMetadata objects
                    metadata_to_create = []
                    for idx, edge in enumerate(created_edges):
                        metadata = edges_data[idx]['metadata']
                        metadata_to_create.append(EdgeMetadata(
                            edge=edge,
                            src_process=metadata.get('src_process') or '',
                            src_pid=metadata.get('src_pid'),
                            dst_resource=metadata.get('dst_resource') or '',
                            dst_type=metadata.get('dst_type') or '',
                            original_event=metadata.get('original_event') or {},
                        ))
                    
                    EdgeMetadata.objects.bulk_create(metadata_to_create, batch_size=1000)
                    self.stdout.write(f'  ✅ Created {len(metadata_to_create)} edge metadata records')

                    # Update graph statistics
                    timestamps = [ed['edge']['timestamp'] for ed in edges_data if ed['edge']['timestamp'] is not None]
                    entry_indices = [ed['edge']['entry_index'] for ed in edges_data if ed['edge']['entry_index'] is not None]
                    operations = [ed['edge']['operation'] for ed in edges_data if ed['edge']['operation']]
                    node_types = sorted({node.type for node in node_cache.values() if node and node.type})
                    operation_counts = Counter(operations)

                    graph.node_count = len(node_cache)
                    graph.edge_count = len(edges_data)
                    graph.entry_count = max(entry_indices) if entry_indices else len(edges_data)
                    graph.time_range_start = min(timestamps) if timestamps else None
                    graph.time_range_end = max(timestamps) if timestamps else None
                    graph.available_features = {
                        'node_types': node_types,
                        'operations': sorted(operation_counts.keys()),
                        'has_reapr_annotations': graph.reapr_annotations.exists(),
                        'has_sequences': graph.sequence_groups.exists(),
                    }
                    graph.stats = {
                        'unique_operations': len(operation_counts),
                        'top_operations': [
                            {'operation': op, 'count': count}
                            for op, count in operation_counts.most_common(20)
                        ],
                    }
                    graph.save(update_fields=[
                        'node_count', 'edge_count', 'entry_count',
                        'time_range_start', 'time_range_end',
                        'available_features', 'stats', 'updated_at'
                    ])
                
                else:
                    raise ValueError('CSV did not contain any valid events')
        except Exception as e:
            # Update status to failed and re-raise for logging
            dataset.status = 'failed'
            dataset.error_message = str(e)[:500]
            dataset.save(update_fields=['status', 'error_message', 'updated_at'])
            if graph:
                self.stdout.write(self.style.ERROR(f'  ❌ Import failed: {str(e)}'))
            raise

        # Success: update dataset status
        dataset.status = 'completed'
        dataset.error_message = ''
        dataset.save(update_fields=['status', 'error_message', 'updated_at'])
        self.stdout.write(f'  📈 Nodes: {len(node_cache)}, Edges: {len(edges_data)}')

    def _read_csv_with_encoding(self, csv_file):
        """Read CSV file with multiple encoding attempts"""
        encodings = ['utf-8', 'utf-8-sig', 'cp950', 'cp1252', 'iso-8859-1']
        
        for encoding in encodings:
            try:
                with open(csv_file, 'r', encoding=encoding, newline='') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                    return rows
            except UnicodeDecodeError:
                continue
            except Exception as e:
                raise ValueError(f'Error reading CSV: {str(e)}')
        
        raise ValueError(f'Could not decode CSV with any supported encoding')

    def _parse_csv_row(self, row, line_number):
        """Parse a CSV row into event data structure"""
        
        # Source process information
        src_name = row.get('Process Name') or row.get('Image Path') or row.get('User') or 'unknown'
        pid_str = row.get('PID') or row.get('Parent PID') or '0'
        
        try:
            src_pid = int(pid_str)
        except (ValueError, TypeError):
            src_pid = 0
        
        src_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{src_name}_{src_pid}"))
        
        # Event information
        event_class = (row.get('Event Class') or '').lower()
        operation = row.get('Operation') or 'unknown'
        result = row.get('Result') or ''
        detail = row.get('Detail') or ''
        
        # Destination node information
        dst_uuid = src_uuid
        dst_name = src_name
        dst_type = 'Process'
        dst_pid = None
        dst_resource = None
        
        # Classify destination based on event class
        if 'file' in event_class or 'file system' in event_class:
            path = row.get('Path') or row.get('Content') or ''
            if path:
                dst_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, path))
                dst_name = os.path.basename(path) if path else path
                dst_type = 'File'
                dst_resource = path
        
        elif 'registry' in event_class:
            key = row.get('Path') or row.get('Detail') or ''
            if key:
                dst_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, key))
                dst_name = key.split('\\')[-1] if '\\' in key else key
                dst_type = 'Registry'
                dst_resource = key
        
        elif 'network' in event_class:
            # Extract IP address from detail/path/content
            addr = ''
            for field in ('Detail', 'Path', 'Content'):
                text = row.get(field, '')
                if text:
                    m = re.search(r'(?:\b)(?:\d{1,3}\.){3}\d{1,3}(?:\b)', text)
                    if m:
                        addr = m.group(0)
                        break
            
            if addr:
                dst_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, addr))
                dst_name = addr
                dst_type = 'Network'
                dst_resource = addr
        
        elif 'process' in event_class:
            path = row.get('Path') or row.get('Image Path') or ''
            dst_name = os.path.basename(path.replace('\\', '/').strip()) if path else ''
            dst_name = dst_name.lstrip('/\\').strip() or 'unknown'
            
            op_lower = operation.lower()
            
            # Determine destination PID
            if 'create' in op_lower:
                # Extract PID from Detail
                m = re.search(r'PID\s*:\s*(\d+)', detail)
                if m:
                    try:
                        dst_pid = int(m.group(1))
                    except:
                        dst_pid = 0
                else:
                    try:
                        dst_pid = int(row.get('PID') or row.get('Parent PID') or 0)
                    except:
                        dst_pid = 0
            else:
                try:
                    dst_pid = int(row.get('PID') or row.get('Parent PID') or 0)
                except:
                    dst_pid = 0
            
            dst_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{dst_name}_{dst_pid}"))
            dst_type = 'Process'
            dst_resource = path
        
        # Parse timestamp
        timestamp = self._parse_timestamp(row.get('Date & Time'), line_number)
        
        # Line ID (use line number if not provided)
        line_id = row.get('lineid') or row.get('LineID') or str(line_number)
        
        return {
            'src_uuid': src_uuid,
            'src_name': src_name,
            'src_pid': src_pid,
            'dst_uuid': dst_uuid,
            'dst_name': dst_name,
            'dst_type': dst_type,
            'dst_pid': dst_pid,
            'dst_resource': dst_resource,
            'operation': operation,
            'timestamp': timestamp,
            'entry_index': line_number,
            'line_id': line_id,
            'result': result,
            'detail': detail[:1000] if detail else '',  # Limit detail length
            'event_class': event_class
        }

    def _parse_timestamp(self, date_str, fallback_value):
        """Parse timestamp from string, fallback to entry index"""
        if not date_str:
            return fallback_value
        
        # Try common date formats
        formats = [
            "%m/%d/%Y %I:%M:%S %p",  # 12/31/2023 11:59:59 PM
            "%Y-%m-%d %H:%M:%S",     # 2023-12-31 23:59:59
            "%m/%d/%Y %H:%M:%S",     # 12/31/2023 23:59:59
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return int(dt.timestamp())
            except ValueError:
                continue
        
        # If all parsing fails, use fallback
        return fallback_value

    def _get_or_create_node(self, graph, cache, node_uuid, name, node_type, pid=None, resource_key=None):
        """Get or create a node, using cache to avoid duplicates"""
        
        # Check cache first
        if node_uuid in cache:
            return cache[node_uuid]
        
        # Create node_id from name and pid
        if node_type == 'Process' and pid:
            node_id = f"{name}_{pid}"
        else:
            node_id = node_uuid[:16]  # Use first 16 chars of UUID
        
        # Try to get existing node
        node = Node.objects.filter(graph=graph, node_id=node_id).first()
        
        if not node:
            # Create new node
            node = Node.objects.create(
                graph=graph,
                node_id=node_id,
                original_uuid=node_uuid,
                name=name or 'unknown',
                type=node_type.lower(),
                pid=pid,
                resource_key=resource_key or ''
            )
        
        cache[node_uuid] = node
        return node
