PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def test_analyze_returns_structured_json(client, fake_llm):
    response = client.post(
        "/api/ai/analyze",
        json={"question": "求 lim(x->0) sin(x)/x", "answer": "0"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["error_analysis"].startswith("把极限")
    assert body["knowledge_points"] == ["极限", "连续性"]
    assert len(body["variants"]) == 2
    assert body["variants"][0]["question"] == "变式题 A"


def test_analyze_normalizes_messy_output(client, fake_llm):
    fake_llm.analysis = {
        "error_analysis": "  概念混淆  ",
        "solution": "步骤",
        "knowledge_points": ["极限", ""],
        "variants": [{"question": "题"}, {"answer": "没有题干"}, "垃圾"],
    }
    response = client.post("/api/ai/analyze", json={"question": "题目"})
    body = response.json()
    assert body["error_analysis"] == "概念混淆"
    assert body["knowledge_points"] == ["极限"]
    assert len(body["variants"]) == 1
    assert body["variants"][0]["answer"] == ""


def test_transcribe_image(client, fake_llm):
    response = client.post(
        "/api/ai/transcribe",
        files={"file": ("题目.png", PNG_BYTES, "image/png")},
    )
    assert response.status_code == 200
    assert "sin(x)/x" in response.json()["text"]
    assert fake_llm.calls[-1][0] == "text"


def test_transcribe_pdf_uses_ocr(client, fake_llm):
    response = client.post(
        "/api/ai/transcribe",
        files={"file": ("试卷.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    assert fake_llm.calls[-1] == ("ocr", "试卷.pdf")


def test_transcribe_rejects_unsupported_type(client, fake_llm):
    response = client.post(
        "/api/ai/transcribe",
        files={"file": ("a.exe", b"MZ", "application/octet-stream")},
    )
    assert response.status_code == 400
