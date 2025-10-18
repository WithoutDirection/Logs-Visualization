// Test file to check if config is loaded correctly
import { CONFIG } from './config.js';

console.log('=== CONFIG TEST ===');
console.log('API Base URL:', CONFIG.apiBaseUrl);
console.log('Expected: /api');
console.log('Match:', CONFIG.apiBaseUrl === '/api' ? '✅ CORRECT' : '❌ WRONG');
console.log('==================');

// Test API endpoint
fetch(`${CONFIG.apiBaseUrl}/datasets/`)
    .then(response => {
        console.log('API Response Status:', response.status);
        console.log('API URL:', response.url);
        return response.json();
    })
    .then(data => {
        console.log('API Data:', data);
    })
    .catch(error => {
        console.error('API Error:', error);
    });
