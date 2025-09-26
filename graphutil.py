import networkx as nx
from tqdm import tqdm
from pyvis.network import Network
import pandas as pd
import json
import os
from collections import defaultdict, namedtuple

# =========================================================================
# CONSTANTS AND CONFIGURATIONS
# =========================================================================

SequencePattern = namedtuple('SequencePattern', ['name', 'operations', 'color', 'description', 'min_length', 'strict_order', 'results'])
ENABLE_RESULT_MATCHING = False  # Toggle to enable/disable result column matching
ORIGINAL_CSV_PATH_TEMPLATE = "./{target_file}_raw_events_with_lineid.csv"  # Template for original CSV path

ATTACK_SEQUENCE_PATTERNS = [
    # Process creation patterns
    SequencePattern(
        name="Process_Creation",
        operations=["Process Create"],
        color="#FF3333",  # Red
        description="Process creation operations",
        min_length=1,
        strict_order=False,
        results=["SUCCESS"]  # Expected results for this pattern
    ),

    # File manipulation patterns
    SequencePattern(
        name="File_Creation_Write",
        operations=["CreateFile", "WriteFile"],
        color="#FF6600",  # Orange
        description="File creation followed by write operations",
        min_length=2,
        strict_order=True,
        results=["SUCCESS", "SUCCESS"]  
    ),
    SequencePattern(
        name="File_Creation_Metadata_Write",
        operations=["CreateFile", "QueryBasicInformationFile", "WriteFile", "CloseFile"],
        color="#FAD000",  # Yellow
        description="File creation with metadata query and write",
        min_length=1,
        strict_order=False,
        results=["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"]  
    ),

    # Registry manipulation patterns
    SequencePattern(
        name="Registry_Creation_Modification",
        operations=["RegCreateKey", "RegSetValue", "RegQueryKey", "RegCloseKey"],
        color="#34CCFF",  # Cyan
        description="Registry key Create and modification",
        min_length=2,
        strict_order=False,
        results=["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"]  
    ),

    SequencePattern(
        name="Registry_Modification",
        operations=["RegOpenKey", "RegSetValue", "RegQueryKey", "RegCloseKey"],
        color="#33CC33",  # Green
        description="Registry key open and modification",
        min_length=2,
        strict_order=False,
        results=["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"]  
    ),

    # Network communication patterns
    SequencePattern(
        name="TCP_Communication",
        operations=["TCP Connect", "TCP Send", "TCP Receive", "TCP Disconnect"],
        color="#0066FF",  # Blue
        description="TCP network communication sequence",
        min_length=2,
        strict_order=True,
        results=["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"] 
    ),
    
]

# =========================================================================
# BASIC UTILITY FUNCTIONS
# =========================================================================

def _get_edge_timestamp(src, dst, key, edge_data, edge_metadata):
    """Get timestamp for an edge from either edge data or metadata mapping"""
    # Try edge_data first
    ts = edge_data.get('timestamp')
    if ts is None and edge_metadata:
        meta = edge_metadata.get((src, dst, key)) or {}
        ts = meta.get('timestamp') or meta.get('time')
    try:
        return int(ts) if ts is not None else None
    except:
        try:
            return int(float(ts))
        except:
            return None

def _get_edge_line_id(src, dst, key, edge_data, edge_metadata):
    """Get line_id for an edge from either edge data or metadata mapping"""
    # Try edge_data first
    line_id = edge_data.get('line_id')
    if line_id is None and edge_metadata:
        meta = edge_metadata.get((src, dst, key)) or {}
        line_id = meta.get('line_id')
    try:
        return int(line_id) if line_id is not None else None
    except:
        return None

def load_original_csv_data(target_file, csv_path_template=None):
    """
    Load original CSV data to access additional columns like 'Result'
    
    Args:
        target_file: Target file identifier
        csv_path_template: Template string for CSV path (default uses ORIGINAL_CSV_PATH_TEMPLATE)
    
    Returns:
        dict: mapping line_id -> row data, or None if file not found
    """
    if csv_path_template is None:
        csv_path_template = ORIGINAL_CSV_PATH_TEMPLATE
    
    csv_path = csv_path_template.format(target_file=target_file)
    
    try:
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            print(f"📄 Loaded original CSV: {csv_path} ({len(df)} rows)")
            
            # Create mapping from LineID to row data
            if 'LineID' in df.columns:
                csv_data = {}
                for _, row in df.iterrows():
                    line_id = str(row['LineID'])
                    csv_data[line_id] = row.to_dict()
                print(f"   📋 Mapped {len(csv_data)} rows by LineID")
                print(f"   📋 Available columns: {list(df.columns)}")
                return csv_data
            else:
                print(f"   ⚠️  No 'LineID' column found in CSV")
                return None
        else:
            print(f"   ⚠️  CSV file not found: {csv_path}")
            return None
    except Exception as e:
        print(f"   ❌ Error loading CSV: {e}")
        return None

def list_node_edges(G, node):
    """
    Given a node, list all its outbound and inbound edges with metadata.
    Returns:
        - outbound_edges: list of (src, dst, key, edge_data)
        - inbound_edges: list of (src, dst, key, edge_data)
    """
    outbound_edges = []
    inbound_edges = []
    # Outbound edges: edges where node is the source
    for _, dst, key, data in G.out_edges(node, keys=True, data=True):
        outbound_edges.append((node, dst, key, data))
    # Inbound edges: edges where node is the destination
    for src, _, key, data in G.in_edges(node, keys=True, data=True):
        inbound_edges.append((src, node, key, data))
    return outbound_edges, inbound_edges


# =========================================================================
# CORE GRAPH OPERATIONS
# =========================================================================
    

def event_handle(e):
    srcUUID = e["srcNode"]["UUID"]
    srcType = e["srcNode"]["Type"]
    srcName = e["srcNode"]["Name"]

    dstUUID = e["dstNode"]["UUID"] if e["dstNode"] != None else srcUUID
    dstType = e["dstNode"]["Type"] if e["dstNode"] != None else srcType
    if e["dstNode"] == None:
        dstUUID, dstType, dstName = srcUUID, srcType, srcName
    elif e["dstNode"]["Type"] == "Process":        
        dstName = e["dstNode"]["Name"]
    elif e["dstNode"]["Type"] == "File":
        dstName = e["dstNode"]["Name"]
    elif e["dstNode"]["Type"] == "Registry":
        dstName = e["dstNode"]["Key"]
    elif e["dstNode"]["Type"] == "Network":
        dstName = e["dstNode"]["Dstaddress"]    

    return srcUUID, srcType, srcName, dstUUID, dstType, dstName, e["relation"], e["timestamp"], e["label"]


