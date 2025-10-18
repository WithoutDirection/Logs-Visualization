/**
 * Notification System
 * Handles all user notifications and status updates
 */

import { CONFIG } from '../config.js';

class NotificationSystem {
    constructor() {
        this.lastUpdateTime = Date.now();
        this.init();
    }

    /**
     * Initialize notification system
     */
    init() {
        // Ensure notification elements exist
        this.ensureNotificationElements();
    }

    /**
     * Ensure required notification elements exist in DOM
     */
    ensureNotificationElements() {
        if (!document.getElementById('notification')) {
            const notification = document.createElement('div');
            notification.id = 'notification';
            notification.className = 'notification';
            document.body.appendChild(notification);
        }
    }

    /**
     * Show a standard notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, warning, info)
     * @param {number} duration - Duration in milliseconds (optional)
     */
    showNotification(message, type = 'success', duration = CONFIG.notificationDuration) {
        // Use graph notification for specific message types
        if (this.isGraphRelatedMessage(message)) {
            this.showGraphNotification(message, type, CONFIG.graphNotificationDuration);
            return;
        }
        
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide after duration
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }

    /**
     * Show a graph-specific notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type
     * @param {number} duration - Duration in milliseconds
     */
    showGraphNotification(message, type = 'info', duration = CONFIG.graphNotificationDuration) {
        const notification = document.createElement('div');
        notification.className = `notification graph-interaction ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide after specified duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    /**
     * Check if message is graph-related and should use graph notification
     * @param {string} message - Message to check
     * @returns {boolean} True if graph-related
     */
    isGraphRelatedMessage(message) {
        const graphKeywords = ['drag', 'node', 'focus', 'physics', 'selection'];
        const lowerMessage = message.toLowerCase();
        return graphKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Update status text
     * @param {string} message - Status message
     */
    updateStatus(message) {
        const statusElement = document.getElementById('status-text');
        if (statusElement) {
            statusElement.textContent = message;
        }
        this.lastUpdateTime = Date.now();
        console.log(`Status: ${message}`);
    }

    /**
     * Update performance indicator
     * @param {string} time - Performance time string
     */
    updatePerformance(time) {
        const performanceElement = document.getElementById('performance-text');
        if (performanceElement) {
            performanceElement.textContent = `Performance: ${time}`;
        }
    }

    /**
     * Update memory usage display
     * @param {number} estimatedMemory - Optional estimated memory usage in MB
     */
    updateMemoryUsage(estimatedMemory = null) {
        let memoryText = '';

        if (estimatedMemory !== null) {
            // Use provided estimated memory
            memoryText = `${estimatedMemory}MB`;
        } else if (performance.memory) {
            // Fall back to browser memory usage
            const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            memoryText = `${used}MB`;
        } else {
            memoryText = '-';
        }

        const memoryElement = document.getElementById('memory-text');
        if (memoryElement) {
            memoryElement.textContent = `Memory: ${memoryText}`;
        }
    }

    /**
     * Update filter status display
     * @param {Object} appliedFilters - Applied filters object
     * @param {Object} currentData - Current data object
     */
    updateFilterStatus(appliedFilters, currentData) {
        const activeFilters = [];
        
        if (appliedFilters.entry_range[0] > 1 || 
            appliedFilters.entry_range[1] < currentData.total_entries) {
            activeFilters.push('Range');
        }
        if (appliedFilters.sequence_grouping) activeFilters.push('Sequence');
        if (appliedFilters.reapr_analysis) activeFilters.push('REAPr');
        if (appliedFilters.combine_edges) activeFilters.push('Combined');
        
        const filterText = activeFilters.length > 0 ? activeFilters.join(', ') : 'None';
        const filterElement = document.getElementById('filter-text');
        if (filterElement) {
            filterElement.textContent = `Filters: ${filterText}`;
        }
    }

    /**
     * Show loading state
     * @param {boolean} show - Whether to show loading
     */
    showLoading(show) {
        const loading = document.getElementById('loading');
        const noGraph = document.querySelector('.no-graph');
        
        if (show) {
            if (loading) loading.style.display = 'block';
            if (noGraph) noGraph.style.display = 'none';
        } else {
            if (loading) loading.style.display = 'none';
        }
    }

    /**
     * Show success notification with icon
     * @param {string} message - Success message
     */
    showSuccess(message) {
        this.showNotification(`✅ ${message}`, 'success');
    }

    /**
     * Show error notification with icon
     * @param {string} message - Error message
     */
    showError(message) {
        this.showNotification(`❌ ${message}`, 'error');
    }

    /**
     * Show warning notification with icon
     * @param {string} message - Warning message
     */
    showWarning(message) {
        this.showNotification(`⚠️ ${message}`, 'warning');
    }

    /**
     * Show info notification with icon
     * @param {string} message - Info message
     */
    showInfo(message) {
        this.showNotification(`ℹ️ ${message}`, 'info');
    }

    /**
     * Clear all notifications
     */
    clearNotifications() {
        // Clear main notification
        const notification = document.getElementById('notification');
        if (notification) {
            notification.classList.remove('show');
        }
        
        // Clear all graph notifications
        const graphNotifications = document.querySelectorAll('.notification.graph-interaction');
        graphNotifications.forEach(notif => {
            notif.classList.remove('show');
            setTimeout(() => {
                if (notif.parentNode) {
                    notif.parentNode.removeChild(notif);
                }
            }, 300);
        });
    }

    /**
     * Show informational tooltip
     * @param {string} content - HTML content for tooltip
     */
    showInfoTooltip(content) {
        // Remove existing tooltip
        const existing = document.getElementById('info-tooltip');
        if (existing) existing.remove();
        
        const tooltip = document.createElement('div');
        tooltip.id = 'info-tooltip';
        tooltip.innerHTML = content;
        tooltip.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 400px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 14px;
            line-height: 1.5;
            border: 1px solid rgba(255,255,255,0.2);
        `;
        
        document.body.appendChild(tooltip);
        
        // Auto-remove after 4 seconds
        setTimeout(() => tooltip.remove(), 4000);
        
        // Remove on click
        tooltip.addEventListener('click', () => tooltip.remove());
    }

    /**
     * Get last update time
     * @returns {number} Timestamp of last update
     */
    getLastUpdateTime() {
        return this.lastUpdateTime;
    }
}

// Create singleton instance
const notificationSystem = new NotificationSystem();

// Start memory usage monitoring
setInterval(() => {
    notificationSystem.updateMemoryUsage();
}, 5000);

export default notificationSystem;