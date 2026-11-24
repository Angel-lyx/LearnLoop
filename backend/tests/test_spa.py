"""部署形态：FastAPI 同时托管前端打包产物。"""

import pytest

from app.main import FRONTEND_DIST

pytestmark = pytest.mark.skipif(
    not (FRONTEND_DIST / "index.html").is_file(),
    reason="需要先 pnpm build 生成 frontend/dist",
)


def test_root_serves_index_html(anon_client):
    response = anon_client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert 'id="root"' in response.text


def test_deep_link_falls_back_to_index(anon_client):
    # 刷新 /subjects 这类前端路由不能 404
    response = anon_client.get("/subjects")
    assert response.status_code == 200
    assert 'id="root"' in response.text


def test_static_asset_is_served(anon_client):
    response = anon_client.get("/favicon.svg")
    assert response.status_code == 200
    assert "svg" in response.headers["content-type"]


def test_unknown_api_path_stays_404(anon_client):
    response = anon_client.get("/api/definitely-not-a-route")
    assert response.status_code == 404
    assert 'id="root"' not in response.text


def test_api_still_requires_login(client, anon_client):
    assert anon_client.get("/api/subjects").status_code == 401
    assert client.get("/api/subjects").status_code == 200


def test_path_traversal_is_rejected(anon_client):
    response = anon_client.get("/../backend/app/main.py")
    # 不能把仓库里的源码当静态文件吐出去
    assert "import" not in response.text[:200]
