import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("CAMPUSPULSE_DB_PATH", "/tmp/campuspulse.db")

from app import app

app.config["SESSION_COOKIE_SECURE"] = True
