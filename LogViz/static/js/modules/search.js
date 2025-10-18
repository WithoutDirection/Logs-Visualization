/**
 * Search Module
 * Handles searching and highlighting nodes/edges in the graph
 */

import { CONFIG } from '../config.js';
import DOMHelper from './dom-helper.js';
import notificationSystem from './notifications.js';
import * as SearchUtils from './search-utils.js';

class Search {
    constructor(visualization, app) {
        this.visualization = visualization;
        this.app = app; // Reference to app for triggering data reload
        this.searchResults = new Set();
        this.currentSearchTerm = '';
        this.searchIndex = new Map(); // node/edge id -> searchable text
        this.rawDataIndex = new Map(); // Full dataset index
        this.maxSearchResults = 500; // Maximum number of results to display
        this.searchMode = 'highlight'; // 'highlight' or 'filter'
        this.isSearchActive = false;
    }

    /**
     * Initialize search functionality
     */
    init() {
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for search controls
     */
    setupEventListeners() {
        const searchInput = DOMHelper.getElementById('search-input');
        const searchBtn = DOMHelper.getElementById('search-btn');
        const clearBtn = DOMHelper.getElementById('clear-search-btn');
        const helpBtn = DOMHelper.getElementById('search-help-btn');
        const filterModeCheckbox = DOMHelper.getElementById('search-filter-mode', true); // Optional element

        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(searchInput.value);
                } else if (e.key === 'Escape') {
                    this.clearSearch();
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const searchInput = DOMHelper.getElementById('search-input');
                if (searchInput) {
                    this.performSearch(searchInput.value);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearSearch());
        }

        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showSearchHelp());
        }

        if (filterModeCheckbox) {
            filterModeCheckbox.addEventListener('change', (e) => {
                this.searchMode = e.target.checked ? 'filter' : 'highlight';
                // Re-apply current search if there is one
                if (this.currentSearchTerm) {
                    this.performSearch(this.currentSearchTerm);
                }
            });
        } else {
            // Default to highlight mode if checkbox not found
            this.searchMode = 'highlight';
        }

        // Modal close handlers
        this.setupModalHandlers();
    }

    /**
     * Setup modal event handlers
     */
    setupModalHandlers() {
        const modal = document.getElementById('search-help-modal');
        if (!modal) return;

        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideSearchHelp());
        }

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideSearchHelp();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display !== 'none') {
                this.hideSearchHelp();
            }
        });
    }

    /**
     * Show search help modal
     */
    showSearchHelp() {
        const modal = document.getElementById('search-help-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    /**
     * Hide search help modal
     */
    hideSearchHelp() {
        const modal = document.getElementById('search-help-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Build search index from graph data
     * @param {Object} data - Graph data containing nodes and edges
     * @param {boolean} isRawData - Whether this is the full raw dataset
     */
    buildSearchIndex(data, isRawData = false) {
        const targetIndex = isRawData ? this.rawDataIndex : this.searchIndex;
        const newIndex = SearchUtils.buildSearchIndex(data);
        
        // Clear and populate the target index
        targetIndex.clear();
        for (const [key, value] of newIndex) {
            targetIndex.set(key, value);
        }
    }

    /**
     * Handle search input changes (debounced)
     * @param {string} query - Search query
     */
    handleSearchInput(query) {
        this.currentSearchTerm = query.trim();

        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (query.length === 0) {
            this.clearSearch();
            return;
        }

        if (query.length < 2) {
            return; // Don't search for very short queries
        }

        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 300); // Debounce search
    }

    /**
     * Perform search operation
     * @param {string} query - Search query
     */
    async performSearch(query) {
        if (!query || query.trim().length === 0) {
            this.clearSearch();
            return;
        }

        const searchTerm = query.trim().toLowerCase();
        this.currentSearchTerm = searchTerm;
        this.searchResults.clear();
        this.isSearchActive = true;

        // --- Robust: 暫時停用 entry range 過濾 ---
        let rangeWasActive = false;
        if (this.app && this.app.dataFilters && typeof this.app.dataFilters.disableEntryRange === 'function') {
            if (this.app.dataFilters.isEntryRangeEnabled && this.app.dataFilters.isEntryRangeEnabled()) {
                rangeWasActive = true;
                this.app.dataFilters.disableEntryRange();
            }
        }

        try {
            notificationSystem.showInfo(`Searching for "${query}"...`);

            // Get current graph ID from app
            const graphId = this.app && this.app.graphLoader ?
                this.app.graphLoader.getCurrentGraphId() : null;

            if (!graphId) {
                // Fallback to local search if no graph loaded
                await this.performLocalSearch(searchTerm);
                return;
            }

            // Call Django search API
            const response = await fetch(`${CONFIG.apiBaseUrl}/search/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: searchTerm,
                    graph_id: graphId,
                    expand: true  // Get full subgraph around matches
                })
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const searchData = await response.json();

            // Process search results
            const matchingNodeIds = new Set();
            const matchingEdgeIds = new Set();
            const matchingEntryIndices = new Set();

            // Process matched nodes
            if (searchData.matched_nodes && Array.isArray(searchData.matched_nodes)) {
                searchData.matched_nodes.forEach(node => {
                    const nodeItem = {
                        type: 'node',
                        id: node.id.toString(),
                        label: node.name,
                        nodeType: node.type
                    };
                    this.searchResults.add(nodeItem);
                    matchingNodeIds.add(node.id.toString());
                });
            }

            // Process matched edges
            if (searchData.matched_edges && Array.isArray(searchData.matched_edges)) {
                searchData.matched_edges.forEach(edge => {
                    const edgeItem = {
                        type: 'edge',
                        id: edge.id ? edge.id.toString() : `${edge.src}-${edge.dst}`,
                        src: edge.src.toString(),
                        dst: edge.dst.toString(),
                        operation: edge.operation,
                        entry_index: edge.entry_index
                    };
                    this.searchResults.add(edgeItem);
                    matchingEdgeIds.add(edgeItem.id);
                    if (edge.entry_index) {
                        matchingEntryIndices.add(edge.entry_index);
                    }
                });
            }

            // Disable entry range controls during search
            this.toggleRangeControls(false);

            // If we have matching entries and app supports search filter, reload data
            if (this.app && matchingEntryIndices.size > 0) {
                await this.app.applySearchFilter(Array.from(matchingEntryIndices));
            }

            // Update visualization
            this.highlightSearchResults();

            // Update UI
            const resultCount = this.searchResults.size;
            const totalNodes = searchData.matched_nodes ? searchData.matched_nodes.length : 0;
            const totalEdges = searchData.matched_edges ? searchData.matched_edges.length : 0;

            // Update result info display
            this.updateSearchResultInfo(resultCount, resultCount, query);

            if (resultCount > 0) {
                notificationSystem.showSuccess(
                    `Found ${totalNodes} node${totalNodes === 1 ? '' : 's'} and ${totalEdges} edge${totalEdges === 1 ? '' : 's'} ` +
                    `matching "${query}"`
                );
            } else {
                notificationSystem.showInfo(`No results found for "${query}"`);
            }

            // Update filter text
            const modeText = this.searchMode === 'filter' ? 'Filtered' : 'Highlighted';
            notificationSystem.updateFilter(`Search: "${query}" (${resultCount} ${modeText})`);

        } catch (error) {
            console.error('Search error:', error);
            notificationSystem.showError(`Search failed: ${error.message}`);

            // Fallback to local search
            console.log('Falling back to local search...');
            await this.performLocalSearch(searchTerm);
        } finally {
            // 搜尋結束後恢復 entry range 狀態
            if (rangeWasActive && this.app && this.app.dataFilters && typeof this.app.dataFilters.enableEntryRange === 'function') {
                this.app.dataFilters.enableEntryRange();
            }
        }
    }
    
    /**
     * Perform local search (fallback when API unavailable)
     * @param {string} searchTerm - Search term
     */
    async performLocalSearch(searchTerm) {
        // Parse search query for special patterns
        const searchPatterns = SearchUtils.parseSearchQuery(searchTerm);

        // Search in raw data index (complete dataset)
        const matchingEntryIndices = new Set();
        const matchingNodeIds = new Set();
        const useRawIndex = this.rawDataIndex.size > 0;
        const searchSource = useRawIndex ? this.rawDataIndex : this.searchIndex;

        // Find all matching edges and collect their entry indices
        for (const [key, item] of searchSource) {
            if (SearchUtils.matchesSearchPatterns(item, searchPatterns)) {
                this.searchResults.add(item);
                
                // Collect entry index for edges to get complete raw events
                if (item.type === 'edge' && item.entry_index) {
                    matchingEntryIndices.add(item.entry_index);
                }
                
                // Collect node IDs
                if (item.type === 'node') {
                    matchingNodeIds.add(item.id);
                }
                
                // Stop if we've reached the maximum number of results
                if (this.searchResults.size >= this.maxSearchResults) {
                    break;
                }
            }
        }

        // Disable entry range controls during search
        this.toggleRangeControls(false);

        // Notify app to reload with search filter (no entry range limit)
        if (this.app && matchingEntryIndices.size > 0) {
            await this.app.applySearchFilter(Array.from(matchingEntryIndices));
        }

        // Update visualization
        this.highlightSearchResults();

        // Update UI
        const resultCount = this.searchResults.size;
        const totalMatches = SearchUtils.countTotalMatches(searchPatterns, searchSource);
        
        // Update result info display
        this.updateSearchResultInfo(resultCount, totalMatches, searchTerm);
        
        if (resultCount > 0) {
            if (totalMatches > this.maxSearchResults) {
                notificationSystem.showInfo(
                    `Showing ${resultCount} of ${totalMatches}+ results for "${searchTerm}". ` +
                    `Results span entire dataset (range filter disabled).`
                );
            } else {
                notificationSystem.showSuccess(
                    `Found ${resultCount} result${resultCount === 1 ? '' : 's'} for "${searchTerm}". ` +
                    `Showing all matches from entire dataset.`
                );
            }
        } else {
            notificationSystem.showInfo(`No results found for "${searchTerm}"`);
        }

        // Update filter text
        const modeText = this.searchMode === 'filter' ? 'Filtered' : 'Highlighted';
        notificationSystem.updateFilter(`Search: "${searchTerm}" (${resultCount} ${modeText})`);
    }

    /**
     * Update search result info display
     * @param {number} resultCount - Number of results shown
     * @param {number} totalMatches - Total matches found
     * @param {string} query - Search query
     */
    updateSearchResultInfo(resultCount, totalMatches, query) {
        // Update modal result info
        const resultInfo = DOMHelper.getElementById('search-result-info');
        const resultText = DOMHelper.getElementById('search-result-text');
        
        // Update header result info
        const resultInfoHeader = DOMHelper.getElementById('search-result-info-header');
        const resultTextHeader = DOMHelper.getElementById('search-result-text-header');
        
        if (resultCount > 0) {
            let message = `<strong>✓ ${resultCount} Result${resultCount === 1 ? '' : 's'} Found</strong>`;
            if (totalMatches > this.maxSearchResults) {
                message += ` <em>(showing first ${resultCount} of ${totalMatches}+ total matches)</em>`;
            }
            message += `<br>Search: <code>"${query}"</code>`;
            
            if (this.searchMode === 'filter') {
                message += '<br><small>📌 Filter Mode: Showing only matching nodes/edges</small>';
            } else {
                message += '<br><small>💡 Matches highlighted in gold. Enable "Search Filter Mode" to show only results.</small>';
            }
            
            // Simple message for header
            const headerMessage = `🔍 Found ${resultCount} result${resultCount === 1 ? '' : 's'} for "${query}" - <strong>Showing all matching events from entire dataset</strong>`;
            
            if (resultInfo && resultText) {
                resultInfo.style.display = 'block';
                resultText.innerHTML = message;
            }
            
            if (resultInfoHeader && resultTextHeader) {
                resultInfoHeader.style.display = 'block';
                resultTextHeader.innerHTML = headerMessage;
            }
        } else {
            const message = `<strong>⚠ No Results</strong><br>Search: <code>"${query}"</code><br><small>Try different search terms or patterns</small>`;
            const headerMessage = `⚠ No results found for "${query}"`;
            
            if (resultInfo && resultText) {
                resultInfo.style.display = 'block';
                resultText.innerHTML = message;
            }
            
            if (resultInfoHeader && resultTextHeader) {
                resultInfoHeader.style.display = 'block';
                resultTextHeader.innerHTML = headerMessage;
            }
        }
    }

    /**
     * Highlight search results in the visualization
     */
    highlightSearchResults() {
        if (!this.visualization.network) return;

        const nodeIds = SearchUtils.extractNodeIds(this.searchResults);
        const edgeIds = SearchUtils.extractEdgeIds(this.searchResults);

        const isFilterMode = this.searchMode === 'filter';

        // Update node colors and visibility
        const nodes = this.visualization.network.body.data.nodes;
        const allNodeIds = nodes.getIds();

        const nodeUpdates = [];
        allNodeIds.forEach(nodeId => {
            const node = nodes.get(nodeId);
            if (node) {
                const isHighlighted = nodeIds.includes(nodeId);
                const update = { id: nodeId };
                
                // Store original properties if not already stored
                if (!node.originalColor && node.color) {
                    node.originalColor = node.color;
                }
                if (node.originalHidden === undefined) {
                    node.originalHidden = node.hidden || false;
                }

                if (isFilterMode) {
                    // Filter mode: hide non-matching nodes
                    update.hidden = !isHighlighted;
                } else {
                    // Highlight mode: show all but highlight matches
                    update.hidden = false;
                    
                    if (isHighlighted) {
                        update.color = {
                            background: '#FFD700', // Gold
                            border: '#FFA500', // Orange
                            highlight: {
                                background: '#FFED4E',
                                border: '#FF8C00'
                            }
                        };
                        update.borderWidth = 3;
                    } else {
                        update.color = node.originalColor || node.color;
                        update.borderWidth = 1;
                    }
                }
                
                nodeUpdates.push(update);
            }
        });
        
        if (nodeUpdates.length > 0) {
            nodes.update(nodeUpdates);
        }

        // Update edge colors and visibility
        const edges = this.visualization.network.body.data.edges;
        const allEdgeIds = edges.getIds();

        const edgeUpdates = [];
        allEdgeIds.forEach(edgeId => {
            const edge = edges.get(edgeId);
            if (edge) {
                const isHighlighted = edgeIds.includes(edgeId);
                const update = { id: edgeId };
                
                // Store original properties if not already stored
                if (!edge.originalColor && edge.color) {
                    edge.originalColor = edge.color;
                }
                if (!edge.originalWidth) {
                    edge.originalWidth = edge.width || 1;
                }
                if (edge.originalHidden === undefined) {
                    edge.originalHidden = edge.hidden || false;
                }

                if (isFilterMode) {
                    // Filter mode: hide non-matching edges
                    update.hidden = !isHighlighted;
                } else {
                    // Highlight mode: show all but highlight matches
                    update.hidden = false;
                    
                    if (isHighlighted) {
                        update.color = {
                            color: '#FF4500', // Red-Orange
                            highlight: '#FF6347' // Tomato
                        };
                        update.width = 3;
                    } else {
                        update.color = edge.originalColor || edge.color;
                        update.width = edge.originalWidth || 1;
                    }
                }
                
                edgeUpdates.push(update);
            }
        });
        
        if (edgeUpdates.length > 0) {
            edges.update(edgeUpdates);
        }

        // Refresh the network
        this.visualization.network.redraw();

        // Focus on search results if any found and in filter mode
        if (nodeIds.length > 0 && isFilterMode) {
            setTimeout(() => {
                if (this.visualization.network) {
                    this.visualization.network.fit({
                        nodes: nodeIds,
                        animation: { duration: 500, easingFunction: 'easeInOutQuad' }
                    });
                }
            }, 100);
        }
    }

    /**
     * Clear search results and highlighting
     */
    async clearSearch() {
        this.searchResults.clear();
        this.currentSearchTerm = '';
        this.isSearchActive = false;

        // Clear search input
        const searchInput = DOMHelper.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
        }

        // Hide result info
        const resultInfo = DOMHelper.getElementById('search-result-info');
        if (resultInfo) {
            resultInfo.style.display = 'none';
        }
        
        const resultInfoHeader = DOMHelper.getElementById('search-result-info-header');
        if (resultInfoHeader) {
            resultInfoHeader.style.display = 'none';
        }

        // Re-enable entry range controls
        this.toggleRangeControls(true);

        // Notify app to restore normal range filtering
        if (this.app) {
            await this.app.clearSearchFilter();
        }

        // Restore all nodes and edges to original state
        if (this.visualization.network) {
            const nodes = this.visualization.network.body.data.nodes;
            const edges = this.visualization.network.body.data.edges;
            
            // Restore nodes
            const allNodeIds = nodes.getIds();
            const nodeUpdates = [];
            allNodeIds.forEach(nodeId => {
                const node = nodes.get(nodeId);
                if (node) {
                    const update = { id: nodeId };
                    update.hidden = node.originalHidden || false;
                    update.color = node.originalColor || node.color;
                    update.borderWidth = 1;
                    nodeUpdates.push(update);
                }
            });
            if (nodeUpdates.length > 0) {
                nodes.update(nodeUpdates);
            }
            
            // Restore edges
            const allEdgeIds = edges.getIds();
            const edgeUpdates = [];
            allEdgeIds.forEach(edgeId => {
                const edge = edges.get(edgeId);
                if (edge) {
                    const update = { id: edgeId };
                    update.hidden = edge.originalHidden || false;
                    update.color = edge.originalColor || edge.color;
                    update.width = edge.originalWidth || 1;
                    edgeUpdates.push(update);
                }
            });
            if (edgeUpdates.length > 0) {
                edges.update(edgeUpdates);
            }
            
            this.visualization.network.redraw();
        }

        // Update UI
        notificationSystem.updateFilter('None');
        notificationSystem.showInfo('Search cleared - restored to range view');
    }

    /**
     * Get search suggestions based on current input
     * @param {string} query - Partial search query
     * @returns {Array<string>} Array of suggestions
     */
    getSearchSuggestions(query) {
        return SearchUtils.getSearchSuggestions(query, this.searchIndex, 10);
    }

    /**
     * Toggle entry range controls enabled/disabled state
     * @param {boolean} enabled - Whether controls should be enabled
     */
    toggleRangeControls(enabled) {
        const rangeControls = [
            'entry-start',
            'entry-end',
            'apply-range-btn',
            'last-window-btn',
            'next-window-btn'
        ];

        rangeControls.forEach(id => {
            const element = DOMHelper.getElementById(id);
            if (element) {
                element.disabled = !enabled;
                if (!enabled) {
                    element.style.opacity = '0.5';
                    element.style.cursor = 'not-allowed';
                } else {
                    element.style.opacity = '1';
                    element.style.cursor = '';
                }
            }
        });

        // Also disable preset buttons
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.disabled = !enabled;
            if (!enabled) {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '1';
                btn.style.cursor = '';
            }
        });

        // Add visual indicator
        const rangeNav = document.querySelector('.range-controls');
        if (rangeNav) {
            if (!enabled) {
                rangeNav.classList.add('search-active');
                // Add info message if not already present
                let searchInfo = document.getElementById('search-range-info');
                if (!searchInfo) {
                    searchInfo = document.createElement('div');
                    searchInfo.id = 'search-range-info';
                    searchInfo.className = 'search-range-info';
                    searchInfo.innerHTML = '🔍 <strong>Search Active:</strong> Entry range filter disabled - showing all matching events from entire dataset';
                    rangeNav.insertBefore(searchInfo, rangeNav.firstChild);
                }
            } else {
                rangeNav.classList.remove('search-active');
                const searchInfo = document.getElementById('search-range-info');
                if (searchInfo) {
                    searchInfo.remove();
                }
            }
        }
    }
}

export default Search;