"""
URL configuration for graphs app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NodeViewSet, EdgeViewSet, SequenceGroupViewSet, ReaprAnnotationViewSet

router = DefaultRouter()
router.register(r'nodes', NodeViewSet, basename='node')
router.register(r'edges', EdgeViewSet, basename='edge')
router.register(r'sequences', SequenceGroupViewSet, basename='sequence')
router.register(r'reapr', ReaprAnnotationViewSet, basename='reapr')

urlpatterns = [
    path('', include(router.urls)),
]
