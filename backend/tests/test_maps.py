def test_create_empty_map(client, subject):
    response = client.post(
        f"/api/subjects/{subject['id']}/maps", json={"title": "极限复习"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["data"]["nodeData"]["topic"] == "极限复习"
    assert body["data"]["nodeData"]["id"] == "root"


def test_update_map_data(client, subject):
    map_id = client.post(
        f"/api/subjects/{subject['id']}/maps", json={"title": "导图"}
    ).json()["id"]

    tree = {
        "nodeData": {
            "id": "root",
            "topic": "导图",
            "children": [{"id": "n1", "topic": "极限"}],
        }
    }
    response = client.patch(f"/api/maps/{map_id}", json={"data": tree, "title": "改名"})
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "改名"
    assert body["data"]["nodeData"]["children"][0]["topic"] == "极限"


def test_delete_map(client, subject):
    map_id = client.post(
        f"/api/subjects/{subject['id']}/maps", json={"title": "导图"}
    ).json()["id"]
    assert client.delete(f"/api/maps/{map_id}").status_code == 204
    assert client.get(f"/api/maps/{map_id}").status_code == 404


def test_generate_map_with_ai(client, subject, fake_llm):
    response = client.post(f"/api/subjects/{subject['id']}/maps/generate")
    assert response.status_code == 200
    body = response.json()

    root = body["data"]["nodeData"]
    assert root["id"] == "root"
    assert root["topic"] == "高等数学"
    assert len(root["children"]) == 2
    assert root["children"][0]["topic"] == "极限"
    # 每个节点都要有 id，mind-elixir 才能渲染
    assert all(child.get("id") for child in root["children"])
    assert body["title"] == "高等数学"


def test_generate_map_requires_key(client, subject):
    response = client.post(f"/api/subjects/{subject['id']}/maps/generate")
    assert response.status_code == 428
