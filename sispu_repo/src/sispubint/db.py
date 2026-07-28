from contextlib import contextmanager
from typing import Iterator
import psycopg
from psycopg.rows import dict_row
from sispubint.config import settings


def connection_string() -> str:
    return (
        f"host={settings.db_host} "
        f"port={settings.db_port} "
        f"dbname={settings.db_name} "
        f"user={settings.db_user} "
        f"password={settings.db_password}"
    )


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(connection_string(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("select set_config('app.usuario', %s, true)", (settings.app_user,))
        yield conn
