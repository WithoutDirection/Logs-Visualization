/**
 * Visualization Module
 * Handles all vis.js network visualization logic
 */

import { CONFIG } from '../config.js';
import DOMHelper from './dom-helper.js';
import notificationSystem from './notifications.js';
import { createRegistryPathMapping, getRegistryLabel } from './registry-paths.js';

class Visualization {
    constructor() {
        this.network = null;
        this.selectedNodes = new Set();
        this.registryPathMapping = {};
    }

    /**
     * Create or update network visualization with progressive loading for large datasets
     * @param {Object} data - Filtered graph data
     */
    async createNetworkVisualization(data) {
        if (!data) return;

        const container = DOMHelper.getElementById('graph-container');
        if (!container) return;

        const startTime = performance.now();
        const nodeCount = data.nodes.length;
        const edgeCount = data.edges.length;

        // Performance thresholds for progressive loading
        const LARGE_GRAPH_THRESHOLD = 500;
        const HUGE_GRAPH_THRESHOLD = 2000;

        // Show loading indicator for large graphs
        if (nodeCount > LARGE_GRAPH_THRESHOLD) {
            notificationSystem.showInfo(`Processing large graph (${nodeCount} nodes, ${edgeCount} edges)...`);
        }

        try {
            // Analyze and optimize registry paths if enabled
            const registryOptimizationEnabled = DOMHelper.isChecked('optimize-registry-paths');
            if (registryOptimizationEnabled) {
                this.registryPathMapping = createRegistryPathMapping(data.nodes);
            } else {
                this.registryPathMapping = {};
            }

            // Prepare nodes for vis.js with progressive processing
            const visNodes = await this.processNodesProgressively(data.nodes, registryOptimizationEnabled);

            // Prepare edges for vis.js with progressive processing
            const visEdges = await this.processEdgesProgressively(data.edges);

            const visData = {
                nodes: new vis.DataSet(visNodes),
                edges: new vis.DataSet(visEdges)
            };

            const options = this.getVisualizationOptions(nodeCount, edgeCount);

            // Create or update network
            if (this.network) {
                this.network.setData(visData);
                this.network.setOptions(options);
            } else {
                this.network = new vis.Network(container, visData, options);
                this.setupNetworkEventListeners(data);
            }

            // Performance monitoring
            const updateTime = performance.now() - startTime;
            this.updatePerformanceMetrics(updateTime, nodeCount, edgeCount);

            // Fit view for new graphs
            if (!this.network.initialized) {
                setTimeout(() => {
                    if (this.network) {
                        this.network.fit();
                        this.network.initialized = true;
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error creating network visualization:', error);
            notificationSystem.showError(`Failed to create visualization: ${error.message}`);
        }
    }

    /**
     * Process nodes progressively to avoid blocking UI
     * @param {Array} nodes - Raw node data
     * @param {boolean} registryOptimizationEnabled - Whether to optimize registry paths
     * @returns {Promise<Array>} Processed vis.js nodes
     */
    async processNodesProgressively(nodes, registryOptimizationEnabled) {
        const BATCH_SIZE = 100;

        if (nodes.length <= BATCH_SIZE) {
            return this.processNodeBatch(nodes, registryOptimizationEnabled);
        }

        const results = [];
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
            const batch = nodes.slice(i, i + BATCH_SIZE);
            const processedBatch = this.processNodeBatch(batch, registryOptimizationEnabled);
            results.push(...processedBatch);

            // Yield control to UI thread for large batches
            if (i % (BATCH_SIZE * 5) === 0 && i > 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return results;
    }

    /**
     * Process a batch of nodes
     * @param {Array} nodeBatch - Batch of raw node data
     * @param {boolean} registryOptimizationEnabled - Whether to optimize registry paths
     * @returns {Array} Processed vis.js nodes
     */
    processNodeBatch(nodeBatch, registryOptimizationEnabled) {
        return nodeBatch.map(node => {
            let displayLabel = node.label;

            if (registryOptimizationEnabled && node.type === 'Registry') {
                const label = getRegistryLabel(
                    node.id,
                    this.registryPathMapping,
                    this.selectedNodes.has(node.id)
                );
                if (label) {
                    displayLabel = label;
                }
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
    }

    /**
     * Process edges progressively to avoid blocking UI
     * @param {Array} edges - Raw edge data
     * @returns {Promise<Array>} Processed vis.js edges
     */
    async processEdgesProgressively(edges) {
        const BATCH_SIZE = 200;

        if (edges.length <= BATCH_SIZE) {
            return this.processEdgeBatch(edges);
        }

        const results = [];
        for (let i = 0; i < edges.length; i += BATCH_SIZE) {
            const batch = edges.slice(i, i + BATCH_SIZE);
            const processedBatch = this.processEdgeBatch(batch);
            results.push(...processedBatch);

            // Yield control to UI thread for large batches
            if (i % (BATCH_SIZE * 3) === 0 && i > 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return results;
    }

    /**
     * Process a batch of edges
     * @param {Array} edgeBatch - Batch of raw edge data
     * @returns {Array} Processed vis.js edges
     */
    processEdgeBatch(edgeBatch) {
        return edgeBatch.map((edge, index) => {
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
                color: this.getEdgeColor(edge),
                width: this.getEdgeWidth(edge),
                arrows: 'to'
            };
        });
    }

    /**
     * Update performance metrics and display them
     * @param {number} updateTime - Time taken to update visualization
     * @param {number} nodeCount - Number of nodes
     * @param {number} edgeCount - Number of edges
     */
    updatePerformanceMetrics(updateTime, nodeCount, edgeCount) {
        const memoryUsage = this.estimateMemoryUsage(nodeCount, edgeCount);
        notificationSystem.updatePerformance(`${Math.round(updateTime)}ms`);
        notificationSystem.updateMemoryUsage(memoryUsage);

        // Log performance warnings for large graphs
        if (updateTime > 2000) {
            console.warn(`Slow graph rendering: ${Math.round(updateTime)}ms for ${nodeCount} nodes, ${edgeCount} edges`);
        }
    }

    /**
     * Estimate memory usage based on graph size
     * @param {number} nodeCount - Number of nodes
     * @param {number} edgeCount - Number of edges
     * @returns {number} Estimated memory usage in MB
     */
    estimateMemoryUsage(nodeCount, edgeCount) {
        // Rough estimation: ~1KB per node, ~0.5KB per edge
        const estimatedBytes = (nodeCount * 1024) + (edgeCount * 512);
        return Math.round(estimatedBytes / (1024 * 1024) * 100) / 100;
    }

    /**
     * Get visualization options for vis.js with adaptive performance settings
     * @param {number} nodeCount - Number of nodes for performance tuning
     * @param {number} edgeCount - Number of edges for performance tuning
     * @returns {Object} Vis.js options
     */
    getVisualizationOptions(nodeCount = 0, edgeCount = 0) {
        // Adaptive physics settings based on graph size
        const isLargeGraph = nodeCount > 500 || edgeCount > 1000;
        const isHugeGraph = nodeCount > 2000 || edgeCount > 5000;

        const physicsEnabled = DOMHelper.isChecked('enable-physics') && !isHugeGraph;

        return {
            groups: {
                process: {color: {background: CONFIG.nodeColors.Process, border: '#6B8E6B'}, shape: 'box'},
                file: {color: {background: CONFIG.nodeColors.File, border: '#B8860B'}, shape: 'ellipse'},
                registry: {color: {background: CONFIG.nodeColors.Registry, border: '#4682B4'}, shape: 'diamond'},
                network: {color: {background: CONFIG.nodeColors.Network, border: '#DAA520'}, shape: 'triangle'}
            },
            physics: {
                enabled: physicsEnabled,
                stabilization: {
                    enabled: physicsEnabled,
                    iterations: isLargeGraph ? 50 : 100,
                    updateInterval: isLargeGraph ? 25 : 10
                },
                barnesHut: {
                    ...CONFIG.visualization.physics.barnesHut,
                    gravitationalConstant: isLargeGraph ? -3000 : -2000,
                    springConstant: isLargeGraph ? 0.02 : 0.05
                },
                minVelocity: isLargeGraph ? 0.5 : 0.1,
                maxVelocity: isLargeGraph ? 50 : 25
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: !isHugeGraph, // Disable hover for huge graphs to improve performance
                hoverConnectedEdges: !isHugeGraph,
                selectConnectedEdges: false,
                multiselect: true,
                keyboard: {
                    enabled: true,
                    speed: {x: 10, y: 10, zoom: 0.02},
                    bindToWindow: false
                }
            },
            nodes: {
                ...CONFIG.visualization.nodes,
                font: {
                    ...CONFIG.visualization.nodes.font,
                    size: isLargeGraph ? 10 : CONFIG.visualization.nodes.font.size
                }
            },
            edges: {
                ...CONFIG.visualization.edges,
                font: {
                    size: isLargeGraph ? 10 : 12,
                    color: '#000000',
                    strokeWidth: 1,
                    strokeColor: '#ffffff'
                },
                smooth: isLargeGraph ? false : {type: 'continuous'}
            },
            layout: {
                improvedLayout: !isHugeGraph,
                hierarchical: false
            }
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
                // Store positions without fixing nodes to allow continued dragging
                const positions = this.network.getPositions(params.nodes);
                const updates = params.nodes.map(nodeId => {
                    const pos = positions[nodeId];
                    return {
                        id: nodeId,
                        physics: false, // Disable physics for this node but allow dragging
                        x: pos.x,
                        y: pos.y
                    };
                });
                
                try {
                    this.network.body.data.nodes.update(updates);
                    notificationSystem.showSuccess(`Positioned ${params.nodes.length} node(s) - still draggable`);
                } catch (error) {
                    console.error('Error updating node positions:', error);
                    notificationSystem.showError('Error updating node positions');
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
     * Update registry node labels based on selection
     */
    updateRegistryNodeLabels() {
        if (!this.network) return;
        
        const registryOptimizationEnabled = DOMHelper.isChecked('optimize-registry-paths');
        const nodesToUpdate = [];

        if (registryOptimizationEnabled && this.registryPathMapping && Object.keys(this.registryPathMapping).length) {
            Object.keys(this.registryPathMapping).forEach(nodeId => {
                const currentLabel = getRegistryLabel(
                    nodeId,
                    this.registryPathMapping,
                    this.selectedNodes.has(nodeId)
                );

                if (!currentLabel) return;

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
        const container = document.querySelector('.container');
        const detailsContent = DOMHelper.getElementById('details-content');
        
        if (!container || !detailsContent) return;
        
        // Add details-open class to show panel
        container.classList.add('details-open');
        
        const nodeType = node.type || 'Node';
        const nodeIcon = this.getNodeIcon(node.type);
        const nameVariants = this.getNameVariants(node.label || node.id);
        const shortName = nameVariants.short || nodeType;
        const fullName = nameVariants.full || nodeType;
        const nodeId = node.id ? this.escapeHtml(node.id) : '';
        const nodeTypeClass = this.getSafeTypeClass(node.type);
        const entryIndicesMarkup = this.createChipGroup(node.entry_indices, 'No entry indices');
        const occurrences = Array.isArray(node.timestamps)
            ? node.timestamps.length
            : Array.isArray(node.entry_indices)
                ? node.entry_indices.length
                : node.entry_indices ? 1 : null;
        const firstTimestamp = Array.isArray(node.timestamps) && node.timestamps.length ? Math.min(...node.timestamps) : null;
        const lastTimestamp = Array.isArray(node.timestamps) && node.timestamps.length ? Math.max(...node.timestamps) : null;
        const firstSeen = this.formatDate(firstTimestamp);
        const lastSeen = this.formatDate(lastTimestamp);

        this.updateDetailsHeader({
            icon: nodeIcon,
            title: shortName,
            subtitle: `${nodeType} node`
        });

        const timelineHtml = firstSeen ? `
            <section class="detail-block">
                <h4>🕒 Activity Timeline</h4>
                <ul class="detail-timeline">
                    <li>
                        <time>${firstSeen}</time>
                        <span>First recorded occurrence</span>
                    </li>
                    ${lastSeen && lastSeen !== firstSeen ? `
                    <li>
                        <time>${lastSeen}</time>
                        <span>${occurrences ? `${this.formatNumber(occurrences)} recorded occurrences` : 'Latest observation'}</span>
                    </li>` : ''}
                </ul>
            </section>
        ` : '';

        const summaryBadges = `
            <div class="summary-badges">
                <span class="summary-badge"><span>Type</span>${this.escapeHtml(nodeType)}</span>
                ${occurrences ? `<span class="summary-badge"><span>Occurrences</span>${this.formatNumber(occurrences)}</span>` : ''}
                ${node.entry_indices ? `<span class="summary-badge"><span>Entry count</span>${this.formatNumber(Array.isArray(node.entry_indices) ? node.entry_indices.length : 1)}</span>` : ''}
            </div>
        `;

        detailsContent.innerHTML = `
            <div class="details-wrapper node-details">
                <section class="details-summary-card">
                    <div class="summary-header">
                        <div class="summary-icon">${nodeIcon}</div>
                        <div class="summary-title">
                            <h2 title="${this.escapeHtml(fullName)}">${this.escapeHtml(shortName)}</h2>
                            <p class="summary-subtitle">${this.escapeHtml(nodeType)} node${nodeId ? ` • ${nodeId}` : ''}</p>
                            <p class="summary-description">Full name: ${this.escapeHtml(fullName)}</p>
                        </div>
                    </div>
                    ${node.title ? `<span class="detail-path" title="${this.escapeHtml(node.title)}">${this.escapeHtml(node.title)}</span>` : ''}
                    ${summaryBadges}
                </section>
                <section class="detail-block">
                    <h4>� Key Properties</h4>
                    <div class="detail-grid">
                        <div class="detail-card">
                            <div class="detail-card-label">Node ID</div>
                            <div class="detail-card-value">${nodeId}</div>
                        </div>
                        <div class="detail-card">
                            <div class="detail-card-label">Node Type</div>
                            <div class="detail-card-value"><span class="node-type ${nodeTypeClass}">${this.escapeHtml(nodeType)}</span></div>
                        </div>
                        ${firstSeen ? `
                        <div class="detail-card">
                            <div class="detail-card-label">First Seen</div>
                            <div class="detail-card-value">${firstSeen}</div>
                        </div>` : ''}
                        ${lastSeen && lastSeen !== firstSeen ? `
                        <div class="detail-card">
                            <div class="detail-card-label">Last Seen</div>
                            <div class="detail-card-value">${lastSeen}</div>
                        </div>` : ''}
                        ${occurrences ? `
                        <div class="detail-card">
                            <div class="detail-card-label">Occurrences</div>
                            <div class="detail-card-value">${this.formatNumber(occurrences)}</div>
                        </div>` : ''}
                    </div>
                </section>
                <section class="detail-block">
                    <h4>📚 Entry Indices</h4>
                    <div class="detail-chip-group">
                        ${entryIndicesMarkup}
                    </div>
                </section>
                ${timelineHtml}
                <section class="detail-block">
                    <h4>🎯 Quick Actions</h4>
                    <div class="detail-toolbar">
                        <button class="detail-btn" data-action="focus-node" data-node-id="${nodeId}">🎯 Focus on node</button>
                        <button class="detail-btn secondary" data-action="unfix-node" data-node-id="${nodeId}">🔓 Unfix node</button>
                    </div>
                    <div class="detail-note">Tip: Right-click a node in the graph for additional layout controls.</div>
                </section>
            </div>
        `;

        detailsContent.scrollTop = 0;

        this.bindDetailActions(detailsContent, [
            {
                selector: '[data-action="focus-node"]',
                handler: () => this.focusOnNode(node.id)
            },
            {
                selector: '[data-action="unfix-node"]',
                handler: () => this.unfixNode(node.id)
            }
        ]);
        
        console.log('Showing node details:', node);
    }

    /**
     * Show edge details in side panel
     * @param {Object} edge - Edge object
     */
    showEdgeDetails(edge) {
        const container = document.querySelector('.container');
        const detailsContent = DOMHelper.getElementById('details-content');
        
        if (!container || !detailsContent) return;
        
        // Add details-open class to show panel
        container.classList.add('details-open');
        
        const edgeIcon = this.getEdgeIcon();
        const fromNode = this.escapeHtml(edge.src);
        const toNode = this.escapeHtml(edge.dst);
        const operationVariants = this.getNameVariants(edge.operation || 'Operation');
        const shortOperation = operationVariants.short || 'Operation';
        const fullOperation = operationVariants.full || 'Operation';
        const operationEscaped = this.escapeHtml(fullOperation);
        const entryIndicesMarkup = this.createChipGroup(edge.entry_indices, 'No entry indices recorded');
        const lineIdMarkup = this.createChipGroup(
            Array.isArray(edge.line_ids) ? edge.line_ids.filter(id => id) : edge.line_ids,
            'No line identifiers available',
            'muted'
        );
        const combinedCount = edge.is_combined && edge.combined_count ? this.formatNumber(edge.combined_count) : null;
        const primaryTimestamp = !edge.is_combined ? this.formatDate(edge.timestamp) : null;
        const rangeStart = edge.is_combined ? this.formatDate(edge.timestamp_min) : null;
        const rangeEnd = edge.is_combined ? this.formatDate(edge.timestamp_max) : null;

        this.updateDetailsHeader({
            icon: edgeIcon,
            title: shortOperation,
            subtitle: 'Edge operation'
        });

        const timelineHtml = edge.is_combined && rangeStart ? `
            <section class="detail-block">
                <h4>🕒 Activity Timeline</h4>
                <ul class="detail-timeline">
                    <li>
                        <time>${rangeStart}</time>
                        <span>First recorded operation</span>
                    </li>
                    ${rangeEnd && rangeEnd !== rangeStart ? `
                    <li>
                        <time>${rangeEnd}</time>
                        <span>Most recent operation</span>
                    </li>` : ''}
                </ul>
                ${combinedCount ? `<div class="detail-note">Combined from ${combinedCount} individual operations.</div>` : ''}
            </section>
        ` : primaryTimestamp ? `
            <section class="detail-block">
                <h4>🕒 Activity Timestamp</h4>
                <ul class="detail-timeline">
                    <li>
                        <time>${primaryTimestamp}</time>
                        <span>Operation occurred</span>
                    </li>
                </ul>
            </section>
        ` : '';

        const summaryBadges = `
            <div class="summary-badges">
                <span class="summary-badge"><span>Edge Type</span>${edge.is_combined ? 'Combined edge' : 'Single edge'}</span>
                ${combinedCount ? `<span class="summary-badge"><span>Operations</span>${combinedCount}</span>` : ''}
                ${edge.entry_indices ? `<span class="summary-badge"><span>Entry count</span>${this.formatNumber(Array.isArray(edge.entry_indices) ? edge.entry_indices.length : 1)}</span>` : ''}
            </div>
        `;

        detailsContent.innerHTML = `
            <div class="details-wrapper edge-details">
                <section class="details-summary-card">
                    <div class="summary-header">
                        <div class="summary-icon">${edgeIcon}</div>
                        <div class="summary-title">
                            <h2 title="${operationEscaped}">${this.escapeHtml(shortOperation)}</h2>
                            <p class="summary-subtitle">${fromNode} → ${toNode}</p>
                            <p class="summary-description">Full operation: ${operationEscaped}</p>
                        </div>
                    </div>
                    ${summaryBadges}
                </section>
                <section class="detail-block">
                    <h4>� Direction</h4>
                    <div class="detail-direction">
                        <div class="direction-node" title="Source node">${fromNode}</div>
                        <div class="direction-arrow">➜</div>
                        <div class="direction-node" title="Target node">${toNode}</div>
                    </div>
                </section>
                <section class="detail-block">
                    <h4>🔍 Operation Details</h4>
                    <div class="detail-grid">
                        <div class="detail-card">
                            <div class="detail-card-label">Operation</div>
                            <div class="detail-card-value"><span class="operation-type">${operationEscaped}</span></div>
                        </div>
                        ${edge.entry_index !== undefined ? `
                        <div class="detail-card">
                            <div class="detail-card-label">Entry Index</div>
                            <div class="detail-card-value">${this.escapeHtml(edge.entry_index)}</div>
                        </div>` : ''}
                        ${combinedCount ? `
                        <div class="detail-card">
                            <div class="detail-card-label">Combined Operations</div>
                            <div class="detail-card-value">${combinedCount}</div>
                        </div>` : ''}
                    </div>
                    <div class="detail-chip-group">
                        ${entryIndicesMarkup}
                    </div>
                </section>
                ${lineIdMarkup ? `
                <section class="detail-block">
                    <h4>📄 Related Line IDs</h4>
                    <div class="detail-chip-group">
                        ${lineIdMarkup}
                    </div>
                </section>` : ''}
                ${timelineHtml}
                <section class="detail-block">
                    <h4>🎯 Quick Actions</h4>
                    <div class="detail-toolbar">
                        <button class="detail-btn" data-action="focus-edge" data-edge-src="${fromNode}" data-edge-dst="${toNode}">🎯 Focus on edge</button>
                    </div>
                    <div class="detail-note">Tip: Use combined edges to spot repeated behaviors between nodes.</div>
                </section>
            </div>
        `;
        
        detailsContent.scrollTop = 0;

        this.bindDetailActions(detailsContent, [
            {
                selector: '[data-action="focus-edge"]',
                handler: () => this.focusOnEdge(edge.src, edge.dst)
            }
        ]);
        
        console.log('Showing edge details:', edge);
    }

    /**
     * Hide details panel
     */
    hideDetailsPanel() {
        const appInstance = window.logVizApp;
        if (appInstance && typeof appInstance.hideDetailsPanel === 'function') {
            appInstance.hideDetailsPanel();
            return;
        }

        const container = document.querySelector('.container');
        if (container) {
            container.classList.remove('details-open');
        }

        this.resetDetailsPanel(300);
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
     * Focus on specific edge
     * @param {string} fromNodeId - Source node ID
     * @param {string} toNodeId - Target node ID
     */
    focusOnEdge(fromNodeId, toNodeId) {
        if (!this.network) return;
        
        const options = {
            scale: 1.2,
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        };
        
        this.network.fit({
            nodes: [fromNodeId, toNodeId],
            animation: options.animation
        });
        notificationSystem.showSuccess(`Focused on edge: ${fromNodeId} → ${toNodeId}`);
    }

    /**
     * Unfix a specific node to allow physics simulation
     * @param {string} nodeId - Node ID
     */
    unfixNode(nodeId) {
        if (!this.network) return;
        
        try {
            const update = {
                id: nodeId,
                fixed: false,
                physics: true
            };
            
            this.network.body.data.nodes.update(update);
            notificationSystem.showSuccess(`Node ${nodeId} is now free to move`);
        } catch (error) {
            console.error('Error unfixing node:', error);
            notificationSystem.showError('Error unfixing node');
        }
    }

    /**
     * Show context menu for node
     * @param {string} nodeId - Node ID
     * @param {Object} position - Mouse position
     */
    showNodeContextMenu(nodeId, position) {
        // Remove any existing context menu
        const existingMenu = document.getElementById('context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${position.y}px;
            left: ${position.x}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            min-width: 150px;
        `;
        
        const menuItems = [
            {
                text: '🎯 Focus Node',
                action: () => this.focusOnNode(nodeId)
            },
            {
                text: '🔓 Unfix Node',
                action: () => this.unfixNode(nodeId)
            },
            {
                text: '🔒 Fix All Nodes',
                action: () => this.fixAllNodes()
            },
            {
                text: '🔓 Unfix All Nodes',
                action: () => this.unfixAllNodes()
            }
        ];
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                font-size: 14px;
                border-bottom: 1px solid #eee;
            `;
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = '#f0f0f0';
            });
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'white';
            });
            menuItem.addEventListener('click', () => {
                item.action();
                menu.remove();
            });
            menu.appendChild(menuItem);
        });
        
        // Remove last border
        if (menu.lastChild) {
            menu.lastChild.style.borderBottom = 'none';
        }
        
        document.body.appendChild(menu);
        
        // Remove menu when clicking elsewhere
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', removeMenu), 100);
        
        console.log('Context menu shown for node:', nodeId);
    }

    /**
     * Fix all nodes to prevent physics simulation
     */
    fixAllNodes() {
        if (!this.network) return;
        
        try {
            const nodeIds = this.network.body.data.nodes.getIds();
            const updates = nodeIds.map(id => ({
                id: id,
                fixed: true,
                physics: false
            }));
            
            this.network.body.data.nodes.update(updates);
            notificationSystem.showSuccess(`Fixed ${nodeIds.length} nodes`);
        } catch (error) {
            console.error('Error fixing all nodes:', error);
            notificationSystem.showError('Error fixing all nodes');
        }
    }

    /**
     * Unfix all nodes to allow physics simulation
     */
    unfixAllNodes() {
        if (!this.network) return;
        
        try {
            const nodeIds = this.network.body.data.nodes.getIds();
            const updates = nodeIds.map(id => ({
                id: id,
                fixed: false,
                physics: true
            }));
            
            this.network.body.data.nodes.update(updates);
            notificationSystem.showSuccess(`Unfixed ${nodeIds.length} nodes - all can move freely`);
        } catch (error) {
            console.error('Error unfixing all nodes:', error);
            notificationSystem.showError('Error unfixing all nodes');
        }
    }

    /**
     * Update details panel header contents
     * @param {Object} config - Header configuration
     * @param {string} config.icon - Icon character
     * @param {string} config.title - Title text
     * @param {string} config.subtitle - Subtitle text
     */
    updateDetailsHeader({ icon = '📄', title = 'Details', subtitle = '' } = {}) {
        const iconElement = document.getElementById('details-icon');
        const titleElement = document.getElementById('details-title');
        const subtitleElement = document.getElementById('details-subtitle');

        if (iconElement) {
            iconElement.textContent = icon;
        }
        if (titleElement) {
            titleElement.textContent = title;
        }
        if (subtitleElement) {
            subtitleElement.textContent = subtitle;
        }
    }

    /**
     * Reset details panel to default state
     * @param {number} delay - Optional delay before applying placeholder (ms)
     */
    resetDetailsPanel(delay = 0) {
        this.updateDetailsHeader({
            icon: '📄',
            title: 'Node & Edge Details',
            subtitle: 'Select a node or edge in the graph to explore its context.'
        });

        const applyPlaceholder = () => {
            const detailsContent = DOMHelper.getElementById('details-content');
            if (detailsContent) {
                detailsContent.innerHTML = this.getDefaultDetailsPlaceholder();
                detailsContent.scrollTop = 0;
            }
        };

        if (delay > 0) {
            setTimeout(applyPlaceholder, delay);
        } else {
            applyPlaceholder();
        }
    }

    /**
     * Create default placeholder markup for details panel
     * @returns {string} Placeholder HTML string
     */
    getDefaultDetailsPlaceholder() {
        return `
            <div class="details-placeholder">
                <div class="placeholder-icon">👈</div>
                <h4>Waiting for a selection</h4>
                <p>Interact with the graph to surface rich metadata, timelines, and quick actions here.</p>
                <ul class="placeholder-hints">
                    <li>Click a node to inspect its properties and timestamps.</li>
                    <li>Click an edge to review the associated operation history.</li>
                    <li>Use the action buttons to focus or unfix nodes instantly.</li>
                </ul>
            </div>
        `;
    }

    /**
     * Attach action handlers to details panel buttons
     * @param {HTMLElement} detailsContent - Details container element
     * @param {Array} actions - Collection of action descriptors
     */
    bindDetailActions(detailsContent, actions = []) {
        if (!detailsContent || !Array.isArray(actions)) return;

        actions.forEach(action => {
            if (!action || !action.selector || typeof action.handler !== 'function') return;
            const element = detailsContent.querySelector(action.selector);
            if (element) {
                element.addEventListener('click', action.handler);
            }
        });
    }

    /**
     * Retrieve icon for node types
     * @param {string} type - Node type
     * @returns {string} Emoji icon
     */
    getNodeIcon(type) {
        const iconMap = {
            Process: '🖥️',
            File: '📄',
            Registry: '🗂️',
            Network: '🌐'
        };
        return iconMap[type] || '📍';
    }

    /**
     * Retrieve icon for edges
     * @returns {string} Emoji icon
     */
    getEdgeIcon() {
        return '🔗';
    }

    /**
     * Produce short and full variants for display names
     * @param {*} value - Source value
     * @param {number} maxLength - Maximum length for short variant
     * @returns {{short: string, full: string}}
     */
    getNameVariants(value, maxLength = 28) {
        if (value === undefined || value === null) {
            return { short: '', full: '' };
        }

        const full = String(value);
        if (!full.trim()) {
            return { short: '', full: '' };
        }

        if (full.length <= maxLength) {
            return { short: full, full };
        }

        const shortened = full.slice(0, maxLength - 1).trimEnd() + '…';
        return { short: shortened, full };
    }

    /**
     * Safely derive a type-based CSS class
     * @param {string} type - Node type
     * @returns {string} Normalized class name fragment
     */
    getSafeTypeClass(type) {
        if (!type) return '';
        return type.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    }

    /**
     * Produce chip markup from values
     * @param {Array|*} items - Value(s) to display
     * @param {string} placeholder - Fallback text
     * @param {string} extraClass - Additional chip class
     * @returns {string} Rendered HTML
     */
    createChipGroup(items, placeholder = 'No data available', extraClass = '') {
        if (items === undefined || items === null || items === '') {
            return `<span class="detail-empty">${this.escapeHtml(placeholder)}</span>`;
        }

        const normalized = Array.isArray(items) ? items : [items];
        const filtered = normalized.filter(value => value !== undefined && value !== null && value !== '');

        if (filtered.length === 0) {
            return `<span class="detail-empty">${this.escapeHtml(placeholder)}</span>`;
        }

        return filtered
            .map(value => `<span class="detail-chip${extraClass ? ` ${extraClass}` : ''}">${this.escapeHtml(value)}</span>`)
            .join('');
    }

    /**
     * Format timestamp (seconds) to readable date string
     * @param {number} timestamp - Unix timestamp in seconds
     * @returns {string|null} Localized date
     */
    formatDate(timestamp) {
        if (timestamp === undefined || timestamp === null || Number.isNaN(timestamp)) {
            return null;
        }
        return new Date(timestamp * 1000).toLocaleString();
    }

    /**
     * Format numeric values with locale separators
     * @param {number} value - Numeric value
     * @returns {string} Formatted number or empty string
     */
    formatNumber(value) {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return '';
        }
        return Number(value).toLocaleString();
    }

    /**
     * Escape HTML entities for safe rendering
     * @param {*} value - Input value
     * @returns {string} Escaped string
     */
    escapeHtml(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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