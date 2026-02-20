"""
Hello World Tool
Simple test tool to verify MCP server is working
"""

from datetime import datetime
from typing import Optional


def hello_world(name: Optional[str] = "World") -> dict:
    """
    Simple hello world tool for testing MCP server.
    
    Args:
        name: Name to greet (default: "World")
        
    Returns:
        Dictionary with greeting message and timestamp
        
    Example:
        >>> hello_world("Alice")
        {'message': 'Hello, Alice!', 'timestamp': '2024-02-20T10:30:00.000Z'}
    """
    return {
        "message": f"Hello, {name}!",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "tool": "hello.world",
        "version": "1.0.0"
    }