def generate_query_graph(campaign_events, per_event=False, return_full_graph=False):
    """
    Simplified graph generation: each log entry = one edge from process to resource
    - Source: Process (with PID)
    - Destination: File/Registry/Network/Process
    - Edge: Contains log entry metadata (line_id, operation, timestamp, etc.)
    """
    G = nx.MultiDiGraph(name="simplified_query_graph", data=True)
    edge_metadata = {}  # Store detailed edge information
    
    
    for idx, e in enumerate(campaign_events):
        srcUUID, srcType, srcName, dstUUID, dstType, dstName, relation, timestamp, label = event_handle(e)
        
        # Create source process node with PID
        src_pid = e['srcNode'].get('Pid', 0)
        src_node_id = f"{srcName}_{src_pid}"
        
        # Add source process node
        G.add_node(src_node_id, 
                  name=srcName, 
                  pid=src_pid,
                  type="Process",
                  original_uuid=srcUUID)
        
        # Create destination resource node
        if dstType == "Process":
            dst_pid = e['dstNode'].get('Pid', 0) if e['dstNode'] else 0
            dst_node_id = f"{dstName}_{dst_pid}"
            G.add_node(dst_node_id,
                      name=dstName,
                      pid=dst_pid,
                      type="Process",
                      original_uuid=dstUUID)
        else:
            # For File/Registry/Network, use the resource name/path as identifier
            if dstType == "Registry":
                dst_resource_key = e['dstNode'].get('Key', dstName) if e['dstNode'] else dstName
            elif dstType == "Network":
                dst_resource_key = e['dstNode'].get('Dstaddress', dstName) if e['dstNode'] else dstName
            else:  # File or other
                dst_resource_key = dstName
                
            dst_node_id = f"{dst_resource_key}_{dstType}"
            G.add_node(dst_node_id,
                      name=dstName,
                      resource_key=dst_resource_key,
                      type=dstType,
                      original_uuid=dstUUID)
        
        # Create edge representing this log entry
        line_id = e.get('line_id', str(idx))
        edge_key = (src_node_id, dst_node_id, idx)  # Use index as edge key for multi-edges
        
        # Add edge with comprehensive metadata
        G.add_edge(src_node_id, dst_node_id, key=idx,
                  line_id=line_id,
                  operation=relation,
                  timestamp=timestamp,
                  technique=label,
                  time_order=idx,
                  edge_type="log_entry")
        
        # Store detailed edge metadata for analysis
        edge_metadata[edge_key] = {
            'line_id': line_id,
            'operation': relation,
            'timestamp': timestamp,
            'technique': label,
            'src_process': srcName,
            'src_pid': src_pid,
            'dst_resource': dstName,
            'dst_type': dstType,
            'original_event': e
        }

    
    # Count node types for summary
    node_types = {}
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'Unknown')
        node_types[node_type] = node_types.get(node_type, 0) + 1
    
    
    return G, edge_metadata

# =========================================================================
# REAPr ANALYSIS FUNCTIONS
# =========================================================================

def apply_reapr_to_simplified_graph(G, edge_metadata, malicious_specs):
    """
    Apply REAPr-inspired labeling to simplified graph (one edge per log entry).
    Each spec is (lineid, 'src'/'dst'/'both') to mark only source or destination node as malicious.
    """
    # Initialize labels for all nodes
    for node in G.nodes():
        G.nodes[node]['reapr_label'] = 'BENIGN'
        G.nodes[node]['is_root_cause'] = False
        G.nodes[node]['is_impact'] = False
        G.nodes[node]['is_known_malicious'] = False
        G.nodes[node]['malicious_operations'] = []

    malicious_processes = set()
    malicious_resources = set()
    matched_edges = []
    root_cause_nodes = set()
    impact_nodes = set()

    # Normalize specs to (lineid, target) tuples
    normalized_specs = []
    for spec in malicious_specs:
        if isinstance(spec, (tuple, list)) and len(spec) == 2:
            lineid, target = spec
            normalized_specs.append((str(lineid), target.lower()))
        else:
            normalized_specs.append((str(spec), 'both'))

    # Mark nodes as malicious according to specs
    for edge_key, meta in edge_metadata.items():
        line_id = str(meta.get('line_id', ''))
        src_node = meta.get('src_process', '')
        src_pid = meta.get('src_pid', 0)
        dst_node = meta.get('dst_resource', '')
        dst_type = meta.get('dst_type', '')

        src_node_id = edge_key[0]
        dst_node_id = edge_key[1]

        for spec_lineid, target in normalized_specs:
            if line_id == spec_lineid:
                if target in ['src', 'both'] and src_node_id in G:
                    G.nodes[src_node_id]['reapr_label'] = 'ROOT_CAUSE'
                    G.nodes[src_node_id]['is_root_cause'] = True
                    G.nodes[src_node_id]['is_known_malicious'] = True
                    malicious_processes.add(src_node_id)
                    op_details = {
                        'line_id': line_id,
                        'operation': meta.get('operation', ''),
                        'target_type': dst_type,
                        'target_name': dst_node,
                        'marked_as': 'src'
                    }
                    G.nodes[src_node_id]['malicious_operations'].append(op_details)
                    root_cause_nodes.add(src_node_id)
                if target in ['dst', 'both'] and dst_node_id in G:
                    G.nodes[dst_node_id]['reapr_label'] = 'MALICIOUS'
                    G.nodes[dst_node_id]['is_known_malicious'] = True
                    malicious_resources.add(dst_node_id)
                    op_details = {
                        'line_id': line_id,
                        'operation': meta.get('operation', ''),
                        'target_type': dst_type,
                        'target_name': dst_node,
                        'marked_as': 'dst'
                    }
                    G.nodes[dst_node_id]['malicious_operations'].append(op_details)
                    impact_nodes.add(dst_node_id)
                matched_edges.append(edge_key)

    if not malicious_processes and not malicious_resources:
        raise ValueError("No known malicious events found in the simplified graph. Check the LineIDs or edge metadata.")


    # Forward contamination trace from root cause nodes
    contaminated_nodes = set()
    for root in root_cause_nodes:
        visited = set()
        queue = [root]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            contaminated_nodes.add(current)
            for successor in G.successors(current):
                if successor not in visited:
                    queue.append(successor)

    # Backward trace from impact nodes (standard REAPr methodology)
    backward_traced_nodes = set()
    for impact in impact_nodes:
        visited = set()
        queue = [impact]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            backward_traced_nodes.add(current)
            # Only traverse through process nodes for backward trace
            for predecessor in G.predecessors(current):
                if predecessor not in visited and G.nodes[predecessor].get('type') == 'Process':
                    queue.append(predecessor)
    
    # Find intersection of forward and backward traces (true attack path)
    attack_path_nodes = contaminated_nodes.intersection(backward_traced_nodes)
    
    print(f"REAPr Analysis:")
    print(f"  Forward contaminated: {len(contaminated_nodes)}")
    print(f"  Backward traced: {len(backward_traced_nodes)}")
    print(f"  Attack path intersection: {len(attack_path_nodes)}")


    # Apply REAPr labeling rules following standard methodology
    for node in G.nodes():
        if node in root_cause_nodes or node in impact_nodes:
            print(f"REAPr Labeling Node: {node} - {G.nodes[node]['reapr_label']}")
            # Keep original root cause/malicious labels for explicitly marked nodes
            if G.nodes[node]['reapr_label'] != 'ROOT_CAUSE':
                G.nodes[node]['reapr_label'] = 'MALICIOUS'
        elif node in attack_path_nodes:
            # Nodes in the intersection of forward and backward traces are the true attack path
            print(f"REAPr Labeling Node: {node} - MALICIOUS (attack path)")
            G.nodes[node]['reapr_label'] = 'MALICIOUS'
            G.nodes[node]['is_attack_path'] = True
        elif node in contaminated_nodes:
            # Nodes only in forward trace are contaminated
            G.nodes[node]['reapr_label'] = 'CONTAMINATED'


    # count the number of each label
    label_counts = {}
    for node, data in G.nodes(data=True):
        label = data.get('reapr_label', 'BENIGN')
        label_counts[label] = label_counts.get(label, 0) + 1
    print(f"REAPr Label Counts: {label_counts}")

    return list(malicious_processes), list(malicious_resources), contaminated_nodes, impact_nodes


