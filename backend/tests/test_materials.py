PDF_BYTES = b"%PDF-1.4\n% test fixture\n"


def upload(client, subject_id, filename="期中真题.pdf", content=PDF_BYTES):
    return client.post(
        f"/api/subjects/{subject_id}/materials",
        files={"file": (filename, content, "application/pdf")},
    )


def test_upload_and_list_material(client, subject):
    response = upload(client, subject["id"])
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "期中真题.pdf"
    assert body["kind"] == "pdf"
    assert body["size"] == len(PDF_BYTES)

    listed = client.get(f"/api/subjects/{subject['id']}/materials")
    assert listed.status_code == 200
    assert [m["id"] for m in listed.json()] == [body["id"]]


def test_upload_custom_title(client, subject):
    response = client.post(
        f"/api/subjects/{subject['id']}/materials",
        files={"file": ("a.pdf", PDF_BYTES, "application/pdf")},
        data={"title": "第一章 极限"},
    )
    assert response.status_code == 201
    assert response.json()["title"] == "第一章 极限"


def test_upload_rejects_unsupported_extension(client, subject):
    response = upload(client, subject["id"], filename="virus.exe")
    assert response.status_code == 400


def test_upload_rejects_empty_file(client, subject):
    response = upload(client, subject["id"], filename="empty.pdf", content=b"")
    assert response.status_code == 400


def test_upload_to_missing_subject(client):
    response = upload(client, 999)
    assert response.status_code == 404


def test_download_material_returns_bytes(client, subject):
    material_id = upload(client, subject["id"]).json()["id"]
    response = client.get(f"/api/materials/{material_id}/file")
    assert response.status_code == 200
    assert response.content == PDF_BYTES


def test_get_material_detail(client, subject):
    uploaded = upload(client, subject["id"]).json()
    response = client.get(f"/api/materials/{uploaded['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == uploaded["id"]
    assert client.get("/api/materials/999").status_code == 404


def test_delete_material_removes_record_and_file(client, subject, tmp_path):
    material_id = upload(client, subject["id"]).json()["id"]
    assert client.delete(f"/api/materials/{material_id}").status_code == 204
    assert client.get(f"/api/subjects/{subject['id']}/materials").json() == []

    uploads = list((tmp_path / "uploads").glob("*"))
    assert uploads == []


def put_annotation(client, material_id, page, payload):
    return client.put(
        f"/api/materials/{material_id}/annotations/{page}",
        json={"payload": payload},
    )


def test_annotation_upsert_and_list(client, subject):
    material_id = upload(client, subject["id"]).json()["id"]

    created = put_annotation(client, material_id, 1, '[{"type":"path"}]')
    assert created.status_code == 200
    assert created.json()["page"] == 1

    listed = client.get(f"/api/materials/{material_id}/annotations").json()
    assert len(listed) == 1
    assert listed[0]["payload"] == '[{"type":"path"}]'


def test_annotation_overwrite_same_page(client, subject):
    material_id = upload(client, subject["id"]).json()["id"]
    put_annotation(client, material_id, 1, "[]")
    put_annotation(client, material_id, 1, '[{"type":"rect"}]')

    listed = client.get(f"/api/materials/{material_id}/annotations").json()
    assert len(listed) == 1
    assert listed[0]["payload"] == '[{"type":"rect"}]'


def test_annotation_delete(client, subject):
    material_id = upload(client, subject["id"]).json()["id"]
    put_annotation(client, material_id, 2, "[]")

    assert (
        client.delete(f"/api/materials/{material_id}/annotations/2").status_code == 204
    )
    assert client.get(f"/api/materials/{material_id}/annotations").json() == []
    assert (
        client.delete(f"/api/materials/{material_id}/annotations/2").status_code == 404
    )


def test_annotation_rejects_page_zero(client, subject):
    material_id = upload(client, subject["id"]).json()["id"]
    assert put_annotation(client, material_id, 0, "[]").status_code == 422


def test_annotations_require_existing_material(client):
    assert (
        client.get("/api/materials/999/annotations").status_code == 404
    )
