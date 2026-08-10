#!/usr/bin/env python3
"""Add house-cards to HACS as a custom repository and download it.

Adding a custom repository is NOT installing it -- HACS registers the repo and
then waits for a download that the UI would normally trigger. Both steps happen
here, and the script finishes by reading back the file HA actually serves and
comparing its length to dist/, because the CDN and the browser cache will both
happily hand you a stale copy of a file you just replaced.

Re-runnable. If the repo is already registered it skips straight to download.
"""
import json, pathlib, sys, time, urllib.request

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import WS, token

REPO = "keranm/house-cards"
CATEGORY = "plugin"
SERVED = "/hacsfiles/house-cards/house-cards.js"
BASE = "http://homeassistant.local:8123"

local = (HERE.parent / "dist" / "house-cards.js").read_bytes()
print(f"local  dist/house-cards.js  {len(local)} bytes")

w = WS()


def repos():
    return w.cmd(type="hacs/repositories/list")


def find():
    for r in repos():
        if (r.get("full_name") or "").lower() == REPO.lower():
            return r
    return None


entry = find()
if entry is None:
    print(f"adding {REPO} …")
    w.cmd(type="hacs/repositories/add", repository=REPO, category=CATEGORY)
    for _ in range(20):
        time.sleep(1.5)
        entry = find()
        if entry:
            break
    if entry is None:
        sys.exit("repository never appeared in the HACS list")
print(f"repo id={entry.get('id')}  installed={entry.get('installed')}  "
      f"version={entry.get('installed_version')}  available={entry.get('available_version')}")

# Download the newest release. Idempotent: HACS re-downloads happily, and a
# re-download is exactly what a version bump needs.
print("downloading …")
try:
    w.cmd(type="hacs/repository/download", repository=str(entry["id"]))
except RuntimeError as e:
    print(f"  download returned: {e}")

time.sleep(3)
entry = find() or {}
print(f"after: installed={entry.get('installed')}  version={entry.get('installed_version')}")

# What does HA actually serve?
req = urllib.request.Request(BASE + SERVED,
                             headers={"Authorization": "Bearer " + token()})
try:
    served = urllib.request.urlopen(req).read()
except Exception as e:
    sys.exit(f"HA does not serve {SERVED}: {e}")

print(f"served {SERVED}  {len(served)} bytes")
if served == local:
    print("\nBYTES MATCH — HA is serving the build in dist/")
else:
    print("\nMISMATCH — HA is serving a different build.")
    print(f"  local {len(local)}  served {len(served)}")
    sys.exit(1)
