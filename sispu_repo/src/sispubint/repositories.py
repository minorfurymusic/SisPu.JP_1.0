from __future__ import annotations
from typing import Any
from sispubint.db import get_connection


class RepositoryError(RuntimeError):
    pass


class SecretariasRepository:
    def listar(self) -> list[dict[str, Any]]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute('select id, codigo_legado, nome, ativo from secretarias order by nome')
            return list(cur.fetchall())

    def salvar(self, codigo_legado: int | None, nome: str) -> None:
        nome = nome.strip().upper()
        if not nome:
            raise RepositoryError("Informe o nome da secretaria.")
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                'insert into secretarias (codigo_legado, nome) values (%s, %s)',
                (codigo_legado, nome),
            )
            conn.commit()


class AuditoriaRepository:
    def listar(self, limite: int = 200) -> list[dict[str, Any]]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                '''
                select id, tabela, registro_pk, acao, usuario, criado_em
                from auditoria_registros
                order by criado_em desc
                limit %s
                ''',
                (limite,),
            )
            return list(cur.fetchall())
