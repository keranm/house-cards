#!/usr/bin/env python3
"""Concatenate src/ into dist/house-cards.js.

Order is: src/core/*.js sorted, then src/cards/*.js sorted, then src/99-close.js.
The whole bundle is one IIFE -- 00-open.js opens it, 99-close.js closes it --
so the concatenation order is the only build step there is.

Edit src/, never dist/. 04-roles.generated.js comes from tools/gen_roles.py.
"""
import pathlib, subprocess, sys

HERE = pathlib.Path(__file__).parent
OUT = HERE / "dist" / "house-cards.js"

core = sorted((HERE / "src" / "core").glob("*.js"))
cards = sorted((HERE / "src" / "cards").glob("*.js"))
close = HERE / "src" / "99-close.js"

if not core:
    sys.exit("no core sources")
if not close.exists():
    sys.exit("missing src/99-close.js")

# HC.CSS is a template literal. A stray backtick anywhere inside it silently
# terminates the string and the bundle ships unparseable. Cheaper to refuse
# than to discover it as a blank dashboard.
tokens = HERE / "src" / "core" / "01-tokens.js"
if tokens.exists():
    body = tokens.read_text()
    opener = body.find("HC.CSS = `")
    if opener >= 0:
        rest = body[opener + len("HC.CSS = `"):]
        closer = rest.find("`;")
        stray = rest[:closer].count("`") if closer >= 0 else rest.count("`")
        if stray:
            sys.exit(f"01-tokens.js: {stray} stray backtick(s) inside HC.CSS")

parts = [p.read_text() for p in core + cards] + [close.read_text()]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("".join(parts))

# Parse check. A bundle that does not parse renders as a bare "Configuration
# error" box in Lovelace with nothing in the log pointing at the cause.
try:
    subprocess.run(["node", "--check", str(OUT)], check=True,
                   capture_output=True, text=True)
    checked = "node --check ok"
except FileNotFoundError:
    checked = "node not found -- SKIPPED parse check"
except subprocess.CalledProcessError as e:
    sys.exit(f"parse error in bundle:\n{e.stderr}")

kb = OUT.stat().st_size / 1024
print(f"wrote dist/house-cards.js  {kb:.1f} KiB  "
      f"({len(core)} core + {len(cards)} cards)  {checked}")
