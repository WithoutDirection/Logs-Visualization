/**
 * Visualization Module
 * Handles all vis.js network visualization logic
 */

import { CONFIG } from '../config.js';
import DOMHelper from './dom-helper.js';
import notificationSystem from './notifications.js';

class Visualization {
    constructor() {
        this.network = null;
        this.selectedNodes = new Set();
        this.registryPathMapping = {};
    }

    /**
     * Create or update network visualization
     * @param {Object} data - Filtered graph data
     */
    createNetworkVisualization(data) {
        if (!data) return;

        const container = DOMHelper.getElementById('graph-container');
        if (!container) return;

        const startTime = performance.now();

        // Analyze and optimize registry paths if enabled
        const registryOptimizationEnabled = DOMHelper.isChecked('optimize-registry-paths');
        if (registryOptimizationEnabled) {
            this.registryPathMapping = this.analyzeRegistryPaths(data.nodes);
        } else {
            this.registryPathMapping = {};
        }

        // Prepare nodes for vis.js
        const visNodes = data.nodes.map(node => {
            let displayLabel = node.label;
            
            if (registryOptimizationEnabled && node.type === 'Registry' && this.registryPathMapping[node.id]) {
                const pathInfo = this.registryPathMapping[node.id];
                displayLabel = this.selectedNodes.has(node.id) ? pathInfo.original : pathInfo.shortened;
            }
            
            return {
                id: node.id,
                label: displayLabel,
                title: node.title,
                group: node.type.toLowerCase(),
                color: this.getNodeColor(node),
                size: this.getNodeSize(node),
                originalLabel: node.label
            };
        });

        // Prepare edges for vis.js
        const visEdges = data.edges.map((edge, index) => {
            let label = '';
            if (DOMHelper.isChecked('show-edge-labels')) {
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
                title: this.createEdgeTooltip(edge),
                color: this.getEdgeColor(edge, data),
                width: this.getEdgeWidth(edge),
                arrows: 'to'
            };
        });

        const visData = {
            nodes: new vis.DataSet(visNodes),
            edges: new vis.DataSet(visEdges)
        };

        const options = this.getVisualizationOptions();

        // Create or update network
        if (this.network) {
            this.network.setData(visData);
            this.network.setOptions(options);
        } else {
            this.network = new vis.Network(container, visData, options);
            this.setupNetworkEventListeners(data);
        }

        const updateTime = performance.now() - startTime;
        notificationSystem.updatePerformance(`${Math.round(updateTime)}ms`);
    }

    /**
     * Get visualization options for vis.js
     * @returns {Object} Vis.js options
     */
    getVisualizationOptions() {
        return {
            groups: {
                process: {color: {background: CONFIG.nodeColors.Process, border: '#6B8E6B'}, shape: 'box'},
                file: {color: {background: CONFIG.nodeColors.File, border: '#B8860B'}, shape: 'ellipse'},
                registry: {color: {background: CONFIG.nodeColors.Registry, border: '#4682B4'}, shape: 'diamond'},
                network: {color: {background: CONFIG.nodeColors.Network, border: '#DAA520'}, shape: 'triangle'}
            },
            physics: {
                enabled: DOMHelper.isChecked('enable-physics'),
                stabilization: {
                    enabled: true,
                    iterations: 100
                },
                ...CONFIG.visualization.physics
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                hoverConnectedEdges: true,
                selectConnectedEdges: false,
                multiselect: true,
                keyboard: {
                    enabled: true,
                    speed: {x: 10, y: 10, zoom: 0.02},
                    bindToWindow: false
                }
            },
            nodes: CONFIG.visualization.nodes,
            edges: CONFIG.visualization.edges
        };
    }

