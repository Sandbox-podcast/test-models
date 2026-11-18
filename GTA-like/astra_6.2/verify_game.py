"""Optional desktop smoke test. Start Vite, then run with Python Playwright installed."""
import os
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
URL = os.environ.get("DEADLINE_TEST_URL", "http://127.0.0.1:5173")
SETUP = """async () => {
 const src=document.querySelector('script[src*="/src/main.ts"]').src;
 const {game:g}=await import(src); const {sites,distance,p}=await import('/src/level.ts');
 window.testGame=g; window.sites=sites;
 window.walkTo=(dest) => {
   const path=g.streets.path(g.q,dest);
   const total=distance(g.q,dest);
   for(const node of path) {
     let steps=0;
     while(distance(g.q,node)>.11 && steps++<1600){
       const dx=node.x-g.q.x,dz=node.z-g.q.z;
       g.keys.clear();g.keys.add('shift');
       if(Math.abs(dx)>.065)g.keys.add(dx>0?'d':'a');
       if(Math.abs(dz)>.065)g.keys.add(dz>0?'s':'w');
       g.simulate(1/60);
       if(g.health<=0)throw Error('Died at '+JSON.stringify([g.q,node,dest,g.source,path]));
       if(steps===1600)throw Error('Blocked at '+JSON.stringify(g.q)+' toward '+JSON.stringify(node));
     }
   }
   g.keys.clear();g.view.snap(g.q);g.updateInteraction();
   if(distance(g.q,dest)>1)throw Error('Incomplete path '+JSON.stringify([g.q,dest]));
   return Math.round(total);
 };
 window.at=(pos)=>{g.q={...pos};g.prev={...pos};g.view.snap(pos);g.updateInteraction()};
}"""

