"""Rebuild the campaign's glTF binary and its file:// transport. Requires Pillow."""

import base64
import io
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ASSETS = Path(__file__).resolve().parents[1] / "assets"
binary = bytearray()
model = {
    "asset": {"version": "2.0", "generator": "Sandbox COSMOS"},
    "extensionsUsed": ["KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_ior"],
    "scene": 0, "scenes": [{"nodes": [0]}],
    "nodes": [{"name": "COSMOS — Sandbox", "children": [], "scale": [0.035, 0.035, 0.035]}],
    "meshes": [], "materials": [], "images": [], "textures": [], "bufferViews": [], "accessors": [],
    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
}


def add_view(data, target=None):
    binary.extend(b"\0" * (-len(binary) % 4))
    entry = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)}
    if target:
        entry["target"] = target
    model["bufferViews"].append(entry)
    binary.extend(data)
    return len(model["bufferViews"]) - 1


def accessor(values, shape, component, target):
    format_char = "H" if component == 5123 else "f"
    flattened = [v for row in values for v in row]
    view = add_view(struct.pack("<" + str(len(flattened)) + format_char, *flattened), target)
    entry = {"bufferView": view, "componentType": component, "count": len(values), "type": shape}
    if shape == "VEC3":
        entry.update(min=list(map(min, zip(*values))), max=list(map(max, zip(*values))))
    model["accessors"].append(entry)
    return len(model["accessors"]) - 1


def texture(image, name):
    stream = io.BytesIO()
    image.convert("RGB").save(stream, "JPEG", quality=94, subsampling=0, optimize=True)
    model["images"].append({"name": name, "bufferView": add_view(stream.getvalue()), "mimeType": "image/jpeg"})
    model["textures"].append({"sampler": 0, "source": len(model["images"]) - 1})
    return len(model["textures"]) - 1


def material(name, surface, rgb, metal=0, rough=.18, optical=None, ink=None):
    pbr = {"baseColorFactor": [*rgb, 1], "roughnessFactor": rough, "metallicFactor": metal}
    if ink is not None:
        pbr["baseColorTexture"] = {"index": ink}
    entry = {"name": name, "pbrMetallicRoughness": pbr, "extras": {"surface": surface}}
    if optical:
        entry["extensions"] = optical
    model["materials"].append(entry)
    return len(model["materials"]) - 1


def optics(transmission, ior, tint, distance, thickness):
    return {
        "KHR_materials_transmission": {"transmissionFactor": transmission},
        "KHR_materials_ior": {"ior": ior},
        "KHR_materials_volume": {"thicknessFactor": thickness, "attenuationColor": tint, "attenuationDistance": distance},
    }


def mesh(name, surface, points, normals, uv, indices):
    attrs = {"POSITION": accessor(points, "VEC3", 5126, 34962),
             "NORMAL": accessor(normals, "VEC3", 5126, 34962),
             "TEXCOORD_0": accessor(uv, "VEC2", 5126, 34962)}
    idx = accessor([(i,) for i in indices], "SCALAR", 5123, 34963)
    model["meshes"].append({"name": name, "primitives": [{"attributes": attrs, "indices": idx, "material": surface}]})
    model["nodes"][0]["children"].append(len(model["nodes"]))
    model["nodes"].append({"name": name, "mesh": len(model["meshes"]) - 1})


def contour(width, depth, radius, circular):
    if circular:
        for i in range(64):
            angle = math.tau * i / 64
            nx, nz = math.cos(angle), math.sin(angle)
            yield width * nx, width * nz, nx, nz
    else:
        for corner, (sx, sz) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
            for step in range(6):
                angle = (corner + step / 5) * math.pi / 2
                nx, nz = math.cos(angle), math.sin(angle)
                yield sx * (width-radius) + radius*nx, sz*(depth-radius) + radius*nz, nx, nz


