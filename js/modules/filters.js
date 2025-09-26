/**
 * Data Filters Module
 * Handles all data filtering logic for the visualization
 */

import DOMHelper from './dom-helper.js';
import { CONFIG } from '../config.js';

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
     * @returns {Object} Filtered data
     */
    applyFilters(data) {
        if (!data) return null;

        const startEntry = DOMHelper.getIntValueById('entry-start', 1);
        const endEntry = DOMHelper.getIntValueById('entry-end', data.total_entries);
        const showSequenceGrouping = DOMHelper.isChecked('sequence-grouping');
        const showReapr = DOMHelper.isChecked('reapr-analysis');
        const confidenceThreshold = DOMHelper.getIntValueById('confidence-slider', 50) / 100;
        const combineEdges = DOMHelper.isChecked('combine-edges');

        // Filter edges by entry range
        let filteredEdges = data.edges.filter(edge => 
            edge.entry_index >= startEntry && edge.entry_index <= endEntry
        );

        // Apply edge combination if enabled
        if (combineEdges) {
            filteredEdges = this.combineEdgesByOperation(filteredEdges);
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
                entry_range: [startEntry, endEntry],
                sequence_grouping: showSequenceGrouping,
                reapr_analysis: showReapr,
                confidence_threshold: confidenceThreshold,
                node_types: nodeTypeFilters,
                combine_edges: combineEdges
            }
        };
    }

    /**
     * Combine edges with same operation between same nodes
     * @param {Array} edges - Array of edges
     * @returns {Array} Combined edges
     */
    combineEdgesByOperation(edges) {
        const combinedMap = new Map();
        
        edges.forEach(edge => {
            const key = `${edge.src}-${edge.dst}-${edge.operation}`;
            
            if (combinedMap.has(key)) {
                const existing = combinedMap.get(key);
                existing.combined_count++;
                existing.original_edges.push(edge);
                existing.line_ids.push(edge.line_id);
                existing.entry_indices.push(edge.entry_index);
                existing.timestamps.push(edge.timestamp);
                
                existing.timestamp_min = Math.min(existing.timestamp_min, edge.timestamp);
                existing.timestamp_max = Math.max(existing.timestamp_max, edge.timestamp);
                
                if (edge.sequence_group_id && !existing.sequence_group_id) {
                    existing.sequence_group_id = edge.sequence_group_id;
                    existing.sequence_color = edge.sequence_color;
                    existing.sequence_pattern = edge.sequence_pattern;
                }
            } else {
                const combinedEdge = {
                    ...edge,
                    id: key,
                    combined_count: 1,
                    original_edges: [edge],
                    line_ids: [edge.line_id],
                    entry_indices: [edge.entry_index],
                    timestamps: [edge.timestamp],
                    timestamp_min: edge.timestamp,
                    timestamp_max: edge.timestamp,
                    is_combined: false
                };
                combinedMap.set(key, combinedEdge);
            }
        });
        
        const combinedEdges = Array.from(combinedMap.values()).map(edge => {
            if (edge.combined_count > 1) {
                edge.is_combined = true;
                edge.entry_index = Math.min(...edge.entry_indices);
            }
            return edge;
        });
        
        return combinedEdges.sort((a, b) => a.entry_index - b.entry_index);
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