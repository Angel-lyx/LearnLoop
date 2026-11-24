from collections.abc import Iterator

from sqlalchemy import Connection
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from .config import DATA_DIR, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

# 需要按账号隔离的表。升级前的库没有 user_id 列，迁移时补上。
SCOPED_TABLES = (
    "subject",
    "material",
    "annotation",
    "mistake",
    "exam",
    "task",
    "studyplan",
    "mindmap",
    "course",
    "scorerule",
    "bonusitem",
)

# 从单用户版本升级时，旧的 setting 表被改名到这里，等第一个账号注册后搬进去
LEGACY_SETTING_TABLE = "setting_legacy"


def init_db() -> None:
    from . import models  # noqa: F401  确保建表前模型已注册

    SQLModel.metadata.create_all(engine)
    migrate(engine)


def _table_exists(conn: Connection, table: str) -> bool:
    row = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).first()
    return row is not None


def _columns(conn: Connection, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {row[1] for row in conn.exec_driver_sql(f'PRAGMA table_info("{table}")')}


def migrate(target: Engine) -> None:
    """轻量迁移，兼容单用户版本留下的旧库。

    SQLite 不支持删列/改约束，所以涉及唯一约束的表走「建新表 + 拷贝 + 换名」。
    整个过程可重复执行：新库上除了补索引不会有任何改动。
    """
    from . import models  # noqa: F401

    with target.begin() as conn:
        # 顺序不能换：setting 要先换表结构，subject 重建时要能读到 user_id 列
        _migrate_legacy_setting(conn)
        _add_scope_columns(conn)
        _migrate_subject_unique(conn)
        _create_indexes(conn)


def _migrate_legacy_setting(conn: Connection) -> None:
    """旧 setting 表以 key 为主键，无法按账号隔离，改造成 (user_id, key)。"""
    columns = _columns(conn, "setting")
    if not columns or "user_id" in columns:
        return

    if _table_exists(conn, LEGACY_SETTING_TABLE):
        conn.exec_driver_sql(f'DROP TABLE "{LEGACY_SETTING_TABLE}"')
    conn.exec_driver_sql(f'ALTER TABLE "setting" RENAME TO "{LEGACY_SETTING_TABLE}"')
    conn.exec_driver_sql(
        """
        CREATE TABLE "setting" (
            user_id INTEGER NOT NULL,
            key VARCHAR(64) NOT NULL,
            value VARCHAR(500) NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY(user_id) REFERENCES "user" (id)
        )
        """
    )


def _single_column_unique(conn: Connection, table: str, column: str) -> bool:
    for row in conn.exec_driver_sql(f'PRAGMA index_list("{table}")').all():
        name, unique = row[1], row[2]
        if not unique:
            continue
        info = conn.exec_driver_sql(f'PRAGMA index_info("{name}")').all()
        if [item[2] for item in info] == [column]:
            return True
    return False


def _migrate_subject_unique(conn: Connection) -> None:
    """学科名从全局唯一改成按账号唯一。"""
    if not _table_exists(conn, "subject"):
        return
    if "user_id" not in _columns(conn, "subject"):
        return
    if not _single_column_unique(conn, "subject", "name"):
        return

    conn.exec_driver_sql('ALTER TABLE "subject" RENAME TO "subject_legacy_tmp"')
    conn.exec_driver_sql(
        """
        CREATE TABLE "subject" (
            id INTEGER NOT NULL,
            user_id INTEGER,
            name VARCHAR(50) NOT NULL,
            color VARCHAR(20) NOT NULL,
            icon VARCHAR(32) NOT NULL,
            archived BOOLEAN NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY(user_id) REFERENCES "user" (id)
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO "subject" (id, user_id, name, color, icon, archived, created_at, updated_at)
        SELECT id, user_id, name, color, icon, archived, created_at, updated_at
        FROM "subject_legacy_tmp"
        """
    )
    conn.exec_driver_sql('DROP TABLE "subject_legacy_tmp"')


def _add_scope_columns(conn: Connection) -> None:
    for table in SCOPED_TABLES:
        columns = _columns(conn, table)
        if columns and "user_id" not in columns:
            conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN user_id INTEGER')


def _create_indexes(conn: Connection) -> None:
    if _table_exists(conn, "subject"):
        conn.exec_driver_sql(
            'CREATE INDEX IF NOT EXISTS ix_subject_name ON "subject" (name)'
        )
        conn.exec_driver_sql(
            'CREATE UNIQUE INDEX IF NOT EXISTS uq_subject_user_name '
            'ON "subject" (user_id, name)'
        )
    for table in SCOPED_TABLES:
        if _table_exists(conn, table):
            conn.exec_driver_sql(
                f'CREATE INDEX IF NOT EXISTS ix_{table}_user_id '
                f'ON "{table}" (user_id)'
            )


def adopt_orphan_data(session: Session, user_id: int) -> int:
    """把升级前遗留（user_id 为空）的数据归给第一个注册的账号。

    新部署的库没有孤儿数据，这里什么都不做。
    """
    conn = session.connection()
    adopted = 0
    for table in SCOPED_TABLES:
        if "user_id" not in _columns(conn, table):
            continue
        result = conn.exec_driver_sql(
            f'UPDATE "{table}" SET user_id = ? WHERE user_id IS NULL', (user_id,)
        )
        adopted += max(result.rowcount or 0, 0)

    if _table_exists(conn, LEGACY_SETTING_TABLE):
        conn.exec_driver_sql(
            f'INSERT OR IGNORE INTO "setting" (user_id, key, value, updated_at) '
            f'SELECT ?, key, value, updated_at FROM "{LEGACY_SETTING_TABLE}"',
            (user_id,),
        )
        conn.exec_driver_sql(f'DROP TABLE "{LEGACY_SETTING_TABLE}"')

    session.commit()
    return adopted


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
