from datetime import date, timedelta


def create_exam(client, subject_id, days_ahead=5, title="期中考试", scope="极限与导数"):
    return client.post(
        f"/api/subjects/{subject_id}/exams",
        json={
            "title": title,
            "exam_date": (date.today() + timedelta(days=days_ahead)).isoformat(),
            "scope": scope,
        },
    )


def test_create_and_list_exam(client, subject):
    created = create_exam(client, subject["id"], days_ahead=5)
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "期中考试"
    assert body["days_left"] == 5

    listed = client.get(f"/api/subjects/{subject['id']}/exams").json()
    assert [item["id"] for item in listed] == [body["id"]]


def test_exam_requires_subject(client):
    assert create_exam(client, 999).status_code == 404


def test_list_all_exams(client, subject):
    create_exam(client, subject["id"], days_ahead=7, title="晚的考试")
    create_exam(client, subject["id"], days_ahead=2, title="早的考试")
    rows = client.get("/api/exams").json()
    assert [row["title"] for row in rows] == ["早的考试", "晚的考试"]


def test_generate_plan_creates_tasks(client, subject):
    # 造一点资料与错题，让计划里出现对应条目
    client.post(
        f"/api/subjects/{subject['id']}/materials",
        files={"file": ("真题.pdf", b"%PDF-1.4", "application/pdf")},
    )
    client.post(
        f"/api/subjects/{subject['id']}/mistakes",
        json={"question": "求极限", "knowledge_points": ["极限"]},
    )

    exam = create_exam(client, subject["id"], days_ahead=3).json()
    response = client.post(f"/api/exams/{exam['id']}/plan")
    assert response.status_code == 200
    tasks = response.json()

    assert len(tasks) >= 3
    titles = [task["title"] for task in tasks]
    assert any(title.startswith("复习资料") for title in titles)
    assert any(title.startswith("重做错题") for title in titles)
    assert any(title.startswith("明确考试范围") for title in titles)

    today = date.today()
    for task in tasks:
        due = date.fromisoformat(task["due_date"])
        assert today <= due <= date.today() + timedelta(days=3)


def test_regenerate_replaces_previous_plan(client, subject):
    exam = create_exam(client, subject["id"]).json()
    first = client.post(f"/api/exams/{exam['id']}/plan").json()
    second = client.post(f"/api/exams/{exam['id']}/plan").json()
    # 计划任务分布在多天，取一个远期日期把全部任务取回来比较
    all_tasks = client.get("/api/tasks", params={"day": "2099-01-01"}).json()
    assert len(all_tasks) == len(second)
    assert len(first) == len(second)


def test_plan_has_minimum_three_tasks(client, subject):
    # 只有考试范围、没有任何资料和错题时，也要给出可执行的节奏
    exam = create_exam(client, subject["id"], days_ahead=4).json()
    tasks = client.post(f"/api/exams/{exam['id']}/plan").json()
    assert len(tasks) >= 3


def test_ai_plan_searches_and_creates_tasks(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=5).json()

    response = client.post(f"/api/exams/{exam['id']}/plan/ai")
    assert response.status_code == 200
    body = response.json()

    assert body["summary"]
    assert body["source_note"].startswith("已参考")
    assert len(body["days"]) == 1
    assert body["days"][0]["tasks"][0]["title"] == "复习极限定义"
    assert len(body["tasks"]) == 1
    assert body["tasks"][0]["detail"] == "整理 5 个典型例题"

    # 近 10 天要有「考点速览 + 易错点 + 自测题」，这才是减少工作量的部分
    assert body["days"][0]["notes"]
    assert body["days"][0]["pitfalls"]
    assert body["days"][0]["quiz"][0]["answer"] == "1，用等价无穷小"

    # 覆盖表只接受合法考频
    assert [item["topic"] for item in body["coverage"]] == ["极限", "导数"]
    assert body["coverage"][0]["weight"] == "高频"
    assert body["coverage"][1]["weight"] == ""

    # 只保留检索结果里真实存在的链接，模型编造的链接会被丢弃
    urls = [res["url"] for res in body["days"][0]["resources"]]
    assert urls == ["https://example.com/outline"]

    # 确认确实调用了联网检索
    assert any(kind == "search" for kind, _ in fake_llm.calls)

    tasks = client.get("/api/tasks", params={"day": "2099-01-01"}).json()
    assert len(tasks) == 1
    assert tasks[0]["source"] == "ai"
    assert tasks[0]["resources"][0]["url"] == "https://example.com/outline"


