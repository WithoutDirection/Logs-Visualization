/**
 * Edge aggregation helpers used by filters and visualization.
 */

/**
 * Combine edges with identical source, destination, and operation.
 * @param {Array} edges
 * @returns {Array}
 */
export function combineEdgesByOperation(edges = []) {
    const combinedMap = new Map();

    edges.forEach(edge => {
        const key = `${edge.src}-${edge.dst}-${edge.operation}`;

        if (combinedMap.has(key)) {
            const existing = combinedMap.get(key);
            existing.combined_count += 1;
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
            combinedMap.set(key, {
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
            });
        }
    });

    return Array.from(combinedMap.values())
        .map(edge => {
            if (edge.combined_count > 1) {
                edge.is_combined = true;
                edge.entry_index = Math.min(...edge.entry_indices);
            }
            return edge;
        })
        .sort((a, b) => a.entry_index - b.entry_index);
}
