def create_subject(client, name="高等数学", **extra):
    payload = {"name": name, **extra}
    return client.post("/api/subjects", json=payload)


def test_create_and_list_subject(client):
    created = create_subject(client, color="#FF6B6B")
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "高等数学"
    assert body["color"] == "#FF6B6B"
    assert body["archived"] is False
    assert body["id"] > 0

    listed = client.get("/api/subjects")
    assert listed.status_code == 200
    assert [s["name"] for s in listed.json()] == ["高等数学"]


def test_create_trims_whitespace(client):
    created = create_subject(client, name="  线性代数  ")
    assert created.status_code == 201
    assert created.json()["name"] == "线性代数"


def test_create_rejects_blank_name(client):
    response = client.post("/api/subjects", json={"name": "   "})
    assert response.status_code == 422


def test_create_rejects_duplicate_name(client):
    assert create_subject(client, name="概率论").status_code == 201
    duplicated = create_subject(client, name="概率论")
    assert duplicated.status_code == 409


def test_update_subject(client):
    subject_id = create_subject(client).json()["id"]
    response = client.patch(
        f"/api/subjects/{subject_id}", json={"name": "高等数学（上）", "archived": True}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "高等数学（上）"
    assert body["archived"] is True


def test_update_rejects_duplicate_name(client):
    create_subject(client, name="大学物理")
    other_id = create_subject(client, name="电路分析").json()["id"]
    response = client.patch(f"/api/subjects/{other_id}", json={"name": "大学物理"})
    assert response.status_code == 409


def test_delete_subject(client):
    subject_id = create_subject(client).json()["id"]
    assert client.delete(f"/api/subjects/{subject_id}").status_code == 204
    assert client.get("/api/subjects").json() == []
    assert client.delete(f"/api/subjects/{subject_id}").status_code == 404