# =========================================================================
# VISUALIZATION FUNCTIONS
# =========================================================================


def create_interactive_entry_visualization(G, edge_metadata, malicious_specs=None, output_path="interactive_entry_graph.html"):
    """Create an interactive visualization with entry range selection"""
    
    total_edges = G.number_of_edges()
    if total_edges == 0:
        print("No edges found in graph")
        return None
    
    print(f"Total entries (edges): {total_edges}")
    
    # Get edge ordering information
    edge_list = []
    for src, dst, key, data in G.edges(keys=True, data=True):
        ts = _get_edge_timestamp(src, dst, key, data, edge_metadata)
        line_id = _get_edge_line_id(src, dst, key, data, edge_metadata)
        sort_key = ts if ts is not None else (line_id if line_id is not None else len(edge_list))
        edge_list.append((sort_key, src, dst, key, data))
    
    # Sort edges chronologically
    edge_list.sort(key=lambda x: x[0])
    
    # Apply REAPr analysis if malicious specs provided
    if malicious_specs:
        malicious_processes, malicious_resources, contaminated, impacts = apply_reapr_to_simplified_graph(
            G, edge_metadata, malicious_specs
        )
    
    # Create base visualization
    net = Network(notebook=True, height="600px", width="100%", bgcolor="#ffffff", directed=True)
    
    # Add all nodes with styling
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'Unknown')
        node_name = data.get('name', 'Unknown')
        reapr_label = data.get('reapr_label', 'BENIGN')
        
        # Color based on REAPr analysis if available
        if malicious_specs and reapr_label != 'BENIGN':
            if reapr_label == 'MALICIOUS_RESOURCE':
                color = '#FF4444'  # Red
                size = 25
            elif reapr_label == 'CONTAMINATED':
                color = '#FF8800'  # Orange  
                size = 20
            elif reapr_label == 'IMPACT':
                color = '#FFAA00'  # Yellow-orange
                size = 18
            else:
                color = '#CCCCCC'  # Gray
                size = 15
        else:
            # Default color by type
            if node_type == 'Process':
                color = '#90EE90'  # Light green
                size = 20
            elif node_type == 'Registry':
                color = '#87CEEB'  # Sky blue
                size = 15
            elif node_type == 'File':
                color = '#DDA0DD'  # Plum
                size = 15
            elif node_type == 'Network':
                color = '#F0E68C'  # Khaki
                size = 15
            else:
                color = '#D3D3D3'  # Light gray
                size = 12
        
        title = f"{node_type}: {node_name}"
        if malicious_specs:
            title += f"\nREAPr Label: {reapr_label}"
        
        net.add_node(node, label=node_name, title=title, color=color, size=size)
    
    # Add all edges with entry indices
    edge_count = {}
    for idx, (sort_key, src, dst, key, data) in enumerate(edge_list):
        edge_pair = (src, dst)
        edge_count[edge_pair] = edge_count.get(edge_pair, 0) + 1
        n = edge_count[edge_pair]
        
        # Get edge metadata
        edge_meta = edge_metadata.get((src, dst, key), {})
        line_id = edge_meta.get('line_id', 'N/A')
        operation = edge_meta.get('operation', 'unknown')
        timestamp = edge_meta.get('timestamp', data.get('timestamp', 'N/A'))
        
        # Create edge label
        edge_label = f"{operation}" + (f" #{n}" if n > 1 else "")
        
        # Edge styling
        edge_color = {'color': '#666666', 'opacity': 0.7}
        edge_width = 1 + (n % 3)
        
        # Handle multiple edges with curves
        smooth_type = 'curvedCW' if (n % 2 == 1) else 'curvedCCW'
        roundness = min(0.6, 0.1 + 0.05 * (n - 1))
        smooth = {"enabled": True, "type": smooth_type, "roundness": roundness}
        
        net.add_edge(src, dst,
                    id=f"{src}->{dst}#{key}",
                    label=edge_label,
                    title=f"Entry #{idx}\nOperation: {operation}\nLine ID: {line_id}\nTimestamp: {timestamp}",
                    color=edge_color,
                    width=edge_width,
                    smooth=smooth,
                    entry_index=idx)  # Store entry index for filtering
    
    # Enhanced options with entry controls
    net.set_options("""
    var options = {
      "physics": {
        "enabled": true,
        "stabilization": {
          "enabled": true,
          "iterations": 100
        }
      },
      "nodes": {
        "font": {"size": 12, "color": "#000000"}
      },
      "edges": {
        "font": {"size": 10}
      },
      "interaction": {
        "dragNodes": true,
        "dragView": true,
        "zoomView": true
      }
    }
    """)
    
    # Save the basic HTML
    net.show(output_path)
    
    # Read the HTML and add entry controls
    with open(output_path, 'r') as f:
        html_content = f.read()
    
    # Create the enhanced HTML with entry controls
    entry_controls_html = f"""
    <div id="entryControls" style="position: fixed; top: 10px; left: 10px; background: white; padding: 15px; border: 2px solid #ccc; border-radius: 8px; z-index: 1000; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
        <h3 style="margin-top: 0;">Entry Range Filter</h3>
        <div style="margin-bottom: 10px;">
            <label for="startEntry">Start Entry:</label><br>
            <input type="number" id="startEntry" min="0" max="{total_edges-1}" value="0" style="width: 200px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label for="endEntry">End Entry:</label><br>
            <input type="number" id="endEntry" min="1" max="{total_edges}" value="{total_edges}" style="width: 200px;">
        </div>
        <div style="margin-bottom: 10px;">
            <button onclick="filterByEntryRange()" style="background: #4CAF50; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Apply Filter</button>
            <button onclick="resetEntryFilter()" style="background: #f44336; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px;">Reset</button>
        </div>
        <div style="margin-bottom: 10px;">
            <label for="windowSize">Sliding Window Size:</label><br>
            <input type="number" id="windowSize" min="10" max="500" value="100" style="width: 100px;">
            <button onclick="nextWindow()" style="background: #2196F3; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px;">Next →</button>
            <button onclick="prevWindow()" style="background: #2196F3; color: white; padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px;">← Prev</button>
        </div>
        <div id="entryInfo" style="font-size: 12px; color: #666;">
            Total Entries: {total_edges}<br>
            <span id="currentEntryInfo">Showing: All entries (0-{total_edges-1})</span>
        </div>
    </div>
    
    <script>
    var allEdges = [];
    var originalNodes = [];
    var totalEntries = {total_edges};
    var currentWindowStart = 0;
    
    // Store original data after network is initialized
    network.on("afterDrawing", function() {{
        if (allEdges.length === 0) {{
            allEdges = network.body.data.edges.get();
            originalNodes = network.body.data.nodes.get();
        }}
    }});
    
    function filterByEntryRange() {{
        var startEntry = parseInt(document.getElementById('startEntry').value);
        var endEntry = parseInt(document.getElementById('endEntry').value);
        
        if (isNaN(startEntry) || isNaN(endEntry)) {{
            alert('Please enter valid entry numbers');
            return;
        }}
        
        if (startEntry >= endEntry) {{
            alert('Start entry must be less than end entry');
            return;
        }}
        
        if (startEntry < 0 || endEntry > totalEntries) {{
            alert('Entry range must be between 0 and ' + totalEntries);
            return;
        }}
        
        filterEdgesByEntryRange(startEntry, endEntry);
        updateEntryInfo(startEntry, endEntry);
    }}
    
    function filterEdgesByEntryRange(startEntry, endEntry) {{
        // Filter edges by entry index
        var filteredEdges = allEdges.filter(function(edge) {{
            var entryIdx = edge.entry_index;
            if (entryIdx === null || entryIdx === undefined) {{
                return false;
            }}
            return entryIdx >= startEntry && entryIdx < endEntry;
        }});
        
        // Get nodes that are connected by filtered edges
        var connectedNodes = new Set();
        filteredEdges.forEach(function(edge) {{
            connectedNodes.add(edge.from);
            connectedNodes.add(edge.to);
        }});
        
        // Filter nodes to only show connected ones
        var filteredNodes = originalNodes.filter(function(node) {{
            return connectedNodes.has(node.id);
        }});
        
        // Update the network
        network.setData({{
            nodes: filteredNodes,
            edges: filteredEdges
        }});
        
        // Update display info
        document.getElementById('currentEntryInfo').innerHTML = 
            'Showing: ' + filteredEdges.length + ' edges, ' + filteredNodes.length + ' nodes (entries ' + startEntry + '-' + (endEntry-1) + ')';
    }}
    
    function resetEntryFilter() {{
        // Reset to show all data
        network.setData({{
            nodes: originalNodes,
            edges: allEdges
        }});
        
        // Reset entry inputs
        document.getElementById('startEntry').value = 0;
        document.getElementById('endEntry').value = totalEntries;
        document.getElementById('entryWindow').value = '';
        currentWindowStart = 0;
        
        document.getElementById('currentEntryInfo').innerHTML = 'Showing: All entries (0-' + (totalEntries-1) + ')';
    }}
    
    function applyQuickEntryWindow() {{
        var windowSelect = document.getElementById('entryWindow');
        var windowType = windowSelect.value;
        
        if (!windowType) return;
        
        var startEntry, endEntry;
        
        if (windowType === 'all') {{
            resetEntryFilter();
            return;
        }} else if (windowType.startsWith('last_')) {{
            var size = parseInt(windowType.split('_')[1]);
            startEntry = Math.max(0, totalEntries - size);
            endEntry = totalEntries;
        }} else if (windowType === 'middle_100') {{
            var size = 100;
            startEntry = Math.max(0, Math.floor((totalEntries - size) / 2));
            endEntry = Math.min(totalEntries, startEntry + size);
        }} else {{
            var size = parseInt(windowType);
            startEntry = 0;
            endEntry = Math.min(totalEntries, size);
        }}
        
        // Update input fields
        document.getElementById('startEntry').value = startEntry;
        document.getElementById('endEntry').value = endEntry;
        
        // Apply filter
        filterEdgesByEntryRange(startEntry, endEntry);
        updateEntryInfo(startEntry, endEntry);
        currentWindowStart = startEntry;
    }}
    
    function nextWindow() {{
        var windowSize = parseInt(document.getElementById('windowSize').value) || 100;
        var newStart = Math.min(currentWindowStart + windowSize, totalEntries - windowSize);
        var newEnd = Math.min(newStart + windowSize, totalEntries);
        
        document.getElementById('startEntry').value = newStart;
        document.getElementById('endEntry').value = newEnd;
        
        filterEdgesByEntryRange(newStart, newEnd);
        updateEntryInfo(newStart, newEnd);
        currentWindowStart = newStart;
    }}
    
    function prevWindow() {{
        var windowSize = parseInt(document.getElementById('windowSize').value) || 100;
        var newStart = Math.max(currentWindowStart - windowSize, 0);
        var newEnd = Math.min(newStart + windowSize, totalEntries);
        
        document.getElementById('startEntry').value = newStart;
        document.getElementById('endEntry').value = newEnd;
        
        filterEdgesByEntryRange(newStart, newEnd);
        updateEntryInfo(newStart, newEnd);
        currentWindowStart = newStart;
    }}
    
    function updateEntryInfo(startEntry, endEntry) {{
        document.getElementById('currentEntryInfo').innerHTML = 
            'Filtered: entries ' + startEntry + ' to ' + (endEntry-1) + ' (' + (endEntry-startEntry) + ' entries)';
    }}
    
    // Disable physics after stabilization to prevent spinning
    network.on("stabilizationIterationsDone", function () {{
        network.setOptions({{physics: {{enabled: false}}}});
    }});
    
    // Fallback: disable physics after timeout
    setTimeout(function() {{
        network.setOptions({{physics: {{enabled: false}}}});
    }}, 15000);
    </script>
    """
    
    # Insert the entry controls before the closing body tag
    html_content = html_content.replace('</body>', entry_controls_html + '</body>')
    
    # Write the enhanced HTML
    with open(output_path, 'w') as f:
        f.write(html_content)
    
    
    return output_path


