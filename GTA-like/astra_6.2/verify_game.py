"""Local browser acceptance tests. Start Vite before running this script."""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path(__file__).resolve().parent
URL=os.environ.get("DEADLINE_TEST_URL","http://127.0.0.1:5173/")
def run(engine,name):
    opts={"headless":True}
    if name=="chromium":
        opts.update(executable_path=engine.executable_path,args=["--enable-gpu","--use-angle=d3d11","--ignore-gpu-blocklist","--no-proxy-server"])
    browser=engine.launch(**opts)
    page=browser.new_page(viewport={"width":1920,"height":1080})
    errors=[]
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.set_default_timeout(20000)
    page.goto(URL)
    page.locator("#start").click()
    page.locator(".objective").wait_for()
    page.evaluate("""async()=>{const m=await import(document.querySelector('script[src*="/src/main.ts"]').src);
      window.g=m.game;window.level=await import('/src/level.ts');window.quest=await import('/src/campaign.ts');window.life=await import('/src/life.ts');
      g.pause();window.teleport=q=>{g.q={...q};g.prev={...q};g.view.snap(q);g.updateInteraction()};}""")
    checks=page.evaluate((ROOT/"verify_world.js").read_text(encoding="utf-8"))
    print(name,json.dumps(checks,ensure_ascii=False),flush=True)
    if errors:raise AssertionError(errors)
    if checks["issues"]:raise AssertionError(checks["issues"])
    scenarios=ROOT/"verify_play.js"
    if scenarios.exists():
        events=page.evaluate(scenarios.read_text(encoding="utf-8"))
        print(name,"situations",json.dumps(events,ensure_ascii=False),flush=True)
        if events["issues"]:raise AssertionError(events["issues"])
    result=page.evaluate((ROOT/"verify_routes.js").read_text(encoding="utf-8"))
    print(name,"routes",json.dumps(result,ensure_ascii=False),flush=True)
    if result["issues"]:raise AssertionError(result["issues"])
    if os.environ.get("DEADLINE_LIFE"):
        result=page.evaluate((ROOT/"verify_life.js").read_text(encoding="utf-8"))
        print(name,"ville",json.dumps(result,ensure_ascii=False),flush=True)
        if result["issues"]:raise AssertionError(result["issues"])
    if errors:raise AssertionError(errors)
    if name=="chromium" and os.environ.get("DEADLINE_CAPTURES"):
        out=ROOT/"captures";out.mkdir(exist_ok=True)
        page.set_viewport_size({"width":1440,"height":900})
        for label,q,mode in [("01-garage",[32,38.6],"foot"),("02-depot",[111,47.5],"foot"),("03-tunnel",[125,73.5],"foot"),("04-pont",[165,72],"car")]:
            page.evaluate("""([q,mode])=>{g.started=true;g.driving=mode==='car';g.q={x:q[0],z:q[1]};if(g.driving){g.car={...g.q};g.prevCar={...g.q};g.carAngle=0};g.prev={...g.q};g.view.snap(g.q);g.resume()}""",[q,mode])
            page.locator("#toast").evaluate("t=>t.classList.remove('visible')");page.wait_for_timeout(350);page.screenshot(path=str(out/(label+".webp")).replace(".webp",".jpg"),quality=89);page.evaluate("g.pause()")
    page.evaluate("""()=>{Object.assign(g.save,quest.fresh());g.save.done=['chip'];g.restore();g.startJob('delivery');g.step=1}""")
    page.reload();page.locator("#start").click();page.locator(".objective").wait_for()
    resumed=page.evaluate("""async()=>{const {game}=await import(document.querySelector('script[src*="/src/main.ts"]').src);const first=game.job==='delivery'&&game.step===0&&game.save.activeOffer==='C01-0'&&game.streets.open.has('shortcut');game.abandon();return first&&!game.job}""")
    if not resumed or errors:raise AssertionError([resumed,errors])
    class QuietFiles(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    local=ThreadingHTTPServer(("127.0.0.1",0),partial(QuietFiles,directory=str(ROOT/"dist")))
    worker=Thread(target=local.serve_forever,daemon=True);worker.start()
    try:
        page.goto(f"http://127.0.0.1:{local.server_port}/")
        page.locator("#start").click();page.locator(".objective").wait_for()
        page.keyboard.press("e");page.get_by_role("button",name="Accepter le contrat").click()
        page.keyboard.press("j");page.get_by_role("heading",name="Journal de mission").wait_for()
        if errors:raise AssertionError(errors)
        print(name,"version compilée, journal et briefing vérifiés",flush=True)
    finally:
        local.shutdown();local.server_close();browser.close()
if __name__=="__main__":
    with sync_playwright() as pw:
        for name in sys.argv[1:] or ["chromium","firefox"]:run(getattr(pw,name),name)