def vessel(name, surface, profile, circular=False):
    """Loft rounded sections with analytic normals. Dimensions are half-extents."""
    rings = [list(contour(w, d, r, circular)) for y, w, d, r in profile]
    count = len(rings[0])
    pos, normal, uv, faces = [], [], [], []
    for j, ring in enumerate(rings):
        y, width, depth, _ = profile[j]
        lower, upper = max(0, j-1), min(len(rings)-1, j+1)
        dy = profile[upper][0] - profile[lower][0]
        for k, (x, z, nx, nz) in enumerate(ring):
            dx = rings[upper][k][0] - rings[lower][k][0]
            dz = rings[upper][k][1] - rings[lower][k][1]
            ny = -(nx*dx + nz*dz) / dy
            length = math.sqrt(1 + ny*ny)
            pos.append((x, y, z))
            normal.append((nx/length, ny/length, nz/length))
            uv.append((k/count, (profile[-1][0]-y)/(profile[-1][0]-profile[0][0])))
            if j:
                a, b = (j-1)*count+k, (j-1)*count+(k+1)%count
                faces.extend((a, a+count, b, b, a+count, b+count))
    for j, direction in [(0,-1), (len(rings)-1,1)]:
        first = len(pos)
        y, w, d, _ = profile[j]
        pos.append((0, y, 0))
        normal.append((0, direction, 0))
        uv.append((.5, .5))
        for x, z, _, _ in rings[j]:
            pos.append((x, y, z))
            normal.append((0, direction, 0))
            uv.append((.5+x/(2*w), .5+z/(2*d)))
        for k in range(count):
            a, b = first+1+k, first+1+(k+1)%count
            faces.extend((first, b, a) if direction == 1 else (first, a, b))
    mesh(name, surface, pos, normal, uv, faces)


def cylinder(name, surface, profile):
    vessel(name, surface, [(y,r,r,0) for y,r in profile], True)


# Reuse the campaign artwork for the foil print and the fine inclusions of the glass.
# The front inscription is isolated on its own mesh so it never appears on the rear.
source = Image.open(ASSETS/"flacon.webp").convert("RGB")
def crop(coordinates):
    return source.crop(tuple(round(v*source.width/335) for v in coordinates))

ink = texture(crop((63,246,264,356)).resize((512,256), Image.Resampling.LANCZOS),
              "COSMOS et SANDBOX — impression argent")
study = crop((6,147,327,527)).resize((512,608), Image.Resampling.LANCZOS)
patch = Image.new("L", study.size)
ImageDraw.Draw(patch).rectangle((82,143,426,348), fill=255)
clean = study.copy()
for y in range(130,362):
    left = study.getpixel((77,y))
    right = study.getpixel((431,y))
    for x in range(73,437):
        t = max(0,min(1,(x-77)/354))
        clean.putpixel((x,y),tuple(round(a*(1-t)+b*t) for a,b in zip(left,right)))
study = Image.composite(clean, study, patch.filter(ImageFilter.GaussianBlur(4)))
detail = texture(study.resize((512,512), Image.Resampling.LANCZOS), "Inclusions et facettes du verre")
machining = texture(crop((72,6,262,116)).resize((512,256),Image.Resampling.LANCZOS),
                    "Microstries du bouchon en lumière de studio")
model["extras"] = {"glassStudy": detail, "metalStudy": machining}

glass = material("Verre fumé taillé", "glass", (.89,.82,.97), rough=.065,
                 optical=optics(.94,1.52,[.66,.45,.82],.021,.32))
juice = material("Parfum violet", "liquid", (.55,.36,.67), rough=.1,
                 optical=optics(.85,1.36,[.38,.17,.57],.024,.66))
cap = material("Métal anthracite brossé", "brushed", (.14,.125,.165), .91,.26)
grooves = Image.new("RGB",(8,512))
for y in range(grooves.height):
    tilt = .17*math.sin(math.tau*y*74/512)
    for x in range(grooves.width):
        grooves.putpixel((x,y),(128,round(127.5+127.5*tilt),round(127.5+127.5*math.sqrt(1-tilt*tilt))))
