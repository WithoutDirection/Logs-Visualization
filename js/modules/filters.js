/**
 * Data Filters Module
 * Handles all data filtering logic for the visualization
 */

import DOMHelper from './dom-helper.js';
import { CONFIG } from '../config.js';
import { combineEdgesByOperation } from './edge-aggregator.js';

class DataFilters {
    constructor() {
        this.defaultFilters = {
            entry_range: [1, 100],
            sequence_grouping: true,
            reapr_analysis: false,
            confidence_threshold: 0.5,
            combine_edges: false,
            node_types: {
                'Process': true,
                'File': true,
                'Registry': true,
                'Network': true
            }
        };
    }

    /**
     * Apply all filters to raw data
     * @param {Object} data - Raw graph data
     * @param {Array<number>} searchEntryIndices - Entry indices from search (if search active)
     * @returns {Object} Filtered data
     */
    applyFilters(data, searchEntryIndices = null) {
        if (!data) return null;

        const showSequenceGrouping = DOMHelper.isChecked('sequence-grouping');
        const showReapr = DOMHelper.isChecked('reapr-analysis');
        const confidenceThreshold = DOMHelper.getIntValueById('confidence-slider', 50) / 100;
        const combineEdges = DOMHelper.isChecked('combine-edges');

        let filteredEdges;
        let entryRange;

        // If search is active, use search entry indices instead of range
        if (searchEntryIndices && searchEntryIndices.length > 0) {
            const entrySet = new Set(searchEntryIndices);
            filteredEdges = data.edges.filter(edge => 
                entrySet.has(edge.entry_index)
            );
            entryRange = [Math.min(...searchEntryIndices), Math.max(...searchEntryIndices)];
        } else {
            // Normal range filtering
            const startEntry = DOMHelper.getIntValueById('entry-start', 1);
            const endEntry = DOMHelper.getIntValueById('entry-end', data.total_entries);
            filteredEdges = data.edges.filter(edge => 
                edge.entry_index >= startEntry && edge.entry_index <= endEntry
            );
            entryRange = [startEntry, endEntry];
        }

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
            'Process': DOMHelper.isChecked('show-process'),
            'File': DOMHelper.isChecked('show-file'),
            'Registry': DOMHelper.isChecked('show-registry'),
            'Network': DOMHelper.isChecked('show-network')
        };

        const filteredNodes = data.nodes.filter(node => 
            involvedNodeIds.has(node.id) && nodeTypeFilters[node.type]
        );

        return {
            ...data,
            nodes: filteredNodes,
            edges: filteredEdges,
            filters_applied: {
                entry_range: entryRange,
                search_active: searchEntryIndices !== null && searchEntryIndices.length > 0,
                sequence_grouping: showSequenceGrouping,
                reapr_analysis: showReapr,
                confidence_threshold: confidenceThreshold,
                node_types: nodeTypeFilters,
                combine_edges: combineEdges
            }
        };
    }

    /**
     * Get current filter state
     * @returns {Object} Current filter configuration
     */
    getCurrentFilterState() {
        return {
            entry_range: [
                DOMHelper.getIntValueById('entry-start', 1),
                DOMHelper.getIntValueById('entry-end', 100)
            ],
            sequence_grouping: DOMHelper.isChecked('sequence-grouping'),
            reapr_analysis: DOMHelper.isChecked('reapr-analysis'),
            confidence_threshold: DOMHelper.getIntValueById('confidence-slider', 50) / 100,
            combine_edges: DOMHelper.isChecked('combine-edges'),
            node_types: {
                'Process': DOMHelper.isChecked('show-process'),
                'File': DOMHelper.isChecked('show-file'),
                'Registry': DOMHelper.isChecked('show-registry'),
                'Network': DOMHelper.isChecked('show-network')
            }
        };
    }

    /**
     * Validate entry range
     * @param {number} start - Start entry
     * @param {number} end - End entry
     * @returns {Object} Validation result
     */
    validateEntryRange(start, end) {
        if (start > end) {
            return {
                valid: false,
                message: 'Start entry must be less than or equal to end entry'
            };
        }
        
        if (end - start > CONFIG.maxEntryRange) {
            return {
                valid: false,
                message: `Range too large! Maximum ${CONFIG.maxEntryRange} entries allowed`
            };
        }
        
        return { valid: true };
    }

    /**
     * Reset filters to default values
     */
    resetFilters() {
        DOMHelper.setValueById('entry-start', this.defaultFilters.entry_range[0]);
        DOMHelper.setValueById('entry-end', this.defaultFilters.entry_range[1]);
        DOMHelper.setChecked('sequence-grouping', this.defaultFilters.sequence_grouping);
        DOMHelper.setChecked('reapr-analysis', this.defaultFilters.reapr_analysis);
        DOMHelper.setValueById('confidence-slider', this.defaultFilters.confidence_threshold * 100);
        DOMHelper.setChecked('combine-edges', this.defaultFilters.combine_edges);
        
        Object.entries(this.defaultFilters.node_types).forEach(([type, checked]) => {
            const id = `show-${type.toLowerCase()}`;
            DOMHelper.setChecked(id, checked);
        });
    }
}

export default DataFilters;