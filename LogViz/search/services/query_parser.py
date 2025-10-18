"""
Query parser for search language.

Parses query strings with the following syntax:
- op:<operation>  - Filter by edge operation (e.g., op:RegOpenKey)
- process:<name>  - Filter by process name
- pid:<id>        - Filter by process ID
- type:<type>     - Filter by node type (process/resource)

Multiple terms are space-separated and AND-ed together.
Values can be quoted for multi-word terms: process:"cmd.exe"

Example: op:RegOpenKey process:explorer pid:1234
"""
import re
from typing import Dict, Any


class QueryParser:
    """Parser for search query language."""
    
    # Regex pattern for query terms: field:value or field:"quoted value"
    TERM_PATTERN = re.compile(r'(\w+):(?:"([^"]*)"|(\S+))')
    
    VALID_FIELDS = {'op', 'operation', 'process', 'pid', 'type'}
    
    def __init__(self, query_string: str):
        """
        Initialize parser with query string.
        
        Args:
            query_string: Query string to parse
        """
        self.query_string = query_string.strip()
    
    def parse(self) -> Dict[str, Any]:
        """
        Parse the query string into a dictionary of filters.
        
        Returns:
            Dictionary with filter field names as keys and filter values as values
            
        Raises:
            ValueError: If query syntax is invalid
        """
        if not self.query_string:
            return {}
        
        filters = {}
        
        # Find all field:value pairs
        matches = self.TERM_PATTERN.findall(self.query_string)
        
        if not matches:
            raise ValueError(
                f"No valid search terms found. Use format: field:value "
                f"(valid fields: {', '.join(sorted(self.VALID_FIELDS))})"
            )
        
        for match in matches:
            field, quoted_value, unquoted_value = match
            value = quoted_value if quoted_value else unquoted_value
            
            # Normalize field names
            field_lower = field.lower()
            
            # Validate field
            if field_lower not in self.VALID_FIELDS:
                raise ValueError(
                    f"Invalid field '{field}'. Valid fields are: "
                    f"{', '.join(sorted(self.VALID_FIELDS))}"
                )
            
            # Normalize field name (op -> operation)
            if field_lower == 'op':
                field_lower = 'operation'
            
            # Convert pid to integer
            if field_lower == 'pid':
                try:
                    value = int(value)
                except ValueError:
                    raise ValueError(f"PID must be an integer, got: {value}")
            
            # Validate type field
            if field_lower == 'type' and value not in ('process', 'resource'):
                raise ValueError(
                    f"Invalid type '{value}'. Valid types are: process, resource"
                )
            
            # Store filter (last value wins if duplicate fields)
            filters[field_lower] = value
        
        return filters
    
    def __repr__(self) -> str:
        return f"QueryParser(query_string={self.query_string!r})"
