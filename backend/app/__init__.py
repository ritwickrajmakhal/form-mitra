import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import router
from app.client import azure_client_manager

# Set up logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Form Mitra backend server...")
    try:
        from app.db import init_db
        init_db()
    except Exception as e:
        logger.error(f"Could not initialize SQLite database on startup: {e}")

    try:
        azure_client_manager.initialize()
    except Exception as e:
        logger.error(f"Could not initialize Azure AI Client on startup: {e}")
        
    try:
        from app.services.local_model import local_model_service
        logger.info("Initializing Local ONNX Model Service...")
        local_model_service.initialize()
    except Exception as e:
        logger.error(f"Could not initialize local model on startup: {e}")
        
    yield
    logger.info("Shutting down Form Mitra backend server...")
    azure_client_manager.close()

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

def create_app() -> FastAPI:
    app = FastAPI(
        title="Form Mitra Backend",
        description="FastAPI backend for Form Mitra Browser Extension, integrating Microsoft Foundry Agents.",
        version="1.0.0",
        lifespan=lifespan
    )
    
    # Configure CORS for browser extensions
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allows any chrome-extension origin
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request, exc):
        logger.error(f"Request Validation Error: {exc.errors()} - Body was: {await request.body()}")
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors()},
        )
    
    app.include_router(router, prefix="/api")
    
    # Mount uploads static folder
    import os
    from fastapi.staticfiles import StaticFiles
    uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    
    return app
