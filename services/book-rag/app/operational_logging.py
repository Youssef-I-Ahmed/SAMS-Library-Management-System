"""Fixed operational events only; never record caller content or exceptions."""
import json
import logging

log = logging.getLogger("sams_api")


def record_operation(event, *, cached=False):
    if event not in {"ask_completed", "ask_cached", "ask_failed"}:
        raise ValueError("Unknown operational event")
    log.info(json.dumps({"event": event, "cached": cached is True}, separators=(",", ":")))
