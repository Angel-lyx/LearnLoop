def add_course(client, **overrides):
    payload = {
        "name": "高等数学",
        "credits": 4,
        "score": 90,
        "category": "required",
        "term": "2026 秋",
        **overrides,
    }
    return client.post("/api/research/courses", json=payload)


def test_course_crud_and_overview(client):
    assert add_course(client).status_code == 201
    add_course(client, name="选修课", credits=2, score=60, category="elective")

    courses = client.get("/api/research/courses").json()
    assert len(courses) == 2

    overview = client.get("/api/research/overview").json()
    # 只算必修：90 分 4 学分
    assert overview["courses"]["weighted_average"] == 90.0
    assert overview["courses"]["credits"] == 4.0

    course_id = courses[0]["id"]
    assert client.delete(f"/api/research/courses/{course_id}").status_code == 204
    assert len(client.get("/api/research/courses").json()) == 1


def test_course_validation(client):
    assert add_course(client, score=120).status_code == 422
    assert add_course(client, credits=0).status_code == 422


def test_rules_crud(client):
    created = client.post(
        "/api/research/rules", json={"dimension": "智", "name": "数学建模国一", "score": 5}
    )
    assert created.status_code == 201
    assert created.json()["dimension"] == "智"

    rules = client.get("/api/research/rules").json()
    assert len(rules) == 1
    assert client.delete(f"/api/research/rules/{rules[0]['id']}").status_code == 204


def test_rule_dimension_validation(client):
    response = client.post(
        "/api/research/rules", json={"dimension": "情绪", "name": "x", "score": 1}
    )
    assert response.status_code == 422


def test_bonus_and_dimension_totals(client):
    client.post(
        "/api/research/bonus",
        json={"dimension": "智", "title": "竞赛省一", "score": 3},
    )
    client.post(
        "/api/research/bonus",
        json={"dimension": "德", "title": "志愿服务", "score": 2},
    )
    overview = client.get("/api/research/overview").json()
    assert overview["zongce"]["dimensions"]["智"] == 3
    assert overview["zongce"]["dimensions"]["德"] == 2
    assert overview["zongce"]["total"] == 5

    bonus = client.get("/api/research/bonus").json()
    assert client.delete(f"/api/research/bonus/{bonus[0]['id']}").status_code == 204


def test_weights_and_composite(client):
    add_course(client, score=90)
    client.post("/api/research/bonus", json={"dimension": "智", "title": "竞赛", "score": 10})

    default = client.get("/api/research/weights").json()
    assert default["course_weight"] == 0.7

    saved = client.put("/api/research/weights", json={"course_weight": 0.6})
    assert saved.status_code == 200

    overview = client.get("/api/research/overview").json()
    # 90 * 0.6 + 10 * 0.4 = 58
    assert overview["composite"]["score"] == 58
    assert overview["composite"]["course_weight"] == 0.6


def test_weights_validation(client):
    assert client.put("/api/research/weights", json={"course_weight": 1.5}).status_code == 422


def test_parse_rules_filters_invalid(client, fake_llm):
    response = client.post(
        "/api/research/rules/parse", json={"text": "国家级竞赛一等奖 5 分；志愿服务 50 小时 2 分"}
    )
    assert response.status_code == 200
    drafts = response.json()
    # 非法维度与空名称会被丢掉
    assert len(drafts) == 2
    assert drafts[0]["dimension"] == "智"
    assert drafts[0]["score"] == 5


def test_parse_rules_requires_key(client, subject):
    response = client.post("/api/research/rules/parse", json={"text": "任意细则"})
    assert response.status_code == 428


def test_parse_courses_from_text(client, fake_llm):
    response = client.post(
        "/api/research/courses/parse",
        json={"text": "高等数学 4 学分 92 分；大学物理 3 学分 85 分"},
    )
    assert response.status_code == 200
    drafts = response.json()
    # 空名称与越界成绩会被过滤
    assert len(drafts) == 3
    assert drafts[0] == {
        "name": "高等数学",
        "credits": 4,
        "score": 92,
        "category": "required",
    }
    assert drafts[2]["category"] == "elective"


def test_parse_courses_from_file(client, fake_llm):
    response = client.post(
        "/api/research/courses/parse-file",
        files={"file": ("成绩单.png", b"fake-png", "image/png")},
    )
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_parse_courses_requires_key(client):
    response = client.post("/api/research/courses/parse", json={"text": "成绩单"})
    assert response.status_code == 428


def test_parse_bonus_from_file(client, fake_llm):
    response = client.post(
        "/api/research/bonus/parse-file",
        files={"file": ("证书.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 200
    drafts = response.json()
    assert len(drafts) == 2
    assert drafts[0]["dimension"] == "智"
