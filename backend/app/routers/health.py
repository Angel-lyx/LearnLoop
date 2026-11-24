from fastapi import APIRouter

from ..config import settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
