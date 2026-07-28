import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    db_host: str = os.getenv("SISPUBINT_DB_HOST", "localhost")
    db_port: int = int(os.getenv("SISPUBINT_DB_PORT", "5432"))
    db_name: str = os.getenv("SISPUBINT_DB_NAME", "sispubint")
    db_user: str = os.getenv("SISPUBINT_DB_USER", "postgres")
    db_password: str = os.getenv("SISPUBINT_DB_PASSWORD", "postgres")
    app_user: str = os.getenv("SISPUBINT_APP_USER", "admin")


settings = Settings()
