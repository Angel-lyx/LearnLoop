from datetime import date, timedelta


def test_create_manual_task(client, subject):
    response = client.post(
        "/api/tasks",
        json={
            "title": "背单词",
            "due_date": date.today().isoformat(),
            "subject_id": subject["id"],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "manual"
    assert body["done"] is False


def test_task_requires_existing_subject(client):
    response = client.post(
        "/api/tasks",
        json={"title": "x", "due_date": date.today().isoformat(), "subject_id": 999},
    )
    assert response.status_code == 404


def test_today_list_includes_overdue_undone(client, subject):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    overdue = client.post(
        "/api/tasks", json={"title": "昨天的任务", "due_date": yesterday}
    ).json()
    today_task = client.post(
        "/api/tasks", json={"title": "今天的任务", "due_date": date.today().isoformat()}
    ).json()
    client.post(
        "/api/tasks",
        json={"title": "明天的任务", "due_date": (date.today() + timedelta(days=1)).isoformat()},
    )

    listed = client.get("/api/tasks").json()
    titles = [task["title"] for task in listed]
    assert "昨天的任务" in titles
    assert "今天的任务" in titles
    assert "明天的任务" not in titles

    # 逾期且已完成的不再顺延
    client.patch(f"/api/tasks/{overdue['id']}", json={"done": True})
    again = [task["title"] for task in client.get("/api/tasks").json()]
    assert "昨天的任务" not in again
    assert today_task["id"]


def test_toggle_done(client, subject):
    task = client.post(
        "/api/tasks", json={"title": "任务", "due_date": date.today().isoformat()}
    ).json()
    response = client.patch(f"/api/tasks/{task['id']}", json={"done": True})
    assert response.status_code == 200
    assert response.json()["done"] is True


def test_delete_task(client, subject):
    task = client.post(
        "/api/tasks", json={"title": "任务", "due_date": date.today().isoformat()}
    ).json()
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.patch(f"/api/tasks/{task['id']}", json={"done": True}).status_code == 404
