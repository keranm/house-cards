#!/usr/bin/env python3
"""Add house-cards to HACS as a custom repository and download it.

Adding a custom repository is NOT installing it -- HACS registers the repo and
then waits for a download that the UI would normally trigger. Both steps happen
here, and the script finishes by reading back the file HA actually serves and
comparing its length to dist/, because the CDN and the browser cache will both
happily hand you a stale copy of a file you just replaced.

Re-runnable. If the repo is already registered it skips straight to download.
"""
import json, pathlib, subprocess, sys, time, urllib.request

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import WS, base_url, token

REPO = "keranm/house-cards"
CATEGORY = "plugin"
SERVED = "/hacsfiles/house-cards/house-cards.js"
# Address comes from env.txt, which is not published.
BASE = base_url()

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

# HACS downloads the newest release IT KNOWS ABOUT, and what it knows about is
# whatever its last poll found. Cut a release and download straight away and it
# happily re-fetches the previous tag, reports success, and the byte check at
# the bottom is the only thing that notices. So: refresh first, and wait until
# the tag we just pushed is actually the one on offer.
#
# The tag has to come from the remote. `gh release create` tags on GitHub and
# does not write a local tag, so `git describe` here finds nothing at all --
# which is silent, and leaves this whole check skipped.
want = subprocess.run(["gh", "release", "view", "--json", "tagName", "-q", ".tagName"],
                      cwd=HERE.parent, capture_output=True, text=True).stdout.strip()
if want:
    print(f"waiting for HACS to see {want} …")
    for attempt in range(12):
        if (entry or {}).get("available_version") == want:
            break
        try:
            w.cmd(type="hacs/repository/refresh", repository=str(entry["id"]))
        except RuntimeError as e:
            print(f"  refresh returned: {e}")
        time.sleep(2.5)
        entry = find() or entry
    else:
        print(f"  WARNING: HACS still offers {(entry or {}).get('available_version')!r}")
    print(f"  available={(entry or {}).get('available_version')}")

# Idempotent: HACS re-downloads happily, and a
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
