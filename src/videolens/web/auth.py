from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


PASSWORD_ITERATIONS = 600_000


class AuthError(Exception):
    """Base class for recoverable authentication and key-storage errors."""


class DuplicateUserError(AuthError):
    """Raised when an email address is already registered."""


class KeyDecryptError(AuthError):
    """Raised when a saved API key cannot be decrypted with the current secret."""


@dataclass(frozen=True)
class AuthUser:
    id: int
    email: str


class AuthStore:
    def __init__(self, db_path: Path, secret: str) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
        self._fernet = Fernet(key)
        self._init_schema()

    @classmethod
    def default(cls) -> AuthStore:
        data_dir = app_data_dir()
        return cls(data_dir / "auth.sqlite3", _load_or_create_secret(data_dir))

    def create_user(self, email: str, password: str) -> AuthUser:
        normalized = normalize_email(email)
        _validate_email(normalized)
        _validate_password(password)
        password_hash = hash_password(password)
        now = _now()

        try:
            with self._connect() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO users (email, password_hash, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (normalized, password_hash, now),
                )
                user_id = int(cursor.lastrowid)
        except sqlite3.IntegrityError as exc:
            raise DuplicateUserError("An account already exists for that email.") from exc

        return AuthUser(id=user_id, email=normalized)

    def authenticate(self, email: str, password: str) -> AuthUser | None:
        normalized = normalize_email(email)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, email, password_hash FROM users WHERE email = ?",
                (normalized,),
            ).fetchone()

        if row is None or not verify_password(password, row["password_hash"]):
            return None
        return AuthUser(id=int(row["id"]), email=row["email"])

    def save_api_key(self, user_id: int, api_key: str) -> None:
        key = api_key.strip()
        if not key:
            raise AuthError("OpenAI API key cannot be blank.")

        encrypted = self._fernet.encrypt(key.encode("utf-8")).decode("utf-8")
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO api_keys (user_id, encrypted_key, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    encrypted_key = excluded.encrypted_key,
                    updated_at = excluded.updated_at
                """,
                (user_id, encrypted, now),
            )

    def get_api_key(self, user_id: int) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT encrypted_key FROM api_keys WHERE user_id = ?",
                (user_id,),
            ).fetchone()

        if row is None:
            return None

        try:
            return self._fernet.decrypt(row["encrypted_key"].encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise KeyDecryptError(
                "Saved OpenAI API key cannot be decrypted. Update the key in Account settings."
            ) from exc

    def has_api_key(self, user_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM api_keys WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return row is not None

    def delete_api_key(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM api_keys WHERE user_id = ?", (user_id,))

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    user_id INTEGER PRIMARY KEY,
                    encrypted_key TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )


def app_data_dir() -> Path:
    configured = os.environ.get("VIDEOLENS_DATA_DIR")
    if configured:
        return Path(configured)

    cache_dir = os.environ.get("VIDEOLENS_CACHE_DIR")
    if cache_dir:
        return Path(cache_dir).parent

    return Path.cwd() / ".videolens"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_ITERATIONS}$"
        f"{base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
    except (ValueError, TypeError):
        return False

    return secrets.compare_digest(actual, expected)


def _load_or_create_secret(data_dir: Path) -> str:
    env_secret = os.environ.get("VIDEOLENS_SECRET_KEY")
    if env_secret:
        return env_secret

    data_dir.mkdir(parents=True, exist_ok=True)
    secret_path = data_dir / "auth.secret"
    if secret_path.exists():
        return secret_path.read_text().strip()

    secret = secrets.token_urlsafe(48)
    secret_path.write_text(secret)
    secret_path.chmod(0o600)
    return secret


def _validate_email(email: str) -> None:
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise AuthError("Enter a valid email address.")


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise AuthError("Password must be at least 8 characters.")


def _now() -> str:
    return datetime.now(UTC).isoformat()
