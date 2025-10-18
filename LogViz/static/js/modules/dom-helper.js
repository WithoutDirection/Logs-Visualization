/**
 * DOM Helper Utilities
 * Provides a clean interface for DOM manipulation and reduces repetitive code
 */

class DOMHelper {
    /**
     * Get element by ID with error handling
     * @param {string} id - Element ID
     * @param {boolean} suppressWarning - Suppress warning if element not found
     * @returns {HTMLElement|null} Element or null if not found
     */
    static getElementById(id, suppressWarning = false) {
        const element = document.getElementById(id);
        if (!element && !suppressWarning) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    }

    /**
     * Get element value by ID
     * @param {string} id - Element ID
     * @param {*} defaultValue - Default value if element not found or has no value
     * @returns {*} Element value or default
     */
    static getValueById(id, defaultValue = '') {
        const element = this.getElementById(id);
        return element ? element.value : defaultValue;
    }

    /**
     * Set element value by ID
     * @param {string} id - Element ID
     * @param {*} value - Value to set
     * @returns {boolean} Success status
     */
    static setValueById(id, value) {
        const element = this.getElementById(id);
        if (element) {
            element.value = value;
            return true;
        }
        return false;
    }

    /**
     * Get element text content by ID
     * @param {string} id - Element ID
     * @param {string} defaultText - Default text if element not found
     * @returns {string} Element text or default
     */
    static getTextById(id, defaultText = '') {
        const element = this.getElementById(id);
        return element ? element.textContent : defaultText;
    }

    /**
     * Set element text content by ID
     * @param {string} id - Element ID
     * @param {string} text - Text to set
     * @returns {boolean} Success status
     */
    static setTextById(id, text) {
        const element = this.getElementById(id);
        if (element) {
            element.textContent = text;
            return true;
        }
        return false;
    }

    /**
     * Check if checkbox/radio button is checked
     * @param {string} id - Element ID
     * @returns {boolean} Checked status
     */
    static isChecked(id) {
        const element = this.getElementById(id);
        return element ? element.checked : false;
    }

    /**
     * Set checkbox/radio button checked status
     * @param {string} id - Element ID
     * @param {boolean} checked - Checked status
     * @returns {boolean} Success status
     */
    static setChecked(id, checked) {
        const element = this.getElementById(id);
        if (element) {
            element.checked = checked;
            return true;
        }
        return false;
    }

    /**
     * Enable/disable element by ID
     * @param {string} id - Element ID
     * @param {boolean} enabled - Enabled status
     * @returns {boolean} Success status
     */
    static setEnabled(id, enabled) {
        const element = this.getElementById(id);
        if (element) {
            element.disabled = !enabled;
            return true;
        }
        return false;
    }

    /**
     * Add event listener to element by ID
     * @param {string} id - Element ID
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @returns {boolean} Success status
     */
    static addEventListener(id, event, handler) {
        const element = this.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
            return true;
        }
        return false;
    }

    /**
     * Add event listeners to multiple elements by IDs
     * @param {Array} configs - Array of {id, event, handler} objects
     * @returns {number} Number of successfully added listeners
     */
    static addEventListeners(configs) {
        let successCount = 0;
        configs.forEach(config => {
            if (this.addEventListener(config.id, config.event, config.handler)) {
                successCount++;
            }
        });
        return successCount;
    }

    /**
     * Show/hide element by ID
     * @param {string} id - Element ID
     * @param {boolean} visible - Visibility status
     * @param {string} displayType - Display type when visible (default: 'block')
     * @returns {boolean} Success status
     */
    static setVisible(id, visible, displayType = 'block') {
        const element = this.getElementById(id);
        if (element) {
            element.style.display = visible ? displayType : 'none';
            return true;
        }
        return false;
    }

    /**
     * Add CSS class to element by ID
     * @param {string} id - Element ID
     * @param {string} className - CSS class name
     * @returns {boolean} Success status
     */
    static addClass(id, className) {
        const element = this.getElementById(id);
        if (element) {
            element.classList.add(className);
            return true;
        }
        return false;
    }

    /**
     * Remove CSS class from element by ID
     * @param {string} id - Element ID
     * @param {string} className - CSS class name
     * @returns {boolean} Success status
     */
    static removeClass(id, className) {
        const element = this.getElementById(id);
        if (element) {
            element.classList.remove(className);
            return true;
        }
        return false;
    }

    /**
     * Toggle CSS class on element by ID
     * @param {string} id - Element ID
     * @param {string} className - CSS class name
     * @returns {boolean} Success status
     */
    static toggleClass(id, className) {
        const element = this.getElementById(id);
        if (element) {
            element.classList.toggle(className);
            return true;
        }
        return false;
    }

    /**
     * Set multiple attributes on element
     * @param {string} id - Element ID
     * @param {Object} attributes - Key-value pairs of attributes
     * @returns {boolean} Success status
     */
    static setAttributes(id, attributes) {
        const element = this.getElementById(id);
        if (element) {
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
            return true;
        }
        return false;
    }

    /**
     * Create element with attributes and content
     * @param {string} tagName - HTML tag name
     * @param {Object} options - Options object
     * @param {Object} options.attributes - Attributes to set
     * @param {string} options.textContent - Text content
     * @param {string} options.innerHTML - HTML content
     * @param {Array} options.classes - CSS classes to add
     * @returns {HTMLElement} Created element
     */
    static createElement(tagName, options = {}) {
        const element = document.createElement(tagName);
        
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (options.classes) {
            element.classList.add(...options.classes);
        }
        
        if (options.textContent) {
            element.textContent = options.textContent;
        } else if (options.innerHTML) {
            element.innerHTML = options.innerHTML;
        }
        
        return element;
    }

    /**
     * Safely parse integer from element value
     * @param {string} id - Element ID
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} Parsed integer or default
     */
    static getIntValueById(id, defaultValue = 0) {
        const value = this.getValueById(id);
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Safely parse float from element value
     * @param {string} id - Element ID
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} Parsed float or default
     */
    static getFloatValueById(id, defaultValue = 0.0) {
        const value = this.getValueById(id);
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
}

export default DOMHelper;