def run(engine, name):
    browser = engine.launch(headless=True, args=["--enable-unsafe-swiftshader","--no-proxy-server"] if name == "chromium" else [])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.set_default_timeout(15000)
    page.goto(URL, wait_until="networkidle")
    page.get_by_role("button", name="Commandes", exact=True).click()
    assert page.get_by_role("heading", name="Commandes").is_visible()
    page.keyboard.press("Escape")
    page.locator("[data-act=atlas]").first.click()
    assert page.get_by_role("heading", name="Carte de la ville").is_visible()
    page.locator(".brand").click()
    def enter():
        page.locator("#start").click()
        page.locator(".objective").wait_for()
        page.evaluate(SETUP)
    def action():
        page.keyboard.press("e")
    def choose(label):
        if not page.get_by_role("button",name=label,exact=True).count():
            print("Expected",label,"HUD",page.locator("#hud").inner_text(),"Dialog",page.locator("#modal").inner_text(),"State",page.evaluate("({paused:testGame.paused,hint:testGame.hint,q:testGame.q})"),flush=True)
        page.get_by_role("button", name=label, exact=True).click()
    def at(site):
        page.evaluate("s=>at(sites[s])", site)
    def walk(site):
        return page.evaluate("s=>walkTo(sites[s])", site)
    def state():
        return page.evaluate("JSON.parse(localStorage.getItem('deadline.courier.v1'))")
    enter()
    if os.environ.get("DEADLINE_SCREENSHOT"):
        page.screenshot(path=f"game-{name}.jpg",quality=85)
    action()
    choose("Accepter le contrat")
    assert state()["active"] == "chip"
    # A reload of the active sequence must reconstruct the briefing checkpoint.
    page.reload(wait_until="networkidle")
    enter()
    assert page.evaluate("testGame.step===0 && testGame.health===100")
    # The actual movement simulation traverses the avenue and the main entrance.
    page.evaluate("walkTo({x:-40,z:23});walkTo({x:-55,z:23});walkTo({x:-55,z:0});walkTo({x:-27,z:0});walkTo({x:-27,z:-11})")
    walk("chip")
    action()
    assert page.evaluate("testGame.step===1")
    walk("drop")
    page.evaluate("for(let i=0;i<400;i++)testGame.simulate(1/60)")
    action()
    choose("Suivre la piste de Mina")
    assert state()["money"] == 450
    page.reload(wait_until="networkidle")
    enter()
    assert page.evaluate("testGame.streets.open.has('shortcut')")
    # Actual driving and collision sweep against an immovable wall.
    at("car");action()
    assert page.evaluate("testGame.driving")
    page.evaluate("testGame.keys.add('w');for(let i=0;i<90;i++)testGame.simulate(1/60);testGame.keys.clear()")
    assert page.evaluate("testGame.speed>8 && testGame.car.x>sites.car.x+5")
    page.evaluate("testGame.keys.add(' ');for(let i=0;i<70;i++)testGame.simulate(1/60);testGame.keys.clear()")
    action()
    assert page.evaluate("!testGame.driving")
    assert page.evaluate("testGame.streets.move({x:-44,z:18},0,-20,true,0).z>16")
    # Walk the mission states for both optional contacts and their final effect.
    at("contact");action();choose("Accepter le contrat")
    at("parcel");action();at("contact");action()
    at("mina");action();choose("Accepter le contrat")
    at("ledger");action()
    route = "collectif" if name=="chromium" else "sorel"
    at("mina" if route=="collectif" else "sorel");action();choose("Remettre le registre")
    assert state()["route"] == route
    at("mina" if route=="collectif" else "sorel");action();choose("Accepter le contrat")
    at("gallery" if route=="collectif" else "service");action();at("core");action()
    choose("Publier le registre" if name=="chromium" else "Sceller les identités")
    choose("Retourner en ville")
    at("sorel");action();choose("Accepter le contrat");at("relay");action();at("sorel");action()
    assert len(state()["done"]) == 5 and state()["money"] == 2600
    print(name, "PASS", state()["done"], state()["route"], state()["ending"], flush=True)
    if name=="chromium":
        page.keyboard.press("j")
        choose("Nouvelle campagne");choose("Recommencer");enter()
        action();choose("Accepter le contrat")
        at("chip");action()
        page.evaluate("testGame.damage(100)")
        choose("Reprendre au briefing")
        assert page.evaluate("testGame.step===0 && testGame.health===100 && testGame.people.every(n=>n.hp>0)")
        page.evaluate("""() => {
          const g=testGame;
          window.driveTo=(x,z)=>{
            for(let i=0;i<1500;i++){
              const dx=x-g.car.x,dz=z-g.car.z,dist=Math.hypot(dx,dz);
              if(dist<1.35)break;
              const heading=Math.atan2(dx,dz),err=Math.atan2(Math.sin(heading-g.carAngle),Math.cos(heading-g.carAngle));
              g.keys.clear();if(Math.abs(err)>.03)g.keys.add(err>0?'a':'d');
              if(g.speed<(Math.abs(err)>.2?3.2:Math.min(9,dist*1.4)))g.keys.add('w');
              else if(Math.abs(err)>.3&&g.speed>4)g.keys.add(' ');
              g.simulate(1/60);
              if(i===1499)throw Error('Car blocked '+JSON.stringify([g.car,{x,z}]));
            }
            g.keys.clear();g.keys.add(' ');for(let i=0;i<50;i++)g.simulate(1/60);g.keys.clear();
          };
        }""")
        at("car");action()
        page.evaluate("driveTo(-5,24);driveTo(-5,-11)")
        action()
        page.evaluate("""() => {const g=testGame;
          g.aim={x:-7,z:-20};g.implant(1);
          g.aim=sites.gate;g.implant(0);
          if(!g.streets.open.has('gate') || !g.cool.every(n=>n>0))throw Error('Implants inactive');
          walkTo({x:-10,z:-12});walkTo(sites.chip);
        }""")
        action()
        page.evaluate("walkTo({x:-10,z:-12});walkTo({x:-7,z:-12})")
        page.evaluate("walkTo({x:testGame.car.x-1.8,z:testGame.car.z})");action()
        assert page.evaluate("testGame.driving")
        page.evaluate("""() => {const g=testGame;g.keys.add('s');
          for(let i=0;i<220&&g.car.z<.5;i++)g.simulate(1/60);
          g.keys.clear();g.keys.add(' ');for(let i=0;i<55;i++)g.simulate(1/60);g.keys.clear();
          driveTo(25,0);driveTo(25,-36);driveTo(25,-42);driveTo(-3,-42);
        }""")
        action();walk("drop")
        page.evaluate("for(let i=0;i<380;i++)testGame.simulate(1/60)")
        action();choose("Suivre la piste de Sorel")
        assert state()["money"]==450
        page.evaluate("testGame.q={...sites.drop};testGame.updateInteraction()")
        page.keyboard.press("e")
        assert state()["money"]==450
        print("Side courtyard, unarmed theft, checkpoint, bridge and second delivery PASS",flush=True)
    assert not errors, errors
    browser.close()

if __name__ == "__main__":
    with sync_playwright() as pw:
        for name in sys.argv[1:] or ["chromium","firefox"]:
            run(getattr(pw,name),name)
