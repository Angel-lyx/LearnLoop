import json
import re
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

PLAN_SYSTEM = """你是备考规划师，任务是把「考试范围 + 学生已有的资料和错题 + 网上检索到的资料」压成一份省力但覆盖全面的复习计划。

严格输出 JSON：
{
  "summary": "整体取舍与节奏，2-4 句",
  "coverage": [
    {"topic": "考试范围里的专题", "date": "YYYY-MM-DD", "weight": "高频|中频|低频"}
  ],
  "days": [
    {
      "date": "YYYY-MM-DD",
      "focus": "当天主题，10 字以内",
      "goal": "当天结束时能做到什么，20 字以内",
      "notes": ["考点速览：直接给结论、公式或判别法，30-60 字"],
      "pitfalls": ["易错点，30 字以内"],
      "quiz": [{"question": "一道小题", "answer": "答案与关键步骤，80 字以内"}],
      "tasks": [{"title": "动词开头，15 字以内", "detail": "怎么做、做到什么程度，40 字以内", "minutes": 40}],
      "resources": [{"title": "资料名", "url": "链接"}]
    }
  ]
}

要求：
- coverage 必须覆盖考试范围的每一个专题，一个都不能漏；按历年考频标「高频 / 中频 / 低频」，一个专题只出现一次
- 每天 2-3 个任务，当天总时长不超过学生给出的每日预算；单任务 15-90 分钟
- 任务优先用学生已有的资料与错题（写清用哪一份），网上资料只作为补充
- 只有用户消息里点名「精讲日」的日期才填 notes / pitfalls / quiz；其余日期这三项必须是空数组
- 精讲日给 3 条 notes、1 条 pitfalls、1 道 quiz；要短、可背、可直接照做，不要让学生自己再总结
- 前期补基础、中期专项突破、最后 2 天真题模拟与错题回顾，不再开新专题
- resources 只能从给出的检索结果里挑，没有就留空数组
- 只输出 JSON，不要解释"""


def decode_json(text: str) -> dict[str, Any]:
    """解析模型返回的 JSON：兼容 ```json 围栏、前后解释文字，顶层必须是对象。"""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise
        parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("顶层不是 JSON 对象")
    return parsed


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
        max_tokens: int = 8192,
        timeout: float = 120,
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
            "max_tokens": max_tokens,
            # 结构化输出不需要思维链：reasoning 会吃掉输出预算，长计划会因此被截断
            "thinking": {"type": "disabled"},
        }
        data = await self._request("/chat/completions", json_body=payload, timeout=timeout)
        try:
            choice = data["choices"][0]
            raw = str(choice["message"].get("content") or "")
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("大模型没有返回内容", 502) from exc

        if choice.get("finish_reason") == "length":
            raise LLMError("大模型输出被截断（内容太长），请缩短范围后重试", 502)
        try:
            return decode_json(raw)
        except ValueError as exc:
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
