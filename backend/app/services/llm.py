import json
from typing import Any

import httpx

from ..config import settings

ANALYZE_SYSTEM = """你是一位经验丰富的老师，负责分析学生做错的题目。
请严格输出 JSON，字段如下：
{
  "error_analysis": "错误原因分析，指出学生可能在哪个概念/步骤上出错",
  "solution": "正确的解题思路和完整步骤",
  "knowledge_points": ["知识点1", "知识点2"],
  "variants": [
    {"question": "同类变式题题干", "answer": "变式题答案与简要解析"},
    {"question": "...", "answer": "..."}
  ]
}
variants 固定给 3 道，难度与原题相当。只输出 JSON，不要多余文字。"""

TRANSCRIBE_SYSTEM = """你负责把图片里的题目准确地转写成文字。
保留题号、公式（用 LaTeX 行内写法）、选项与空格。
只输出转写后的题目文本，不要解释。"""

EXTRACT_SYSTEM = """你负责把文档内容整理成结构化数据，严格输出 JSON，不要多余文字。"""


class LLMError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class LLMClient:
    def __init__(self, api_key: str, base_url: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key
        self.base_url = (base_url or settings.deepseek_base_url).rstrip("/")
        self.model = model or settings.deepseek_model

    async def _request(
        self,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        files: dict[str, Any] | None = None,
        timeout: float = 120,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(
                    f"{self.base_url}{path}",
                    headers=headers,
                    json=json_body,
                    data=data,
                    files=files,
                )
            except httpx.HTTPError as exc:
                raise LLMError(f"无法连接大模型服务：{exc}", 503) from exc

        if response.status_code >= 400:
            detail = response.text[:300]
            raise LLMError(f"大模型返回 {response.status_code}：{detail}", 502)
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise LLMError("大模型返回内容不是合法 JSON", 502) from exc

    async def chat_json(
        self,
        system: str,
        user: str,
        image_urls: list[str] | None = None,
    ) -> dict[str, Any]:
        content: list[dict[str, Any]] = [{"type": "text", "text": user}]
        for url in image_urls or []:
            content.append({"type": "image_url", "image_url": {"url": url}})

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }
        data = await self._request("/chat/completions", json_body=payload)
        try:
            raw = data["choices"][0]["message"]["content"]
            return json.loads(raw)
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise LLMError("大模型没有返回可解析的 JSON", 502) from exc

    async def chat_text(
        self,
        system: str,
        user: str,
        image_urls: list[str] | None = None,
    ) -> str:
        content: list[dict[str, Any]] = [{"type": "text", "text": user}]
        for url in image_urls or []:
            content.append({"type": "image_url", "image_url": {"url": url}})

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "temperature": 0.2,
        }
        data = await self._request("/chat/completions", json_body=payload)
        try:
            return str(data["choices"][0]["message"]["content"]).strip()
        except (KeyError, IndexError) as exc:
            raise LLMError("大模型没有返回内容", 502) from exc

    async def ocr(self, filename: str, content: bytes) -> str:
        """调用官方 OCR 接口，返回按页拼接的文本。"""
        result = await self._request(
            "/v1/tools/ocr",
            data={"purpose": "text_recognition"},
            files={"file": (filename, content)},
            timeout=180,
        )
        if "error" in result:
            raise LLMError(str(result["error"].get("message", "OCR 失败")), 502)
        pages = result.get("pages", [])
        return "\n".join(str(page.get("text", "")) for page in pages).strip()

    async def ping(self) -> bool:
        await self.chat_text("你是一个测试助手，只回复 OK。", "ping")
        return True
