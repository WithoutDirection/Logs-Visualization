/**
 * Configuration settings for the Log Visualization Tool
 */
export const CONFIG = {
    // API Configuration
    apiBaseUrl: './unified_viz_data',
    
    // Performance Settings
    defaultEntryRange: 100,
    maxEntryRange: 10000,
    physicsStabilizationTime: 5000,
    
    // UI Settings
    detailsPanelWidth: '350px',
    notificationDuration: 3000,
    graphNotificationDuration: 2000,
    
    // Node Colors by Type
    nodeColors: {
        'Process': '#90EE90',
        'File': '#DDA0DD', 
        'Registry': '#87CEEB',
        'Network': '#F0E68C',
        'default': '#D3D3D3'
    },
    
    // Visualization Options
    visualization: {
        physics: {
            enabled: true,
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 200,
                springConstant: 0.05
            }
        },
        nodes: {
            defaultSize: 20,
            processSize: 25,
            font: {
                size: 12,
                color: '#000000',
                face: 'Segoe UI',
                strokeWidth: 2,
                strokeColor: '#ffffff'
            },
            borderWidth: 2,
            borderWidthSelected: 3
        },
        edges: {
            defaultWidth: 2,
            font: {
                size: 10,
                face: 'Segoe UI',
                strokeWidth: 2,
                strokeColor: '#ffffff'
            },
            smooth: {
                enabled: true,
                type: 'curvedCW',
                roundness: 0.2
            }
        }
    },
    
    // Keyboard Shortcuts
    keyboardShortcuts: {
        fitView: 'Ctrl+F',
        redraw: 'Ctrl+R',
        clearSelection: 'Escape',
        togglePhysics: 'Space'
    }
};

export default CONFIG;