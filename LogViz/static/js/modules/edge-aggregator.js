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
        const src = edge.src ?? edge.from;
        const dst = edge.dst ?? edge.to;
        const op = edge.operation ?? 'Unknown';
        const key = `${src}-${dst}-${op}`;

        if (combinedMap.has(key)) {
            const existing = combinedMap.get(key);
            existing.combined_count += 1;
            existing.original_edges.push(edge);
            if (edge.line_id !== undefined) existing.line_ids.push(edge.line_id);
            if (edge.entry_index !== undefined) existing.entry_indices.push(edge.entry_index);
            if (edge.timestamp !== undefined) {
                existing.timestamps.push(edge.timestamp);
                existing.timestamp_min = Math.min(existing.timestamp_min ?? edge.timestamp, edge.timestamp);
                existing.timestamp_max = Math.max(existing.timestamp_max ?? edge.timestamp, edge.timestamp);
            }

            if (edge.sequence_group_id && !existing.sequence_group_id) {
                existing.sequence_group_id = edge.sequence_group_id;
                existing.sequence_color = edge.sequence_color;
                existing.sequence_pattern = edge.sequence_pattern;
            }
        } else {
            combinedMap.set(key, {
                ...edge,
                id: key,
                from: src,
                to: dst,
                src,
                dst,
                operation: op,
                combined_count: 1,
                original_edges: [edge],
                line_ids: edge.line_id !== undefined ? [edge.line_id] : [],
                entry_indices: edge.entry_index !== undefined ? [edge.entry_index] : [],
                timestamps: edge.timestamp !== undefined ? [edge.timestamp] : [],
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
                if (edge.entry_indices.length) {
                    edge.entry_index = Math.min(...edge.entry_indices);
                }
            }
            return edge;
        })
        .sort((a, b) => {
            const ae = a.entry_index ?? Number.MAX_SAFE_INTEGER;
            const be = b.entry_index ?? Number.MAX_SAFE_INTEGER;
            return ae - be;
        });
}
