/**
 * Search Utilities Module
 * Contains helper functions for search operations
 */

/**
 * Parse search query into structured patterns
 * @param {string} query - Raw search query string
 * @returns {Object} Parsed search patterns
 */
export function parseSearchQuery(query) {
    const patterns = {
        operation: null,
        registry: null,
        process: null,
        type: null,
        general: []
    };

    // Split query into terms
    const terms = query.split(/\s+/);

    for (const term of terms) {
        // Check for operation patterns (e.g., "op:RegRead" or just "RegRead")
        if (term.startsWith('op:')) {
            patterns.operation = term.substring(3);
        } 
        // Match any registry/file/network/process operations
        else if (term.match(/^(reg|file|tcp|udp|process)/i) || 
                 term.match(/(read|write|query|set|open|close|create|delete|send|receive|connect|disconnect|start)$/i)) {
            // This is likely an operation search
            patterns.operation = term;
        }
        // Check for registry path patterns
        else if (term.includes('hklm') || term.includes('hkcu') || term.includes('hkcr') || 
                 term.includes('hku') || term.includes('hkey_')) {
            patterns.registry = term;
        }
        // Check for process patterns
        else if (term.startsWith('process:') || term.startsWith('pid:')) {
            patterns.process = term;
        }
        // Check for type filters
        else if (term.startsWith('type:')) {
            patterns.type = term.substring(5);
        }
        // General search term
        else {
            patterns.general.push(term);
        }
    }

    return patterns;
}

/**
 * Check if an item matches the given search patterns
 * @param {Object} item - Search index item (node or edge)
 * @param {Object} patterns - Parsed search patterns
 * @returns {boolean} True if item matches all patterns
 */
export function matchesSearchPatterns(item, patterns) {
    // Check operation pattern
    if (patterns.operation) {
        if (item.type === 'edge' && item.operation) {
            if (!item.operation.includes(patterns.operation.toLowerCase())) {
                return false;
            }
        } else {
            return false; // Operation search only applies to edges
        }
    }

    // Check registry pattern
    if (patterns.registry) {
        // Registry pattern can match nodes or edges
        if (!item.text.includes(patterns.registry)) {
            return false;
        }
    }

    // Check process pattern
    if (patterns.process) {
        if (!item.text.includes(patterns.process.replace('process:', '').replace('pid:', ''))) {
            return false;
        }
    }

    // Check type pattern
    if (patterns.type) {
        if (item.type !== patterns.type && 
            (item.data.type && item.data.type.toLowerCase() !== patterns.type)) {
            return false;
        }
    }

    // Check general patterns (all must match)
    for (const term of patterns.general) {
        if (!item.text.includes(term)) {
            return false;
        }
    }

    return true;
}

/**
 * Build a search index from graph data
 * @param {Object} data - Graph data with nodes and edges
 * @returns {Map} Search index mapping keys to searchable items
 */
export function buildSearchIndex(data) {
    const index = new Map();

    if (!data) return index;

    // Index nodes with comprehensive searchable fields
    data.nodes.forEach(node => {
        const searchableText = [
            node.label,
            node.id,
            node.type,
            node.title || '',
            node.pid ? `pid:${node.pid}` : ''
        ].join(' ').toLowerCase();

        index.set(`node-${node.id}`, {
            type: 'node',
            id: node.id,
            text: searchableText,
            data: node
        });
    });

    // Index edges with comprehensive searchable fields
    data.edges.forEach(edge => {
        // Create comprehensive searchable text for edges including all metadata
        const metadataStr = edge.metadata ? JSON.stringify(edge.metadata) : '';
        const searchableText = [
            edge.operation || '',
            edge.src || '',
            edge.dst || '',
            edge.title || '',
            metadataStr,
            edge.line_id ? `line:${edge.line_id}` : '',
            edge.entry_index ? `entry:${edge.entry_index}` : ''
        ].join(' ').toLowerCase();

        const edgeData = {
            type: 'edge',
            id: edge.id || `${edge.src}-${edge.dst}`,
            text: searchableText,
            data: edge,
            operation: edge.operation ? edge.operation.toLowerCase() : '',
            entry_index: edge.entry_index,
            src: edge.src,
            dst: edge.dst
        };

        index.set(`edge-${edge.id || `${edge.src}-${edge.dst}`}`, edgeData);
    });

    return index;
}

/**
 * Count total matches in an index
 * @param {Object} patterns - Search patterns
 * @param {Map} searchIndex - Index to search
 * @returns {number} Total count of matches
 */
export function countTotalMatches(patterns, searchIndex) {
    let count = 0;
    for (const [key, item] of searchIndex) {
        if (matchesSearchPatterns(item, patterns)) {
            count++;
        }
    }
    return count;
}

/**
 * Extract entry indices from search results
 * @param {Set} searchResults - Set of search result items
 * @returns {Set} Set of entry indices
 */
export function extractEntryIndices(searchResults) {
    const entryIndices = new Set();
    for (const result of searchResults) {
        if (result.type === 'edge' && result.entry_index !== undefined && result.entry_index !== null) {
            entryIndices.add(result.entry_index);
        }
    }
    return entryIndices;
}

/**
 * Extract node IDs from search results
 * @param {Set} searchResults - Set of search result items
 * @returns {Array} Array of node IDs
 */
export function extractNodeIds(searchResults) {
    const nodeIds = [];
    for (const result of searchResults) {
        if (result.type === 'node') {
            nodeIds.push(result.id);
        }
    }
    return nodeIds;
}

/**
 * Extract edge IDs from search results
 * @param {Set} searchResults - Set of search result items
 * @returns {Array} Array of edge IDs
 */
export function extractEdgeIds(searchResults) {
    const edgeIds = [];
    for (const result of searchResults) {
        if (result.type === 'edge') {
            edgeIds.push(result.id);
        }
    }
    return edgeIds;
}

/**
 * Get search suggestions based on partial query
 * @param {string} query - Partial search query
 * @param {Map} searchIndex - Search index to get suggestions from
 * @param {number} maxSuggestions - Maximum number of suggestions to return
 * @returns {Array<string>} Array of suggestion strings
 */
export function getSearchSuggestions(query, searchIndex, maxSuggestions = 10) {
    if (!query || query.length < 1) return [];

    const suggestions = new Set();
    const lowerQuery = query.toLowerCase();

    for (const item of searchIndex.values()) {
        // Find words that start with the query
        const words = item.text.split(/\s+/);
        words.forEach(word => {
            if (word.startsWith(lowerQuery) && word.length > lowerQuery.length) {
                suggestions.add(word);
            }
        });

        if (suggestions.size >= maxSuggestions) {
            break;
        }
    }

    return Array.from(suggestions).slice(0, maxSuggestions);
}