    /**
     * Setup network event listeners
     * @param {Object} data - Graph data for reference
     */
    setupNetworkEventListeners(data) {
        if (!this.network) return;

        // Stabilization complete
        this.network.on("stabilizationIterationsDone", () => {
            if (DOMHelper.isChecked('enable-physics')) {
                setTimeout(() => {
                    this.network.setOptions({physics: {enabled: false}});
                }, CONFIG.physicsStabilizationTime);
            }
            notificationSystem.updateStatus('Graph layout stabilized');
            notificationSystem.showSuccess('Graph layout complete!');
        });

        // Click events
        this.network.on("click", (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = data.nodes.find(n => n.id === nodeId);
                if (node) {
                    this.showNodeDetails(node);
                }
            } else if (params.edges.length > 0) {
                const edgeId = params.edges[0];
                const edge = data.edges.find(e => e.id === edgeId || `${e.src}-${e.dst}-${data.edges.indexOf(e)}` === edgeId);
                if (edge) {
                    this.showEdgeDetails(edge);
                }
            } else {
                this.hideDetailsPanel();
            }
        });

        // Selection events for registry optimization
        this.network.on("selectNode", (params) => {
            params.nodes.forEach(nodeId => this.selectedNodes.add(nodeId));
            this.updateRegistryNodeLabels();
        });

        this.network.on("deselectNode", (params) => {
            if (params.previousSelection && params.previousSelection.nodes) {
                params.previousSelection.nodes.forEach(nodeId => this.selectedNodes.delete(nodeId));
                this.updateRegistryNodeLabels();
            }
        });

        this.network.on("select", (params) => {
            this.selectedNodes.clear();
            if (params.nodes) {
                params.nodes.forEach(nodeId => this.selectedNodes.add(nodeId));
            }
            this.updateRegistryNodeLabels();
        });

        // Drag events
        this.network.on("dragStart", (params) => {
            if (params.nodes.length > 0) {
                const container = DOMHelper.getElementById('graph-container');
                if (container) container.style.cursor = 'grabbing';
                notificationSystem.showInfo(`Dragging ${params.nodes.length} node(s)`);
            }
        });

        this.network.on("dragEnd", (params) => {
            const container = DOMHelper.getElementById('graph-container');
            if (container) container.style.cursor = 'default';
            
            if (params.nodes.length > 0) {
                const positions = this.network.getPositions(params.nodes);
                const updates = params.nodes.map(nodeId => {
                    const pos = positions[nodeId];
                    return {
                        id: nodeId,
                        fixed: true,
                        x: pos.x,
                        y: pos.y
                    };
                });
                
                try {
                    this.network.body.data.nodes.update(updates);
                    notificationSystem.showSuccess(`Fixed ${params.nodes.length} node(s) at new position`);
                } catch (error) {
                    console.error('Error fixing nodes:', error);
                    notificationSystem.showError('Error fixing node positions');
                }
            }
        });

        // Hover events
        this.network.on("hoverNode", (params) => {
            const container = DOMHelper.getElementById('graph-container');
            if (container) container.style.cursor = 'grab';
        });

        this.network.on("blurNode", () => {
            const container = DOMHelper.getElementById('graph-container');
            if (container) container.style.cursor = 'default';
        });

        // Double-click to focus
        this.network.on("doubleClick", (params) => {
            if (params.nodes.length > 0) {
                this.focusOnNode(params.nodes[0]);
            }
        });