# =========================================================================
# GRAPH SLICING AND WINDOWING FUNCTIONS not used 
# =========================================================================

def slice_graph_by_time(G, edge_metadata=None, start_ts=None, end_ts=None, inclusive=True):
    """
    Return a new MultiDiGraph with only edges whose timestamp is within [start_ts, end_ts).
    - G: networkx.MultiDiGraph
    - edge_metadata: dict mapping (src,dst,key) -> metadata (optional)
    - start_ts, end_ts: timestamps (seconds)
    - inclusive: if True uses <= end_ts, else uses < end_ts
    """
    if start_ts is None or end_ts is None:
        raise ValueError("start_ts and end_ts must be provided")
    
    newG = nx.MultiDiGraph()
    
    for src, dst, key, data in G.edges(keys=True, data=True):
        ts = _get_edge_timestamp(src, dst, key, data, edge_metadata)
        if ts is None:
            continue
        
        if inclusive:
            ok = (start_ts <= ts <= end_ts)
        else:
            ok = (start_ts <= ts < end_ts)
        
        if ok:
            # Ensure nodes exist with attributes
            if src not in newG:
                newG.add_node(src, **G.nodes[src])
            if dst not in newG:
                newG.add_node(dst, **G.nodes[dst])
            # Copy edge with all attributes
            newG.add_edge(src, dst, key=key, **data)
    
    return newG

