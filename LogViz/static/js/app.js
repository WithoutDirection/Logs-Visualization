/**
 * Application Entry Point
 * Main application controller that coordinates all modules
 * Cache version: 9 - Update import URLs below to bust cache
 */

import { CONFIG } from './config.js?v=9';
import DOMHelper from './modules/dom-helper.js?v=9';
import notificationSystem from './modules/notifications.js?v=9';
import GraphLoader from './modules/graph-loader.js?v=9';
import DataFilters from './modules/filters.js?v=9';
import Visualization from './modules/visualization.js?v=9';
import Search from './modules/search.js?v=9';

class LogVisualizationApp {
    constructor() {
        this.graphLoader = new GraphLoader();
        this.dataFilters = new DataFilters();
        this.visualization = new Visualization();
        this.search = new Search(this.visualization, this);
        this.filteredData = null;
        this.searchFilterActive = false;
        this.searchEntryIndices = [];
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            notificationSystem.showInfo('Initializing visualization tool...');
            
            await this.loadMetadata();
            this.initializeUI();
            this.search.init(); // Initialize search functionality
            this.setupEventListeners();
            this.updateWindowNavigationButtons();
            
            notificationSystem.updateStatus('Ready - Select a graph to begin');
            notificationSystem.showSuccess('Visualization tool ready!');
            
        } catch (error) {
            console.error('Initialization error:', error);
            notificationSystem.showError('Failed to initialize: ' + error.message);
        }
    }

    /**
     * Load graph metadata
     */
    async loadMetadata() {
        await this.graphLoader.loadMetadataIndex();
    }

    /**
     * Initialize UI components
     */
    initializeUI() {
        this.initializeGraphSelector();
        this.setupKeyboardShortcuts();
        this.addAccessibilityFeatures();
    }

    /**
     * Initialize graph selector dropdown
     */
    initializeGraphSelector() {
        const selector = DOMHelper.getElementById('graph-selector');
        if (!selector) return;
        
        // Clear existing options
        selector.innerHTML = '<option value="">Select Event Graph...</option>';
        
        // Populate graph selector
        const graphIds = this.graphLoader.getAvailableGraphIds();
        graphIds.forEach(graphId => {
            const metadata = this.graphLoader.getGraphMetadata(graphId);
            const option = document.createElement('option');
            option.value = graphId;
            // Initial placeholder label
            option.textContent = `${metadata?.name || 'Dataset ' + graphId} (… nodes, … edges)`;
            selector.appendChild(option);

            // Asynchronously fetch full graph info to update counts
            this.graphLoader.loadGraphInfo(graphId).then(fullMeta => {
                if (!fullMeta) return;
                const nodes = fullMeta?.stats?.nodes ?? '…';
                const edges = fullMeta?.stats?.edges ?? '…';
                option.textContent = `${fullMeta.name} (${nodes} nodes, ${edges} edges)`;
            }).catch(() => {/* noop */});
        });
        
        console.log('Graph selector initialized with', graphIds.length, 'options');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Main control event listeners
        const eventConfigs = [
            {
                id: 'graph-selector',
                event: 'change',
                handler: (e) => this.onGraphSelectorChange(e)
            },
            {
                id: 'load-btn',
                event: 'click',
                handler: () => this.onLoadButtonClick()
            },
            {
                id: 'apply-range-btn',
                event: 'click',
                handler: () => this.onApplyRangeClick()
            },
            {
                id: 'last-window-btn',
                event: 'click',
                handler: () => this.navigateToLastWindow()
            },
            {
                id: 'next-window-btn',
                event: 'click',
                handler: () => this.navigateToNextWindow()
            }
        ];
        
        DOMHelper.addEventListeners(eventConfigs);
        
        // Input change listeners for navigation buttons
    DOMHelper.addEventListener('entry-start', 'input', () => this.updateWindowNavigationButtons());
    DOMHelper.addEventListener('entry-end', 'input', () => this.updateWindowNavigationButtons());
        
        // Feature toggle listeners
        this.setupFeatureToggleListeners();
        
        // Preset button listeners
        this.setupPresetButtonListeners();
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Escape key to close details panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const container = document.querySelector('.container');
                if (container && container.classList.contains('details-open')) {
                    this.hideDetailsPanel();
                }
            }
        });
    }

    /**
     * Setup feature toggle event listeners
     */
    setupFeatureToggleListeners() {
        const featureConfigs = [
            {
                id: 'sequence-grouping',
                handler: () => this.onFeatureToggle('sequence-grouping')
            },
            {
                id: 'reapr-analysis', 
                handler: () => this.onFeatureToggle('reapr-analysis')
            },
            {
                id: 'show-legend',
                handler: () => this.onLegendToggle()
            },
            {
                id: 'enable-physics',
                handler: () => this.onPhysicsToggle()
            },
            {
                id: 'show-edge-labels',
                handler: () => this.onFeatureToggle('show-edge-labels')
            },
            {
                id: 'combine-edges',
                handler: () => this.onFeatureToggle('combine-edges')
            },
            {
                id: 'optimize-registry-paths',
                handler: () => this.onRegistryOptimizationToggle()
            }
        ];
        
        featureConfigs.forEach(config => {
            DOMHelper.addEventListener(config.id, 'change', config.handler);
        });
        
        // Node type filters
        const nodeTypes = ['show-process', 'show-file', 'show-registry', 'show-network'];
        nodeTypes.forEach(id => {
            DOMHelper.addEventListener(id, 'change', () => this.onFeatureToggle('node-filters'));
        });
        
        // Confidence slider
        DOMHelper.addEventListener('confidence-slider', 'input', (e) => {
            DOMHelper.setTextById('confidence-value', e.target.value + '%');
            if (this.graphLoader.hasLoadedGraph()) {
                this.updateVisualization();
            }
        });
        
        // Close details button
        DOMHelper.addEventListener('close-details-btn', 'click', () => this.hideDetailsPanel());
    }

    /**
     * Setup preset button event listeners
     */
    setupPresetButtonListeners() {
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.dataset.range;
                this.applyPresetRange(range);
                this.updateWindowNavigationButtons();
            });
        });
    }

    /**
     * Handle graph selector change
     */
    async onGraphSelectorChange(event) {
        const selectedGraph = event.target.value;
        const loadBtn = DOMHelper.getElementById('load-btn');
        
        if (loadBtn) {
            loadBtn.disabled = !selectedGraph;
        }
        
        if (selectedGraph) {
            // Load full graph info from API
            const metadata = await this.graphLoader.loadGraphInfo(selectedGraph);
            if (metadata) {
                this.updateStatsDisplay(metadata);
                this.updateEntryRange(metadata.stats.entry_range);
            } else {
                console.warn('No graph metadata available for', selectedGraph);
            }
        }
    }

    /**
     * Handle load button click
     */
    async onLoadButtonClick() {
        const selectedGraph = DOMHelper.getValueById('graph-selector');
        if (selectedGraph) {
            await this.loadGraph(selectedGraph);
        }
    }

    /**
     * Load a specific graph
     */
    async loadGraph(graphId) {
        try {
            await this.graphLoader.loadGraph(graphId);
            
            // Build raw data index for search
            const rawData = this.graphLoader.getCurrentData();
            if (rawData) {
                const { stats, total_entries } = rawData;
                if (stats?.entry_range) {
                    const { from, to } = stats.entry_range;
                    DOMHelper.setValueById('entry-start', from);
                    DOMHelper.setValueById('entry-end', to);
                    if (Number.isFinite(total_entries)) {
                        DOMHelper.setAttributes('entry-start', { max: total_entries });
                        DOMHelper.setAttributes('entry-end', { max: total_entries });
                    }
                }
                this.search.buildSearchIndex(rawData, true); // true = raw data index
            }
            
            this.updateVisualization();
            this.updateLegend();
            this.updateWindowNavigationButtons();
        } catch (error) {
            console.error('Failed to load graph:', error);
            // Error handling is done in GraphLoader
        }
    }

    /**
     * Load currently selected graph with the entry range from inputs
     */
    async loadGraphWithCurrentRange() {
        const datasetId = DOMHelper.getValueById('graph-selector') || (this.graphLoader.getCurrentData()?.dataset_id);
        if (!datasetId) return;
        const startEntry = DOMHelper.getIntValueById('entry-start', 1);
        const endEntry = DOMHelper.getIntValueById('entry-end', startEntry + (CONFIG.defaultEntryRange - 1));
        try {
            await this.graphLoader.loadGraph(datasetId, startEntry, endEntry);
            const rawData = this.graphLoader.getCurrentData();
            if (rawData) {
                const { stats, total_entries } = rawData;
                if (stats?.entry_range) {
                    const { from, to } = stats.entry_range;
                    DOMHelper.setValueById('entry-start', from);
                    DOMHelper.setValueById('entry-end', to);
                    if (Number.isFinite(total_entries)) {
                        DOMHelper.setAttributes('entry-start', { max: total_entries });
                        DOMHelper.setAttributes('entry-end', { max: total_entries });
                    }
                }
                this.search.buildSearchIndex(rawData, true);
            }
            this.updateVisualization();
            this.updateLegend();
            this.updateWindowNavigationButtons();
        } catch (e) {
            console.error('Failed to load graph window:', e);
        }
    }

    /**
     * Apply search filter (called by Search module)
     * @param {Array<number>} entryIndices - Entry indices matching search
     */
    async applySearchFilter(entryIndices) {
        this.searchFilterActive = true;
        this.searchEntryIndices = entryIndices;
        this.updateVisualization();
    }

    /**
     * Clear search filter (called by Search module)
     */
    async clearSearchFilter() {
        this.searchFilterActive = false;
        this.searchEntryIndices = [];
        this.updateVisualization();
    }

    /**
     * Handle apply range button click
     */
    onApplyRangeClick() {
        // Always attempt to load with current range; will safely no-op if no dataset selected
        this.loadGraphWithCurrentRange();
    }

    /**
     * Handle feature toggle changes
     */
    onFeatureToggle(featureType) {
        if (this.graphLoader.hasLoadedGraph()) {
            this.updateVisualization();
        }
    }

    /**
     * Handle legend toggle
     */
    onLegendToggle() {
        const isChecked = DOMHelper.isChecked('show-legend');
        DOMHelper.setVisible('legend', isChecked);
    }

    /**
     * Handle physics toggle
     */
    onPhysicsToggle() {
        const network = this.visualization.getNetwork();
        if (network) {
            const enabled = DOMHelper.isChecked('enable-physics');
            network.setOptions({physics: {enabled}});
            notificationSystem.showInfo(`Physics ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Handle registry optimization toggle
     */
    onRegistryOptimizationToggle() {
        const enabled = DOMHelper.isChecked('optimize-registry-paths');
        
        if (enabled) {
            notificationSystem.showSuccess('Registry path optimization enabled');
        } else {
            notificationSystem.showInfo('Registry path optimization disabled');
        }
        
        if (this.graphLoader.hasLoadedGraph()) {
            this.updateVisualization();
        }
    }

    /**
     * Update statistics display
     */
    updateStatsDisplay(metadata) {
        // Safely get stats with fallbacks
        const stats = metadata?.stats || {};
        const nodes = stats.nodes || 0;
        const edges = stats.edges || 0;
        const entryRange = stats.entry_range || [0, 0];
        const timeRange = stats.time_range || [0, 0];
        const availableFeatures = metadata?.available_features || {};
        
        DOMHelper.setTextById('stat-nodes', nodes.toLocaleString());
        DOMHelper.setTextById('stat-edges', edges.toLocaleString());
        DOMHelper.setTextById('stat-entries', entryRange[1].toLocaleString());
        
        // Update time range
        if (timeRange && timeRange[0] && timeRange[1] && timeRange[0] > 0) {
            const start = new Date(timeRange[0] * 1000).toLocaleString();
            const end = new Date(timeRange[1] * 1000).toLocaleString();
            DOMHelper.setTextById('stat-time', `${start} - ${end}`);
        } else {
            DOMHelper.setTextById('stat-time', 'N/A');
        }
        
        // Update REAPr checkbox availability
        const hasReapr = availableFeatures.reapr_analysis || false;
        DOMHelper.setEnabled('reapr-analysis', hasReapr);
        if (!hasReapr) {
            DOMHelper.setChecked('reapr-analysis', false);
        }
    }

    /**
     * Update entry range inputs
     */
    updateEntryRange(entryRange) {
        const maxEntries = entryRange[1];
        DOMHelper.setValueById('entry-start', entryRange[0] ?? 1);
        DOMHelper.setAttributes('entry-start', { max: maxEntries });
        DOMHelper.setAttributes('entry-end', { max: maxEntries });
        DOMHelper.setValueById('entry-end', Math.min(CONFIG.defaultEntryRange, maxEntries));
    }

    /**
     * Apply preset range
     */
    applyPresetRange(range) {
        const currentData = this.graphLoader.getCurrentData();
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
        
        DOMHelper.setValueById('entry-start', startEntry);
        DOMHelper.setValueById('entry-end', endEntry);
        
        this.applyEntryRange();
    }

    /**
     * Apply entry range filter
     */
    applyEntryRange() {
        const startEntry = DOMHelper.getIntValueById('entry-start', 1);
        const endEntry = DOMHelper.getIntValueById('entry-end', 100);
        
        if (startEntry > endEntry) {
            notificationSystem.showError('Start entry must be less than or equal to end entry');
            return;
        }
        
        if (endEntry - startEntry > CONFIG.maxEntryRange) {
            notificationSystem.showWarning(`Range too large! Maximum ${CONFIG.maxEntryRange} entries allowed`);
            return;
        }
        
        notificationSystem.updateStatus(`Applying entry range: ${startEntry} - ${endEntry}`);
        this.updateVisualization();
    }

    /**
     * Navigate to previous window
     */
    navigateToLastWindow() {
        const currentData = this.graphLoader.getCurrentData();
        if (!currentData) return;
        
        const currentStart = DOMHelper.getIntValueById('entry-start', 1);
        const currentEnd = DOMHelper.getIntValueById('entry-end', 100);
        const windowSize = currentEnd - currentStart + 1;
        
        const newEnd = currentStart - 1;
        const newStart = Math.max(1, newEnd - windowSize + 1);
        
        if (newStart < 1 || newEnd < 1) {
            notificationSystem.showInfo('Already at the beginning of the dataset');
            return;
        }
        
        DOMHelper.setValueById('entry-start', newStart);
        DOMHelper.setValueById('entry-end', newEnd);
        
        // Reload data for the new window
        this.loadGraphWithCurrentRange();
        notificationSystem.showSuccess(`Moved to previous window: ${newStart} - ${newEnd}`);
    }

    /**
     * Navigate to next window
     */
    navigateToNextWindow() {
        const currentData = this.graphLoader.getCurrentData();
        if (!currentData) return;
        
        const currentStart = DOMHelper.getIntValueById('entry-start', 1);
        const currentEnd = DOMHelper.getIntValueById('entry-end', 100);
        const windowSize = currentEnd - currentStart + 1;
        const maxEntries = currentData.total_entries;
        
        const newStart = currentEnd + 1;
        const newEnd = Math.min(maxEntries, newStart + windowSize - 1);
        
        if (newStart > maxEntries) {
            notificationSystem.showInfo('Already at the end of the dataset');
            return;
        }
        
        DOMHelper.setValueById('entry-start', newStart);
        DOMHelper.setValueById('entry-end', newEnd);
        
        this.loadGraphWithCurrentRange();
        notificationSystem.showSuccess(`Moved to next window: ${newStart} - ${newEnd}`);
    }

    /**
     * Update window navigation buttons state
     */
    updateWindowNavigationButtons() {
        const currentData = this.graphLoader.getCurrentData();
        if (!currentData) {
            DOMHelper.setEnabled('last-window-btn', false);
            DOMHelper.setEnabled('next-window-btn', false);
            return;
        }
        
        const currentStart = DOMHelper.getIntValueById('entry-start', 1);
        const currentEnd = DOMHelper.getIntValueById('entry-end', 100);
        const maxEntries = currentData.total_entries;
        
        DOMHelper.setEnabled('last-window-btn', currentStart > 1);
        DOMHelper.setEnabled('next-window-btn', currentEnd < maxEntries);
    }

    /**
     * Update visualization
     */
    updateVisualization() {
        const currentData = this.graphLoader.getCurrentData();
        if (!currentData) return;
        
        const startTime = performance.now();
        
        // Apply filters to create filtered dataset
        // If search is active, pass search entry indices
        const searchIndices = this.searchFilterActive ? this.searchEntryIndices : null;
        this.filteredData = this.dataFilters.applyFilters(currentData, searchIndices);
        
        // Build search index for the filtered data (for current view)
        this.search.buildSearchIndex(this.filteredData, false);
        
        // Create vis.js network
        this.visualization.createNetworkVisualization(this.filteredData);
        
        const updateTime = performance.now() - startTime;
        notificationSystem.updatePerformance(`${Math.round(updateTime)}ms`);
        notificationSystem.updateFilterStatus(this.filteredData.filters_applied, currentData);
        this.updateWindowNavigationButtons();
    }

    /**
     * Update legend
     */
    updateLegend() {
        const legend = DOMHelper.getElementById('legend');
        const content = DOMHelper.getElementById('legend-content');
        const stats = DOMHelper.getElementById('legend-stats');
        
        const currentData = this.graphLoader.getCurrentData();
        if (!currentData || !content) return;
        
        // Clear existing content
        content.innerHTML = '';
        
        // Add sequence patterns if available
        if (Object.keys(currentData.sequence_groups).length > 0) {
            Object.values(currentData.sequence_groups).forEach(group => {
                const item = DOMHelper.createElement('div', {
                    classes: ['legend-item'],
                    innerHTML: `
                        <div class="legend-color" style="background-color: ${group.pattern_color}"></div>
                        <span>${group.pattern_name}</span>
                    `
                });
                content.appendChild(item);
            });
        }
        
        // Add node type legend
        const nodeTypes = [...new Set(currentData.nodes.map(n => n.type))];
        nodeTypes.forEach(type => {
            const item = DOMHelper.createElement('div', {
                classes: ['legend-item'],
                innerHTML: `
                    <div class="legend-color" style="background-color: ${CONFIG.nodeColors[type] || CONFIG.nodeColors.default}"></div>
                    <span>${type} Nodes</span>
                `
            });
            content.appendChild(item);
        });
        
        // Update stats
        if (this.filteredData && stats) {
            const combineEdges = this.filteredData.filters_applied.combine_edges;
            let edgeStatsText = `Edges: ${this.filteredData.edges.length}`;
            
            if (combineEdges) {
                const totalOriginalEdges = this.filteredData.edges.reduce((sum, edge) => {
                    return sum + (edge.combined_count || 1);
                }, 0);
                edgeStatsText += ` (${totalOriginalEdges} original)`;
            }
            
            stats.innerHTML = `
                <strong>Current View:</strong><br>
                Nodes: ${this.filteredData.nodes.length}<br>
                ${edgeStatsText}<br>
                Entry Range: ${this.filteredData.filters_applied.entry_range[0]}-${this.filteredData.filters_applied.entry_range[1]}${combineEdges ? '<br><em>Edges combined by operation</em>' : ''}
            `;
        }
    }

    /**
     * Hide details panel
     */
    hideDetailsPanel() {
        const container = document.querySelector('.container');
        if (container) {
            container.classList.remove('details-open');
        }
        
        setTimeout(() => {
            const detailsContent = DOMHelper.getElementById('details-content');
            if (detailsContent) {
                detailsContent.innerHTML = `
                    <div class="no-selection">
                        <p>Click on a node to view its details</p>
                    </div>
                `;
            }
        }, 300);
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        // Keyboard shortcuts are handled in the global keydown listener
        // Tooltips for UI elements
        DOMHelper.setAttributes('enable-physics', { 
            title: `Toggle physics simulation (${CONFIG.keyboardShortcuts.togglePhysics})` 
        });
        DOMHelper.setAttributes('combine-edges', { 
            title: 'Combine multiple edges with same operation' 
        });
        DOMHelper.setAttributes('show-edge-labels', { 
            title: 'Show/hide operation labels on edges' 
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        // Only handle shortcuts when graph container is active
        const graphContainer = DOMHelper.getElementById('graph-container');
        if (!graphContainer || 
            (!graphContainer.contains(document.activeElement) && 
             document.activeElement !== document.body)) {
            return;
        }
        
        const network = this.visualization.getNetwork();
        if (!network || !this.graphLoader.hasLoadedGraph()) return;
        
        switch(event.code) {
            case 'KeyF':
                if (event.ctrlKey) {
                    event.preventDefault();
                    network.fit();
                    notificationSystem.showInfo('Fit view to all nodes');
                }
                break;
                
            case 'KeyR':
                if (event.ctrlKey) {
                    event.preventDefault();
                    network.redraw();
                    notificationSystem.showInfo('Graph redrawn');
                }
                break;
                
            case 'Escape':
                network.unselectAll();
                this.visualization.selectedNodes.clear();
                notificationSystem.showInfo('Selection cleared');
                break;
                
            case 'Space':
                if (!event.ctrlKey && !event.altKey) {
                    event.preventDefault();
                    const physicsEnabled = !DOMHelper.isChecked('enable-physics');
                    DOMHelper.setChecked('enable-physics', physicsEnabled);
                    network.setOptions({physics: {enabled: physicsEnabled}});
                    notificationSystem.showInfo(`Physics ${physicsEnabled ? 'enabled' : 'disabled'}`);
                }
                break;
        }
    }

    /**
     * Add accessibility features
     */
    addAccessibilityFeatures() {
        const graphContainer = DOMHelper.getElementById('graph-container');
        if (graphContainer) {
            DOMHelper.setAttributes('graph-container', {
                'tabindex': '0',
                'role': 'img',
                'aria-label': 'Interactive network graph visualization'
            });
        }
    }

    /**
     * Get application state
     */
    getState() {
        return {
            hasLoadedGraph: this.graphLoader.hasLoadedGraph(),
            currentGraph: this.graphLoader.getCurrentGraphId(),
            selectedNodes: Array.from(this.visualization.selectedNodes),
            loadingStats: this.graphLoader.getLoadingStats(),
            filterState: this.dataFilters.getCurrentFilterState()
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.visualization.destroy();
        this.graphLoader.clearCurrentGraph();
        notificationSystem.clearNotifications();
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.logVizApp = new LogVisualizationApp();
});

export default LogVisualizationApp;