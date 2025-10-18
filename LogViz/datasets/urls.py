"""
URL configuration for datasets app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DatasetViewSet, GraphViewSet

router = DefaultRouter()
router.register(r'datasets', DatasetViewSet, basename='dataset')
router.register(r'graphs', GraphViewSet, basename='graph')

urlpatterns = [
    path('', include(router.urls)),
]
