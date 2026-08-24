"""
app.py - Flask Application Factory for Smart Resume Screener.

Assembles Blueprints for uploads and shortlists, serves static dashboard assets,
configures logging and global error handling.
"""

import os
import logging
from flask import Flask, send_from_directory, jsonify
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("smart_resume_screener")


def create_app(test_config=None) -> Flask:
    """
    Application factory pattern for Flask app.

    Args:
        test_config: Optional dictionary to override configurations during testing.

    Returns:
        Configured Flask application instance.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    static_folder = os.path.join(base_dir, "static")

    app = Flask(
        __name__,
        static_folder=static_folder,
        static_url_path="/static"
    )

    # Base configuration
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-screener-secret-key-2026"),
        MAX_CONTENT_LENGTH=32 * 1024 * 1024,  # 32 MB total request limit
        UPLOAD_EXTENSIONS=[".pdf", ".docx", ".doc", ".txt"]
    )

    if test_config:
        app.config.update(test_config)

    # Register Blueprints
    from server.routes.upload_routes import upload_bp
    from server.routes.shortlist_routes import shortlist_bp

    app.register_blueprint(upload_bp)
    app.register_blueprint(shortlist_bp)

    # Root route - serve vanilla single-page UI
    @app.route("/")
    def index():
        return send_from_directory(static_folder, "index.html")

    # Health check endpoint
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "healthy",
            "service": "Smart Resume Screener",
            "gemini_api_configured": bool(os.environ.get("GEMINI_API_KEY"))
        }), 200

    # Global HTTP error handlers
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad Request", "message": str(e)}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource Not Found"}), 404

    @app.errorhandler(413)
    def request_entity_too_large(e):
        return jsonify({"error": "Payload Too Large: Maximum upload limit is 32MB."}), 413

    @app.errorhandler(500)
    def server_error(e):
        logger.error(f"Internal server error: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal Server Error", "message": "An unexpected error occurred."}), 500

    logger.info("Smart Resume Screener application initialized successfully.")
    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
