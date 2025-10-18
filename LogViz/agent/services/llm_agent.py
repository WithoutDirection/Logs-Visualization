"""
LLM Agent service for analysis assistance.

Provides conversational AI assistance for graph analysis with:
- Safety controls (parameter validation, audit logging)
- Tool integration for graph queries
- Context management for conversations
"""
import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from openai import OpenAI

logger = logging.getLogger(__name__)


class LLMAgent:
    """LLM-powered agent for graph analysis assistance."""
    
    # System prompt for the agent
    SYSTEM_PROMPT = """You are a helpful assistant for analyzing process monitoring data visualized as a graph.

The graph represents system events with:
- Nodes: Processes (programs) and Resources (files, registry keys, network connections)
- Edges: Operations (RegOpenKey, CreateFile, TCP Connect, etc.) with timestamps
- Sequences: Detected behavioral patterns
- REAPr Annotations: Labeled attack paths and tactics

You have access to tools to query the graph. When asked questions:
1. Use the appropriate tools to gather information
2. Provide clear, concise analysis
3. Highlight security-relevant findings
4. Suggest further investigation steps when appropriate

Be specific about what you find. Include node IDs, process names, and timestamps in your answers.
"""
    
    def __init__(self, tools=None, model: str = "gpt-4", api_key: Optional[str] = None):
        """
        Initialize the LLM agent.
        
        Args:
            tools: GraphTools instance for querying the graph
            model: OpenAI model to use
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.tools = tools
        self.model = model
        
        # Initialize OpenAI client
        api_key = api_key or os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise ValueError(
                "OpenAI API key not found. Set OPENAI_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        self.client = OpenAI(api_key=api_key)
        
        # Conversation history (in-memory for now, could be moved to database)
        self.conversations: Dict[str, List[Dict[str, str]]] = {}
    
    def _validate_parameters(self, max_tokens: int) -> None:
        """
        Validate request parameters for safety.
        
        Args:
            max_tokens: Max response length
            
        Raises:
            ValueError: If parameters are invalid
        """
        if max_tokens < 1 or max_tokens > 2000:
            raise ValueError("max_tokens must be between 1 and 2000")
    
    def _audit_log(self, event: str, data: Dict[str, Any]) -> None:
        """
        Log agent activity for audit trail.
        
        Args:
            event: Event type
            data: Event data
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'event': event,
            'data': data
        }
        logger.info(f"Agent audit: {json.dumps(log_entry)}")
    
    def _get_conversation_history(
        self,
        conversation_id: Optional[str]
    ) -> List[Dict[str, str]]:
        """
        Get conversation history.
        
        Args:
            conversation_id: Conversation ID
            
        Returns:
            List of message dictionaries
        """
        if conversation_id and conversation_id in self.conversations:
            return self.conversations[conversation_id]
        return []
    
    def _save_conversation_history(
        self,
        conversation_id: str,
        messages: List[Dict[str, str]]
    ) -> None:
        """
        Save conversation history.
        
        Args:
            conversation_id: Conversation ID
            messages: List of messages
        """
        self.conversations[conversation_id] = messages
    
    def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """
        Process a chat message and return response.
        
        Args:
            message: User message
            conversation_id: Optional conversation ID for context
            max_tokens: Max response length
            
        Returns:
            Dictionary with 'response', 'conversation_id', and optional 'tool_calls'
            
        Raises:
            ValueError: If parameters are invalid
        """
        self._validate_parameters(max_tokens)
        
        # Generate conversation ID if not provided
        if not conversation_id:
            conversation_id = f"conv_{datetime.utcnow().timestamp()}"
        
        # Get conversation history
        history = self._get_conversation_history(conversation_id)
        
        # Build messages
        messages = [
            {'role': 'system', 'content': self.SYSTEM_PROMPT}
        ]
        messages.extend(history)
        messages.append({'role': 'user', 'content': message})
        
        # Audit log
        self._audit_log('chat_request', {
            'conversation_id': conversation_id,
            'message_length': len(message),
            'history_length': len(history)
        })
        
        try:
            # Call OpenAI API (simplified - no function calling for now)
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.7
            )
            
            assistant_message = response.choices[0].message.content
            
            # Save to history
            history.append({'role': 'user', 'content': message})
            history.append({'role': 'assistant', 'content': assistant_message})
            self._save_conversation_history(conversation_id, history)
            
            # Audit log
            self._audit_log('chat_response', {
                'conversation_id': conversation_id,
                'response_length': len(assistant_message),
                'tokens_used': response.usage.total_tokens
            })
            
            return {
                'response': assistant_message,
                'conversation_id': conversation_id,
                'tokens_used': response.usage.total_tokens
            }
            
        except Exception as e:
            logger.error(f"Chat error: {str(e)}")
            self._audit_log('chat_error', {
                'conversation_id': conversation_id,
                'error': str(e)
            })
            raise
    
    def suggest(
        self,
        graph_id: int,
        context: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """
        Generate proactive suggestions for analysis.
        
        Args:
            graph_id: Graph ID
            context: Optional context (e.g., selected nodes)
            
        Returns:
            List of suggestion strings
        """
        suggestions = []
        
        # Audit log
        self._audit_log('suggest_request', {
            'graph_id': graph_id,
            'context': context
        })
        
        try:
            # Get graph stats
            if self.tools:
                stats = self.tools.get_graph_stats()
                
                # Generate context-aware suggestions
                if stats.get('reapr_annotation_count', 0) > 0:
                    suggestions.append(
                        "🔍 Review REAPr annotations to identify potential attack paths"
                    )
                
                if stats.get('sequence_count', 0) > 0:
                    suggestions.append(
                        "📊 Analyze detected sequences to understand process behaviors"
                    )
                
                # Check for common suspicious operations
                top_ops = stats.get('top_operations', [])
                suspicious_ops = [
                    'RegSetValue', 'CreateRemoteThread', 'WriteProcessMemory'
                ]
                for op in top_ops:
                    if any(sus in op['operation'] for sus in suspicious_ops):
                        suggestions.append(
                            f"⚠️ Investigate '{op['operation']}' operations (found {op['count']} times)"
                        )
                        break
                
                # Context-specific suggestions
                if context and context.get('selected_node_ids'):
                    suggestions.append(
                        "🔗 Explore neighbors of selected nodes to understand causality"
                    )
            
            # Default suggestions
            if not suggestions:
                suggestions = [
                    "Start by exploring the graph statistics",
                    "Search for specific operations or processes",
                    "Look for sequences to understand behaviors"
                ]
            
            self._audit_log('suggest_response', {
                'graph_id': graph_id,
                'suggestion_count': len(suggestions)
            })
            
            return suggestions
            
        except Exception as e:
            logger.error(f"Suggest error: {str(e)}")
            self._audit_log('suggest_error', {
                'graph_id': graph_id,
                'error': str(e)
            })
            raise
