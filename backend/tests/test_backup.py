import io
import json
import zipfile

from fastapi.testclient import TestClient

SECOND_USER = {"username": "roommate", "password": "learnloop-test-456"}


def _manifest(content: bytes) -> dict:
    archive = zipfile.ZipFile(io.BytesIO(content))
    return json.loads(archive.read("manifest.json").decode("utf-8"))


def _second_client(client: TestClient) -> TestClient:
    """同一个应用、同一个数据库，但独立的 Cookie jar，用来模拟另一个账号。"""
    other = TestClient(client.app)
    response = other.post("/api/auth/register", json=SECOND_USER)
    assert response.status_code == 201, response.text
    return other


def test_export_contains_manifest(client, subject):
    response = client.get("/api/backup/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    manifest = _manifest(response.content)
    assert manifest["version"] == 2
    assert [item["name"] for item in manifest["subjects"]] == ["高等数学"]


def test_export_never_includes_api_key(client, subject):
    client.put("/api/settings/ai", json={"api_key": "sk-should-not-leak-123456"})
    manifest = _manifest(client.get("/api/backup/export").content)
    text = json.dumps(manifest, ensure_ascii=False)
    assert "sk-should-not-leak" not in text


def test_import_restores_deleted_data(client, subject):
    backup = client.get("/api/backup/export").content

    assert client.delete(f"/api/subjects/{subject['id']}").status_code == 204
    assert client.get("/api/subjects").json() == []

    response = client.post(
        "/api/backup/import", files={"file": ("backup.zip", backup, "application/zip")}
    )
    assert response.status_code == 200
    assert [item["name"] for item in client.get("/api/subjects").json()] == ["高等数学"]


def test_export_includes_uploaded_files_and_annotations(client, subject):
    upload = client.post(
        f"/api/subjects/{subject['id']}/materials",
        files={"file": ("真题.pdf", b"%PDF-1.4", "application/pdf")},
    ).json()
    client.put(
        f"/api/materials/{upload['id']}/annotations/1",
        json={"payload": '[{"type":"path"}]'},
    )

    content = client.get("/api/backup/export").content
    archive = zipfile.ZipFile(io.BytesIO(content))
    uploads = [name for name in archive.namelist() if name.startswith("uploads/")]
    assert len(uploads) == 1
    assert archive.read(uploads[0]) == b"%PDF-1.4"

    manifest = _manifest(content)
    assert manifest["materials"][0]["annotations"][0]["payload"] == '[{"type":"path"}]'

    # 删除后再导入，批注也要回来
    client.delete(f"/api/subjects/{subject['id']}")
    assert (
        client.post(
            "/api/backup/import",
            files={"file": ("backup.zip", content, "application/zip")},
        ).status_code
        == 200
    )
    restored = client.get("/api/subjects").json()
    assert len(restored) == 1
    materials = client.get(f"/api/subjects/{restored[0]['id']}/materials").json()
    assert len(materials) == 1
    annotations = client.get(
        f"/api/materials/{materials[0]['id']}/annotations"
    ).json()
    assert annotations[0]["payload"] == '[{"type":"path"}]'


def test_import_only_touches_current_account(client, subject):
    other = _second_client(client)
    other_subject = other.post("/api/subjects", json={"name": "大学物理"}).json()

    backup = client.get("/api/backup/export").content
    client.delete(f"/api/subjects/{subject['id']}")
    assert (
        client.post(
            "/api/backup/import",
            files={"file": ("backup.zip", backup, "application/zip")},
        ).status_code
        == 200
    )

    assert [item["name"] for item in client.get("/api/subjects").json()] == ["高等数学"]
    assert [item["name"] for item in other.get("/api/subjects").json()] == ["大学物理"]
    assert (
        other.get(f"/api/subjects/{other_subject['id']}/materials").status_code == 200
    )


def test_import_rejects_invalid_zip(client):
    response = client.post(
        "/api/backup/import", files={"file": ("bad.zip", b"not-a-zip", "application/zip")}
    )
    assert response.status_code == 400


def test_import_rejects_zip_without_manifest(client):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("readme.txt", "hello")
    response = client.post(
        "/api/backup/import",
        files={"file": ("empty.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400


def test_import_rejects_old_single_user_backup(client):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("learnloop.db", b"SQLite format 3\x00")
    response = client.post(
        "/api/backup/import",
        files={"file": ("old.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
    assert "manifest" in response.json()["detail"]


def test_import_rejects_path_traversal(client):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("manifest.json", json.dumps({"version": 2}))
        archive.writestr("../evil.txt", "boom")
    response = client.post(
        "/api/backup/import",
        files={"file": ("evil.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400


def test_broken_manifest_keeps_existing_data(client, subject):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "manifest.json",
            json.dumps({"version": 2, "subjects": "not-a-list"}),
        )
    response = client.post(
        "/api/backup/import",
        files={"file": ("broken.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
    assert [item["name"] for item in client.get("/api/subjects").json()] == ["高等数学"]