def test_ai_plan_is_saved_and_can_be_reloaded(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    created = client.post(f"/api/exams/{exam['id']}/plan/ai").json()
    calls_after_create = len(fake_llm.calls)

    loaded = client.get(f"/api/exams/{exam['id']}/plan/ai")
    assert loaded.status_code == 200
    body = loaded.json()
    assert body["summary"] == created["summary"]
    assert body["days"] == created["days"]
    assert body["coverage"] == created["coverage"]
    assert body["source_note"] == created["source_note"]
    # 读取快照不应再调用模型
    assert len(fake_llm.calls) == calls_after_create


def test_ai_plan_missing_snapshot_returns_404(client, subject):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    response = client.get(f"/api/exams/{exam['id']}/plan/ai")
    assert response.status_code == 404
    assert response.json()["detail"] == "还没有生成 AI 计划"


def test_ai_plan_drops_detail_for_far_days(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=30).json()
    far_day = (date.today() + timedelta(days=20)).isoformat()
    fake_llm.plan_data = {
        "summary": "远期只排任务",
        "coverage": [],
        "days": [
            {
                "date": far_day,
                "focus": "定积分",
                "notes": ["这条不该出现"],
                "pitfalls": ["这条也不该出现"],
                "quiz": [{"question": "不该出现", "answer": "x"}],
                "tasks": [{"title": "做定积分练习", "minutes": 45}],
            }
        ],
    }

    body = client.post(f"/api/exams/{exam['id']}/plan/ai").json()
    day = body["days"][0]
    assert day["date"] == far_day
    assert day["notes"] == []
    assert day["pitfalls"] == []
    assert day["quiz"] == []
    assert day["tasks"][0]["title"] == "做定积分练习"


def test_ai_plan_survives_search_failure(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    fake_llm.fail_search = True

    response = client.post(f"/api/exams/{exam['id']}/plan/ai")
    assert response.status_code == 200
    body = response.json()
    assert body["source_note"].startswith("联网检索暂时不可用")
    assert body["days"][0]["tasks"]


def test_ai_plan_passes_daily_budget_to_prompt(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    client.post(f"/api/exams/{exam['id']}/plan/ai", json={"daily_minutes": 30})

    prompts = [text for kind, text in fake_llm.calls if kind == "json"]
    assert any("30 分钟" in text for text in prompts)


def test_delete_exam_removes_saved_plan(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    client.post(f"/api/exams/{exam['id']}/plan/ai")
    assert client.delete(f"/api/exams/{exam['id']}").status_code == 204
    assert client.get(f"/api/exams/{exam['id']}/plan/ai").status_code == 404


def test_ai_plan_requires_key(client, subject):
    exam = create_exam(client, subject["id"], days_ahead=5).json()
    assert client.post(f"/api/exams/{exam['id']}/plan/ai").status_code == 428


def test_ai_plan_rejects_past_exam(client, subject, fake_llm):
    exam = create_exam(client, subject["id"], days_ahead=-2).json()
    assert client.post(f"/api/exams/{exam['id']}/plan/ai").status_code == 400


def test_past_exam_cannot_generate_plan(client, subject):
    exam = create_exam(client, subject["id"], days_ahead=-2).json()
    response = client.post(f"/api/exams/{exam['id']}/plan")
    assert response.status_code == 400


def test_delete_exam_removes_its_tasks(client, subject):
    exam = create_exam(client, subject["id"]).json()
    client.post(f"/api/exams/{exam['id']}/plan")
    assert client.delete(f"/api/exams/{exam['id']}").status_code == 204
    assert client.get("/api/tasks", params={"day": "2099-01-01"}).json() == []