        // Context menu
        this.network.on("oncontext", (params) => {
            params.event.preventDefault();
            if (params.nodes.length > 0) {
                this.showNodeContextMenu(params.nodes[0], params.pointer.DOM);
            }
        });
    }

    /**
     * Get node color based on type and features
     * @param {Object} node - Node object
     * @returns {string} Color value
     */
    getNodeColor(node) {
        // TODO: Add REAPr coloring when enabled
        if (DOMHelper.isChecked('reapr-analysis')) {
            // Implement REAPr-based coloring
        }
        
        return CONFIG.nodeColors[node.type] || CONFIG.nodeColors.default;
    }

    /**
     * Get node size based on type
     * @param {Object} node - Node object
     * @returns {number} Size value
     */
    getNodeSize(node) {
        return node.type === 'Process' ? CONFIG.visualization.nodes.processSize : CONFIG.visualization.nodes.defaultSize;
    }

    /**
     * Get edge color based on sequence grouping
     * @param {Object} edge - Edge object
     * @param {Object} data - Full data object for sequence groups
     * @returns {string} Color value
     */
    getEdgeColor(edge, data) {
        if (DOMHelper.isChecked('sequence-grouping')) {
            if (edge.sequence_color) {
                return edge.sequence_color;
            }
            
            if (data && data.sequence_groups) {
                for (const [groupId, group] of Object.entries(data.sequence_groups)) {
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
     * Get edge width based on combination status
     * @param {Object} edge - Edge object
     * @returns {number} Width value
     */
    getEdgeWidth(edge) {
        if (edge.is_combined && edge.combined_count > 1) {
            return Math.min(2 + edge.combined_count, 8);
        }
        return CONFIG.visualization.edges.defaultWidth;
    }

    /**
     * Create tooltip text for edges
     * @param {Object} edge - Edge object
     * @returns {string} Tooltip HTML
     */
    createEdgeTooltip(edge) {
        if (edge.is_combined && edge.combined_count > 1) {
            const timeRange = edge.timestamp_min !== edge.timestamp_max 
                ? `${new Date(edge.timestamp_min * 1000).toLocaleString()} - ${new Date(edge.timestamp_max * 1000).toLocaleString()}`
                : new Date(edge.timestamp_min * 1000).toLocaleString();
            
            return `Operation: ${edge.operation} (Combined)\\n` +
                   `Count: ${edge.combined_count} operations\\n` +
                   `Time Range: ${timeRange}\\n` +
                   `Entry Indices: ${edge.entry_indices.join(', ')}\\n` +
                   `Line IDs: ${edge.line_ids.filter(id => id).join(', ')}`;
        } else {
            return `Operation: ${edge.operation}\\nEntry: ${edge.entry_index}\\nTimestamp: ${new Date(edge.timestamp * 1000).toLocaleString()}`;
        }
    }

    /**
     * Analyze registry paths for optimization
     * @param {Array} nodes - Array of nodes
     * @returns {Object} Path mapping
     */
    analyzeRegistryPaths(nodes) {
        const registryNodes = nodes.filter(node => node.type === 'Registry');
        const pathMapping = {};
        
        if (registryNodes.length < 2) {
            registryNodes.forEach(node => {
                pathMapping[node.id] = {
                    original: node.label,
                    shortened: node.label,
                    needsOptimization: false
                };
            });
            return pathMapping;
        }
        
        // Group by root key and find common prefixes
        const rootGroups = {};
        registryNodes.forEach(node => {
            const parts = node.label.split('\\');
            const rootKey = parts[0];
            if (!rootGroups[rootKey]) {
                rootGroups[rootKey] = [];
            }
            rootGroups[rootKey].push({
                id: node.id,
                label: node.label,
                parts: parts
            });
        });
        
        Object.keys(rootGroups).forEach(rootKey => {
            const group = rootGroups[rootKey];
            if (group.length < 2) {
                group.forEach(node => {
                    pathMapping[node.id] = {
                        original: node.label,
                        shortened: node.label,
                        needsOptimization: false
                    };
                });
                return;
            }
            
            const commonPrefixes = this.findCommonPrefixes(group);
            
            group.forEach(node => {
                const shortened = this.createShortenedLabel(node, commonPrefixes);
                pathMapping[node.id] = {
                    original: node.label,
                    shortened: shortened,
                    needsOptimization: shortened !== node.label
                };
            });
        });
        
        return pathMapping;
    }

    /**
     * Find common prefixes in registry paths
     * @param {Array} group - Group of registry nodes
     * @returns {Array} Common prefixes
     */
    findCommonPrefixes(group) {
        const prefixMap = new Map();
        
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const path1 = group[i].parts;
                const path2 = group[j].parts;
                
                let commonLength = 0;
                const minLength = Math.min(path1.length, path2.length);
                
                for (let k = 0; k < minLength - 1; k++) {
                    if (path1[k] === path2[k]) {
                        commonLength = k + 1;
                    } else {
                        break;
                    }
                }
                
                if (commonLength >= 2) {
                    const prefixKey = path1.slice(0, commonLength).join('\\');
                    if (!prefixMap.has(prefixKey)) {
                        prefixMap.set(prefixKey, new Set());
                    }
                    prefixMap.get(prefixKey).add(group[i].id);
                    prefixMap.get(prefixKey).add(group[j].id);
                }
            }
        }
        
        return Array.from(prefixMap.entries())
            .map(([prefix, nodeIds]) => ({
                prefix,
                nodeIds: Array.from(nodeIds),
                length: prefix.split('\\').length
            }))
            .sort((a, b) => b.length - a.length);
    }

    /**
     * Create shortened label for registry node
     * @param {Object} node - Registry node
     * @param {Array} prefixes - Common prefixes
     * @returns {string} Shortened label
     */
    createShortenedLabel(node, prefixes) {
        const originalPath = node.label;
        const parts = node.parts;
        
        for (const prefixInfo of prefixes) {
            if (prefixInfo.nodeIds.includes(node.id) && prefixInfo.nodeIds.length >= 2) {
                const prefixParts = prefixInfo.prefix.split('\\');
                
                if (parts.length > prefixParts.length + 1) {
                    const rootPart = parts[0];
                    const remainingParts = parts.slice(prefixParts.length);
                    return `${rootPart}\\~\\${remainingParts.join('\\')}`;
                }
            }
        }
        
        return originalPath;
    }

    /**
     * Update registry node labels based on selection
     */
    updateRegistryNodeLabels() {
        if (!this.network) return;
        
        const registryOptimizationEnabled = DOMHelper.isChecked('optimize-registry-paths');
        const nodesToUpdate = [];
        
        if (registryOptimizationEnabled && this.registryPathMapping) {
            Object.keys(this.registryPathMapping).forEach(nodeId => {
                const pathInfo = this.registryPathMapping[nodeId];
                const isSelected = this.selectedNodes.has(nodeId);
                const currentLabel = isSelected ? pathInfo.original : pathInfo.shortened;
                
                const currentNode = this.network.body.data.nodes.get(nodeId);
                if (currentNode && currentNode.label !== currentLabel) {
                    nodesToUpdate.push({
                        id: nodeId,
                        label: currentLabel
                    });
                }
            });
        }
        
        if (nodesToUpdate.length > 0) {
            this.network.body.data.nodes.update(nodesToUpdate);
        }
    }

    /**
     * Show node details in side panel
     * @param {Object} node - Node object
     */
    showNodeDetails(node) {
        // Implementation will be similar to original but using DOMHelper
        console.log('Show node details:', node);
        // This would show details in the right panel
    }

    /**
     * Show edge details in side panel
     * @param {Object} edge - Edge object
     */
    showEdgeDetails(edge) {
        console.log('Show edge details:', edge);
        // This would show details in the right panel
    }

    /**
     * Hide details panel
     */
    hideDetailsPanel() {
        const container = document.querySelector('.container');
        if (container) {
            container.classList.remove('details-open');
        }
    }

    /**
     * Focus on specific node
     * @param {string} nodeId - Node ID
     */
    focusOnNode(nodeId) {
        if (!this.network) return;
        
        const options = {
            scale: 1.5,
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        };
        
        this.network.focus(nodeId, options);
        notificationSystem.showSuccess(`Focused on node: ${nodeId}`);
    }

    /**
     * Show context menu for node
     * @param {string} nodeId - Node ID
     * @param {Object} position - Mouse position
     */
    showNodeContextMenu(nodeId, position) {
        console.log('Show context menu for node:', nodeId, 'at position:', position);
        // Implementation would create context menu
    }

    /**
     * Get current network instance
     * @returns {Object|null} Network instance
     */
    getNetwork() {
        return this.network;
    }

    /**
     * Destroy network instance
     */
    destroy() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        this.selectedNodes.clear();
        this.registryPathMapping = {};
    }
}

export default Visualization;