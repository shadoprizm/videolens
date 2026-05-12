from __future__ import annotations

import pytest

from videolens.web.auth import AuthError, AuthStore, DuplicateUserError


def test_user_can_register_login_and_manage_api_key(tmp_path):
    store = AuthStore(tmp_path / "auth.sqlite3", "test-secret")

    user = store.create_user("USER@example.com", "correct horse battery staple")

    assert user.email == "user@example.com"
    assert store.authenticate("user@example.com", "wrong password") is None
    assert store.authenticate("USER@example.com", "correct horse battery staple") == user
    assert not store.has_api_key(user.id)
    assert store.get_api_key(user.id) is None

    store.save_api_key(user.id, "sk-test")

    assert store.has_api_key(user.id)
    assert store.get_api_key(user.id) == "sk-test"

    store.delete_api_key(user.id)

    assert not store.has_api_key(user.id)
    assert store.get_api_key(user.id) is None


def test_duplicate_users_are_rejected(tmp_path):
    store = AuthStore(tmp_path / "auth.sqlite3", "test-secret")
    store.create_user("user@example.com", "correct horse battery staple")

    with pytest.raises(DuplicateUserError):
        store.create_user("USER@example.com", "correct horse battery staple")


def test_blank_api_key_is_rejected(tmp_path):
    store = AuthStore(tmp_path / "auth.sqlite3", "test-secret")
    user = store.create_user("user@example.com", "correct horse battery staple")

    with pytest.raises(AuthError):
        store.save_api_key(user.id, " ")
