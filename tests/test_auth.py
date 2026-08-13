"""
Tests — Auth

Couvre :
- create_jwt / decode_jwt : token valide → payload extrait
- decode_jwt : token expiré → None
- decode_jwt : token falsifié → None
- hash_password / verify_password : hash ≠ plain, vérification OK
- get_current_user : token manquant → 401
- get_current_user : token invalide → 401
- update_me : merge partiel de preferences (reading_language seul → autres clés conservées)
- update_me : full_name seul → preferences inchangées
"""

import time
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from argos.services.auth_service import create_jwt, decode_jwt, hash_password, verify_password


SECRET = "test-secret-key"


# ─── JWT ──────────────────────────────────────────────────────────────────────

class TestJWT:
    def test_valid_token_decoded(self):
        token = create_jwt({"sub": "42", "email": "a@b.com"}, SECRET, expire_minutes=60)
        payload = decode_jwt(token, SECRET)
        assert payload["sub"] == "42"
        assert payload["email"] == "a@b.com"

    def test_expired_token_returns_none(self):
        token = create_jwt({"sub": "1"}, SECRET, expire_minutes=-1)
        assert decode_jwt(token, SECRET) is None

    def test_wrong_secret_returns_none(self):
        token = create_jwt({"sub": "1"}, SECRET, expire_minutes=60)
        assert decode_jwt(token, "wrong-secret") is None

    def test_garbage_string_returns_none(self):
        assert decode_jwt("not.a.token", SECRET) is None


# ─── Password ─────────────────────────────────────────────────────────────────

class TestPassword:
    def test_hash_differs_from_plain(self):
        h = hash_password("mysecret123")
        assert h != "mysecret123"

    def test_verify_correct_password(self):
        h = hash_password("mysecret123")
        assert verify_password("mysecret123", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("mysecret123")
        assert verify_password("wrong", h) is False


# ─── get_current_user ─────────────────────────────────────────────────────────

class TestGetCurrentUser:
    def _make_db(self, user_row=None):
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        cur.fetchone = MagicMock(return_value=user_row)
        conn = MagicMock()
        conn.__enter__ = MagicMock(return_value=conn)
        conn.__exit__ = MagicMock(return_value=False)
        conn.cursor = MagicMock(return_value=cur)
        db = MagicMock()
        db.get_connection = MagicMock(return_value=conn)
        return db

    def test_missing_credentials_raises_401(self):
        from argos.api.auth import get_current_user
        db = self._make_db()
        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=None, db=db)
        assert exc.value.status_code == 401

    def test_invalid_token_raises_401(self):
        from argos.api.auth import get_current_user
        db = self._make_db()
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.token.here")
        with patch("argos.api.auth.decode_jwt", return_value=None):
            with pytest.raises(HTTPException) as exc:
                get_current_user(credentials=creds, db=db)
        assert exc.value.status_code == 401

    def test_user_not_found_raises_401(self):
        from argos.api.auth import get_current_user
        db = self._make_db(user_row=None)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.token")
        with patch("argos.api.auth.decode_jwt", return_value={"sub": "99"}):
            with pytest.raises(HTTPException) as exc:
                get_current_user(credentials=creds, db=db)
        assert exc.value.status_code == 401

    def test_valid_token_returns_user(self):
        from argos.api.auth import get_current_user
        db = self._make_db(user_row=(1, "a@b.com", "Alice", "user", True, {"reading_language": "en"}))
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.token")
        with patch("argos.api.auth.decode_jwt", return_value={"sub": "1"}):
            user = get_current_user(credentials=creds, db=db)
        assert user["id"] == 1
        assert user["preferences"]["reading_language"] == "en"


# ─── update_me — merge preferences ────────────────────────────────────────────

class TestUpdateMePreferences:
    def _make_db(self, return_row):
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        cur.fetchone = MagicMock(return_value=return_row)
        conn = MagicMock()
        conn.__enter__ = MagicMock(return_value=conn)
        conn.__exit__ = MagicMock(return_value=False)
        conn.cursor = MagicMock(return_value=cur)
        db = MagicMock()
        db.get_connection = MagicMock(return_value=conn)
        return db

    @pytest.mark.asyncio
    async def test_partial_preferences_merge_keeps_other_keys(self):
        """Envoyer reading_language seul ne doit pas effacer theme ou autre clé existante."""
        import json
        from argos.api.auth import update_me

        existing_prefs = {"reading_language": "fr", "theme": "dark"}
        user = {"id": 1, "email": "a@b.com", "full_name": "Alice", "role": "user",
                "onboarding_done": True, "preferences": existing_prefs}

        merged_prefs = {**existing_prefs, "reading_language": "en"}
        return_row = (1, "a@b.com", "Alice", "user", True, merged_prefs)
        db = self._make_db(return_row)

        result = await update_me(
            body={"preferences": {"reading_language": "en"}},
            user=user,
            db=db,
        )

        # Vérifier que le SQL reçu contient le merge (theme conservé)
        # Structure : execute(sql_string, (prefs_json, user_id))
        sql_call = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.execute
        call_args = sql_call.call_args
        sql_params = call_args[0][1]  # tuple de paramètres SQL
        prefs_json = sql_params[0]    # premier paramètre = JSON préférences
        prefs = json.loads(prefs_json)
        assert prefs["reading_language"] == "en"
        assert prefs["theme"] == "dark"

    @pytest.mark.asyncio
    async def test_full_name_update_does_not_touch_preferences(self):
        from argos.api.auth import update_me

        user = {"id": 1, "email": "a@b.com", "full_name": "Alice", "role": "user",
                "onboarding_done": True, "preferences": {"reading_language": "fr"}}

        return_row = (1, "a@b.com", "Bob", "user", True, {"reading_language": "fr"})
        db = self._make_db(return_row)

        result = await update_me(body={"full_name": "Bob"}, user=user, db=db)

        sql_call = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.execute
        sql_str = sql_call.call_args[0][0]
        # Le SET clause ne doit contenir que full_name, pas preferences
        assert "SET full_name" in sql_str
        assert "SET full_name = %s WHERE" in sql_str or "full_name = %s" in sql_str
        # Aucune valeur de preferences dans les arguments SQL
        positional_args = sql_call.call_args[0]
        assert not any(isinstance(a, str) and "reading_language" in a for a in positional_args)

    @pytest.mark.asyncio
    async def test_empty_body_returns_user_unchanged(self):
        from argos.api.auth import update_me

        user = {"id": 1, "email": "a@b.com", "full_name": "Alice", "role": "user",
                "onboarding_done": True, "preferences": {}}
        db = MagicMock()

        result = await update_me(body={}, user=user, db=db)

        assert result == user
        db.get_connection.assert_not_called()
