/**
 * Graph Data Loader
 * Handles loading and managing graph metadata and data
 */

import { CONFIG } from '../config.js';
import notificationSystem from './notifications.js';

class GraphLoader {
    constructor() {
        this.graphMetadata = {};
        this.currentGraph = null;
        this.currentData = null;
    }

    /**
     * Load metadata index for all graphs
     * @returns {Promise<Object>} Graph metadata object
     */
    async loadMetadataIndex() {
        try {
            notificationSystem.showInfo('Loading graph metadata...');
            
            const response = await fetch(`${CONFIG.apiBaseUrl}/metadata_index.json`);
            if (!response.ok) {
                throw new Error(`Failed to load metadata index: ${response.status}`);
            }
            
            this.graphMetadata = await response.json();
            console.log('Loaded metadata for', Object.keys(this.graphMetadata).length, 'graphs');
            
            notificationSystem.showSuccess(`Loaded metadata for ${Object.keys(this.graphMetadata).length} graphs`);
            return this.graphMetadata;
            
        } catch (error) {
            console.error('Error loading metadata:', error);
            notificationSystem.showError(`Failed to load metadata: ${error.message}`);
            
            // Fallback to empty metadata for demo
            this.graphMetadata = {};
            throw error;
        }
    }

    /**
     * Load specific graph data
     * @param {string} graphId - Graph identifier
     * @returns {Promise<Object>} Graph data object
     */
    async loadGraph(graphId) {
        const startTime = performance.now();
        
        try {
            notificationSystem.showLoading(true);
            notificationSystem.updateStatus(`Loading graph: ${graphId}...`);
            
            const response = await fetch(`${CONFIG.apiBaseUrl}/${graphId}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load graph data: ${response.status}`);
            }
            
            this.currentData = await response.json();
            this.currentGraph = graphId;
            
            console.log('Loaded graph data:', {
                nodes: this.currentData.nodes.length,
                edges: this.currentData.edges.length,
                sequences: Object.keys(this.currentData.sequence_groups).length,
                malicious: this.currentData.malicious_specs.length
            });
            
            const loadTime = performance.now() - startTime;
            notificationSystem.updateStatus(`Graph loaded successfully`);
            notificationSystem.updatePerformance(`${Math.round(loadTime)}ms`);
            notificationSystem.showSuccess(`Graph ${graphId} loaded successfully!`);
            
            return this.currentData;
            
        } catch (error) {
            console.error('Error loading graph:', error);
            notificationSystem.updateStatus(`Error loading graph: ${error.message}`);
            notificationSystem.showError(`Failed to load graph: ${error.message}`);
            
            // For demo purposes, create mock data if file doesn't exist
            if (error.message.includes('404') || error.message.includes('Failed to fetch')) {
                return this.createMockData(graphId);
            }
            
            throw error;
            
        } finally {
            notificationSystem.showLoading(false);
        }
    }

    /**
     * Create mock visualization data for demo purposes
     * @param {string} graphId - Graph identifier
     * @returns {Object} Mock graph data
     */
    createMockData(graphId) {
        console.log('Creating mock visualization for:', graphId);
        
        const mockData = {
            graph_id: graphId,
            nodes: [
                {
                    id: 'proc1', 
                    label: 'powershell.exe', 
                    type: 'Process', 
                    title: 'Process: powershell.exe'
                },
                {
                    id: 'file1', 
                    label: 'config.txt', 
                    type: 'File', 
                    title: 'File: config.txt'
                },
                {
                    id: 'reg1', 
                    label: 'HKLM\\Software\\Test', 
                    type: 'Registry', 
                    title: 'Registry: HKLM\\Software\\Test'
                },
                {
                    id: 'net1', 
                    label: '192.168.1.100', 
                    type: 'Network', 
                    title: 'Network: 192.168.1.100'
                }
            ],
            edges: [
                {
                    src: 'proc1', 
                    dst: 'file1', 
                    operation: 'CreateFile', 
                    timestamp: Date.now() / 1000, 
                    entry_index: 1
                },
                {
                    src: 'proc1', 
                    dst: 'reg1', 
                    operation: 'RegSetValue', 
                    timestamp: Date.now() / 1000 + 1, 
                    entry_index: 2
                },
                {
                    src: 'proc1', 
                    dst: 'net1', 
                    operation: 'TCP Connect', 
                    timestamp: Date.now() / 1000 + 2, 
                    entry_index: 3
                }
            ],
            sequence_groups: {},
            malicious_specs: [],
            total_entries: 3
        };
        
        this.currentData = mockData;
        this.currentGraph = graphId;
        
        notificationSystem.updateStatus(`Mock graph loaded for: ${graphId}`);
        notificationSystem.showWarning('Demo mode: Mock graph loaded');
        
        return mockData;
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
     * @returns {string|null} Current graph ID or null
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
        const targetId = graphId || this.currentGraph;
        const metadata = this.getGraphMetadata(targetId);
        
        if (!metadata) return null;
        
        return {
            nodes: metadata.stats.nodes,
            edges: metadata.stats.edges,
            entries: metadata.stats.entry_range[1],
            timeRange: metadata.stats.time_range,
            operations: metadata.stats.operations,
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
        
        const requiredFields = ['graph_id', 'nodes', 'edges', 'total_entries'];
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
            totalGraphs: Object.keys(this.graphMetadata).length,
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