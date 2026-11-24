from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from .config import DATA_DIR, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    from . import models  # noqa: F401  确保建表前模型已注册

    SQLModel.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    """轻量迁移：给已存在的表补上新列（SQLite 不支持自动加列）。"""
    additions = {
        "task": {
            "detail": "TEXT DEFAULT ''",
            "resources": "TEXT DEFAULT '[]'",
        }
    }
    with engine.connect() as connection:
        for table, columns in additions.items():
            existing = {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info({table})")
            }
            if not existing:
                continue
            for name, ddl in columns.items():
                if name not in existing:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"
                    )
        connection.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
