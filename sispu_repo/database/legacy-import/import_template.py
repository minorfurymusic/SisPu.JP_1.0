"""Template de importação do banco legado.

Ajuste os caminhos dos CSVs e o mapeamento conforme o dump real do banco antigo.
"""
from pathlib import Path
import csv
from sispubint.db import get_connection


def importar_secretarias(csv_path: Path) -> None:
    with csv_path.open(newline='', encoding='utf-8-sig') as f, get_connection() as conn:
        reader = csv.DictReader(f)
        with conn.cursor() as cur:
            for row in reader:
                cur.execute(
                    """
                    insert into secretarias(codigo_legado, nome)
                    values (%s, %s)
                    on conflict (codigo_legado) do update set nome = excluded.nome
                    """,
                    (row.get('CODSEC'), row.get('DESSEC')),
                )
        conn.commit()


if __name__ == '__main__':
    importar_secretarias(Path('Secretarias.csv'))
