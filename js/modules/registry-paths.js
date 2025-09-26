/**
 * Registry path utilities
 * Extracted from visualization module to keep pure data helpers.
 */

/**
 * Generate mapping of registry node IDs to their original and shortened labels.
 * @param {Array} nodes - Array of graph nodes.
 * @returns {Object} Mapping keyed by node id: { original, shortened, needsOptimization }
 */
export function createRegistryPathMapping(nodes = []) {
    const registryNodes = nodes.filter(node => node.type === 'Registry');
    const pathMapping = {};

    if (registryNodes.length < 2) {
        registryNodes.forEach(node => {
            pathMapping[node.id] = {
                original: node.label,
                shortened: node.label,
                needsOptimization: false
            };
        });
        return pathMapping;
    }

    const rootGroups = groupByRootKey(registryNodes);

    Object.values(rootGroups).forEach(group => {
        if (group.length < 2) {
            group.forEach(entry => {
                pathMapping[entry.id] = {
                    original: entry.label,
                    shortened: entry.label,
                    needsOptimization: false
                };
            });
            return;
        }

        const prefixes = findCommonPrefixes(group);
        group.forEach(entry => {
            const shortened = createShortenedLabel(entry, prefixes);
            pathMapping[entry.id] = {
                original: entry.label,
                shortened,
                needsOptimization: shortened !== entry.label
            };
        });
    });

    return pathMapping;
}

function groupByRootKey(registryNodes) {
    return registryNodes.reduce((groups, node) => {
        const parts = node.label.split('\\');
        const rootKey = parts[0];
        if (!groups[rootKey]) {
            groups[rootKey] = [];
        }
        groups[rootKey].push({
            id: node.id,
            label: node.label,
            parts
        });
        return groups;
    }, {});
}

function findCommonPrefixes(group) {
    const prefixMap = new Map();

    for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
            const path1 = group[i].parts;
            const path2 = group[j].parts;
            let commonLength = 0;
            const minLength = Math.min(path1.length, path2.length);

            for (let k = 0; k < minLength - 1; k++) {
                if (path1[k] === path2[k]) {
                    commonLength = k + 1;
                } else {
                    break;
                }
            }

            if (commonLength >= 2) {
                const prefixKey = path1.slice(0, commonLength).join('\\');
                if (!prefixMap.has(prefixKey)) {
                    prefixMap.set(prefixKey, new Set());
                }
                prefixMap.get(prefixKey).add(group[i].id);
                prefixMap.get(prefixKey).add(group[j].id);
            }
        }
    }

    return Array.from(prefixMap.entries())
        .map(([prefix, nodeIds]) => ({
            prefix,
            nodeIds: Array.from(nodeIds),
            length: prefix.split('\\').length
        }))
        .sort((a, b) => b.length - a.length);
}

function createShortenedLabel(nodeEntry, prefixes) {
    const { label: originalPath, parts, id } = nodeEntry;

    for (const prefixInfo of prefixes) {
        if (prefixInfo.nodeIds.includes(id) && prefixInfo.nodeIds.length >= 2) {
            const prefixParts = prefixInfo.prefix.split('\\');

            if (parts.length > prefixParts.length + 1) {
                const rootPart = parts[0];
                const remainingParts = parts.slice(prefixParts.length);
                return `${rootPart}\\~\\${remainingParts.join('\\')}`;
            }
        }
    }

    return originalPath;
}

/**
 * Decide which label should be displayed for a registry node based on selection state.
 * @param {string} nodeId
 * @param {Object} mapping - Output from createRegistryPathMapping.
 * @param {boolean} isSelected
 * @returns {string|undefined}
 */
export function getRegistryLabel(nodeId, mapping, isSelected) {
    const info = mapping?.[nodeId];
    if (!info) return undefined;
    return isSelected ? info.original : info.shortened;
}
