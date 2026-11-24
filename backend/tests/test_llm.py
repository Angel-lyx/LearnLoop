import asyncio

import pytest

from app.services.llm import LLMClient, LLMError, decode_json


def _client_with(response: dict) -> tuple[LLMClient, dict]:
    client = LLMClient("test-key")
    captured: dict = {}

    async def fake_request(path, *, json_body=None, data=None, files=None, timeout=120):
        captured["path"] = path
        captured["payload"] = json_body
        return response

    client._request = fake_request  # type: ignore[method-assign]
    return client, captured


def test_decode_json_accepts_plain_object():
    assert decode_json('{"days": []}') == {"days": []}


def test_decode_json_strips_code_fence():
    assert decode_json('```json\n{"summary": "ok"}\n```') == {"summary": "ok"}


def test_decode_json_recovers_from_surrounding_text():
    assert decode_json('结果如下：\n{"summary": "ok"}\n以上') == {"summary": "ok"}


def test_decode_json_rejects_non_object():
    with pytest.raises(ValueError):
        decode_json("[1, 2]")


def test_chat_json_uses_large_budget_and_disables_thinking():
    client, captured = _client_with(
        {"choices": [{"message": {"content": '{"ok": true}'}, "finish_reason": "stop"}]}
    )
    assert asyncio.run(client.chat_json("system", "user", max_tokens=16384)) == {
        "ok": True
    }
    assert captured["payload"]["max_tokens"] == 16384
    # 思维链会占用输出预算，结构化输出必须关掉，否则长计划会被截断
    assert captured["payload"]["thinking"] == {"type": "disabled"}


def test_chat_json_reports_truncation():
    client, _ = _client_with(
        {"choices": [{"message": {"content": '{"days": ['}, "finish_reason": "length"}]}
    )
    with pytest.raises(LLMError) as info:
        asyncio.run(client.chat_json("system", "user"))
    assert "截断" in info.value.message


def test_chat_json_reports_unparsable_content():
    client, _ = _client_with(
        {"choices": [{"message": {"content": "这不是 JSON"}, "finish_reason": "stop"}]}
    )
    with pytest.raises(LLMError) as info:
        asyncio.run(client.chat_json("system", "user"))
    assert "可解析" in info.value.message