def get_graph_time_range(G, edge_metadata=None):
    """Get the min and max timestamps from the graph"""
    all_ts = []
    for src, dst, key, data in G.edges(keys=True, data=True):
        ts = _get_edge_timestamp(src, dst, key, data, edge_metadata)
        if ts is not None:
            all_ts.append(int(ts))
    
    if not all_ts:
        return None, None
    
    return min(all_ts), max(all_ts)



# =========================================================================
# SEQUENCE ANALYSIS FUNCTIONS
# =========================================================================

def find_sequence_groups(G, edge_metadata, sequence_patterns=None, max_gap=1, target_file=None, enable_result_matching=None):
    """
    Find groups of consecutive edges that match defined sequence patterns based on exact operation names.
    The sequence must be against the same target (same source-destination pair) to be identified together.
    When multiple patterns match at the same position, selects the one with the highest confidence score.
    
    Args:
        G: NetworkX MultiDiGraph
        edge_metadata: dict mapping (src,dst,key) -> metadata
        sequence_patterns: list of SequencePattern objects
        max_gap: maximum number of non-matching entries allowed between pattern matches
        target_file: target file identifier for loading original CSV data
        enable_result_matching: whether to use result column matching (uses global setting if None)
    
    Returns:
        dict: mapping group_id -> {
            'pattern': SequencePattern,
            'edges': list of (src, dst, key),
            'start_index': int,
            'end_index': int,
            'confidence': float,
            'matched_operations': list of matched operation names,
            'target_pair': (src, dst)
        }
    """
    if sequence_patterns is None:
        sequence_patterns = ATTACK_SEQUENCE_PATTERNS
    
    if enable_result_matching is None:
        enable_result_matching = ENABLE_RESULT_MATCHING
    
    # Load original CSV data if result matching is enabled
    csv_data = None
    if enable_result_matching and target_file:
        csv_data = load_original_csv_data(target_file)
        if csv_data is None:
            print("   ⚠️  Result matching disabled due to CSV loading failure")
            enable_result_matching = False
    
    print(f"🔍 Result matching: {'ENABLED' if enable_result_matching else 'DISABLED'}")
    
    # Group edges by target (src, dst) pair and get them in chronological order
    target_edge_groups = defaultdict(list)
    for src, dst, key, data in G.edges(keys=True, data=True):
        ts = _get_edge_timestamp(src, dst, key, data, edge_metadata)
        line_id = _get_edge_line_id(src, dst, key, data, edge_metadata)
        sort_key = ts if ts is not None else (line_id if line_id is not None else 0)
        
        # Get operation from metadata and normalize it
        edge_meta = edge_metadata.get((src, dst, key), {})
        operation = edge_meta.get('operation', data.get('operation', 'unknown'))
        
        # Get result from original CSV if available
        result = None
        if enable_result_matching and csv_data and line_id:
            csv_row = csv_data.get(str(line_id))
            if csv_row:
                result = csv_row.get('Result')
        
        target_edge_groups[(src, dst)].append((sort_key, src, dst, key, operation, data, result))
    
    # Sort edges within each target group chronologically
    for target_pair in target_edge_groups:
        target_edge_groups[target_pair].sort(key=lambda x: x[0])
    
    print(f"📋 Found {len(target_edge_groups)} unique target pairs (src, dst)")
    if enable_result_matching:
        print(f"📋 Sample operations with results from different targets:")
    else:
        print(f"📋 Sample operations from different targets:")
    
    sample_count = 0
    for target_pair, edge_list in list(target_edge_groups.items())[:3]:
        print(f"   Target {target_pair}: {len(edge_list)} operations")
        for i, edge_data in enumerate(edge_list[:3]):
            sample_count += 1
            if len(edge_data) >= 7:  # Has result data
                _, src, dst, key, norm_op, data, result = edge_data
                if enable_result_matching and result:
                    print(f"     {sample_count}. {norm_op} -> {result}")
                else:
                    print(f"     {sample_count}. {norm_op}")
            else:  # Legacy format without result
                _, src, dst, key, norm_op, data = edge_data
                print(f"     {sample_count}. {norm_op}")
        if len(edge_list) > 3:
            print(f"     ... and {len(edge_list) - 3} more")
    
    # Find sequence groups within each target pair
    sequence_groups = {}
    group_id = 0
    
    # For each target pair, find all potential pattern matches at all positions
    for target_pair, edge_list in target_edge_groups.items():
        if len(edge_list) < min(p.min_length for p in sequence_patterns):
            continue  # Skip targets with insufficient edges
        
        print(f"\n📍 Analyzing target pair {target_pair} with {len(edge_list)} edges")
        
        # Collect all potential matches for this target
        potential_matches = []
        
        for pattern in sequence_patterns:
            print(f"   🔍 Testing pattern: {pattern.name} (min_length: {pattern.min_length})")
            pattern_length = len(pattern.operations)
            
            if len(edge_list) < pattern.min_length:
                continue  # Skip patterns requiring more edges than available
            
            # Sliding window to find pattern matches within this target
            for start_idx in range(len(edge_list) - pattern.min_length + 1):
                start_edge_data = edge_list[start_idx]
                
                # Handle both old format (6 elements) and new format (7 elements with result)
                if len(start_edge_data) >= 7:
                    _, start_src, start_dst, start_key, start_op, start_data, start_result = start_edge_data
                else:
                    _, start_src, start_dst, start_key, start_op, start_data = start_edge_data
                    start_result = None
                
                matched_edges = []
                matched_operations = []
                pattern_positions = []
                current_pattern_idx = 0
                gap_count = 0
                used_pattern_indices = set()  # Track which pattern operations we've matched
                
                # Look for pattern starting at start_idx within this target
                search_end = min(start_idx + pattern_length * 2 + max_gap, len(edge_list))
                
                for check_idx in range(start_idx, search_end):
                    edge_data = edge_list[check_idx]
                    
                    # Handle both old format (6 elements) and new format (7 elements with result)
                    if len(edge_data) >= 7:
                        _, src, dst, key, operation, data, result = edge_data
                    else:
                        _, src, dst, key, operation, data = edge_data
                        result = None
                    
                    # Ensure we're still working with the same target
                    if (src, dst) != target_pair:
                        break
                    
                    if pattern.strict_order:
                        # Strict order: must match operations in sequence
                        if current_pattern_idx < pattern_length:
                            target_operation = pattern.operations[current_pattern_idx]
                            expected_result = pattern.results[current_pattern_idx] if hasattr(pattern, 'results') and current_pattern_idx < len(pattern.results) else None
                            
                            matches = match_operation_to_patterns(
                                operation, [target_operation], 
                                result=result, result_list=[expected_result] if expected_result else None,
                                strict_order=True, current_index=0,
                                enable_result_matching=enable_result_matching
                            )
                            
                            if matches:
                                # Found the next expected operation in sequence on same target
                                matched_edges.append((src, dst, key))
                                matched_operations.append(operation)
                                pattern_positions.append(check_idx)
                                current_pattern_idx += 1
                                gap_count = 0
                                
                                # Continue until we've checked the full pattern or met minimum
                                if current_pattern_idx >= pattern_length:
                                    break
                            else:
                                gap_count += 1
                                if gap_count > max_gap:
                                    break
                    else:
                        # Flexible order: can skip operations but must maintain overall order
                        expected_results = pattern.results if hasattr(pattern, 'results') else None
                        
                        pattern_matches = match_operation_to_patterns(
                            operation, pattern.operations, 
                            result=result, result_list=expected_results,
                            strict_order=False,
                            enable_result_matching=enable_result_matching
                        )
                        
                        if pattern_matches:
                            # Check if we can match this operation while maintaining order
                            for match_idx in pattern_matches:
                                # Only allow matching operations that come at or after the highest position matched so far
                                max_position = max(used_pattern_indices) if used_pattern_indices else -1
                                if match_idx not in used_pattern_indices and match_idx > max_position:
                                    matched_edges.append((src, dst, key))
                                    matched_operations.append(operation)
                                    pattern_positions.append(check_idx)
                                    used_pattern_indices.add(match_idx)
                                    gap_count = 0
                                    break
                            
                            # If we've matched enough operations for the minimum
                            if len(used_pattern_indices) >= pattern.min_length:
                                # Check if we have a valid sequence (may not need all operations)
                                if len(used_pattern_indices) >= pattern_length:
                                    break
                        else:
                            gap_count += 1
                            if gap_count > max_gap:
                                break
                
                # Validate the sequence and calculate score
                if len(matched_edges) >= pattern.min_length:
                    unique_ops = set(matched_operations)
                    if len(unique_ops) >= 0:  # Must have at least 2 different operations
                        
                        # Calculate confidence and completeness
                        if pattern.strict_order:
                            completeness = current_pattern_idx / pattern_length
                        else:
                            completeness = len(used_pattern_indices) / pattern_length
                        
                        pattern_coverage = completeness
                        
                        if pattern_coverage >= 0.4:  # At least 40% of pattern operations
                            gap_penalty = max(0, 1 - (gap_count / max_gap)) if max_gap > 0 else 1
                            confidence = completeness * gap_penalty
                            
                            # Additional scoring factors for best match selection
                            edge_count_bonus = min(1.0, len(matched_edges) / pattern_length)
                            unique_ops_bonus = min(1.0, len(unique_ops) / pattern_length)
                            
                            # Final score combines confidence with bonus factors
                            final_score = confidence * (1 + 0.2 * edge_count_bonus + 0.1 * unique_ops_bonus)
                            
                            potential_match = {
                                'pattern': pattern,
                                'edges': matched_edges,
                                'start_index': start_idx,
                                'end_index': pattern_positions[-1] if pattern_positions else start_idx,
                                'confidence': confidence,
                                'final_score': final_score,
                                'matched_operations': matched_operations,
                                'completeness': completeness,
                                'unique_operations': len(unique_ops),
                                'pattern_coverage': pattern_coverage,
                                'target_pair': target_pair
                            }
                            
                            potential_matches.append(potential_match)
                            print(f"      ✅ Potential match: {pattern.name} at pos {start_idx}, score: {final_score:.3f}, conf: {confidence:.3f}")
        
        # Now select the best non-overlapping matches for this target
        if potential_matches:
            # Sort by final score (highest first)
            potential_matches.sort(key=lambda x: x['final_score'], reverse=True)
            print(f"   🏆 Found {len(potential_matches)} potential matches, selecting best non-overlapping ones")
            
            selected_matches = []
            used_positions = set()
            
            for match in potential_matches:
                # Check if this match overlaps significantly with already selected matches
                match_positions = set(range(match['start_index'], match['end_index'] + 1))
                overlap = len(match_positions & used_positions) / len(match_positions)
                
                if overlap < 0.5:  # Less than 50% overlap allowed
                    selected_matches.append(match)
                    used_positions.update(match_positions)
                    print(f"      ✅ Selected: {match['pattern'].name} (score: {match['final_score']:.3f})")
                else:
                    print(f"      ❌ Skipped: {match['pattern'].name} (overlap: {overlap:.2f})")
            
            # Add selected matches to sequence groups
            for match in selected_matches:
                if match['confidence'] > 0.4:  # Minimum confidence threshold
                    sequence_groups[group_id] = match
                    group_id += 1
    
    return sequence_groups

