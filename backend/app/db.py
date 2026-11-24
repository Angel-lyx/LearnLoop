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

    # 部署时 DATA_DIR 指向挂载卷，卷里可能还没有子目录；sqlite 不会自己建目录
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
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

    注意：pysqlite 的 DDL 在部分版本里是自动提交的，中途异常会留下半成品。
    所以每一步都先尝试修复上一次留下的临时表，重建也用「先建新表、再删旧表」的顺序，
    保证任何时刻都不会出现「数据只在临时表里」而又没人认领的情况。
    """
    from . import models  # noqa: F401

    with target.begin() as conn:
        # 顺序不能换：先把上次中断的残局收拾掉，再按 setting → 列 → 约束 → 索引推进
        _recover_subject(conn)
        _migrate_legacy_setting(conn)
        _add_scope_columns(conn)
        _migrate_subject_unique(conn)
        _create_indexes(conn)


SUBJECT_TEMP_TABLES = ("subject_legacy_tmp", "subject__new")


def _merge_rows(conn: Connection, source: str, target: str) -> None:
    """把临时表里 target 还没有的行补进去，然后删掉临时表。

    用普通 INSERT 而不是 INSERT OR IGNORE：真出现约束冲突就整体失败，
    数据留在临时表里等人处理，绝不静默丢行。
    """
    target_columns = _columns(conn, target)
    source_columns = _columns(conn, source)
    shared = [
        column
        for column in (
            "id",
            "user_id",
            "name",
            "color",
            "icon",
            "archived",
            "created_at",
            "updated_at",
        )
        if column in target_columns and column in source_columns
    ]
    columns = ", ".join(f'"{column}"' for column in shared)
    conn.exec_driver_sql(
        f'INSERT INTO "{target}" ({columns}) '
        f'SELECT {columns} FROM "{source}" '
        f'WHERE id NOT IN (SELECT id FROM "{target}")'
    )
    conn.exec_driver_sql(f'DROP TABLE "{source}"')


def _is_empty(conn: Connection, table: str) -> bool:
    return conn.exec_driver_sql(f'SELECT COUNT(*) FROM "{table}"').scalar() == 0


def _recover_subject(conn: Connection) -> None:
    """上次迁移中途断掉时，把数据从临时表搬回 subject。

    空表多半是 create_all 或上次失败的 DDL 留下的空壳，直接丢掉换成带数据的临时表；
    否则临时表里的 user_id 是空值，合并进 NOT NULL 的新表会失败。
    """
    for name in SUBJECT_TEMP_TABLES:
        if not _table_exists(conn, name):
            continue
        if "user_id" not in _columns(conn, name):
            # 早期版本的临时表还没 user_id 列，补上（可空）才能接住未认领的数据
            conn.exec_driver_sql(f'ALTER TABLE "{name}" ADD COLUMN user_id INTEGER')
        if not _table_exists(conn, "subject") or _is_empty(conn, "subject"):
            conn.exec_driver_sql('DROP TABLE IF EXISTS "subject"')
            conn.exec_driver_sql(f'ALTER TABLE "{name}" RENAME TO "subject"')
            continue
        _merge_rows(conn, name, "subject")


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
    """学科名从全局唯一改成按账号唯一。

    用「建新表 → 拷数据 → 删旧表 → 改名」的顺序：即使中途断掉，
    旧表或新表里总有一份完整数据，下次启动由 _recover_subject 收拾。
    """
    if not _table_exists(conn, "subject"):
        return
    if "user_id" not in _columns(conn, "subject"):
        return
    if not _single_column_unique(conn, "subject", "name"):
        return

    if _table_exists(conn, "subject__new"):
        conn.exec_driver_sql('DROP TABLE "subject__new"')
    conn.exec_driver_sql(
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
            PRIMARY KEY (id),
            FOREIGN KEY(user_id) REFERENCES "user" (id)
        )
        """
    )
    conn.exec_driver_sql(
        """
        INSERT INTO "subject__new"
            (id, user_id, name, color, icon, archived, created_at, updated_at)
        SELECT id, user_id, name, color, icon, archived, created_at, updated_at
        FROM "subject"
        """
    )
    conn.exec_driver_sql('DROP TABLE "subject"')
    conn.exec_driver_sql('ALTER TABLE "subject__new" RENAME TO "subject"')


def _add_scope_columns(conn: Connection) -> None:
    for table in SCOPED_TABLES:
        columns = _columns(conn, table)
        if columns and "user_id" not in columns:
            conn.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN user_id INTEGER')


def _ensure_index(
    conn: Connection, index: str, table: str, columns: str, unique: bool = False
) -> None:
    """建索引。同名索引若残留在别的表上（上次迁移的痕迹）先删掉再重建。"""
    owner = conn.exec_driver_sql(
        "SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?", (index,)
    ).first()
    if owner is not None:
        if owner[0] == table:
            return
        conn.exec_driver_sql(f'DROP INDEX "{index}"')
    kind = "UNIQUE INDEX" if unique else "INDEX"
    conn.exec_driver_sql(f'CREATE {kind} "{index}" ON "{table}" ({columns})')


def _create_indexes(conn: Connection) -> None:
    if _table_exists(conn, "subject"):
        _ensure_index(conn, "ix_subject_name", "subject", "name")
        _ensure_index(
            conn, "uq_subject_user_name", "subject", "user_id, name", unique=True
        )
    for table in SCOPED_TABLES:
        if _table_exists(conn, table):
            _ensure_index(conn, f"ix_{table}_user_id", table, "user_id")


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
