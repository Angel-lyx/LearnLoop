import base64
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..schemas import AnalyzeRequest, AnalyzeResponse, TranscribeResponse
from ..services.deps import get_llm
from ..services.llm import ANALYZE_SYSTEM, TRANSCRIBE_SYSTEM, LLMClient, LLMError

router = APIRouter(prefix="/api/ai", tags=["ai"])

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MAX_AI_FILE_BYTES = 40 * 1024 * 1024


def _normalize_analysis(data: dict) -> AnalyzeResponse:
    variants = []
    for item in data.get("variants") or []:
        if isinstance(item, dict) and item.get("question"):
            variants.append(
                {"question": str(item["question"]), "answer": str(item.get("answer", ""))}
            )
    points = [str(p) for p in (data.get("knowledge_points") or []) if str(p).strip()]
    return AnalyzeResponse(
        error_analysis=str(data.get("error_analysis") or "").strip(),
        solution=str(data.get("solution") or "").strip(),
        knowledge_points=points,
        variants=variants,
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_mistake(
    payload: AnalyzeRequest, llm: LLMClient = Depends(get_llm)
) -> AnalyzeResponse:
    user = (
        f"题目：\n{payload.question}\n\n"
        f"学生的答案（可能为空，空表示不会做）：\n{payload.answer or '（未提供）'}"
    )
    try:
        data = await llm.chat_json(ANALYZE_SYSTEM, user)
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    return _normalize_analysis(data)


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...), llm: LLMClient = Depends(get_llm)
) -> TranscribeResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件为空")
    if len(content) > MAX_AI_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "文件过大")

    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()

    try:
        if suffix == ".pdf":
            text = await llm.ocr(filename, content)
        elif suffix in IMAGE_EXTS:
            mime = "image/png" if suffix == ".png" else f"image/{suffix.lstrip('.')}"
            encoded = base64.b64encode(content).decode("ascii")
            text = await llm.chat_text(
                TRANSCRIBE_SYSTEM,
                "请转写这张图片中的题目内容，保留题号与选项。",
                [f"data:{mime};base64,{encoded}"],
            )
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"不支持的文件类型：{suffix or '无扩展名'}",
            )
    except LLMError as exc:
        raise HTTPException(exc.status, exc.message) from exc

    if not text.strip():
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "没有识别出文字")
    return TranscribeResponse(text=text.strip())
