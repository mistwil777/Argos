"""
REST API module for Argos
"""

from argos.api.router import api_router
from argos.api.veille import veille_router

__all__ = ['api_router', 'veille_router']
