"""两个账号共用一套部署时，任何接口都不能看到或改动别人的数据。"""

import io
import json
import zipfile

from fastapi.testclient import TestClient


def _pdf(name: str = "真题.pdf") -> dict:
    return {"file": (name, b"%PDF-1.4", "application/pdf")}


def test_subjects_are_isolated(client, other_client):
    created = client.post("/api/subjects", json={"name": "高等数学"}).json()
    subject_id = created["id"]

    assert other_client.get("/api/subjects").json() == []
    assert (
        other_client.patch(f"/api/subjects/{subject_id}", json={"name": "偷改"}).status_code
        == 404
    )
    assert other_client.delete(f"/api/subjects/{subject_id}").status_code == 404
    # 原账号的数据没有被影响
    assert [item["name"] for item in client.get("/api/subjects").json()] == ["高等数学"]


def test_same_subject_name_allowed_for_different_accounts(client, other_client):
    assert client.post("/api/subjects", json={"name": "高等数学"}).status_code == 201
    assert other_client.post("/api/subjects", json={"name": "高等数学"}).status_code == 201


def test_materials_and_annotations_are_isolated(client, other_client, subject):
    material = client.post(
        f"/api/subjects/{subject['id']}/materials", files=_pdf()
    ).json()
    client.put(
        f"/api/materials/{material['id']}/annotations/1", json={"payload": "[]"}
    )

    assert other_client.get(f"/api/subjects/{subject['id']}/materials").status_code == 404
    assert other_client.get(f"/api/materials/{material['id']}").status_code == 404
    assert other_client.get(f"/api/materials/{material['id']}/file").status_code == 404
    assert (
        other_client.get(f"/api/materials/{material['id']}/annotations").status_code
        == 404
    )
    assert (
        other_client.put(
            f"/api/materials/{material['id']}/annotations/1", json={"payload": "x"}
        ).status_code
        == 404
    )
    assert other_client.delete(f"/api/materials/{material['id']}").status_code == 404
    # 上传到自己账号下也不允许挂到别人的学科
    assert (
        other_client.post(
            f"/api/subjects/{subject['id']}/materials", files=_pdf("别人的.pdf")
        ).status_code
        == 404
    )


def test_mistakes_are_isolated(client, other_client, subject):
    mistake = client.post(
        f"/api/subjects/{subject['id']}/mistakes", json={"question": "求极限"}
    ).json()

    assert other_client.get(f"/api/subjects/{subject['id']}/mistakes").status_code == 404
    assert other_client.get(f"/api/mistakes/{mistake['id']}").status_code == 404
    assert (
        other_client.patch(
            f"/api/mistakes/{mistake['id']}", json={"status": "mastered"}
        ).status_code
        == 404
    )
    assert other_client.delete(f"/api/mistakes/{mistake['id']}").status_code == 404


def test_exams_and_plans_are_isolated(client, other_client, subject):
    exam = client.post(
        f"/api/subjects/{subject['id']}/exams",
        json={"title": "期末", "exam_date": "2099-01-10"},
    ).json()

    assert other_client.get("/api/exams").json() == []
    assert other_client.get(f"/api/subjects/{subject['id']}/exams").status_code == 404
    assert other_client.post(f"/api/exams/{exam['id']}/plan").status_code == 404
    assert other_client.get(f"/api/exams/{exam['id']}/plan/ai").status_code == 404
    assert other_client.delete(f"/api/exams/{exam['id']}").status_code == 404


def test_tasks_are_isolated(client, other_client):
    task = client.post(
        "/api/tasks",
        json={"title": "背单词", "due_date": "2020-01-01"},
    ).json()

    assert other_client.get("/api/tasks").json() == []
    assert (
        other_client.patch(f"/api/tasks/{task['id']}", json={"done": True}).status_code
        == 404
    )
    assert other_client.delete(f"/api/tasks/{task['id']}").status_code == 404
    assert client.get("/api/tasks").json()[0]["title"] == "背单词"


def test_mindmaps_are_isolated(client, other_client, subject):
    mindmap = client.post(
        f"/api/subjects/{subject['id']}/maps", json={"title": "极限"}
    ).json()

    assert other_client.get(f"/api/subjects/{subject['id']}/maps").status_code == 404
    assert other_client.get(f"/api/maps/{mindmap['id']}").status_code == 404
    assert (
        other_client.patch(f"/api/maps/{mindmap['id']}", json={"title": "改"}).status_code
        == 404
    )
    assert other_client.delete(f"/api/maps/{mindmap['id']}").status_code == 404


def test_research_data_is_isolated(client, other_client):
    client.post(
        "/api/research/courses",
        json={"name": "高等数学", "credits": 4, "score": 95},
    )
    client.post(
        "/api/research/bonus",
        json={"dimension": "智", "title": "竞赛", "score": 5},
    )
    client.put("/api/research/weights", json={"course_weight": 0.6})

    assert other_client.get("/api/research/courses").json() == []
    assert other_client.get("/api/research/bonus").json() == []
    assert other_client.get("/api/research/weights").json()["course_weight"] == 0.7

    overview = other_client.get("/api/research/overview").json()
    assert overview["courses"]["count"] == 0
    assert overview["zongce"]["total"] == 0


def test_ai_key_is_per_account(client, other_client):
    client.put("/api/settings/ai", json={"api_key": "sk-tester-own-key"})
    assert client.get("/api/settings/ai").json()["configured"] is True
    assert other_client.get("/api/settings/ai").json()["configured"] is False


def test_search_does_not_leak_other_accounts(client, other_client, subject):
    client.post(f"/api/subjects/{subject['id']}/mistakes", json={"question": "洛必达法则"})
    result = other_client.get("/api/search", params={"q": "洛必达"}).json()
    assert result == {"subjects": [], "materials": [], "mistakes": [], "maps": []}


def test_delete_subject_keeps_other_subject_files(client, other_client, subject):
    client.post(f"/api/subjects/{subject['id']}/materials", files=_pdf())
    other_subject = other_client.post("/api/subjects", json={"name": "大学物理"}).json()
    other_material = other_client.post(
        f"/api/subjects/{other_subject['id']}/materials", files=_pdf("物理.pdf")
    ).json()

    assert client.delete(f"/api/subjects/{subject['id']}").status_code == 204
    assert (
        other_client.get(f"/api/materials/{other_material['id']}/file").status_code == 200
    )


def test_backup_export_only_contains_own_data(client, other_client, subject):
    other_client.post("/api/subjects", json={"name": "大学物理"})
    archive = zipfile.ZipFile(io.BytesIO(client.get("/api/backup/export").content))
    manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    names = [item["name"] for item in manifest["subjects"]]
    assert names == ["高等数学"]


def test_second_account_does_not_need_registration_code(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "registration_code", "invite-123", raising=False)
    other = TestClient(client.app)
    response = other.post(
        "/api/auth/register",
        json={"username": "newbie", "password": "learnloop-test-789"},
    )
    assert response.status_code == 403
    other.close()
