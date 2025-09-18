#!/usr/bin/env python3
"""
Simple HTTP Server for Unified Log Visualization Tool

This server serves the HTML visualization tool and JSON data files.
It includes CORS headers to allow local file access.
"""

import http.server
import socketserver
import os
import sys
from urllib.parse import urlparse, parse_qs

class VisualizationHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom HTTP handler that serves visualization files with proper CORS headers
    """
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Serve the main HTML file at root
        if path == '/' or path == '/index.html':
            self.path = '/unified_log_visualization.html'
        
        # Serve JSON data files from unified_viz_data directory
        elif path.startswith('/unified_viz_data/'):
            # The path is already correct, just serve it
            pass
        
        # Serve other static files as normal
        return super().do_GET()
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS"""
        self.send_response(200)
        self.end_headers()

def start_server(port=8000, directory='.'):
    """Start the HTTP server"""
    
    # Change to the specified directory
    original_dir = os.getcwd()
    os.chdir(directory)
    
    try:
        with socketserver.TCPServer(("", port), VisualizationHTTPHandler) as httpd:
            print(f"""
? Unified Log Visualization Server Starting
{'='*50}

? Serving directory: {os.path.abspath(directory)}
? Server URL: http://localhost:{port}
? Visualization: http://localhost:{port}/
? Data directory: http://localhost:{port}/unified_viz_data/

? Server Configuration:
   - CORS enabled for local development
   - JSON data served from ./unified_viz_data/
   - Main visualization at root URL

? Quick Start:
   1. Run data preparation: python unified_viz_data_preparation.py
   2. Open: http://localhost:{port}
   3. Select a graph from dropdown
   4. Explore with filters and controls

Press Ctrl+C to stop the server
{'='*50}
            """)
            
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n? Server stopped by user")
    except Exception as e:
        print(f"? Server error: {e}")
    finally:
        os.chdir(original_dir)

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Unified Log Visualization Server')
    parser.add_argument('--port', '-p', type=int, default=8000, 
                       help='Port to serve on (default: 8000)')
    parser.add_argument('--directory', '-d', type=str, default='.', 
                       help='Directory to serve from (default: current directory)')
    
    args = parser.parse_args()
    
    # Check if required files exist
    html_file = os.path.join(args.directory, 'unified_log_visualization.html')
    data_dir = os.path.join(args.directory, 'unified_viz_data')
    
    if not os.path.exists(html_file):
        print(f"? HTML file not found: {html_file}")
        print("   Make sure unified_log_visualization.html exists in the directory")
        sys.exit(1)
    
    if not os.path.exists(data_dir):
        print(f"??  Data directory not found: {data_dir}")
        print("   Run unified_viz_data_preparation.py first to generate data files")
        print("   The server will start but graphs won't load until data is prepared")
    
    start_server(args.port, args.directory)

if __name__ == "__main__":
    main()