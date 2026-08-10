"""Minimal Home Assistant websocket client.

Both the instance address and the token come from `env.txt` two directories up
-- neither is written here. This file is published; that one is not.

env.txt is `key: value`, one per line:

    ha_api_token: <long-lived access token>
    ha_ws_url:    ws://<host>:8123/api/websocket
    ha_base_url:  http://<host>:8123

Parse it PER LINE. `read().split(':', 1)[1]` takes the token plus every line
after it, and auth then fails with an empty frame or a bare 401 -- the single
most repeated bug in this collection of projects.
"""
import json, pathlib, websocket

ENV = pathlib.Path(__file__).resolve().parents[2] / "env.txt"
DEFAULT_WS = "ws://homeassistant.local:8123/api/websocket"
DEFAULT_BASE = "http://homeassistant.local:8123"


def _env(key, default=None):
    try:
        for line in ENV.read_text().splitlines():
            if line.startswith(key + ":"):
                return line.split(":", 1)[1].strip()
    except FileNotFoundError:
        raise RuntimeError(f"{ENV} not found -- see this module's docstring")
    if default is None:
        raise RuntimeError(f"no {key} in {ENV.name}")
    return default


def token():
    return _env("ha_api_token")


def ws_url():
    return _env("ha_ws_url", DEFAULT_WS)


def base_url():
    """REST base, e.g. http://host:8123 -- used by everything that is not WS."""
    return _env("ha_base_url", DEFAULT_BASE).rstrip("/")


class WS:
    def __init__(self):
        self.ws = websocket.create_connection(ws_url(), timeout=180)
        self.ws.recv()                                   # auth_required
        self.ws.send(json.dumps({"type": "auth", "access_token": token()}))
        auth = json.loads(self.ws.recv())
        if auth.get("type") != "auth_ok":
            raise RuntimeError(auth)
        self.i = 0

    def cmd(self, **m):
        # Ids must increase monotonically per connection; reuse one and HA
        # closes the socket.
        self.i += 1
        m["id"] = self.i
        self.ws.send(json.dumps(m))
        while True:
            raw = self.ws.recv()
            if not raw:
                continue
            r = json.loads(raw)
            if r.get("id") == self.i and r.get("type") == "result":
                if not r.get("success"):
                    raise RuntimeError(json.dumps(r.get("error")))
                return r.get("result")
