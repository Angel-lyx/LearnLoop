def test_search_matches_mistakes_and_maps(client, subject):
    client.post(
        f"/api/subjects/{subject['id']}/mistakes",
        json={"question": "求极限 lim(x->0) sin(x)/x"},
    )
    client.post(
        f"/api/subjects/{subject['id']}/maps", json={"title": "极限复习导图"}
    )

    data = client.get("/api/search", params={"q": "极限"}).json()
    assert len(data["mistakes"]) == 1
    assert "极限" in data["mistakes"][0]["question"]
    assert len(data["maps"]) == 1
    assert data["maps"][0]["title"] == "极限复习导图"


def test_search_matches_subject_and_material(client, subject):
    client.post(
        f"/api/subjects/{subject['id']}/materials",
        files={"file": ("高等数学真题.pdf", b"%PDF-1.4", "application/pdf")},
    )
    data = client.get("/api/search", params={"q": "高等"}).json()
    assert len(data["subjects"]) == 1
    assert len(data["materials"]) == 1
    assert data["materials"][0]["kind"] == "pdf"


def test_search_without_match(client, subject):
    data = client.get("/api/search", params={"q": "不存在的关键词"}).json()
    assert data == {"subjects": [], "materials": [], "mistakes": [], "maps": []}


def test_search_requires_keyword(client):
    assert client.get("/api/search", params={"q": ""}).status_code == 422
