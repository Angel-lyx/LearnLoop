from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import ai, health, materials, mistakes, settings as settings_router, subjects


def create_app(init_database: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if init_database:
            init_db()
        yield

    app = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(subjects.router)
    app.include_router(materials.router)
    app.include_router(settings_router.router)
    app.include_router(ai.router)
    app.include_router(mistakes.router)
    return app


app = create_app()
