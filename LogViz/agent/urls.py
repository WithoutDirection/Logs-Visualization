"""
URL configuration for agent app.
"""
from django.urls import path
from .views import ChatView, SuggestView

urlpatterns = [
    path('chat/', ChatView.as_view(), name='agent-chat'),
    path('suggest/', SuggestView.as_view(), name='agent-suggest'),
]
