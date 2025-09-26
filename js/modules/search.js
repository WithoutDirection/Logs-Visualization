/**
 * Search Module
 * Handles searching and highlighting nodes/edges in the graph
 */

import { CONFIG } from '../config.js';
import DOMHelper from './dom-helper.js';
import notificationSystem from './notifications.js';

class Search {
    constructor(visualization) {
        this.visualization = visualization;
        this.searchResults = new Set();
        this.currentSearchTerm = '';
        this.searchIndex = new Map(); // node/edge id -> searchable text
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
    }

    /**
     * Build search index from graph data
     * @param {Object} data - Graph data containing nodes and edges
     */
    buildSearchIndex(data) {
        this.searchIndex.clear();

        if (!data) return;

        // Index nodes
        data.nodes.forEach(node => {
            const searchableText = [
                node.label,
                node.id,
                node.type,
                node.title || ''
            ].join(' ').toLowerCase();

            this.searchIndex.set(`node-${node.id}`, {
                type: 'node',
                id: node.id,
                text: searchableText,
                data: node
            });
        });

        // Index edges
        data.edges.forEach(edge => {
            const searchableText = [
                edge.operation,
                edge.src,
                edge.dst,
                edge.title || '',
                edge.metadata || ''
            ].join(' ').toLowerCase();

            this.searchIndex.set(`edge-${edge.id || `${edge.src}-${edge.dst}`}`, {
                type: 'edge',
                id: edge.id || `${edge.src}-${edge.dst}`,
                text: searchableText,
                data: edge
            });
        });
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
    performSearch(query) {
        if (!query || query.trim().length === 0) {
            this.clearSearch();
            return;
        }

        const searchTerm = query.trim().toLowerCase();
        this.searchResults.clear();

        // Find matches
        for (const [key, item] of this.searchIndex) {
            if (item.text.includes(searchTerm)) {
                this.searchResults.add(item);
            }
        }

        // Update visualization
        this.highlightSearchResults();

        // Update UI
        const resultCount = this.searchResults.size;
        if (resultCount > 0) {
            notificationSystem.showSuccess(`Found ${resultCount} result${resultCount === 1 ? '' : 's'} for "${query}"`);
        } else {
            notificationSystem.showInfo(`No results found for "${query}"`);
        }

        // Update filter text
        notificationSystem.updateFilter(`Search: "${query}" (${resultCount} results)`);
    }

    /**
     * Highlight search results in the visualization
     */
    highlightSearchResults() {
        if (!this.visualization.network) return;

        const nodeIds = [];
        const edgeIds = [];

        // Collect IDs of matching nodes and edges
        for (const result of this.searchResults) {
            if (result.type === 'node') {
                nodeIds.push(result.id);
            } else if (result.type === 'edge') {
                edgeIds.push(result.id);
            }
        }

        // Update node colors for highlighting
        const nodes = this.visualization.network.body.data.nodes;
        const allNodeIds = nodes.getIds();

        allNodeIds.forEach(nodeId => {
            const node = nodes.get(nodeId);
            if (node) {
                const isHighlighted = nodeIds.includes(nodeId);
                // Store original color if not already stored
                if (!node.originalColor && node.color) {
                    node.originalColor = node.color;
                }

                // Apply highlight color
                if (isHighlighted) {
                    node.color = {
                        background: '#FFD700', // Gold
                        border: '#FFA500' // Orange
                    };
                } else {
                    // Restore original color
                    node.color = node.originalColor || node.color;
                }
            }
        });

        // Update edge colors for highlighting
        const edges = this.visualization.network.body.data.edges;
        const allEdgeIds = edges.getIds();

        allEdgeIds.forEach(edgeId => {
            const edge = edges.get(edgeId);
            if (edge) {
                const isHighlighted = edgeIds.includes(edgeId);
                // Store original color if not already stored
                if (!edge.originalColor && edge.color) {
                    edge.originalColor = edge.color;
                }

                // Apply highlight color
                if (isHighlighted) {
                    edge.color = {
                        color: '#FF4500', // Red-Orange
                        highlight: '#FF6347' // Tomato
                    };
                    edge.width = 3;
                } else {
                    // Restore original color and width
                    edge.color = edge.originalColor || edge.color;
                    edge.width = edge.originalWidth || 1;
                }
            }
        });

        // Refresh the network
        this.visualization.network.redraw();

        // Focus on search results if any found
        if (nodeIds.length > 0) {
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
    clearSearch() {
        this.searchResults.clear();
        this.currentSearchTerm = '';

        // Clear search input
        const searchInput = DOMHelper.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
        }

        // Remove highlighting
        this.highlightSearchResults();

        // Update UI
        notificationSystem.updateFilter('None');
        notificationSystem.showInfo('Search cleared');
    }

    /**
     * Get search suggestions based on current input
     * @param {string} query - Partial search query
     * @returns {Array<string>} Array of suggestions
     */
    getSearchSuggestions(query) {
        if (!query || query.length < 1) return [];

        const suggestions = new Set();
        const lowerQuery = query.toLowerCase();

        for (const item of this.searchIndex.values()) {
            // Find words that start with the query
            const words = item.text.split(/\s+/);
            words.forEach(word => {
                if (word.startsWith(lowerQuery) && word.length > lowerQuery.length) {
                    suggestions.add(word);
                }
            });
        }

        return Array.from(suggestions).slice(0, 10); // Limit to 10 suggestions
    }
}

export default Search;