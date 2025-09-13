#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Data Preparation Script for Unified Log Entry Visualization Tool

This script prepares graph data for the unified visualization tool by:
1. Loading .pkl graphs and metadata
2. Converting to web-friendly JSON format
3. Integrating sequence patterns and REAPr analysis
4. Creating metadata index for all graphs
"""

import json
import os
import pickle
import pandas as pd
from glob import glob
from datetime import datetime
from collections import defaultdict, namedtuple
import re
import uuid
import networkx as nx
from tqdm import tqdm





# Import existing functions from the notebook
try:
    from graphutil import find_sequence_groups, ATTACK_SEQUENCE_PATTERNS
except ImportError:
    print("Could not import graphutil. Ensure graphutil.py is in the same directory.")

class UnifiedVisualizationDataPreparator:
    """
    Prepares data for the unified visualization tool
    """
    
    def __init__(self, graph_dir="./Graphs", output_dir="./unified_viz_data"):
        self.graph_dir = graph_dir
        self.output_dir = output_dir
        self.available_graphs = glob(os.path.join(graph_dir, "**", "*.pkl"), recursive=True)
        self.graph_metadata = {}

        print(f"Found {len(self.available_graphs)} available graphs in {self.graph_dir}")
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
    
    def load_all_graph_metadata(self):
        """Load metadata for all available graphs"""
        print(f"? Loading metadata for {len(self.available_graphs)} graphs...")
        
        for graph_file in tqdm(self.available_graphs, desc="Loading metadata"):
            graph_basename = os.path.basename(graph_file).replace('.pkl', '')
            edge_metadata_file = os.path.join(self.graph_dir, graph_basename, f"{graph_basename}_edge_metadata.json")
            predictions_file = f"Caldera_Ability_Predictions/{graph_basename}.csv"
            
            if not os.path.exists(edge_metadata_file):
                print(f"??  Missing metadata for {graph_basename} - skipping")
                continue
                
            try:
                # Load graph to get basic stats
                G = pickle.load(open(graph_file, "rb"))
                
                # Load edge metadata
                with open(edge_metadata_file, "r") as fp:
                    edge_metadata_json = json.load(fp)
                
                # Calculate time range from edge metadata
                timestamps = []
                for edge_id, data in edge_metadata_json.items():
                    if 'timestamp' in data and data['timestamp'] is not None:
                        try:
                            ts = float(data['timestamp'])
                            if ts > 0:  # Valid timestamp
                                timestamps.append(ts)
                        except (ValueError, TypeError):
                            pass
                
                time_range = [min(timestamps), max(timestamps)] if timestamps else [0, 0]
                
                # Check available features
                has_reapr = os.path.exists(predictions_file)
                
                # Detect available operations for sequence patterns
                operations = set()
                for edge_id, data in edge_metadata_json.items():
                    if 'operation' in data and data['operation']:
                        operations.add(data['operation'])
                
                # Check which sequence patterns are applicable
                available_patterns = []
                if ATTACK_SEQUENCE_PATTERNS:
                    for pattern in ATTACK_SEQUENCE_PATTERNS:
                        if any(op in operations for op in pattern.operations):
                            available_patterns.append(pattern.name)
                
                # Detect node types
                node_types = set()
                for node, data in G.nodes(data=True):
                    node_type = data.get('type', 'Unknown')
                    node_types.add(node_type)
                
                self.graph_metadata[graph_basename] = {
                    "graph_id": graph_basename,
                    "name": graph_basename.replace('_', ' ').title(),
                    "stats": {
                        "nodes": G.number_of_nodes(),
                        "edges": G.number_of_edges(),
                        "time_range": time_range,
                        "entry_range": [1, G.number_of_edges()],
                        "operations": list(operations)
                    },
                    "available_features": {
                        "reapr_analysis": has_reapr,
                        "sequence_patterns": available_patterns,
                        "node_types": list(node_types)
                    },
                    "file_paths": {
                        "graph": graph_file,
                        "metadata": edge_metadata_file,
                        "predictions": predictions_file if has_reapr else None
                    }
                }
                
            except Exception as e:
                print(f"? Error loading metadata for {graph_basename}: {e}")
                continue
        
        print(f"? Loaded metadata for {len(self.graph_metadata)} graphs")
        return self.graph_metadata
    
    def convert_edge_metadata_format(self, edge_metadata_json):
        """Convert edge metadata from JSON format to tuple-keyed format"""
        edge_metadata = {}
        for edge_id, data in edge_metadata_json.items():
            # Handle different separator formats (��, ->, or #)
            if '��' in edge_id:
                parts = edge_id.split('��')
            elif '->' in edge_id:
                parts = edge_id.split('->')
            else:
                # Fallback: try to split on common separators
                parts = edge_id.replace('#', ' ').split()
            
            if len(parts) >= 2:
                src = parts[0]
                dst_key = parts[1].split('#')
                if len(dst_key) >= 1:
                    dst = dst_key[0]
                    key = int(dst_key[1]) if len(dst_key) > 1 and dst_key[1].isdigit() else dst_key[1] if len(dst_key) > 1 else 0
                    edge_metadata[(src, dst, key)] = data
        return edge_metadata
    
    def load_reapr_predictions(self, predictions_file):
        """Load REAPr predictions if available"""
        malicious_specs = []
        if predictions_file and os.path.exists(predictions_file):
            try:
                predictions_df = pd.read_csv(predictions_file)
                
                # Handle different CSV formats
                if 'LineID' in predictions_df.columns and 'Score' in predictions_df.columns:
                    malicious_rows = predictions_df[predictions_df['Score'] >= 1.0]
                    for _, row in malicious_rows.iterrows():
                        line_id = str(row['LineID'])
                        prediction_type = row.get('Type', 'both').lower()
                        malicious_specs.append((line_id, prediction_type))
                elif 'line_id' in predictions_df.columns:
                    malicious_rows = predictions_df[
                        (predictions_df.get('prediction', 0) == 1) |
                        (predictions_df.get('is_malicious', False) == True) |
                        (predictions_df.get('label', 'benign').str.lower() == 'malicious')
                    ]
                    for _, row in malicious_rows.iterrows():
                        line_id = str(row['line_id'])
                        malicious_specs.append((line_id, "both"))
                        
            except Exception as e:
                print(f"? Error loading predictions: {e}")
        
        return malicious_specs
    
    def prepare_graph_data_for_web(self, graph_basename):
        """Convert graph data to web-friendly JSON format"""
        if graph_basename not in self.graph_metadata:
            return None
        
        metadata = self.graph_metadata[graph_basename]
        
        try:
            print(f"? Converting {graph_basename} to web format...")
            
            # Load graph and edge metadata
            G = pickle.load(open(metadata["file_paths"]["graph"], "rb"))
            with open(metadata["file_paths"]["metadata"], "r") as fp:
                edge_metadata_json = json.load(fp)
            
            # Convert edge metadata to proper format
            edge_metadata = self.convert_edge_metadata_format(edge_metadata_json)
            
            # Load REAPr predictions if available
            malicious_specs = self.load_reapr_predictions(metadata["file_paths"]["predictions"])
            
            # Prepare nodes data
            nodes_data = []
            for node, data in G.nodes(data=True):
                nodes_data.append({
                    "id": node,
                    "label": data.get('name', node),
                    "type": data.get('type', 'Unknown'),
                    "pid": data.get('pid', 0),
                    "title": f"{data.get('type', 'Unknown')}: {data.get('name', node)}"
                })
            
            # Prepare edges data with chronological ordering
            edges_data = []
            edge_list = []
            
            for src, dst, key, data in G.edges(keys=True, data=True):
                edge_meta = edge_metadata.get((src, dst, key), {})
                timestamp = edge_meta.get('timestamp', 0)
                line_id = edge_meta.get('line_id', None)
                operation = edge_meta.get('operation', 'unknown')
                
                # Ensure timestamp is numeric
                try:
                    timestamp = float(timestamp) if timestamp is not None else 0
                except (ValueError, TypeError):
                    timestamp = 0
                
                edge_entry = {
                    "src": src,
                    "dst": dst,
                    "key": str(key),  # Convert to string for JSON serialization
                    "operation": operation,
                    "timestamp": timestamp,
                    "line_id": str(line_id) if line_id is not None else None,
                    "metadata": {
                        'technique': edge_meta.get('technique', ''),
                        'src_process': edge_meta.get('src_process', ''),
                        'src_pid': edge_meta.get('src_pid', 0),
                        'dst_resource': edge_meta.get('dst_resource', ''),
                        'dst_type': edge_meta.get('dst_type', '')
                    }
                }
                edge_list.append(edge_entry)
            
            # Sort edges by timestamp for entry-based navigation
            edge_list.sort(key=lambda x: x['timestamp'] if x['timestamp'] is not None else 0)
            
            # Add entry index to each edge
            for i, edge in enumerate(edge_list):
                edge['entry_index'] = i + 1
                edges_data.append(edge)
            
            # Generate sequence groups (simplified version if main function not available)
            sequence_groups = {}
            try:
                if ATTACK_SEQUENCE_PATTERNS and len(ATTACK_SEQUENCE_PATTERNS) > 0:
                    sequence_groups = find_sequence_groups(G, edge_metadata, target_file=graph_basename)
            except Exception as e:
                print(f"??  Could not generate sequence groups: {e}")
            
            # Serialize sequence groups for JSON
            serialized_sequence_groups = {}
            for group_id, group_info in sequence_groups.items():
                serialized_sequence_groups[str(group_id)] = {
                    'pattern_name': group_info['pattern'].name,
                    'pattern_color': group_info['pattern'].color,
                    'pattern_description': group_info['pattern'].description,
                    'edges': [(e[0], e[1], str(e[2])) for e in group_info['edges']],  # Convert keys to strings
                    'confidence': group_info['confidence'],
                    'matched_operations': group_info['matched_operations'],
                    'target_pair': list(group_info.get('target_pair', ['unknown', 'unknown']))
                }
            
            # Create comprehensive data structure
            web_data = {
                "graph_id": graph_basename,
                "metadata": metadata,
                "nodes": nodes_data,
                "edges": edges_data,
                "sequence_groups": serialized_sequence_groups,
                "malicious_specs": malicious_specs,
                "total_entries": len(edges_data),
                "generation_timestamp": datetime.now().isoformat()
            }
            
            return web_data
            
        except Exception as e:
            print(f"? Error preparing data for {graph_basename}: {e}")
            return None
    
    def save_graph_data(self, graph_basename, web_data):
        """Save web data to JSON file"""
        if web_data is None:
            return None
        
        output_file = os.path.join(self.output_dir, f"{graph_basename}.json")
        try:
            with open(output_file, 'w') as f:
                json.dump(web_data, f, indent=2)
            return output_file
        except Exception as e:
            print(f"? Error saving data for {graph_basename}: {e}")
            return None
    
    def generate_metadata_index(self):
        """Generate metadata index for all graphs"""
        metadata_index = {}
        
        for graph_id, metadata in self.graph_metadata.items():
            metadata_index[graph_id] = {
                "name": metadata["name"],
                "stats": metadata["stats"],
                "available_features": metadata["available_features"]
            }
        
        # Save metadata index
        index_file = os.path.join(self.output_dir, "metadata_index.json")
        with open(index_file, 'w') as f:
            json.dump(metadata_index, f, indent=2)
        
        print(f"? Metadata index saved to: {index_file}")
        return metadata_index
    
    def process_all_graphs(self):
        """Process all available graphs"""
        print("? Starting data preparation for unified visualization tool...")
        
        # Load metadata for all graphs
        self.load_all_graph_metadata()
        
        # Generate and save metadata index
        metadata_index = self.generate_metadata_index()
        
        # Process each graph
        successful_conversions = []
        failed_conversions = []
        
        for graph_basename in tqdm(self.graph_metadata.keys(), desc="Converting graphs"):
            web_data = self.prepare_graph_data_for_web(graph_basename)
            
            if web_data:
                output_file = self.save_graph_data(graph_basename, web_data)
                if output_file:
                    successful_conversions.append({
                        'graph': graph_basename,
                        'file': output_file,
                        'nodes': web_data['metadata']['stats']['nodes'],
                        'edges': web_data['metadata']['stats']['edges'],
                        'has_reapr': web_data['metadata']['available_features']['reapr_analysis']
                    })
                else:
                    failed_conversions.append((graph_basename, "Save failed"))
            else:
                failed_conversions.append((graph_basename, "Conversion failed"))
        
        # Print summary
        print(f"\n" + "="*60)
        print("? DATA PREPARATION SUMMARY")
        print("="*60)
        
        print(f"\n? SUCCESSFUL CONVERSIONS: {len(successful_conversions)}")
        if successful_conversions:
            print(f"{'Graph':<35} {'Nodes':<8} {'Edges':<8} {'REAPr':<8}")
            print("-" * 65)
            for conv in successful_conversions:
                reapr_str = "Yes" if conv['has_reapr'] else "No"
                print(f"{conv['graph']:<35} {conv['nodes']:<8} {conv['edges']:<8} {reapr_str:<8}")
        
        if failed_conversions:
            print(f"\n? FAILED CONVERSIONS: {len(failed_conversions)}")
            for graph, reason in failed_conversions:
                print(f"   {graph}: {reason}")
        
        print(f"\n? Output directory: {self.output_dir}")
        print(f"? Metadata index: metadata_index.json")
        print(f"? Graph data files: {len(successful_conversions)} JSON files")
        
        return successful_conversions, failed_conversions


def main():
    """Main function to run data preparation"""
    print("? Unified Log Entry Visualization - Data Preparation")
    print("="*60)
    
    # Initialize data preparator
    preparator = UnifiedVisualizationDataPreparator()
    
    # Process all graphs
    successful, failed = preparator.process_all_graphs()
    
    print(f"\n? Data preparation complete!")
    print(f"   Processed: {len(successful)} graphs successfully")
    print(f"   Failed: {len(failed)} graphs")
    
    if successful:
        print(f"\n? Ready for unified visualization!")
        print(f"   Next step: Run the HTML server to view visualizations")


if __name__ == "__main__":
    main()