def match_operation_to_patterns(operation, operation_list, result=None, result_list=None, strict_order=False, current_index=0, enable_result_matching=False):
    """
    Check if an operation (and optionally result) matches any operations in a sequence pattern
    
    Args:
        operation: The operation name to match
        operation_list: List of expected operations in the pattern
        result: The result value to match (optional)
        result_list: List of expected results corresponding to operations (optional)
        strict_order: Whether to enforce strict ordering
        current_index: Current position in pattern for strict order matching
        enable_result_matching: Whether to include result in matching criteria
    
    Returns:
        List of matching indices in the pattern
    """
    operation_clean = operation.strip()
    
    if strict_order:
        # For strict order, only check if operation matches the current expected operation
        if current_index < len(operation_list):
            operation_matches = operation_clean == operation_list[current_index]
            
            # If result matching is enabled, also check result
            if enable_result_matching and result_list and current_index < len(result_list):
                result_matches = result and result.strip() == result_list[current_index]
                return [current_index] if operation_matches and result_matches else []
            else:
                return [current_index] if operation_matches else []
        return []
    else:
        # For flexible order, check if operation matches any in the list
        matched_indices = []
        for i, expected_op in enumerate(operation_list):
            operation_matches = operation_clean == expected_op
            
            # If result matching is enabled, also check result
            if enable_result_matching and result_list and i < len(result_list):
                if result:
                    result_matches = result.strip() == result_list[i]
                    if operation_matches and result_matches:
                        matched_indices.append(i)
                # If no result provided but result matching is enabled, skip this match
            else:
                # No result matching, just check operation
                if operation_matches:
                    matched_indices.append(i)
        return matched_indices
    
