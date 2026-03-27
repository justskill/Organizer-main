"""Utility script to reset a user's password from the command line."""

import asyncio
import sys

from sqlalchemy import text

from app.core.database import async_session_factory
from app.core.security import hash_password


async def reset(username: str, new_password: str):
    async with async_session_factory() as db:
        h = hash_password(new_password)
        result = await db.execute(
            text("UPDATE users SET password_hash = :h WHERE username = :u"),
            {"h": h, "u": username},
        )
        await db.commit()
        if result.rowcount:
            print(f"Password updated for '{username}'.")
        else:
            print(f"User '{username}' not found.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python reset_password.py <username> <new_password>")
        sys.exit(1)
    asyncio.run(reset(sys.argv[1], sys.argv[2]))
