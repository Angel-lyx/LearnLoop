def test_settings_default_is_unconfigured(client):
    response = client.get("/api/settings/ai")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["source"] == "none"
    assert "api_key" not in body


def test_save_key_never_returns_it(client):
    saved = client.put("/api/settings/ai", json={"api_key": "sk-test-1234567890"})
    assert saved.status_code == 200
    body = saved.json()
    assert body["configured"] is True
    assert body["source"] == "database"
    assert "sk-test-1234567890" not in saved.text

    again = client.get("/api/settings/ai").json()
    assert again["configured"] is True
    assert "sk-test-1234567890" not in client.get("/api/settings/ai").text


def test_reject_short_key(client):
    assert client.put("/api/settings/ai", json={"api_key": "short"}).status_code == 422


def test_clear_key(client):
    client.put("/api/settings/ai", json={"api_key": "sk-test-1234567890"})
    cleared = client.delete("/api/settings/ai")
    assert cleared.status_code == 200
    assert cleared.json()["configured"] is False


def test_ai_endpoints_require_key(client):
    # 没有配置 key 时，AI 接口应提示去设置页填写
    response = client.post("/api/ai/analyze", json={"question": "1+1=?"})
    assert response.status_code == 428
    assert "API Key" in response.json()["detail"]


def test_test_endpoint_with_fake_llm(client, fake_llm):
    client.put("/api/settings/ai", json={"api_key": "sk-test-1234567890"})
    response = client.post("/api/settings/ai/test")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert fake_llm.calls
