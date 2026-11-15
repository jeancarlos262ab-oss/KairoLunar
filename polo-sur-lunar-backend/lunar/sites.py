import json
from pathlib import Path

def load_sites(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))