model["materials"][cap]["normalTexture"] = {"index":texture(grooves,"Stries tournées"),"scale":.65}
polish = material("Métal poli", "polished", (.52,.47,.56), .96,.13)
neck = material("Collerette laquée", "neck", (.068,.055,.084), .67,.16)
print_mat = material("Plaque gravée et dorure argent", "print", (1,1,1), .23,.32, ink=ink)

vessel("Corps en verre chanfreiné", glass, [
    (-1.55,.78,.382,.113),(-1.537,.827,.410,.12),(-1.495,.895,.478,.13),
    (-1.433,.949,.529,.147),(-1.40,.957,.535,.15),(-1.32,.958,.535,.15),
    (.354,.958,.535,.15),(.429,.955,.532,.15),(.472,.935,.513,.148),
    (.501,.916,.492,.145),(.675,.763,.381,.123),(.712,.716,.353,.12),
    (.727,.68,.34,.115),(.74,.43,.316,.1)])
vessel("Réservoir intérieur et ménisque", juice, [
    (-1.292,.728,.308,.15),(-1.265,.775,.343,.155),(-1.204,.809,.363,.152),
    (-1.10,.83,.379,.15),(.321,.83,.379,.15),(.395,.822,.367,.15),
    (.448,.779,.335,.14),(.499,.718,.3,.14),(.509,.71,.293,.14)])
cylinder("Col",neck,[(.726,.388),(.743,.409),(.764,.405),(.782,.360),(.806,.349),(.956,.349),(.968,.365),(.994,.363)])
cylinder("Bague du col",polish,[(.749,.408),(.75,.414),(.762,.414),(.764,.408)])
cylinder("Bouchon strié",cap,[(.949,.515),(.964,.554),(.983,.565),(1.012,.567),
                              (1.023,.562),(1.491,.562),(1.509,.559),(1.526,.547),(1.539,.523)])
cylinder("Lèvre inférieure du bouchon",polish,[(.962,.549),(.971,.564),(.983,.569),(1.001,.569),(1.011,.564)])
cylinder("Lèvre supérieure du bouchon",polish,[(1.491,.563),(1.502,.567),(1.518,.557),(1.535,.536),(1.542,.514)])

# Extrude the plaque through the front wall. Its printing exists only on the front.
def plaque_face(w,h,z):
    y = -.235
    return [(-w,y-h,z),(w,y-h,z),(w,y+h,z),(-w,y+h,z)]

front = plaque_face(.609,.329,.545)
back = plaque_face(.609,.329,.531)
outline = list(front)
normals = [(0,0,1)]*4
faces = [0,1,2,0,2,3]
for k, normal in enumerate([(0,-1,0),(1,0,0),(0,1,0),(-1,0,0)]):
    j = (k+1)%4
    i = len(outline)
    outline.extend([back[k], back[j], front[j], front[k]])
    normals.extend([normal]*4)
    faces.extend([i,i+1,i+2,i,i+2,i+3])
mesh("Tranche de la plaque",neck,outline,normals,[(0,0)]*len(outline),faces)
mesh("Étiquette COSMOS",print_mat,plaque_face(.602,.324,.546),[(0,0,1)]*4,
     [(0,1),(1,1),(1,0),(0,0)],[0,1,2,0,2,3])

model["buffers"] = [{"byteLength": len(binary)}]
header = json.dumps(model, ensure_ascii=False, separators=(",",":")).encode("utf-8")
header += b" " * (-len(header)%4)
binary.extend(b"\0" * (-len(binary)%4))
glb = (struct.pack("<4sII", b"glTF", 2, 28+len(header)+len(binary)) +
       struct.pack("<I4s",len(header),b"JSON") + header +
       struct.pack("<I4s",len(binary),b"BIN\0") + binary)
(ASSETS/"cosmos.glb").write_bytes(glb)
# Browsers restrict fetch(file://…). A classic local script can carry the same GLB.
(ASSETS/"cosmos-local.js").write_text(
    "// Generated by tools/build_bottle.py for opening index.html directly.\n"
    "window.cosmosLocalGLB='" + base64.b64encode(glb).decode("ascii") + "';\n", encoding="ascii")
