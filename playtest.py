"""VICE COVER LAB play-test: serves app/, drives the real editor in headless
Chromium and asserts the loop works (load, upload a photo, crop/position,
edit words, change layout/grade, undo/redo, export all 3 sizes), then stages
the 4 screenshots from shots.json.

Headless SwiftShader is slow, so the test waits on state conditions and
window.__shotReady, not fixed sleeps. Screenshots are JPEG quality 88 and
must fit the gate (<=256 KiB, long side <=1280, short side >=480).

Usage: python3 playtest.py [--shots-only]
"""
import base64
import json
import os
import struct
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080"
ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, "shots.json")


def png_size(data_url):
    """Decodes a PNG data URL and returns (width, height), or None."""
    if not data_url.startswith("data:image/png;base64,"):
        return None
    raw = base64.b64decode(data_url.split(",", 1)[1])
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", raw[16:24])
    return w, h, len(raw)


def main():
    shots_only = "--shots-only" in sys.argv
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

    server = subprocess.Popen(
        ["node", "serve.ts", "--port", "8080"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(accept_downloads=True)
            page = ctx.new_page()
            page.set_viewport_size({"width": 1280, "height": 800})
            errors = []
            failed = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("requestfailed", lambda r: failed.append(r.url))

            if not shots_only:
                page.goto(BASE + "/", wait_until="load")
                page.wait_for_function("() => window.__vice && window.__vice.ready", timeout=30000)
                check("app boots, __vice ready", True)

                lib = page.evaluate("() => window.__vice.photos()")
                check("4 sample photos in library", lib == ["boulevard", "pier", "neon", "rooftop"], str(lib))

                fonts = page.evaluate(
                    "() => ({anton: document.fonts.check('80px Anton'), "
                    "pacifico: document.fonts.check('40px Pacifico'), "
                    "bebas: document.fonts.check('30px \"Bebas Neue\"')})")
                check("bundled fonts loaded", all(fonts.values()), str(fonts))

                def canvas_variance():
                    return page.evaluate(
                        """() => {
                          const c = document.getElementById('cover');
                          const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                          let s = 0; for (let i = 0; i < x.length; i += 401) s += x[i];
                          return s;
                        }""")
                v0 = canvas_variance()
                check("preview canvas paints (non-blank)", v0 > 1000, f"sum={v0}")

                # Upload a photo as the user would: a copy of a sample.
                user_photo = "/tmp/vice-user-photo.jpg"
                with open(os.path.join(ROOT, "app", "samples", "pier.jpg"), "rb") as f:
                    open(user_photo, "wb").write(f.read())
                page.set_input_files("#photo", user_photo)
                page.wait_for_function("() => window.__vice.photos().length === 5", timeout=15000)
                check("upload adds a photo to the library", True)
                sel_photo = page.evaluate("() => window.__vice.getState().panels[0].photo")
                check("uploaded photo fills the selected panel", sel_photo == 4, f"panel0 photo={sel_photo}")

                # Drag the hero panel to pan its photo.
                before = page.evaluate("() => window.__vice.getState().panels[0]")
                box = page.locator("#cover").bounding_box()
                page.mouse.move(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3)
                page.mouse.down()
                page.mouse.move(box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.4, steps=8)
                page.mouse.up()
                after = page.evaluate("() => window.__vice.getState().panels[0]")
                check("drag pans the photo", abs(after["ox"] - before["ox"]) > 0.01 or abs(after["oy"] - before["oy"]) > 0.01,
                      f"ox {before['ox']:.2f}->{after['ox']:.2f}")

                # Layout + grade + words change the render.
                page.evaluate("() => window.__vice.setState({layout: 'grid9', grade: 'neon', title: 'Test Drive', subtitle: 'playtest run'})")
                st = page.evaluate("() => window.__vice.getState()")
                check("layout/grade/title change state", st["layout"] == "grid9" and st["grade"] == "neon" and st["title"] == "Test Drive" and len(st["panels"]) == 9,
                      f"{st['layout']}/{st['grade']}/{len(st['panels'])} panels")

                # Undo returns to the previous state, redo reapplies.
                page.click("#undo")
                st2 = page.evaluate("() => window.__vice.getState()")
                check("undo restores previous state", st2["layout"] == "hero3" and st2["title"] == "Neon Shore",
                      f"{st2['layout']}/{st2['title']}")
                page.click("#redo")
                st3 = page.evaluate("() => window.__vice.getState()")
                check("redo reapplies", st3["layout"] == "grid9", st3["layout"])

                # Export all three sizes and validate the PNGs.
                exports = page.evaluate("async () => await window.__vice.exportAll()")
                ok = len(exports) == 3
                detail = []
                for e in exports:
                    got = png_size(e["dataUrl"])
                    good = got and got[0] == e["width"] and got[1] == e["height"] and got[2] > 10000
                    ok = ok and bool(good)
                    detail.append(f"{e['width']}x{e['height']}={got[2] // 1024}KB" if got else "bad png")
                check("export all 3 sizes as valid PNGs", ok, ", ".join(detail))

                # No failed requests: the app is offline.
                check("no failed requests (offline)", not failed, str(failed[:3]))
                check("zero JS errors", not errors, str(errors[:3]))

            # Screenshots from shots.json.
            with open(SHOTS) as f:
                shots = json.load(f)
            for shot in shots:
                p2 = ctx.new_page()
                p2.set_viewport_size({"width": shot["w"], "height": shot["h"]})
                errs = []
                p2.on("pageerror", lambda e: errs.append(str(e)))
                p2.goto(BASE + "/" + shot["query"], wait_until="load")
                p2.wait_for_function("() => window.__shotReady === true", timeout=30000)
                time.sleep(0.3)
                out = os.path.join(ROOT, "screenshots", shot["name"])
                png = p2.screenshot(type="png")
                p2.close()
                # JPEG at the highest quality that still fits the 256 KiB gate.
                from PIL import Image
                import io
                im = Image.open(io.BytesIO(png)).convert("RGB")
                quality = 82
                while True:
                    buf = io.BytesIO()
                    im.save(buf, "JPEG", quality=quality)
                    if len(buf.getvalue()) <= 250000 or quality <= 60:
                        open(out, "wb").write(buf.getvalue())
                        break
                    quality -= 8
                size = os.path.getsize(out)
                w, h = im.size
                ok = size <= 262144 and max(w, h) <= 1280 and min(w, h) >= 480 and not errs
                check(f"screenshot {shot['name']}", ok, f"{w}x{h} {size // 1024}KB q{quality} errs={errs[:1]}")

            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    failed_checks = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed_checks)}/{len(results)} checks PASS")
    sys.exit(1 if failed_checks else 0)


if __name__ == "__main__":
    main()
