def create_mistake(client, subject_id, **overrides):
    payload = {
        "question": "求 lim(x->0) sin(x)/x",
        "answer": "0",
        "error_analysis": "把 0/0 直接当成 0",
        "solution": "用等价无穷小替换",
        "knowledge_points": ["极限", "等价无穷小"],
        "variants": [{"question": "变式：lim(x->0) tan(x)/x", "answer": "1"}],
        **overrides,
    }
    return client.post(f"/api/subjects/{subject_id}/mistakes", json=payload)


def test_create_and_list_mistakes(client, subject):
    created = create_mistake(client, subject["id"])
    assert created.status_code == 201
    body = created.json()
    assert body["question"].startswith("求 lim")
    assert body["status"] == "unmastered"
    assert body["knowledge_points"] == ["极限", "等价无穷小"]
    assert body["variants"][0]["answer"] == "1"

    listed = client.get(f"/api/subjects/{subject['id']}/mistakes")
    assert listed.status_code == 200
    assert [m["id"] for m in listed.json()] == [body["id"]]


def test_create_requires_existing_subject(client):
    assert create_mistake(client, 999).status_code == 404


def test_filter_by_status(client, subject):
    create_mistake(client, subject["id"])
    second = create_mistake(client, subject["id"], question="第二题").json()
    client.patch(f"/api/mistakes/{second['id']}", json={"status": "mastered"})

    mastered = client.get(
        f"/api/subjects/{subject['id']}/mistakes", params={"status": "mastered"}
    ).json()
    assert [m["id"] for m in mastered] == [second["id"]]


def test_update_mistake_status_and_content(client, subject):
    mistake_id = create_mistake(client, subject["id"]).json()["id"]
    response = client.patch(
        f"/api/mistakes/{mistake_id}",
        json={"status": "mastered", "question": "改过的题干"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "mastered"
    assert body["question"] == "改过的题干"


def test_update_rejects_invalid_status(client, subject):
    mistake_id = create_mistake(client, subject["id"]).json()["id"]
    assert (
        client.patch(f"/api/mistakes/{mistake_id}", json={"status": "??? "}).status_code
        == 422
    )


def test_delete_mistake(client, subject):
    mistake_id = create_mistake(client, subject["id"]).json()["id"]
    assert client.delete(f"/api/mistakes/{mistake_id}").status_code == 204
    assert client.get(f"/api/mistakes/{mistake_id}").status_code == 404
    assert client.get(f"/api/subjects/{subject['id']}/mistakes").json() == []


def test_mistake_not_found(client, subject):
    assert client.get("/api/mistakes/999").status_code == 404
