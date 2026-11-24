import io
import zipfile


def test_export_contains_database(client, subject):
    response = client.get("/api/backup/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert "learnloop.db" in archive.namelist()


def test_import_restores_deleted_data(client, subject):
    backup = client.get("/api/backup/export").content

    assert client.delete(f"/api/subjects/{subject['id']}").status_code == 204
    assert client.get("/api/subjects").json() == []

    response = client.post(
        "/api/backup/import", files={"file": ("backup.zip", backup, "application/zip")}
    )
    assert response.status_code == 200
    assert [item["name"] for item in client.get("/api/subjects").json()] == ["高等数学"]


def test_export_includes_uploaded_files(client, subject):
    client.post(
        f"/api/subjects/{subject['id']}/materials",
        files={"file": ("真题.pdf", b"%PDF-1.4", "application/pdf")},
    )
    archive = zipfile.ZipFile(io.BytesIO(client.get("/api/backup/export").content))
    uploads = [name for name in archive.namelist() if name.startswith("uploads/")]
    assert len(uploads) == 1
    assert archive.read(uploads[0]) == b"%PDF-1.4"


def test_import_rejects_invalid_zip(client):
    response = client.post(
        "/api/backup/import", files={"file": ("bad.zip", b"not-a-zip", "application/zip")}
    )
    assert response.status_code == 400


def test_import_rejects_zip_without_database(client):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("readme.txt", "hello")
    response = client.post(
        "/api/backup/import",
        files={"file": ("empty.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400


def test_import_rejects_path_traversal(client):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("learnloop.db", b"")
        archive.writestr("../evil.txt", "boom")
    response = client.post(
        "/api/backup/import",
        files={"file": ("evil.zip", buffer.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
