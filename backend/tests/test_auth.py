from app.config import settings

GOOD_PASSWORD = "learnloop-good-123"


def test_register_signs_user_in(client, user):
    assert user["username"] == "tester"
    me = client.get("/api/auth/me").json()
    assert me["user"]["id"] == user["id"]
    assert me["registration_open"] is True


def test_anonymous_me_returns_null_user(anon_client):
    response = anon_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["user"] is None


def test_protected_endpoints_require_login(anon_client):
    for path in ("/api/subjects", "/api/exams", "/api/tasks", "/api/search?q=数学"):
        response = anon_client.get(path)
        assert response.status_code == 401, path
    assert anon_client.post("/api/subjects", json={"name": "高等数学"}).status_code == 401


def test_register_rejects_duplicate_username(client):
    response = client.post(
        "/api/auth/register",
        json={"username": "TESTER", "password": GOOD_PASSWORD},
    )
    assert response.status_code == 409


def test_register_rejects_short_password(anon_client):
    response = anon_client.post(
        "/api/auth/register", json={"username": "someone", "password": "short"}
    )
    assert response.status_code == 422


def test_register_rejects_bad_username(anon_client):
    for name in ("ab", "has space", "bad/slash"):
        response = anon_client.post(
            "/api/auth/register", json={"username": name, "password": GOOD_PASSWORD}
        )
        assert response.status_code == 422, name


def test_login_and_logout(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    anon_client.post("/api/auth/logout")
    assert anon_client.get("/api/auth/me").json()["user"] is None
    assert anon_client.get("/api/subjects").status_code == 401

    response = anon_client.post(
        "/api/auth/login", json={"username": "Tester", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "tester"
    assert anon_client.get("/api/subjects").status_code == 200


def test_login_rejects_wrong_password(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    anon_client.post("/api/auth/logout")
    response = anon_client.post(
        "/api/auth/login", json={"username": "tester", "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert "不正确" in response.json()["detail"]


def test_login_is_throttled_after_repeated_failures(anon_client):
    anon_client.post(
        "/api/auth/register", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    anon_client.post("/api/auth/logout")

    for _ in range(5):
        anon_client.post(
            "/api/auth/login", json={"username": "tester", "password": "wrong"}
        )

    response = anon_client.post(
        "/api/auth/login", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 429


def test_registration_can_be_closed(client, anon_client, monkeypatch):
    monkeypatch.setattr(settings, "allow_registration", False, raising=False)
    response = anon_client.post(
        "/api/auth/register", json={"username": "newbie", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 403


def test_registration_requires_invite_code(client, anon_client, monkeypatch):
    monkeypatch.setattr(settings, "registration_code", "secret-code", raising=False)

    missing = anon_client.post(
        "/api/auth/register", json={"username": "newbie", "password": GOOD_PASSWORD}
    )
    assert missing.status_code == 403

    wrong = anon_client.post(
        "/api/auth/register",
        json={"username": "newbie", "password": GOOD_PASSWORD, "invite_code": "nope"},
    )
    assert wrong.status_code == 403

    ok = anon_client.post(
        "/api/auth/register",
        json={
            "username": "newbie",
            "password": GOOD_PASSWORD,
            "invite_code": "secret-code",
        },
    )
    assert ok.status_code == 201


def test_login_throttle_can_be_disabled(anon_client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 0, raising=False)
    anon_client.post(
        "/api/auth/register", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    anon_client.post("/api/auth/logout")

    for _ in range(8):
        anon_client.post(
            "/api/auth/login", json={"username": "tester", "password": "wrong"}
        )

    response = anon_client.post(
        "/api/auth/login", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    assert response.status_code == 200


def test_login_throttle_window_is_configurable(anon_client, monkeypatch):
    monkeypatch.setattr(settings, "login_max_failures", 2, raising=False)
    anon_client.post(
        "/api/auth/register", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    anon_client.post("/api/auth/logout")

    for _ in range(2):
        anon_client.post(
            "/api/auth/login", json={"username": "tester", "password": "wrong"}
        )

    blocked = anon_client.post(
        "/api/auth/login", json={"username": "tester", "password": GOOD_PASSWORD}
    )
    assert blocked.status_code == 429
    assert "失败次数过多" in blocked.json()["detail"]


def test_change_password_requires_current_and_renews_session(client):
    response = client.post(
        "/api/auth/password",
        json={"current_password": "wrong", "new_password": "brand-new-pass-1"},
    )
    assert response.status_code == 401

    response = client.post(
        "/api/auth/password",
        json={"current_password": "learnloop-test-123", "new_password": "brand-new-pass-1"},
    )
    assert response.status_code == 200
    # 改密后当前 Cookie 仍然可用
    assert client.get("/api/auth/me").json()["user"]["username"] == "tester"


def test_session_cookie_is_httponly(client):
    response = client.get("/api/auth/me")
    cookie = response.headers.get("set-cookie") or ""
    # 登录时下发的 Cookie 必须带 HttpOnly，避免被脚本读取
    register = client.post(
        "/api/auth/login",
        json={"username": "tester", "password": "learnloop-test-123"},
    )
    assert "httponly" in register.headers.get("set-cookie", "").lower()
