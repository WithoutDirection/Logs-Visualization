// Global variables
let currentGraph = null;
let currentData = null;
let network = null;
let graphMetadata = {};
let filteredData = null;
let lastUpdateTime = Date.now();

// Configuration
const config = {
    apiBaseUrl: './unified_viz_data', // Directory containing JSON files
    defaultEntryRange: 100,
    maxEntryRange: 10000,
    physicsStabilizationTime: 5000
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApplication();
});

async function initializeApplication() {
    showNotification('Initializing visualization tool...', 'warning');
    
    try {
        await loadMetadataIndex();
        initializeGraphSelector();
        setupEventListeners();
        updateWindowNavigationButtons(); // Initialize button states
        updateStatus('Ready - Select a graph to begin');
        showNotification('Visualization tool ready!', 'success');
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
    }
}

async function loadMetadataIndex() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/metadata_index.json`);
        if (!response.ok) {
            throw new Error('Failed to load metadata index');
        }
        graphMetadata = await response.json();
        console.log('Loaded metadata for', Object.keys(graphMetadata).length, 'graphs');
    } catch (error) {
        console.error('Error loading metadata:', error);
        // Fallback to empty metadata for demo
        graphMetadata = {};
        throw error;
    }
}

function initializeGraphSelector() {
    const selector = document.getElementById('graph-selector');
    
    // Clear existing options
    selector.innerHTML = '<option value="">Select Event Graph...</option>';
    
    // Populate graph selector
    Object.keys(graphMetadata).forEach(graphId => {
        const meta = graphMetadata[graphId];
        const option = document.createElement('option');
        option.value = graphId;
        option.textContent = `${meta.name} (${meta.stats.nodes} nodes, ${meta.stats.edges} edges)`;
        selector.appendChild(option);
    });
    
    console.log('Graph selector initialized with', Object.keys(graphMetadata).length, 'options');
}

function setupEventListeners() {
    // Graph selection
    document.getElementById('graph-selector').addEventListener('change', function() {
        const loadBtn = document.getElementById('load-btn');
        loadBtn.disabled = !this.value;
        
        if (this.value) {
            updateStatsDisplay(graphMetadata[this.value]);
            updateEntryRange(graphMetadata[this.value].stats.entry_range);
        }
    });
    
    // Load button
    document.getElementById('load-btn').addEventListener('click', function() {
        const selectedGraph = document.getElementById('graph-selector').value;
        if (selectedGraph) {
            loadGraph(selectedGraph);
        }
    });
    
    // Apply range button
    document.getElementById('apply-range-btn').addEventListener('click', function() {
        if (currentData) {
            applyEntryRange();
            updateWindowNavigationButtons();
        }
    });
    
    // Window navigation buttons
    document.getElementById('last-window-btn').addEventListener('click', function() {
        if (currentData) {
            navigateToLastWindow();
            updateWindowNavigationButtons();
        }
    });
    
    document.getElementById('next-window-btn').addEventListener('click', function() {
        if (currentData) {
            navigateToNextWindow();
            updateWindowNavigationButtons();
        }
    });
    
    // Update navigation buttons when range inputs change
    document.getElementById('entry-start').addEventListener('input', updateWindowNavigationButtons);
    document.getElementById('entry-end').addEventListener('input', updateWindowNavigationButtons);
    
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const range = this.dataset.range;
            applyPresetRange(range);
            updateWindowNavigationButtons();
        });
    });
    
    // Feature toggles
    document.getElementById('sequence-grouping').addEventListener('change', function() {
        if (currentData) {
            updateVisualization();
        }
    });
    
    document.getElementById('reapr-analysis').addEventListener('change', function() {
        if (currentData) {
            updateVisualization();
        }
    });
    
    document.getElementById('show-legend').addEventListener('change', function() {
        const legend = document.getElementById('legend');
        legend.style.display = this.checked ? 'block' : 'none';
    });
    
    document.getElementById('enable-physics').addEventListener('change', function() {
        if (network) {
            network.setOptions({physics: {enabled: this.checked}});
        }
    });
    
    document.getElementById('show-edge-labels').addEventListener('change', function() {
        if (currentData) {
            updateVisualization();
        }
    });
    
    document.getElementById('combine-edges').addEventListener('change', function() {
        if (currentData) {
            updateVisualization();
        }
    });
    
    // Node filters
    ['show-process', 'show-file', 'show-registry', 'show-network'].forEach(id => {
        document.getElementById(id).addEventListener('change', function() {
            if (currentData) {
                updateVisualization();
            }
        });
    });
    
    // Confidence slider
    document.getElementById('confidence-slider').addEventListener('input', function() {
        document.getElementById('confidence-value').textContent = this.value + '%';
        if (currentData) {
            updateVisualization();
        }
    });
}

function updateStatsDisplay(metadata) {
    document.getElementById('stat-nodes').textContent = metadata.stats.nodes.toLocaleString();
    document.getElementById('stat-edges').textContent = metadata.stats.edges.toLocaleString();
    document.getElementById('stat-entries').textContent = metadata.stats.entry_range[1].toLocaleString();
    
    const timeRange = metadata.stats.time_range;
    if (timeRange[0] && timeRange[1] && timeRange[0] > 0) {
        const start = new Date(timeRange[0] * 1000).toLocaleString();
        const end = new Date(timeRange[1] * 1000).toLocaleString();
        document.getElementById('stat-time').textContent = `${start} - ${end}`;
    } else {
        document.getElementById('stat-time').textContent = 'N/A';
    }
    
    // Update REAPr checkbox availability
    const reaprCheckbox = document.getElementById('reapr-analysis');
    reaprCheckbox.disabled = !metadata.available_features.reapr_analysis;
    if (!metadata.available_features.reapr_analysis) {
        reaprCheckbox.checked = false;
    }
}

function updateEntryRange(entryRange) {
    const maxEntries = entryRange[1];
    document.getElementById('entry-start').max = maxEntries;
    document.getElementById('entry-end').max = maxEntries;
    document.getElementById('entry-end').value = Math.min(config.defaultEntryRange, maxEntries);
}

function applyPresetRange(range) {
    if (!currentData) return;
    
    const maxEntries = currentData.total_entries;
    let startEntry = 1;
    let endEntry = maxEntries;
    
    if (range === 'all') {
        endEntry = maxEntries;
    } else {
        const rangeNum = parseInt(range);
        endEntry = Math.min(rangeNum, maxEntries);
    }
    
    document.getElementById('entry-start').value = startEntry;
    document.getElementById('entry-end').value = endEntry;
    
    applyEntryRange();
}

async function loadGraph(graphId) {
    const startTime = performance.now();
    showLoading(true);
    updateStatus(`Loading graph: ${graphId}...`);
    
    try {
        const response = await fetch(`${config.apiBaseUrl}/${graphId}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load graph data: ${response.status}`);
        }
        
        currentData = await response.json();
        currentGraph = graphId;
        
        console.log('Loaded graph data:', {
            nodes: currentData.nodes.length,
            edges: currentData.edges.length,
            sequences: Object.keys(currentData.sequence_groups).length,
            malicious: currentData.malicious_specs.length
        });
        
        updateVisualization();
        updateLegend();
        
        const loadTime = performance.now() - startTime;
        updateStatus(`Graph loaded successfully`);
        updatePerformance(`${Math.round(loadTime)}ms`);
        showNotification(`Graph ${graphId} loaded successfully!`, 'success');
        
    } catch (error) {
        console.error('Error loading graph:', error);
        updateStatus(`Error loading graph: ${error.message}`);
        showNotification(`Failed to load graph: ${error.message}`, 'error');
        
        // For demo purposes, create mock data if file doesn't exist
        if (error.message.includes('404') || error.message.includes('Failed to fetch')) {
            createMockVisualization(graphId);
        }
    } finally {
        showLoading(false);
    }
}

function createMockVisualization(graphId) {
    console.log('Creating mock visualization for:', graphId);
    
    // Create mock data structure
    currentData = {
        graph_id: graphId,
        nodes: [
            {id: 'proc1', label: 'powershell.exe', type: 'Process', title: 'Process: powershell.exe'},
            {id: 'file1', label: 'config.txt', type: 'File', title: 'File: config.txt'},
            {id: 'reg1', label: 'HKLM\\Software\\Test', type: 'Registry', title: 'Registry: HKLM\\Software\\Test'},
            {id: 'net1', label: '192.168.1.100', type: 'Network', title: 'Network: 192.168.1.100'}
        ],
        edges: [
            {src: 'proc1', dst: 'file1', operation: 'CreateFile', timestamp: Date.now() / 1000, entry_index: 1},
            {src: 'proc1', dst: 'reg1', operation: 'RegSetValue', timestamp: Date.now() / 1000 + 1, entry_index: 2},
            {src: 'proc1', dst: 'net1', operation: 'TCP Connect', timestamp: Date.now() / 1000 + 2, entry_index: 3}
        ],
        sequence_groups: {},
        malicious_specs: [],
        total_entries: 3
    };
    
    updateVisualization();
    updateStatus(`Mock graph loaded for: ${graphId}`);
    showNotification('Demo mode: Mock graph loaded', 'warning');
}

function updateVisualization() {
    if (!currentData) return;
    
    const startTime = performance.now();
    
    // Apply filters to create filtered dataset
    filteredData = applyFilters(currentData);
    
    // Create vis.js network
    createNetworkVisualization(filteredData);
    
    const updateTime = performance.now() - startTime;
    updatePerformance(`${Math.round(updateTime)}ms`);
    updateFilterStatus();
    updateWindowNavigationButtons();
}

/**
 * Combines edges with the same operation between the same source and destination nodes.
 * Creates combined edge objects with merged metadata including counts, timestamp ranges,
 * line IDs, entry indices, and preserves sequence group information if present.
 * 
 * @param {Array} edges - Array of edge objects to combine
 * @returns {Array} Array of combined edges, maintaining chronological order
 */
function combineEdgesByOperation(edges) {
    const combinedMap = new Map();
    
    // Group edges by src-dst-operation key
    edges.forEach(edge => {
        const key = `${edge.src}-${edge.dst}-${edge.operation}`;
        
        if (combinedMap.has(key)) {
            const existing = combinedMap.get(key);
            existing.combined_count++;
            existing.original_edges.push(edge);
            existing.line_ids.push(edge.line_id);
            existing.entry_indices.push(edge.entry_index);
            existing.timestamps.push(edge.timestamp);
            
            // Update timestamp range
            existing.timestamp_min = Math.min(existing.timestamp_min, edge.timestamp);
            existing.timestamp_max = Math.max(existing.timestamp_max, edge.timestamp);
            
            // Preserve sequence group info if any edge has it
            if (edge.sequence_group_id && !existing.sequence_group_id) {
                existing.sequence_group_id = edge.sequence_group_id;
                existing.sequence_color = edge.sequence_color;
                existing.sequence_pattern = edge.sequence_pattern;
            }
        } else {
            // Create new combined edge entry
            const combinedEdge = {
                ...edge, // Copy all original properties
                id: key,
                combined_count: 1,
                original_edges: [edge],
                line_ids: [edge.line_id],
                entry_indices: [edge.entry_index],
                timestamps: [edge.timestamp],
                timestamp_min: edge.timestamp,
                timestamp_max: edge.timestamp,
                is_combined: false // Will be true for count > 1
            };
            combinedMap.set(key, combinedEdge);
        }
    });
    
    // Convert map to array and mark combined edges
    const combinedEdges = Array.from(combinedMap.values()).map(edge => {
        if (edge.combined_count > 1) {
            edge.is_combined = true;
            // Use the earliest entry_index for sorting
            edge.entry_index = Math.min(...edge.entry_indices);
        }
        return edge;
    });
    
    // Sort by entry_index to maintain chronological order
    combinedEdges.sort((a, b) => a.entry_index - b.entry_index);
    
    return combinedEdges;
}

function applyFilters(data) {
    const startEntry = parseInt(document.getElementById('entry-start').value) || 1;
    const endEntry = parseInt(document.getElementById('entry-end').value) || data.total_entries;
    const showSequenceGrouping = document.getElementById('sequence-grouping').checked;
    const showReapr = document.getElementById('reapr-analysis').checked;
    const confidenceThreshold = parseInt(document.getElementById('confidence-slider').value) / 100;
    const combineEdges = document.getElementById('combine-edges').checked;
    
    // Filter edges by entry range
    let filteredEdges = data.edges.filter(edge => 
        edge.entry_index >= startEntry && edge.entry_index <= endEntry
    );
    
    // Apply edge combination if enabled
    if (combineEdges) {
        filteredEdges = combineEdgesByOperation(filteredEdges);
    }
    
    // Get involved nodes
    const involvedNodeIds = new Set();
    filteredEdges.forEach(edge => {
        involvedNodeIds.add(edge.src);
        involvedNodeIds.add(edge.dst);
    });
    
    // Filter nodes by type
    const nodeTypeFilters = {
        'Process': document.getElementById('show-process').checked,
        'File': document.getElementById('show-file').checked,
        'Registry': document.getElementById('show-registry').checked,
        'Network': document.getElementById('show-network').checked
    };
    
    const filteredNodes = data.nodes.filter(node => 
        involvedNodeIds.has(node.id) && nodeTypeFilters[node.type]
    );
    
    return {
        ...data,
        nodes: filteredNodes,
        edges: filteredEdges,
        filters_applied: {
            entry_range: [startEntry, endEntry],
            sequence_grouping: showSequenceGrouping,
            reapr_analysis: showReapr,
            confidence_threshold: confidenceThreshold,
            node_types: nodeTypeFilters,
            combine_edges: combineEdges
        }
    };
}

function createNetworkVisualization(data) {
    const container = document.getElementById('graph-container');
    
    // Prepare nodes for vis.js
    const visNodes = data.nodes.map(node => ({
        id: node.id,
        label: node.label,
        title: node.title,
        group: node.type.toLowerCase(),
        color: getNodeColor(node),
        size: getNodeSize(node)
    }));
    
    // Prepare edges for vis.js
    const visEdges = data.edges.map((edge, index) => {
        // Create label with count for combined edges
        let label = '';
        if (document.getElementById('show-edge-labels').checked) {
            label = edge.operation;
            if (edge.is_combined && edge.combined_count > 1) {
                label += ` (${edge.combined_count}x)`;
            }
        }
        
        return {
            id: edge.id || `${edge.src}-${edge.dst}-${index}`,
            from: edge.src,
            to: edge.dst,
            label: label,
            title: createEdgeTooltip(edge),
            color: getEdgeColor(edge),
            width: getEdgeWidth(edge),
            arrows: 'to'
        };
    });
    
    const visData = {
        nodes: new vis.DataSet(visNodes),
        edges: new vis.DataSet(visEdges)
    };
    
    const options = {
        groups: {
            process: {color: {background: '#90EE90', border: '#6B8E6B'}, shape: 'box'},
            file: {color: {background: '#DDA0DD', border: '#B8860B'}, shape: 'ellipse'},
            registry: {color: {background: '#87CEEB', border: '#4682B4'}, shape: 'diamond'},
            network: {color: {background: '#F0E68C', border: '#DAA520'}, shape: 'triangle'}
        },
        physics: {
            enabled: document.getElementById('enable-physics').checked,
            stabilization: {
                enabled: true,
                iterations: 100
            },
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 200,
                springConstant: 0.05
            }
        },
        interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true
        },
        nodes: {
            font: {size: 12, color: '#000000'},
            borderWidth: 2
        },
        edges: {
            font: {size: 10},
            smooth: {
                enabled: true,
                type: 'curvedCW',
                roundness: 0.2
            }
        }
    };
    
    // Create or update network
    if (network) {
        network.setData(visData);
        network.setOptions(options);
    } else {
        network = new vis.Network(container, visData, options);
        
        // Setup event listeners
        network.on("stabilizationIterationsDone", function () {
            if (document.getElementById('enable-physics').checked) {
                setTimeout(() => {
                    network.setOptions({physics: {enabled: false}});
                }, config.physicsStabilizationTime);
            }
        });
        
        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                console.log('Node clicked:', nodeId);
            }
            if (params.edges.length > 0) {
                const edgeId = params.edges[0];
                console.log('Edge clicked:', edgeId);
            }
        });
    }
    
    updateMemoryUsage();
}

function getNodeColor(node) {
    // Default colors based on type
    const typeColors = {
        'Process': '#90EE90',
        'File': '#DDA0DD',
        'Registry': '#87CEEB',
        'Network': '#F0E68C'
    };
    
    // TODO: Add REAPr coloring when enabled
    if (document.getElementById('reapr-analysis').checked) {
        // Check if node is in malicious specs
        // Return appropriate color based on REAPr analysis
    }
    
    return typeColors[node.type] || '#D3D3D3';
}

function getNodeSize(node) {
    return node.type === 'Process' ? 25 : 20;
}

function getEdgeColor(edge) {
    // Apply sequence group coloring if available and enabled
    if (document.getElementById('sequence-grouping').checked) {
        if (edge.sequence_color) {
            return edge.sequence_color;
        }
        // Check if edge is part of sequence groups from currentData
        if (currentData && currentData.sequence_groups) {
            for (const [groupId, group] of Object.entries(currentData.sequence_groups)) {
                // For combined edges, check if any original edge belongs to this group
                if (edge.is_combined) {
                    const hasSequenceEdge = edge.original_edges.some(originalEdge => {
                        return group.edges.some(([src, dst, key]) => 
                            src === originalEdge.src && 
                            dst === originalEdge.dst && 
                            key == originalEdge.key
                        );
                    });
                    if (hasSequenceEdge) {
                        return group.pattern_color;
                    }
                } else {
                    // Single edge, check directly
                    const isInGroup = group.edges.some(([src, dst, key]) => 
                        src === edge.src && 
                        dst === edge.dst && 
                        key == edge.key
                    );
                    if (isInGroup) {
                        return group.pattern_color;
                    }
                }
            }
        }
    }
    
    return '#848484'; // Default gray
}

/**
 * Determines edge width based on combination status.
 * Combined edges are rendered with thicker lines to indicate multiple operations.
 * 
 * @param {Object} edge - Edge object (may be combined or single)
 * @returns {number} Width value for the edge (2-8 pixels)
 */
function getEdgeWidth(edge) {
    if (edge.is_combined && edge.combined_count > 1) {
        // Thicker lines for combined edges, with a maximum
        return Math.min(2 + edge.combined_count, 8);
    }
    return 2; // Default width
}

/**
 * Creates tooltip text for edges, handling both single and combined edges.
 * For combined edges, shows detailed information including count, time ranges, and indices.
 * 
 * @param {Object} edge - Edge object (may be combined or single)
 * @returns {string} HTML tooltip text with escaped newlines
 */
function createEdgeTooltip(edge) {
    if (edge.is_combined && edge.combined_count > 1) {
        // Combined edge tooltip with detailed information
        const timeRange = edge.timestamp_min !== edge.timestamp_max 
            ? `${new Date(edge.timestamp_min * 1000).toLocaleString()} - ${new Date(edge.timestamp_max * 1000).toLocaleString()}`
            : new Date(edge.timestamp_min * 1000).toLocaleString();
        
        return `Operation: ${edge.operation} (Combined)\\n` +
               `Count: ${edge.combined_count} operations\\n` +
               `Time Range: ${timeRange}\\n` +
               `Entry Indices: ${edge.entry_indices.join(', ')}\\n` +
               `Line IDs: ${edge.line_ids.filter(id => id).join(', ')}`;
    } else {
        // Single edge tooltip
        return `Operation: ${edge.operation}\\nEntry: ${edge.entry_index}\\nTimestamp: ${new Date(edge.timestamp * 1000).toLocaleString()}`;
    }
}

function applyEntryRange() {
    const startEntry = parseInt(document.getElementById('entry-start').value);
    const endEntry = parseInt(document.getElementById('entry-end').value);
    
    if (startEntry > endEntry) {
        showNotification('Start entry must be less than or equal to end entry', 'error');
        return;
    }
    
    if (endEntry - startEntry > config.maxEntryRange) {
        showNotification(`Range too large! Maximum ${config.maxEntryRange} entries allowed`, 'warning');
        return;
    }
    
    updateStatus(`Applying entry range: ${startEntry} - ${endEntry}`);
    updateVisualization();
}

function navigateToLastWindow() {
    if (!currentData) return;
    
    const currentStart = parseInt(document.getElementById('entry-start').value);
    const currentEnd = parseInt(document.getElementById('entry-end').value);
    const windowSize = currentEnd - currentStart + 1;
    
    // Calculate previous window
    const newEnd = currentStart - 1;
    const newStart = Math.max(1, newEnd - windowSize + 1);
    
    // Check if we can go back
    if (newStart < 1 || newEnd < 1) {
        showNotification('Already at the beginning of the dataset', 'info');
        return;
    }
    
    // Update the input fields
    document.getElementById('entry-start').value = newStart;
    document.getElementById('entry-end').value = newEnd;
    
    // Apply the new range
    applyEntryRange();
    
    showNotification(`Moved to previous window: ${newStart} - ${newEnd}`, 'success');
}

function navigateToNextWindow() {
    if (!currentData) return;
    
    const currentStart = parseInt(document.getElementById('entry-start').value);
    const currentEnd = parseInt(document.getElementById('entry-end').value);
    const windowSize = currentEnd - currentStart + 1;
    const maxEntries = currentData.total_entries;
    
    // Calculate next window
    const newStart = currentEnd + 1;
    const newEnd = Math.min(maxEntries, newStart + windowSize - 1);
    
    // Check if we can go forward
    if (newStart > maxEntries) {
        showNotification('Already at the end of the dataset', 'info');
        return;
    }
    
    // Update the input fields
    document.getElementById('entry-start').value = newStart;
    document.getElementById('entry-end').value = newEnd;
    
    // Apply the new range
    applyEntryRange();
    
    showNotification(`Moved to next window: ${newStart} - ${newEnd}`, 'success');
}

function updateWindowNavigationButtons() {
    if (!currentData) {
        document.getElementById('last-window-btn').disabled = true;
        document.getElementById('next-window-btn').disabled = true;
        return;
    }
    
    const currentStart = parseInt(document.getElementById('entry-start').value);
    const currentEnd = parseInt(document.getElementById('entry-end').value);
    const maxEntries = currentData.total_entries;
    
    // Enable/disable Last Window button
    document.getElementById('last-window-btn').disabled = currentStart <= 1;
    
    // Enable/disable Next Window button
    document.getElementById('next-window-btn').disabled = currentEnd >= maxEntries;
}

function updateLegend() {
    const legend = document.getElementById('legend');
    const content = document.getElementById('legend-content');
    const stats = document.getElementById('legend-stats');
    
    if (!currentData) return;
    
    // Clear existing content
    content.innerHTML = '';
    
    // Add sequence patterns if available
    if (Object.keys(currentData.sequence_groups).length > 0) {
        Object.values(currentData.sequence_groups).forEach(group => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color" style="background-color: ${group.pattern_color}"></div>
                <span>${group.pattern_name}</span>
            `;
            content.appendChild(item);
        });
    }
    
    // Add node type legend
    const nodeTypes = [...new Set(currentData.nodes.map(n => n.type))];
    nodeTypes.forEach(type => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const color = getNodeColor({type: type});
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${color}"></div>
            <span>${type} Nodes</span>
        `;
        content.appendChild(item);
    });
    
    // Update stats with edge combination information
    if (filteredData) {
        const combineEdges = filteredData.filters_applied.combine_edges;
        let edgeStatsText = `Edges: ${filteredData.edges.length}`;
        
        if (combineEdges) {
            // Count total original edges when combined - shows the reduction in visual clutter
            const totalOriginalEdges = filteredData.edges.reduce((sum, edge) => {
                return sum + (edge.combined_count || 1);
            }, 0);
            edgeStatsText += ` (${totalOriginalEdges} original)`;
        }
        
        stats.innerHTML = `
            <strong>Current View:</strong><br>
            Nodes: ${filteredData.nodes.length}<br>
            ${edgeStatsText}<br>
            Entry Range: ${filteredData.filters_applied.entry_range[0]}-${filteredData.filters_applied.entry_range[1]}${combineEdges ? '<br><em>Edges combined by operation</em>' : ''}
        `;
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    const noGraph = document.querySelector('.no-graph');
    
    if (show) {
        loading.style.display = 'block';
        if (noGraph) noGraph.style.display = 'none';
    } else {
        loading.style.display = 'none';
    }
}

function updateStatus(message) {
    document.getElementById('status-text').textContent = message;
    lastUpdateTime = Date.now();
}

function updatePerformance(time) {
    document.getElementById('performance-text').textContent = `Performance: ${time}`;
}

function updateMemoryUsage() {
    if (performance.memory) {
        const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        document.getElementById('memory-text').textContent = `Memory: ${used}MB`;
    }
}

function updateFilterStatus() {
    if (!filteredData) return;
    
    const filters = filteredData.filters_applied;
    const activeFilters = [];
    
    if (filters.entry_range[0] > 1 || filters.entry_range[1] < currentData.total_entries) {
        activeFilters.push('Range');
    }
    if (filters.sequence_grouping) activeFilters.push('Sequence');
    if (filters.reapr_analysis) activeFilters.push('REAPr');
    if (filters.combine_edges) activeFilters.push('Combined');
    
    const filterText = activeFilters.length > 0 ? activeFilters.join(', ') : 'None';
    document.getElementById('filter-text').textContent = `Filters: ${filterText}`;
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Auto-update memory usage every 5 seconds
setInterval(updateMemoryUsage, 5000);