"""单用户版本的旧库要能平滑升级到多账号结构，且数据不丢。"""

import sqlite3
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select

from app.db import LEGACY_SETTING_TABLE, adopt_orphan_data, migrate
from app.models import Material, Setting, Subject, User, utcnow

OLD_SCHEMA = [
    """
    CREATE TABLE subject (
        id INTEGER NOT NULL,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(20) NOT NULL,
        icon VARCHAR(32) NOT NULL,
        archived BOOLEAN NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (name)
    )
    """,
    """
    CREATE TABLE setting (
        key VARCHAR(64) NOT NULL,
        value VARCHAR(500) NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (key)
    )
    """,
    """
    CREATE TABLE material (
        id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        title VARCHAR(200) NOT NULL,
        filename VARCHAR(200) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        size INTEGER NOT NULL,
        storage_name VARCHAR(120) NOT NULL,
        page_count INTEGER NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(subject_id) REFERENCES subject (id)
    )
    """,
]


def _build_old_db(path: Path) -> None:
    connection = sqlite3.connect(path)
    for statement in OLD_SCHEMA:
        connection.execute(statement)
    connection.execute(
        "INSERT INTO subject VALUES (1, '高等数学', '#4F7CFF', 'book', 0, "
        "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
    )
    connection.execute(
        "INSERT INTO material VALUES (1, 1, '真题', '真题.pdf', 'pdf', 12, "
        "'abc.pdf', 1, '2026-01-02 00:00:00')"
    )
    connection.execute(
        "INSERT INTO setting VALUES ('deepseek_api_key', 'sk-legacy-key', "
        "'2026-01-03 00:00:00')"
    )
    connection.commit()
    connection.close()


def _columns(engine, table: str) -> set[str]:
    with engine.connect() as conn:
        return {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info("{table}")')}


def test_migrate_adds_scope_columns_and_keeps_rows(tmp_path):
    db_path = tmp_path / "legacy.db"
    _build_old_db(db_path)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")

    SQLModel.metadata.create_all(engine)
    migrate(engine)

    assert "user_id" in _columns(engine, "subject")
    assert "user_id" in _columns(engine, "material")
    assert "user_id" in _columns(engine, "setting")

    with Session(engine) as session:
        subject = session.exec(select(Subject).where(Subject.id == 1)).first()
        assert subject is not None
        assert subject.name == "高等数学"
        assert subject.user_id is None

        material = session.exec(select(Material).where(Material.id == 1)).first()
        assert material is not None
        assert material.storage_name == "abc.pdf"


def test_subject_name_unique_only_within_same_user(tmp_path):
    db_path = tmp_path / "legacy.db"
    _build_old_db(db_path)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)

    with engine.connect() as conn:
        indexes = {
            row[1]: row[2]
            for row in conn.exec_driver_sql('PRAGMA index_list("subject")').all()
        }
    assert indexes.get("uq_subject_user_name") == 1

    with Session(engine) as session:
        session.add_all(
            [
                Subject(user_id=1, name="大学物理"),
                Subject(user_id=2, name="大学物理"),
            ]
        )
        session.commit()

    with Session(engine) as session:
        session.add(Subject(user_id=1, name="大学物理"))
        try:
            session.commit()
        except Exception:  # noqa: BLE001  SQLite 抛 IntegrityError
            session.rollback()
        else:  # pragma: no cover - 约束失效时才会走到
            raise AssertionError("同一账号下的重名学科应当被拒绝")


def test_adopt_orphan_data_attaches_legacy_rows_to_first_user(tmp_path):
    db_path = tmp_path / "legacy.db"
    _build_old_db(db_path)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)

    with Session(engine) as session:
        owner = User(username="owner", password_hash="x")
        session.add(owner)
        session.commit()
        session.refresh(owner)
        owner_id = owner.id

        adopted = adopt_orphan_data(session, owner_id)
        assert adopted >= 2

    with Session(engine) as session:
        subject = session.get(Subject, 1)
        material = session.get(Material, 1)
        assert subject.user_id == owner_id
        assert material.user_id == owner_id

        # 旧库里的 API Key 跟着搬到（user_id, key）结构
        saved = session.get(Setting, (owner_id, "deepseek_api_key"))
        assert saved is not None
        assert saved.value == "sk-legacy-key"


def test_migrate_is_repeatable(tmp_path):
    db_path = tmp_path / "legacy.db"
    _build_old_db(db_path)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)
    migrate(engine)

    with Session(engine) as session:
        assert session.get(Subject, 1).name == "高等数学"


def test_migrate_recovers_rows_stranded_in_legacy_table(tmp_path):
    """重建中途被打断：新表建好了但没数据，旧数据还在临时表里。"""
    db_path = tmp_path / "broken.db"
    connection = sqlite3.connect(db_path)
    new_schema = """
        CREATE TABLE "{name}" (
            id INTEGER NOT NULL,
            user_id INTEGER,
            name VARCHAR(50) NOT NULL,
            color VARCHAR(20) NOT NULL,
            icon VARCHAR(32) NOT NULL,
            archived BOOLEAN NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id)
        )
    """
    connection.execute(new_schema.format(name="subject"))
    connection.execute(new_schema.format(name="subject_legacy_tmp"))
    connection.execute(
        "INSERT INTO subject_legacy_tmp VALUES (1, NULL, '高等数学', '#4F7CFF', "
        "'book', 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
    )
    connection.execute(
        "INSERT INTO subject_legacy_tmp VALUES (2, NULL, '大学物理', '#4F7CFF', "
        "'book', 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
    )
    connection.execute(
        "CREATE UNIQUE INDEX ix_subject_name ON subject_legacy_tmp (name)"
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)

    with engine.connect() as conn:
        tables = {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).all()
        }
        assert "subject_legacy_tmp" not in tables
        names = [
            row[0]
            for row in conn.exec_driver_sql("SELECT name FROM subject ORDER BY id").all()
        ]
        assert names == ["高等数学", "大学物理"]

        indexes = {
            row[1]: row[2]
            for row in conn.exec_driver_sql('PRAGMA index_list("subject")').all()
        }
        assert indexes.get("uq_subject_user_name") == 1
        assert indexes.get("ix_subject_name") == 0


def test_migrate_recovers_when_subject_table_missing(tmp_path):
    """重建更早一步被打断：旧表已删，新表还没改名。"""
    db_path = tmp_path / "broken2.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE "subject__new" (
            id INTEGER NOT NULL,
            user_id INTEGER,
            name VARCHAR(50) NOT NULL,
            color VARCHAR(20) NOT NULL,
            icon VARCHAR(32) NOT NULL,
            archived BOOLEAN NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id)
        )
        """
    )
    connection.execute(
        "INSERT INTO subject__new VALUES (1, NULL, '线性代数', '#4F7CFF', 'book', 0, "
        "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
    )
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)

    with engine.connect() as conn:
        assert "subject__new" not in {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).all()
        }
        assert conn.exec_driver_sql("SELECT name FROM subject").scalar() == "线性代数"


def test_fresh_database_needs_no_legacy_tables(tmp_path):
    db_path = tmp_path / "new.db"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    SQLModel.metadata.create_all(engine)
    migrate(engine)

    with Session(engine) as session:
        with engine.connect() as conn:
            tables = {
                row[0]
                for row in conn.exec_driver_sql(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).all()
            }
        assert LEGACY_SETTING_TABLE not in tables
        assert "user" in tables
        session.add(User(username="a", password_hash="x"))
        session.add(Setting(user_id=1, key="k", value="v", updated_at=utcnow()))
        session.commit()
