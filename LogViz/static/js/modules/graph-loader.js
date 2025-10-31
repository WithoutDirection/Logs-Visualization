/**
 * Graph Data Loader - Django API Version
 * Handles loading and managing graph data from Django REST API
 */

import { CONFIG } from '../config.js?v=11';
import notificationSystem from './notifications.js?v=11';

class GraphLoader {
    constructor() {
        this.datasets = [];
        this.graphMetadata = {};  // Keep for compatibility
        this.currentGraph = null;
        this.currentData = null;
    }

    /**
     * Fetch all paginated results from a DRF endpoint.
     * Supports both paginated (results/next) and non-paginated arrays.
     * @param {string} url - Initial URL to fetch
     * @returns {Promise<Array>} Aggregated results
     */
    async fetchAllResults(url) {
        const all = [];
        let nextUrl = url;
        while (nextUrl) {
            const resp = await fetch(nextUrl);
            if (!resp.ok) {
                throw new Error(`Failed to fetch: ${resp.status} ${nextUrl}`);
            }
            const data = await resp.json();
            if (Array.isArray(data)) {
                all.push(...data);
                nextUrl = null;
            } else {
                const results = data.results || [];
                all.push(...results);
                nextUrl = data.next || null;
            }
        }
        return all;
    }

    /**
     * Load available datasets from Django API
     * @returns {Promise<Array>} List of datasets
     */
    async loadDatasets() {
        try {
            notificationSystem.showInfo('Loading available datasets...');
            
            const response = await fetch(`${CONFIG.apiBaseUrl}/datasets/`);
            if (!response.ok) {
                throw new Error(`Failed to load datasets: ${response.status}`);
            }
            
            const data = await response.json();
            this.datasets = data.results || data;
            
            // Build metadata index for compatibility with placeholder data
            this.graphMetadata = {};
            this.datasets.forEach(dataset => {
                this.graphMetadata[dataset.id] = {
                    name: dataset.name,
                    description: dataset.description || '',
                    created_at: dataset.created_at,
                    status: dataset.status,
                    stats: {
                        nodes: 0,
                        edges: 0,
                        entry_range: [1, 100],
                        time_range: [0, 0]
                    },
                    available_features: {
                        reapr_analysis: false,
                        sequence_patterns: [],
                        node_types: []
                    }
                };
            });
            
            console.log('Loaded', this.datasets.length, 'datasets');
            notificationSystem.showSuccess(`Found ${this.datasets.length} datasets`);
            
            return this.datasets;
            
        } catch (error) {
            console.error('Error loading datasets:', error);
            notificationSystem.showError(`Failed to load datasets: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load metadata index for all graphs (legacy compatibility)
     * @returns {Promise<Object>} Graph metadata object
     */
    async loadMetadataIndex() {
        await this.loadDatasets();
        return this.graphMetadata;
    }

    /**
     * Load graph data for a specific dataset with entry range
     * @param {number|string} datasetId - Dataset ID or graph ID
     * @param {number} fromEntry - Starting entry index
     * @param {number} toEntry - Ending entry index
     * @returns {Promise<Object>} Graph data object
     */
    async loadGraph(datasetId, fromEntry = 1, toEntry = 100) {
        const startTime = performance.now();
        
        try {
            notificationSystem.showLoading(true);
            notificationSystem.updateStatus(`Loading graph data (entries ${fromEntry}-${toEntry})...`);
            
            // Find the graph ID for this dataset
            const graphResponse = await fetch(`${CONFIG.apiBaseUrl}/datasets/${datasetId}/graphs/`);
            if (!graphResponse.ok) {
                throw new Error(`Failed to load graph info: ${graphResponse.status}`);
            }
            const graphs = await graphResponse.json();
            const graphObj = graphs.results?.[0] || graphs[0];
            const graphId = graphObj?.id;
            
            if (!graphId) {
                throw new Error('No graph found for this dataset');
            }
            
            // Load nodes and edges with pagination support
            const nodesUrl = `${CONFIG.apiBaseUrl}/nodes/?graph=${graphId}&from_entry=${fromEntry}&to_entry=${toEntry}`;
            const edgesUrl = `${CONFIG.apiBaseUrl}/edges/?graph=${graphId}&from_entry=${fromEntry}&to_entry=${toEntry}`;

            const [nodesList, edgesList] = await Promise.all([
                this.fetchAllResults(nodesUrl),
                this.fetchAllResults(edgesUrl)
            ]);

            let reaprAnnotations = [];
            try {
                reaprAnnotations = await this.loadReaprAnnotations(graphId);
            } catch (reaprError) {
                console.warn('Unable to load REAPr annotations:', reaprError);
            }

            const mappedNodes = this.mapNodes(nodesList);
            const mappedEdges = this.mapEdges(edgesList);
            this.applyReaprAnnotations(mappedNodes, mappedEdges, reaprAnnotations);
            
            // Map Django data to expected format
            const totalEntriesFromGraph = Number(graphObj?.entry_count);
            const hasValidTotalEntries = Number.isFinite(totalEntriesFromGraph) && totalEntriesFromGraph > 0;

            this.currentData = {
                graph_id: graphId,
                dataset_id: datasetId,
                nodes: mappedNodes,
                edges: mappedEdges,
                sequence_groups: {},  // Will be loaded separately if needed
                malicious_specs: [],  // REAPr annotations will be loaded separately
                reapr_annotations: reaprAnnotations,
                // Use full entry count from graph metadata if available; fallback to requested window size
                total_entries: hasValidTotalEntries
                    ? totalEntriesFromGraph
                    : (toEntry - fromEntry + 1),
                stats: {
                    node_count: nodesList.length,
                    edge_count: edgesList.length,
                    entry_range: { from: fromEntry, to: toEntry },
                    reapr_annotations: reaprAnnotations.length
                }
            };
            
            this.currentGraph = graphId;

            if (hasValidTotalEntries) {
                const cachedMeta = this.graphMetadata[datasetId] || {};
                this.graphMetadata[datasetId] = {
                    ...cachedMeta,
                    stats: {
                        ...(cachedMeta.stats || {}),
                        nodes: graphObj?.node_count ?? cachedMeta.stats?.nodes ?? nodesList.length,
                        edges: graphObj?.edge_count ?? cachedMeta.stats?.edges ?? edgesList.length,
                        entry_range: [1, totalEntriesFromGraph]
                    }
                };

                if (reaprAnnotations.length > 0) {
                    this.graphMetadata[datasetId].available_features = {
                        ...(cachedMeta.available_features || {}),
                        reapr_analysis: true
                    };
                }
            }
            
            console.log('Loaded graph data:', {
                nodes: this.currentData.nodes.length,
                edges: this.currentData.edges.length,
                entry_range: `${fromEntry}-${toEntry}`
            });
            
            const loadTime = performance.now() - startTime;
            notificationSystem.updateStatus(`Graph loaded successfully`);
            notificationSystem.updatePerformance(`${Math.round(loadTime)}ms`);
            notificationSystem.showSuccess(`Loaded ${this.currentData.nodes.length} nodes and ${this.currentData.edges.length} edges`);
            
            return this.currentData;
            
        } catch (error) {
            console.error('Error loading graph:', error);
            notificationSystem.updateStatus(`Error loading graph: ${error.message}`);
            notificationSystem.showError(`Failed to load graph: ${error.message}`);
            throw error;
            
        } finally {
            notificationSystem.showLoading(false);
        }
    }

    /**
     * Map Django node format to visualization format
     * @param {Array} nodes - Django nodes
     * @returns {Array} Mapped nodes
     */
    mapNodes(nodes) {
        return nodes.map(node => ({
            id: node.id.toString(),
            label: node.name || `Node ${node.id}`,
            type: node.type || 'Unknown',
            pid: node.pid,
            resource_key: node.resource_key,
            title: this.createNodeTitle(node),
            ...node.attributes  // Spread any additional attributes
        }));
    }

    /**
     * Map Django edge format to visualization format
     * @param {Array} edges - Django edges
     * @returns {Array} Mapped edges
     */
    mapEdges(edges) {
        return edges.map((edge, index) => {
            // Handle both src/dst as IDs or as node_id strings
            const srcId = edge.src ? edge.src.toString() : (edge.src_id ? edge.src_id.toString() : `unknown_src_${index}`);
            const dstId = edge.dst ? edge.dst.toString() : (edge.dst_id ? edge.dst_id.toString() : `unknown_dst_${index}`);
            // Normalize entry index if backend uses a different field name
            const rawEntry = edge.entry_index ?? edge.entry ?? edge.entryId ?? (edge.metadata ? (edge.metadata.entry_index ?? edge.metadata.entry ?? edge.metadata.entryId) : undefined);
            const entryIndex = typeof rawEntry === 'number' ? rawEntry : parseInt(rawEntry);
            const normalizedEntryIndex = Number.isFinite(entryIndex) ? entryIndex : undefined;
            // Normalize timestamp
            const ts = typeof edge.timestamp === 'number' ? edge.timestamp : parseInt(edge.timestamp);
            const normalizedTimestamp = Number.isFinite(ts) ? ts : undefined;
            
            return {
                id: edge.id ? edge.id.toString() : `edge_${index}`,
                from: srcId,
                to: dstId,
                src: srcId,  // Keep both formats for compatibility
                dst: dstId,
                operation: edge.operation || 'Unknown',
                timestamp: normalizedTimestamp,
                entry_index: normalizedEntryIndex,
                line_id: edge.line_id,
                metadata: edge.metadata || {},
                title: this.createEdgeTitle(edge)
            };
        });
    }

    /**
     * Attach REAPr annotations to mapped nodes and edges.
     * @param {Array} nodes - Mapped node objects
     * @param {Array} edges - Mapped edge objects
     * @param {Array} annotations - Raw REAPr annotations
     */
    applyReaprAnnotations(nodes, edges, annotations) {
        const nodeMap = new Map();
        const edgeMap = new Map();

        annotations.forEach(annotation => {
            const nodeId = annotation.node ? annotation.node.toString() : null;
            const edgeId = annotation.edge ? annotation.edge.toString() : null;

            if (nodeId) {
                if (!nodeMap.has(nodeId)) {
                    nodeMap.set(nodeId, []);
                }
                nodeMap.get(nodeId).push(annotation);
            }

            if (edgeId) {
                if (!edgeMap.has(edgeId)) {
                    edgeMap.set(edgeId, []);
                }
                edgeMap.get(edgeId).push(annotation);
            }
        });

        nodes.forEach(node => {
            const annotationsForNode = nodeMap.get(node.id) || [];
            node.reapr_annotations = annotationsForNode;
            node.has_reapr_annotation = annotationsForNode.length > 0;
        });

        edges.forEach(edge => {
            const annotationsForEdge = edgeMap.get(edge.id) || [];
            edge.reapr_annotations = annotationsForEdge;
            edge.has_reapr_annotation = annotationsForEdge.length > 0;
            edge.is_reapr_attack_path = annotationsForEdge.some(a => a.is_attack_path);
        });
    }

    /**
     * Clear all REAPr annotations for the current or specified graph.
     * @param {number|string|null} graphId Optional graph id; defaults to current
     * @returns {Promise<{deleted:number, graph:number}>}
     */
    async clearReaprAnnotations(graphId = null) {
        const targetGraphId = graphId || this.currentGraph;
        if (!targetGraphId) return { deleted: 0, graph: null };

        const url = `${CONFIG.apiBaseUrl}/reapr/clear/`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph: targetGraphId })
        });
        if (!resp.ok) {
            throw new Error(`Failed to clear REAPr annotations (HTTP ${resp.status})`);
        }
        const payload = await resp.json();

        // Update local state to reflect cleared annotations
        if (this.currentData) {
            this.currentData.reapr_annotations = [];
            this.applyReaprAnnotations(this.currentData.nodes, this.currentData.edges, []);

            // Update feature availability cache
            const datasetId = this.currentData.dataset_id;
            if (datasetId && this.graphMetadata[datasetId]) {
                const meta = this.graphMetadata[datasetId];
                meta.available_features = {
                    ...(meta.available_features || {}),
                    reapr_analysis: false,
                    has_reapr_annotations: false
                };
            }
            if (this.currentData.stats) {
                this.currentData.stats.reapr_annotations = 0;
            }
        }

        return payload;
    }

    /**
     * Compute REAPr labels on the backend for the given graph and refresh local annotations.
     * @param {number|string|null} graphId Optional graph id; defaults to current
     * @returns {Promise<Object>} Summary payload from API
     */
    async computeReaprLabels(graphId = null) {
        const targetGraphId = graphId || this.currentGraph;
        if (!targetGraphId) return { created: 0, graph: null };

        const url = `${CONFIG.apiBaseUrl}/reapr/compute/`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph: targetGraphId })
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            let msg = `Failed to compute REAPr labels (HTTP ${resp.status})`;
            try { const data = JSON.parse(text); if (data?.error) msg = data.error; } catch {}
            throw new Error(msg);
        }
        const payload = await resp.json();

        // Reload annotations and apply to in-memory data
        if (this.currentData) {
            const annotations = await this.loadReaprAnnotations(targetGraphId);
            this.currentData.reapr_annotations = annotations;
            this.applyReaprAnnotations(this.currentData.nodes, this.currentData.edges, annotations);

            // Update metadata feature availability
            const datasetId = this.currentData.dataset_id;
            if (datasetId) {
                const meta = this.graphMetadata[datasetId] || {};
                meta.available_features = {
                    ...(meta.available_features || {}),
                    reapr_analysis: true,
                    has_reapr_annotations: (annotations?.length || 0) > 0
                };
                this.graphMetadata[datasetId] = meta;
            }
            if (this.currentData.stats) {
                this.currentData.stats.reapr_annotations = annotations.length;
            }
        }

        return payload;
    }

    /**
     * Add or update a REAPr annotation for an edge via API and merge into current data.
     * @param {number|string} edgeId - Edge identifier
     * @param {'source'|'destination'} role - Annotation role
     * @returns {Promise<Array>} Updated annotations returned by API
     */
    async addReaprAnnotationForEdge(edgeId, role) {
        const url = `${CONFIG.apiBaseUrl}/edges/${edgeId}/reapr-tag/`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role })
        });

        if (!response.ok) {
            throw new Error(`REAPr update failed (${response.status})`);
        }

        const payload = await response.json();
        const annotations = payload.annotations || [];

        if (!this.currentData) {
            return annotations;
        }

        // Merge annotations into current dataset
        const existing = this.currentData.reapr_annotations || [];
        const byId = new Map(existing.map(a => [a.id, a]));
        annotations.forEach(annotation => {
            if (annotation.id) {
                byId.set(annotation.id, annotation);
            }
        });

        this.currentData.reapr_annotations = Array.from(byId.values());

        // Reapply annotations to nodes and edges
        this.applyReaprAnnotations(this.currentData.nodes, this.currentData.edges, this.currentData.reapr_annotations);

        // Ensure metadata reflects REAPr availability
        const datasetId = this.currentData.dataset_id;
        if (datasetId) {
            const existingMeta = this.graphMetadata[datasetId] || {};
            this.graphMetadata[datasetId] = {
                ...existingMeta,
                available_features: {
                    ...(existingMeta.available_features || {}),
                    reapr_analysis: true
                }
            };
        }

        if (this.currentData.stats) {
            this.currentData.stats.reapr_annotations = this.currentData.reapr_annotations.length;
        }

        return annotations;
    }

    /**
     * Create node title for tooltip
     * @param {Object} node - Node data
     * @returns {string} Formatted title
     */
    createNodeTitle(node) {
        let title = `${node.type || 'Node'}: ${node.name || node.id}`;
        if (node.pid) {
            title += `\nPID: ${node.pid}`;
        }
        if (node.resource_key) {
            title += `\nResource: ${node.resource_key}`;
        }
        return title;
    }

    /**
     * Create edge title for tooltip
     * @param {Object} edge - Edge data
     * @returns {string} Formatted title
     */
    createEdgeTitle(edge) {
        let title = `Operation: ${edge.operation || 'Unknown'}`;
        if (edge.timestamp) {
            const date = new Date(edge.timestamp * 1000);
            title += `\nTime: ${date.toLocaleString()}`;
        }
        if (edge.entry_index) {
            title += `\nEntry: ${edge.entry_index}`;
        }
        return title;
    }

    /**
     * Load sequence groups for current graph
     * @param {number} graphId - Graph ID
     * @param {number} minConfidence - Minimum confidence threshold
     * @returns {Promise<Object>} Sequence groups
     */
    async loadSequenceGroups(graphId, minConfidence = 0.6) {
        try {
            const response = await fetch(
                `${CONFIG.apiBaseUrl}/sequences/?graph=${graphId}&min_confidence=${minConfidence}`
            );
            if (!response.ok) {
                console.warn('No sequences endpoint available');
                return {};
            }
            
            const data = await response.json();
            const sequences = data.results || data;
            
            // Convert to old format
            const sequenceGroups = {};
            sequences.forEach(seq => {
                sequenceGroups[seq.pattern_name] = {
                    pattern_name: seq.pattern_name,
                    confidence: seq.confidence,
                    edges: seq.edge_ids || [],
                    description: seq.description || ''
                };
            });
            
            return sequenceGroups;
            
        } catch (error) {
            console.error('Error loading sequences:', error);
            return {};
        }
    }

    /**
     * Load REAPr annotations for current graph
     * @param {number} graphId - Graph ID
     * @returns {Promise<Array>} REAPr annotations
     */
    async loadReaprAnnotations(graphId) {
        try {
            const response = await fetch(`${CONFIG.apiBaseUrl}/reapr/?graph=${graphId}`);
            if (!response.ok) {
                console.warn('No REAPr endpoint available');
                return [];
            }
            
            const data = await response.json();
            return data.results || data;
            
        } catch (error) {
            console.error('Error loading REAPr annotations:', error);
            return [];
        }
    }

    /**
     * Load graph info for a specific dataset (fetch from API)
     * @param {number|string} datasetId - Dataset ID
     * @returns {Promise<Object|null>} Graph metadata with full stats
     */
    async loadGraphInfo(datasetId) {
        try {
            const response = await fetch(`${CONFIG.apiBaseUrl}/datasets/${datasetId}/graphs/`);
            if (!response.ok) {
                console.warn(`No graph info for dataset ${datasetId}`);
                return null;
            }
            
            const data = await response.json();
            const graphs = data.results || data;
            
            if (!graphs || graphs.length === 0) {
                return null;
            }
            
            const graph = graphs[0];
            
            // Update the metadata cache with full graph info
            this.graphMetadata[datasetId] = {
                name: graph.dataset_name || this.graphMetadata[datasetId]?.name || `Dataset ${datasetId}`,
                description: this.graphMetadata[datasetId]?.description || '',
                created_at: graph.created_at,
                status: 'completed',
                graph_id: graph.id,
                stats: {
                    nodes: graph.node_count || 0,
                    edges: graph.edge_count || 0,
                    entry_range: [1, graph.entry_count || 100],
                    time_range: [graph.time_range_start || 0, graph.time_range_end || 0]
                },
                available_features: graph.available_features || {
                    reapr_analysis: false,
                    sequence_patterns: [],
                    node_types: []
                }
            };
            
            return this.graphMetadata[datasetId];
            
        } catch (error) {
            console.error('Error loading graph info:', error);
            return null;
        }
    }

    /**
     * Get metadata for a specific graph
     * @param {string} graphId - Graph identifier
     * @returns {Object|null} Graph metadata or null if not found
     */
    getGraphMetadata(graphId) {
        return this.graphMetadata[graphId] || null;
    }

    /**
     * Get all available graph IDs
     * @returns {Array<string>} Array of graph IDs
     */
    getAvailableGraphIds() {
        return Object.keys(this.graphMetadata);
    }

    /**
     * Get current loaded graph data
     * @returns {Object|null} Current graph data or null
     */
    getCurrentData() {
        return this.currentData;
    }

    /**
     * Get current graph ID
     * @returns {number|null} Current graph ID or null
     */
    getCurrentGraphId() {
        return this.currentGraph;
    }

    /**
     * Check if a graph is currently loaded
     * @returns {boolean} True if graph is loaded
     */
    hasLoadedGraph() {
        return this.currentData !== null && this.currentGraph !== null;
    }

    /**
     * Get graph statistics for display  
     * @param {string} graphId - Graph identifier (optional, uses current if not provided)
     * @returns {Object|null} Graph statistics or null
     */
    getGraphStats(graphId = null) {
        if (this.currentData && this.currentData.stats) {
            return {
                nodes: this.currentData.stats.node_count,
                edges: this.currentData.stats.edge_count,
                entries: this.currentData.total_entries,
                entry_range: this.currentData.stats.entry_range
            };
        }
        
        const targetId = graphId || this.currentGraph;
        const metadata = this.getGraphMetadata(targetId);
        
        if (!metadata) return null;
        
        return {
            nodes: metadata.stats?.nodes || 0,
            edges: metadata.stats?.edges || 0,
            entries: metadata.stats?.entry_range?.[1] || 0,
            timeRange: metadata.stats?.time_range,
            operations: metadata.stats?.operations,
            features: metadata.available_features
        };
    }

    /**
     * Validate graph data structure
     * @param {Object} data - Graph data to validate
     * @returns {boolean} True if valid
     */
    validateGraphData(data) {
        if (!data || typeof data !== 'object') return false;
        
        const requiredFields = ['nodes', 'edges'];
        const hasRequiredFields = requiredFields.every(field => data.hasOwnProperty(field));
        
        if (!hasRequiredFields) {
            console.warn('Graph data missing required fields:', requiredFields);
            return false;
        }
        
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
            console.warn('Graph nodes and edges must be arrays');
            return false;
        }
        
        return true;
    }

    /**
     * Clear current graph data
     */
    clearCurrentGraph() {
        this.currentData = null;
        this.currentGraph = null;
        notificationSystem.updateStatus('Graph cleared');
    }

    /**
     * Get loading statistics
     * @returns {Object} Loading statistics
     */
    getLoadingStats() {
        return {
            totalGraphs: this.datasets.length,
            currentGraph: this.currentGraph,
            hasData: this.hasLoadedGraph(),
            dataSize: this.currentData ? {
                nodes: this.currentData.nodes.length,
                edges: this.currentData.edges.length,
                sequences: Object.keys(this.currentData.sequence_groups || {}).length
            } : null
        };
    }
}

export default GraphLoader;