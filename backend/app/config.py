from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    """运行期配置。敏感项只从环境变量或 backend/.env 读取，不进代码库。"""

    app_name: str = "LearnLoop API"
    data_dir: Path = DATA_DIR
    # 留空则根据 data_dir 推导；部署时可用 DATABASE_URL 指向别处
    database_url: str = ""
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    max_upload_mb: int = 50
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"

    # 账号体系
    session_cookie_name: str = "learnloop_session"
    session_days: int = 30
    # 部署到公网且走 HTTPS 时设为 true，浏览器只在加密连接上发送 Cookie
    session_cookie_secure: bool = False
    allow_registration: bool = True
    # 设置后注册必须填写邀请码，避免公网地址被陌生人注册
    registration_code: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _fill_database_url(self) -> "Settings":
        if not self.database_url.strip():
            self.database_url = f"sqlite:///{(self.data_dir / 'learnloop.db').as_posix()}"
        return self

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
