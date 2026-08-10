import json, websocket

def token():
    for line in open('../../env.txt'):
        if line.startswith('ha_api_token:'):
            return line.split(':', 1)[1].strip()
    raise RuntimeError('no token in env.txt')

class WS:
    def __init__(self):
        self.ws = websocket.create_connection("ws://homeassistant.local:8123/api/websocket", timeout=180)
        self.ws.recv()
        self.ws.send(json.dumps({"type": "auth", "access_token": token()}))
        auth = json.loads(self.ws.recv())
        if auth.get("type") != "auth_ok":
            raise RuntimeError(auth)
        self.i = 0

    def cmd(self, **m):
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
