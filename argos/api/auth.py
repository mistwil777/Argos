"""
Auth API — register, login, me, update onboarding.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from argos.config import settings
from argos.database import DatabaseManager
from argos.services.auth_service import create_jwt, decode_jwt, hash_password, verify_password

logger = logging.getLogger(__name__)
auth_router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


def _get_db() -> DatabaseManager:
    from argos.api.router import db
    return db


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: DatabaseManager = Depends(_get_db),
) -> dict:
    """Dépendance FastAPI — retourne le user depuis le token Bearer."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token manquant")
    payload = decode_jwt(credentials.credentials, settings.jwt_secret)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, full_name, role, onboarding_done FROM users WHERE id = %s",
                (payload["sub"],),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "onboarding_done": row[4]}


@auth_router.post("/register", status_code=201)
async def register(body: dict, db: DatabaseManager = Depends(_get_db)):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    full_name = (body.get("full_name") or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email invalide")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min 8 caractères)")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Email déjà utilisé")
            cur.execute(
                """INSERT INTO users (email, password_hash, full_name)
                   VALUES (%s, %s, %s) RETURNING id""",
                (email, hash_password(password), full_name),
            )
            user_id = cur.fetchone()[0]
            conn.commit()

    token = create_jwt({"sub": user_id, "email": email}, settings.jwt_secret, settings.jwt_expire_minutes)
    return {"access_token": token, "token_type": "bearer", "email": email, "user_id": user_id}


@auth_router.post("/login")
async def login(body: dict, db: DatabaseManager = Depends(_get_db)):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, password_hash, full_name, role, onboarding_done FROM users WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()

    if not row or not verify_password(password, row[1]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    user_id, _, full_name, role, onboarding_done = row
    token = create_jwt({"sub": user_id, "email": email}, settings.jwt_secret, settings.jwt_expire_minutes)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": email, "full_name": full_name, "role": role, "onboarding_done": onboarding_done},
    }


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@auth_router.put("/me")
async def update_me(
    body: dict,
    user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(_get_db),
):
    fields = {}
    if "full_name" in body:
        fields["full_name"] = (body["full_name"] or "").strip()
    if "onboarding_done" in body:
        fields["onboarding_done"] = bool(body["onboarding_done"])

    if not fields:
        return user

    set_clause = ", ".join(f"{k} = %s" for k in fields)
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {set_clause} WHERE id = %s RETURNING id, email, full_name, role, onboarding_done",
                (*fields.values(), user["id"]),
            )
            row = cur.fetchone()
            conn.commit()

    return {"id": row[0], "email": row[1], "full_name": row[2], "role": row[3], "onboarding_done": row[4]}
