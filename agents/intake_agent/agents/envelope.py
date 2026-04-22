import uuid
from datetime import datetime, timezone

def create_envelope(raw_text: str) -> dict:
    return {
        "envelope_id": "ENV-" + str(uuid.uuid4())[:6].upper(),
        "raw_text": raw_text,
        "received_at": datetime.now(timezone.utc).isoformat()
    }