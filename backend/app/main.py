from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .db import init_db
from .routers import (
    auth,
    backup,
    ai,
    exams,
    health,
    maps,
    materials,
    mistakes,
    research,
    search,
    settings as settings_router,
    subjects,
    tasks,
)

# 部署时把前端打包产物放在 frontend/dist，由同一个服务托管，只需要一个地址和一块磁盘
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def _mount_frontend(app: FastAPI) -> None:
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        return

    dist_root = FRONTEND_DIST.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # /api 下没有匹配到路由时仍按 404 返回，不能落到前端页面
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")

        if full_path:
            candidate = (dist_root / full_path).resolve()
            if candidate.is_file() and candidate.is_relative_to(dist_root):
                return FileResponse(candidate)
        # 其余路径交给前端路由（刷新 /subjects 这类深链接不会 404）
        return FileResponse(index)


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
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(subjects.router)
    app.include_router(materials.router)
    app.include_router(settings_router.router)
    app.include_router(ai.router)
    app.include_router(mistakes.router)
    app.include_router(exams.router)
    app.include_router(tasks.router)
    app.include_router(maps.router)
    app.include_router(research.router)
    app.include_router(search.router)
    app.include_router(backup.router)
    _mount_frontend(app)
    return app


app = create_app()
