#!/usr/bin/env python3
"""
Simple HTTP Server for Unified Log Visualization Tool

This server serves the HTML vis    # Check if required files exist
    index_file = os.path.join(args.directory, 'index.html')
    css_dir = os.path.join(args.directory, 'css')
    js_dir = os.path.join(args.directory, 'js')
    data_dir = os.path.join(args.directory, 'unified_viz_data')
    
    if not os.path.exists(index_file):
        print(f"❌ Main HTML file not found: {index_file}")
        print("   Make sure index.html exists in the directory")
        sys.exit(1)
    
    if not os.path.exists(css_dir):
        print(f"⚠️  CSS directory not found: {css_dir}")
        print("   CSS files should be in the css/ directory")
    
    if not os.path.exists(js_dir):
        print(f"⚠️  JavaScript directory not found: {js_dir}")
        print("   JavaScript files should be in the js/ directory")on tool and JSON data files.
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
        """Handle GET requests with improved error handling"""
        try:
            parsed_path = urlparse(self.path)
            path = parsed_path.path

            # Serve the main HTML file at root
            if path == '/' or path == '/index.html':
                self.path = '/index.html'

            # Serve CSS files from css directory
            elif path.startswith('/css/'):
                # The path is already correct, just serve it
                pass

            # Serve JavaScript files from js directory
            elif path.startswith('/js/'):
                # The path is already correct, just serve it
                pass

            # Serve JSON data files from unified_viz_data directory
            elif path.startswith('/unified_viz_data/'):
                # The path is already correct, just serve it
                pass

            # Serve other static files as normal
            return super().do_GET()

        except Exception as e:
            self.send_error(500, f"Internal server error: {str(e)}")
            print(f"Error handling request for {self.path}: {e}")
    
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

📁 Serving directory: {os.path.abspath(directory)}
🌐 Server URL: http://localhost:{port}
🎯 Visualization: http://localhost:{port}/
📊 Data directory: http://localhost:{port}/unified_viz_data/

⚙️ Server Configuration:
   - CORS enabled for local development
   - CSS files served from ./css/
   - JavaScript files served from ./js/
   - JSON data served from ./unified_viz_data/
   - Main visualization at root URL (index.html)

🚀 Quick Start:
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
    index_file = os.path.join(args.directory, 'index.html')
    data_dir = os.path.join(args.directory, 'unified_viz_data')
    
    if not os.path.exists(index_file):
        print(f"❌ Main HTML file not found: {index_file}")
        print("   Make sure index.html exists in the directory")
        sys.exit(1)
    
    if not os.path.exists(data_dir):
        print(f"??  Data directory not found: {data_dir}")
        print("   Run unified_viz_data_preparation.py first to generate data files")
        print("   The server will start but graphs won't load until data is prepared")
    
    start_server(args.port, args.directory)

if __name__ == "__main__":
    main()