"""phones.llmfn.com app package.

The Flask application lives in ``app.app``; it is re-exported here so the
package itself is the entry point (``flask --app app``).
"""

from .app import app

__all__ = ["app"]
