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

MAP_SYSTEM = """你是课程助教，负责把学科内容整理成思维导图。
严格输出 JSON，结构如下：
{"topic": "根主题", "children": [{"topic": "一级分支", "children": [{"topic": "二级分支"}]}]}
最多三层，节点文字不超过 20 字。只输出 JSON，不要解释。"""

RULE_SYSTEM = """你负责把学校的综测/保研加分细则整理成可计算的规则条目。
严格输出 JSON：{"rules": [{"dimension": "德|智|体|美|劳", "name": "加分项名称", "score": 2.5}]}
要求：
- dimension 只能是 德、智、体、美、劳 之一
- name 用细则里的原始表述，尽量简短
- score 是该项对应分值；若是区间或分级，取常见档位并写进 name
- 只输出 JSON，不要解释"""

COURSE_SYSTEM = """你负责把成绩单整理成结构化课程列表。
严格输出 JSON：{"courses": [{"name": "高等数学", "credits": 4, "score": 90, "category": "required"}]}
要求：
- category 只能是 required（必修）或 elective（选修），无法判断时用 required
- credits 是学分数字，score 是百分制成绩数字
- 跳过总学分、平均分这类汇总行
- 只输出 JSON，不要解释"""

PLAN_SYSTEM = """你是备考规划师。根据考试信息、学生已有的学习数据以及检索到的资料，制定一份可执行的每日复习计划。

严格输出 JSON：
{
  "summary": "整体复习策略，2-3 句",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "focus": "当天主题，10 字以内",
      "tasks": [
        {"title": "具体任务，动词开头", "detail": "怎么做、做到什么程度，40 字以内", "minutes": 60}
      ],
      "resources": [{"title": "资料名", "url": "链接"}]
    }
  ]
}

要求：
- 从今天排到考前一天，每天 2-4 个任务，单任务 20-120 分钟
- 前期打基础、中期专项突破、最后 2-3 天做模拟和错题回顾
- 优先利用学生已有的资料与错题，检索到的资料作为补充
- resources 只从给出的检索结果里挑，没有就留空数组
- 只输出 JSON，不要解释"""


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

    async def search(self, query: str, count: int = 5) -> list[dict[str, str]]:
        """调用官方 Search 接口，返回精简后的结果列表。"""
        result = await self._request(
            "/v1/tools/search",
            json_body={"query": query[:120], "count": count, "need_content": False},
            timeout=40,
        )
        rows = []
        for item in result.get("results", [])[:count]:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            rows.append(
                {
                    "title": str(item.get("title") or "")[:120],
                    "url": str(item["url"])[:500],
                    "summary": str(item.get("summary") or item.get("snippet") or "")[:600],
                }
            )
        return rows

    async def ping(self) -> bool:
        await self.chat_text("你是一个测试助手，只回复 OK。", "ping")
        return True
