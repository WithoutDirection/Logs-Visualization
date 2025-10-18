"""
Agent views for LLM-powered analysis assistance.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .services.llm_agent import LLMAgent
from .tools.graph_tools import GraphTools


class ChatView(APIView):
    """
    Chat endpoint for conversational analysis assistance.
    
    Request Body:
    - message: User message
    - graph_id: ID of the graph context
    - conversation_id: Optional conversation ID for context
    - max_tokens: Optional max response length (default: 500)
    """
    
    def post(self, request):
        message = request.data.get('message', '').strip()
        graph_id = request.data.get('graph_id')
        conversation_id = request.data.get('conversation_id')
        max_tokens = request.data.get('max_tokens', 500)
        
        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not graph_id:
            return Response(
                {'error': 'graph_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Initialize agent with tools
            tools = GraphTools(graph_id)
            agent = LLMAgent(tools=tools)
            
            # Get response
            response = agent.chat(
                message=message,
                conversation_id=conversation_id,
                max_tokens=max_tokens
            )
            
            return Response(response)
            
        except ValueError as e:
            return Response(
                {'error': f'Invalid request: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Chat failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SuggestView(APIView):
    """
    Suggestion endpoint for proactive analysis recommendations.
    
    Request Body:
    - graph_id: ID of the graph to analyze
    - context: Optional context (e.g., selected node IDs)
    """
    
    def post(self, request):
        graph_id = request.data.get('graph_id')
        context = request.data.get('context', {})
        
        if not graph_id:
            return Response(
                {'error': 'graph_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Initialize tools
            tools = GraphTools(graph_id)
            agent = LLMAgent(tools=tools)
            
            # Get suggestions based on context
            suggestions = agent.suggest(
                graph_id=graph_id,
                context=context
            )
            
            return Response({
                'suggestions': suggestions
            })
            
        except ValueError as e:
            return Response(
                {'error': f'Invalid request: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Suggestion failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
