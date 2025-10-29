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

/**
 * Combine only consecutive edges with identical source, destination, and operation.
 * The edges must appear back-to-back in the global ordering (by entry index).
 * @param {Array} edges
 * @returns {Array}
 */
export function combineConsecutiveEdgesByOperation(edges = []) {
    if (!Array.isArray(edges) || edges.length === 0) {
        return [];
    }

    const decorated = edges.map((edge, index) => ({
        edge,
        index,
        entry: Number.isFinite(edge.entry_index) ? edge.entry_index : Number.MAX_SAFE_INTEGER
    }));

    decorated.sort((a, b) => {
        if (a.entry === b.entry) {
            return a.index - b.index;
        }
        return a.entry - b.entry;
    });

    const groups = [];
    let currentGroup = [];
    let lastKey = null;

    const makeKey = (edge) => {
        const src = edge.src ?? edge.from;
        const dst = edge.dst ?? edge.to;
        const op = edge.operation ?? 'Unknown';
        return `${src}-${dst}-${op}`;
    };

    decorated.forEach(({ edge }) => {
        const key = makeKey(edge);
        if (currentGroup.length === 0) {
            currentGroup.push(edge);
            lastKey = key;
            return;
        }

        if (lastKey === key) {
            currentGroup.push(edge);
            return;
        }

        groups.push({ key: lastKey, edges: currentGroup });
        currentGroup = [edge];
        lastKey = key;
    });

    if (currentGroup.length) {
        groups.push({ key: lastKey, edges: currentGroup });
    }

    const aggregated = [];
    const segmentCounts = new Map();

    groups.forEach(group => {
        const { key, edges: groupEdges } = group;

        if (!groupEdges || groupEdges.length === 0) {
            return;
        }

        if (groupEdges.length === 1) {
            aggregated.push(groupEdges[0]);
            return;
        }

        const combined = combineEdgesByOperation(groupEdges);
        if (combined.length > 0) {
            const baseEdge = combined[0];
            const segmentIndex = (segmentCounts.get(key) ?? 0) + 1;
            segmentCounts.set(key, segmentIndex);

            const clonedEdge = {
                ...baseEdge,
                id: `${baseEdge.id || key}-segment-${segmentIndex}`,
                is_consecutive_combined: true,
                consecutive_segment_index: segmentIndex,
                consecutive_segment_length: groupEdges.length
            };

            if (Array.isArray(baseEdge.original_edges)) {
                clonedEdge.original_edges = [...baseEdge.original_edges];
            }
            if (Array.isArray(baseEdge.line_ids)) {
                clonedEdge.line_ids = [...baseEdge.line_ids];
            }
            if (Array.isArray(baseEdge.entry_indices)) {
                clonedEdge.entry_indices = [...baseEdge.entry_indices];
            }
            if (Array.isArray(baseEdge.timestamps)) {
                clonedEdge.timestamps = [...baseEdge.timestamps];
            }

            aggregated.push(clonedEdge);
        }
    });

    aggregated.sort((a, b) => {
        const ae = a.entry_index ?? Number.MAX_SAFE_INTEGER;
        const be = b.entry_index ?? Number.MAX_SAFE_INTEGER;
        if (ae === be) {
            return 0;
        }
        return ae - be;
    });

    return aggregated;
}
