import shutil
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from ..config import settings
from ..db import engine, init_db

router = APIRouter(prefix="/api/backup", tags=["backup"])

DB_NAME = "learnloop.db"
UPLOADS_PREFIX = "uploads/"
SQLITE_PREFIX = "sqlite:///"


def _db_path() -> Path:
    url = settings.database_url
    if not url.startswith(SQLITE_PREFIX):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "仅支持 SQLite 数据库备份")
    return Path(url[len(SQLITE_PREFIX) :])


@router.get("/export")
def export_backup() -> Response:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        db_path = _db_path()
        if db_path.exists():
            archive.write(db_path, DB_NAME)
        uploads_dir = settings.uploads_dir
        if uploads_dir.exists():
            for item in uploads_dir.glob("*"):
                if item.is_file():
                    archive.write(item, f"{UPLOADS_PREFIX}{item.name}")

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="learnloop-backup.zip"'},
    )


@router.post("/import")
async def import_backup(file: UploadFile = File(...)) -> dict[str, int]:
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件为空")

    try:
        archive = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "不是合法的备份文件") from exc

    names = archive.namelist()
    if DB_NAME not in names:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份里缺少数据库文件")

    # 防止 zip 路径穿越
    for name in names:
        if name.startswith("/") or ".." in Path(name).parts:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "备份文件包含非法路径")

    with tempfile.TemporaryDirectory() as tmp:
        archive.extractall(tmp)
        tmp_path = Path(tmp)

        # 先断开数据库连接，避免文件被占用
        engine.dispose()
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(tmp_path / DB_NAME, _db_path())

        uploads_dir = settings.uploads_dir
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)

        restored = 0
        tmp_uploads = tmp_path / "uploads"
        if tmp_uploads.exists():
            for item in tmp_uploads.glob("*"):
                if item.is_file():
                    shutil.copyfile(item, uploads_dir / item.name)
                    restored += 1

    init_db()
    return {"ok": 1, "uploads": restored}