def apply_sequence_coloring(G, edge_metadata, sequence_groups):
    """Apply sequence group coloring to graph edges"""
    
    # Create edge to group mapping
    edge_to_group = {}
    for group_id, group_info in sequence_groups.items():
        for edge in group_info['edges']:
            edge_to_group[edge] = group_id
    
    # Apply coloring to edges
    for src, dst, key, data in G.edges(keys=True, data=True):
        edge_tuple = (src, dst, key)
        
        if edge_tuple in edge_to_group:
            group_id = edge_to_group[edge_tuple]
            group_info = sequence_groups[group_id]
            
            # Set sequence group attributes
            data['sequence_group'] = group_id
            data['sequence_pattern'] = group_info['pattern'].name
            data['sequence_color'] = group_info['pattern'].color
            data['sequence_confidence'] = group_info['confidence']
            data['sequence_description'] = group_info['pattern'].description
        else:
            # Default coloring for ungrouped edges
            data['sequence_group'] = None
            data['sequence_pattern'] = 'Ungrouped'
            data['sequence_color'] = '#CCCCCC'  # Gray
            data['sequence_confidence'] = 0.0
            data['sequence_description'] = 'No pattern match'




def create_sequence_grouped_visualization(G, edge_metadata, malicious_specs=None, 
                                        sequence_patterns=None, output_path="sequence_grouped_graph.html", sequence_groups=None):
    """Create visualization with sequence-based edge coloring"""
    
    if sequence_patterns is None:
        sequence_patterns = ATTACK_SEQUENCE_PATTERNS
    
    if sequence_groups is None:
        sequence_groups = find_sequence_groups(G, edge_metadata, sequence_patterns=sequence_patterns)
    
    # Apply sequence coloring
    apply_sequence_coloring(G, edge_metadata, sequence_groups)
    
    print(f"📊 Found {len(sequence_groups)} sequence groups:")
    for group_id, group_info in sequence_groups.items():
        pattern_name = group_info['pattern'].name
        edge_count = len(group_info['edges'])
        confidence = group_info['confidence']
        target_pair = group_info.get('target_pair', 'Unknown')
        print(f"   Group {group_id}: {group_info['pattern'].name} ({edge_count} edges, confidence: {confidence:.2f})")
        print(f"      Target: {target_pair}")
        print(f"      Matched operations: {', '.join(group_info['matched_operations'])}")
        print(f"      Completeness: {group_info.get('completeness', 0):.2f}")
        print(f"      Strict order: {group_info['pattern'].strict_order}")
    
    # Apply REAPr analysis if malicious specs provided - skip for now if not available
    if malicious_specs:
        try:
            malicious_processes, malicious_resources, contaminated, impacts = apply_reapr_to_simplified_graph(
                G, edge_metadata, malicious_specs
            )
        except:
            print("⚠️ REAPr analysis not available, continuing without it")
            malicious_specs = None
    
    # Create visualization
    net = Network(notebook=True, height="700px", width="100%", bgcolor="#ffffff", directed=True)
    
    # Add nodes with REAPr or default styling
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'Unknown')
        node_name = data.get('name', 'Unknown')
        reapr_label = data.get('reapr_label', 'BENIGN')
        
        # Node coloring (REAPr takes precedence over sequence groups)
        if malicious_specs and reapr_label != 'BENIGN':
            if reapr_label == 'MALICIOUS_RESOURCE':
                color = '#FF0000'  # Bright red
                size = 25
            elif reapr_label == 'CONTAMINATED':
                color = '#FF4400'  # Red-orange
                size = 20
            elif reapr_label == 'IMPACT':
                color = '#FF8800'  # Orange
                size = 18
            else:
                color = '#CCCCCC'  # Gray
                size = 15
        else:
            # Default node coloring by type
            if node_type == 'Process':
                color = '#90EE90'  # Light green
                size = 20
            elif node_type == 'Registry':
                color = '#87CEEB'  # Sky blue
                size = 15
            elif node_type == 'File':
                color = '#DDA0DD'  # Plum
                size = 15
            elif node_type == 'Network':
                color = '#F0E68C'  # Khaki
                size = 15
            else:
                color = '#D3D3D3'  # Light gray
                size = 12
        
        title = f"{node_type}: {node_name}"
        if malicious_specs:
            title += f"\nREAPr Label: {reapr_label}"
        
        net.add_node(node, label=node_name, title=title, color=color, size=size)
    
    # Add edges with sequence-based coloring
    edge_count = {}
    for src, dst, key, data in G.edges(keys=True, data=True):
        edge_pair = (src, dst)
        edge_count[edge_pair] = edge_count.get(edge_pair, 0) + 1
        n = edge_count[edge_pair]
        
        # Get edge metadata and sequence info
        edge_meta = edge_metadata.get((src, dst, key), {})
        operation = edge_meta.get('operation', 'unknown')
        line_id = edge_meta.get('line_id', 'N/A')
        timestamp = edge_meta.get('timestamp', data.get('timestamp', 'N/A'))
        
        # Get sequence coloring
        sequence_color = data.get('sequence_color', '#CCCCCC')
        sequence_pattern = data.get('sequence_pattern', 'Ungrouped')
        sequence_confidence = data.get('sequence_confidence', 0.0)
        sequence_description = data.get('sequence_description', 'No pattern match')
        
        # Create edge label with sequence info
        if sequence_pattern != 'Ungrouped':
            edge_label = f"{operation}\n[{sequence_pattern}]"
        else:
            edge_label = operation
        
        if n > 1:
            edge_label += f" #{n}"
        
        # Edge styling based on sequence
        if sequence_pattern != 'Ungrouped':
            edge_width = 2 + int(sequence_confidence * 3)  # Thicker for higher confidence
            opacity = 0.6 + (sequence_confidence * 0.4)    # More opaque for higher confidence
        else:
            edge_width = 1
            opacity = 0.4
        
        edge_color = {'color': sequence_color, 'opacity': opacity}
        
        # Handle multiple edges with curves
        smooth_type = 'curvedCW' if (n % 2 == 1) else 'curvedCCW'
        roundness = min(0.6, 0.1 + 0.05 * (n - 1))
        smooth = {"enabled": True, "type": smooth_type, "roundness": roundness}
        
        # Create detailed title with sequence information
        title_parts = [
            f"Operation: {operation}",
            f"Line ID: {line_id}",
            f"Timestamp: {timestamp}",
            f"Target: {src} → {dst}",
            f"Sequence Pattern: {sequence_pattern}",
            f"Pattern Description: {sequence_description}"
        ]
        
        if sequence_confidence > 0:
            title_parts.append(f"Confidence: {sequence_confidence:.2f}")
            # Find which group this edge belongs to and show target pair info
            for group_id, group_info in sequence_groups.items():
                if (src, dst, key) in group_info['edges']:
                    target_pair = group_info.get('target_pair', (src, dst))
                    title_parts.append(f"Sequence Target: {target_pair}")
                    break
        
        edge_title = "\n".join(title_parts)
        
        net.add_edge(src, dst,
                    id=f"{src}->{dst}#{key}",
                    label=edge_label,
                    title=edge_title,
                    color=edge_color,
                    width=edge_width,
                    smooth=smooth)
    
    # Set options to match standard configuration used by other graphs
    net.set_options("""
    var options = {
      "physics": {
        "enabled": true,
        "stabilization": {
          "enabled": true,
          "iterations": 100
        }
      },
      "nodes": {
        "font": {"size": 12, "color": "#000000"}
      },
      "edges": {
        "font": {"size": 10}
      },
      "interaction": {
        "dragNodes": true,
        "dragView": true,
        "zoomView": true
      }
    }
    """)
    
    # Save the HTML
    net.show(output_path)
    
    # Add stabilization callback and sequence legend to HTML
    with open(output_path, 'r') as f:
        html_content = f.read()
    
    # Add standard stabilization script used by other graphs
    stabilization_script = """
    <script type="text/javascript">
    // Disable physics after stabilization to allow free movement
    document.addEventListener('DOMContentLoaded', function() {
        // Wait for network to be available
        setTimeout(function() {
            if (typeof network !== 'undefined') {
                network.on("stabilizationIterationsDone", function () {
                    network.setOptions({physics: {enabled: false}});
                    console.log("Physics disabled after stabilization - graph will stop spinning");
                });
                
                // Fallback: disable physics after 10 seconds regardless
                setTimeout(function() {
                    network.setOptions({physics: {enabled: false}});
                    console.log("Physics disabled after timeout - graph will stop spinning");
                }, 10000);
            }
        }, 1000);
    });
    </script>
    """
    
    # Create legend HTML
    legend_html = f"""
    <div id="sequenceLegend" style="position: fixed; top: 10px; right: 10px; background: white; padding: 15px; border: 2px solid #ccc; border-radius: 8px; z-index: 1000; box-shadow: 0 4px 8px rgba(0,0,0,0.1); max-width: 300px;">
        <h3 style="margin-top: 0;">Sequence Patterns</h3>
        <div style="max-height: 400px; overflow-y: auto;">
    """
    
    # Add pattern legend items
    for pattern in sequence_patterns:
        legend_html += f"""
        <div style="margin-bottom: 8px; padding: 5px; border-left: 4px solid {pattern.color};">
            <strong>{pattern.name}</strong><br>
            <small style="color: #666;">{pattern.description}</small>
        </div>
        """
    
    # Add group statistics
    legend_html += f"""
        </div>
        <hr style="margin: 10px 0;">
        <div style="font-size: 12px;">
            <strong>Detected Groups:</strong><br>
    """
    
    for group_id, group_info in sequence_groups.items():
        pattern_name = group_info['pattern'].name
        edge_count = len(group_info['edges'])
        confidence = group_info['confidence']
        target_pair = group_info.get('target_pair', 'Unknown')
        legend_html += f"Group {group_id}: {pattern_name} ({edge_count} edges, {confidence:.1%})<br>"
        legend_html += f"&nbsp;&nbsp;&nbsp;&nbsp;Target: {target_pair}<br>"
    
    legend_html += """
        </div>
    </div>
    """
    
    # Insert stabilization script and legend before closing body tag
    enhanced_content = stabilization_script + legend_html
    html_content = html_content.replace('</body>', enhanced_content + '</body>')
    
    # Write enhanced HTML
    with open(output_path, 'w') as f:
        f.write(html_content)
    
    return output_path, sequence_groups

