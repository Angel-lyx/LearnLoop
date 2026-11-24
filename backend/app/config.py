from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    """运行期配置。敏感项只从环境变量或 backend/.env 读取，不进代码库。"""

    app_name: str = "LearnLoop API"
    database_url: str = f"sqlite:///{(DATA_DIR / 'learnloop.db').as_posix()}"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
