import os
import requests
import numpy as np
import json
from pyproj import Proj, transform
from shapely.geometry import LineString, MultiPolygon
from shapely.ops import unary_union
from flask import Flask, request, render_template_string, send_from_directory
from pathlib import Path

app = Flask(__name__)

###############################################################################
# 1) Helper Functions
###############################################################################

# ใช้ Web Mercator (EPSG:3857) เพื่อรองรับพิกัดทั่วโลก
WGS84 = Proj(proj="latlong", datum="WGS84")
WEB_MERCATOR = Proj(proj="merc", datum="WGS84")

def latlon_to_xz(lat, lon, lat0, lon0):
    """
    แปลงพิกัด lat/lon เป็น x, z โดยใช้ Web Mercator อย่างถูกต้อง
    """
    lat_scale = 111000  # เมตรต่อองศาละติจูด
    lon_scale = 111000 * np.cos(np.deg2rad(lat0))  # เมตรต่อองศาลองจิจูด
    x = (lon - lon0) * lon_scale
    z = -(lat - lat0) * lat_scale  # ใส่เครื่องหมายลบเพื่อให้ทิศทางสอดคล้องกัน
    return (x, z)


def geocode_place(place_name):
    """
    ใช้ Nominatim เพื่อแปลงชื่อสถานที่ => (lat, lon)
    """
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": place_name,
        "format": "json",
        "limit": 1,
    }
    headers = {
        "User-Agent": "My3DMapScript/1.0 (contact: me@example.com)"
    }
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        data = r.json()
        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            return (lat, lon)
        else:
            return None
    except:
        return None

def get_route_osrm(lat1, lon1, lat2, lon2):
    """
    ใช้ OSRM หาเส้นทาง (lat1, lon1) -> (lat2, lon2)
    คืน list [[lat, lon], [lat, lon], ...]
    """
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"
    resp = requests.get(url, timeout=10)
    data = resp.json()
    if "routes" not in data or not data["routes"]:
        return []
    coords = data["routes"][0]["geometry"]["coordinates"]  # [[lon, lat], ...]
    latlon_list = [[c[1], c[0]] for c in coords]
    return latlon_list

def bounding_box_around_route(route_points, expand_factor=0.01):
    """
    คำนวณ bounding box รอบเส้นทาง: (min_lat, min_lon, max_lat, max_lon)
    แล้วขยายออกตามค่า expand (องศา) ~ 0.02 => ~2 กม.
    """
    route_length = len(route_points)
    dynamic_expand = max(0.005, expand_factor * route_length/100)  # ใช้ expand_factor แทน 0.002
    
    lats = [p[0] for p in route_points]
    lons = [p[1] for p in route_points]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    
    # ขยายด้วย dynamic_expand
    min_lat -= dynamic_expand
    max_lat += dynamic_expand
    min_lon -= dynamic_expand
    max_lon += dynamic_expand
    
    return (min_lat, min_lon, max_lat, max_lon)

def get_map_data_by_bbox(bbox):
    (min_lat, min_lon, max_lat, max_lon) = bbox

    overpass_url = "http://overpass-api.de/api/interpreter"
    query = f"""
    [out:json][timeout:90];
    (
    way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
    way["building:part"]({min_lat},{min_lon},{max_lat},{max_lon});
    way["highway"]({min_lat},{min_lon},{max_lat},{max_lon});
    relation["building"]({min_lat},{min_lon},{max_lat},{max_lon});
    relation["building:part"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    (._;>;);
    out body;
    """


    headers = {
        "User-Agent": "My3DMapScript/1.0 (contact: me@example.com)"
    }

    try:
        #  ใช้ `.encode('utf-8')` เพื่อให้แน่ใจว่าไม่มีปัญหา encoding
        resp = requests.post(overpass_url, data=query.encode('utf-8'), headers=headers, timeout=60)
        
        if resp.status_code != 200:
            print("Overpass returned:", resp.status_code)
            print(resp.text)
            return {"elements": []}

        data = resp.json()
        print("Overpass elements:", len(data.get("elements", [])))

        #  บันทึก JSON ตรวจสอบข้อมูล
        with open("overpass_data.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print("Overpass data saved to overpass_data.json")
        return data
    except Exception as e:
        print("JSON decode error:", e)
        return {"elements": []}



###############################################################################
# 2) หน้าแรก (Bootstrap)
###############################################################################

index_html = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>3D Demo (Bounding Box)</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css">
</head>
<body class="bg-light">
    <div class="container py-5">
        <div class="card shadow">
            <div class="card-body">
                <h1 class="card-title">3D Map Navigation by Bounding Box</h1>
                <p class="text-muted">
                    ใส่ชื่อสถานที่ Start/End → ใช้ bounding box รอบเส้นทาง OSRM,<br/>
                    ดึง building/building:part + highway มาสร้าง 3D
                </p>
                <form method="GET" action="/map">
                    <div class="mb-3">
                        <label class="form-label">Start Place</label>
                        <input type="text" name="start_place" class="form-control" value="Siam Paragon"/>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">End Place</label>
                        <input type="text" name="end_place" class="form-control" value="Terminal 21"/>
                    </div>
                    <button type="submit" class="btn btn-primary">Show 3D Route</button>
                </form>
            </div>
        </div>
    </div>
</body>
</html>
"""

app = Flask(__name__)

@app.route("/")
def index():
    return render_template_string(index_html)

###############################################################################
# 3) ฟังก์ชันใหม่จากผู้ใช้
###############################################################################

def latlon_to_xz(lat, lon, lat0, lon0):
    """
    ฟังก์ชันช่วย แปลง lat/lon -> x,z โดยอิงจุด (lat0,lon0) เป็น origin
    """
    lat_scale = 111000  # meters per degree (latitude)
    lon_scale = 111000 * np.cos(np.deg2rad(lat0))  # meters per degree (longitude)
    x = (lon - lon0) * lon_scale
    z = (lat - lat0) * lat_scale
    return (x, z)

def way_to_polygon(way_el, node_dict, lat0, lon0):
    """
    แปลง way element เป็น polygon โดยใช้ node_dict + ฟังก์ชัน latlon_to_xz
    """
    try:
        # 1. เก็บ node IDs จาก way
        nds = way_el.get("nodes", [])
        if len(nds) < 3:  # ต้องมีอย่างน้อย 3 จุดจึงจะเป็น polygon ได้
            print(f"⚠️ Way {way_el['id']} has only {len(nds)} points (not enough for polygon)")
            return None

        # 2. แปลงแต่ละ node เป็นพิกัด (x,z)
        pts = []
        for nd in nds:
            if nd in node_dict:
                node = node_dict[nd]
                lat_n, lon_n = node["lat"], node["lon"]
                x, z = latlon_to_xz(lat_n, lon_n, lat0, lon0)
                pts.append((x, z))
            else:
                print(f"⚠️ Node {nd} not found in node_dict (Way {way_el['id']})")
                continue  # ข้าม node ที่ไม่พบ แต่ยังทำต่อ

        if len(pts) < 3:
            print(f"⚠️ Way {way_el['id']} has only {len(pts)} valid points")
            return None

        # 3. สร้าง polygon
        # ถ้าจุดแรกไม่เท่ากับจุดสุดท้าย ให้เพิ่มจุดแรกต่อท้าย
        if pts[0] != pts[-1]:
            pts.append(pts[0])

        # 4. สร้าง Shapely Polygon โดยตรง (ไม่ใช้ LineString.buffer)
        from shapely.geometry import Polygon
        poly = Polygon(pts)

        # 5. ตรวจสอบความถูกต้อง
        if not poly.is_valid:
            # ถ้าไม่ถูกต้อง ลองแก้ด้วย buffer(0)
            poly = poly.buffer(0)
            if not poly.is_valid or poly.is_empty:
                print(f"⚠️ Could not create valid polygon for Way {way_el['id']}")
                return None

        return poly

    except Exception as e:
        print(f"❌ Error in way_to_polygon (Way {way_el['id']}): {e}")
        return None
    
def process_buildings(node_dict, way_dict, relation_dict, lat0, lon0):
    """
    ประมวลผล building และ building:part จาก way และ relation
    คืนค่า: (buildings, building_count)
    """
    buildings = []
    building_count = 0

    # Process building ways
    for w_id, w_el in way_dict.items():
        tags = w_el.get("tags", {})
        if ("building" in tags) or ("building:part" in tags):
            pts = []
            for nd in w_el.get("nodes", []):
                if nd in node_dict:
                    node = node_dict[nd]
                    x, z = latlon_to_xz(node["lat"], node["lon"], lat0, lon0)
                    pts.append((x, z))
            
            if len(pts) >= 3:
                # สร้าง polygon จากจุด
                if pts[0] != pts[-1]:
                    pts.append(pts[0])  # ปิดรูป polygon
                
                h = 30  # ความสูงเริ่มต้น
                if "height" in tags:
                    try:
                        h = float(tags["height"])
                    except:
                        if "building:levels" in tags:
                            try:
                                h = float(tags["building:levels"]) * 3
                            except:
                                pass
                
                buildings.append({
                    "polygon": pts,
                    "height": h,
                    "name": tags.get("name", "")
                })
                building_count += 1

    print(f"Processed {building_count} buildings")
    return buildings, building_count

def process_roads(node_dict, way_dict, lat0, lon0):
    """
    แยกฟังก์ชันสำหรับประมวลผลถนน
    คืนค่า: roads, road_count
    """
    roads = []
    road_count = 0
    for w_id, w_el in way_dict.items():
        tags = w_el.get("tags", {})
        if "highway" in tags:
            pts = []
            for nd in w_el.get("nodes", []):
                if nd in node_dict:
                    node = node_dict[nd]
                    x, z = latlon_to_xz(node["lat"], node["lon"], lat0, lon0)
                    pts.append((x, z))
            
            if len(pts) >= 2:
                roads.append({
                    "points": pts,
                    "name": tags.get("name", ""),
                    "type": tags["highway"]
                })
                road_count += 1
    
    return roads, road_count

###############################################################################
# 4) Main logic: process roads + route + render
###############################################################################
@app.route("/map")
def show_map():
    start_place = request.args.get("start_place", "Siam Paragon")
    end_place   = request.args.get("end_place",   "Terminal 21")

    # 1) Geocode
    start_coord = geocode_place(start_place)
    end_coord   = geocode_place(end_place)
    if not start_coord or not end_coord:
        return f"ไม่สามารถ geocode ได้: {start_place}, {end_place}"
    print("Start:", start_coord, "End:", end_coord)

    # 2) OSRM route
    route_points = get_route_osrm(*start_coord, *end_coord)
    if not route_points:
        return f"ไม่พบเส้นทางระหว่าง {start_place} -> {end_place}"
    print("Route points:", len(route_points))

    # 3) Compute bounding box
    bbox = bounding_box_around_route(route_points, expand_factor=0.005)
    print("Using BBox:", bbox)

    # 4) Query Overpass data
    map_data = get_map_data_by_bbox(bbox)

    node_dict = {}
    way_dict = {}
    relation_dict = {}
    for el in map_data["elements"]:
        t = el["type"]
        if t == "node":
            node_dict[el["id"]] = el
        elif t == "way":
            way_dict[el["id"]] = el
        elif t == "relation":
            relation_dict[el["id"]] = el

    lat0, lon0 = route_points[0]

    # 5) Process buildings
    buildings, building_count = process_buildings(node_dict, way_dict, relation_dict, lat0, lon0)
    
    # 6) Process roads
    roads, road_count = process_roads(node_dict, way_dict, lat0, lon0)
    
    # 7) Process route
    route_xz = []
    for lat, lon in route_points:
        x, z = latlon_to_xz(lat, lon, lat0, lon0)
        route_xz.append((x, z))

    # Create data_js object
    data_js = {
        "buildings": buildings,
        "roads": roads,
        "route": route_xz
    }


    # 8) Create HTML / JS
    static_dir = Path("static")
    templates_dir = Path("templates")
    static_dir.mkdir(exist_ok=True)
    templates_dir.mkdir(exist_ok=True)

    map_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>3D Map (Bbox approach + new code)</title>
        <style>
            body {{ margin: 0; overflow: hidden; }}
            #map {{ width:100vw; height:100vh; }}
        </style>
    </head>
    <body>
        <div id="map"></div>
        <div id="loading">Loading map data...</div>
        <script>
            window.MAP_DATA = {json.dumps(data_js)};
        </script>
        <script type="importmap">
        {{
            "imports": {{
                "three": "https://unpkg.com/three@0.159.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.159.0/examples/jsm/"
            }}
        }}
        </script>
        <script type="module" src="/static/map3d.js"></script>
    </body>
    </html>
    """
    with open(templates_dir / "map.html", "w", encoding="utf-8") as f:
        f.write(map_html)

    js_content = """
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

    const data = window.MAP_DATA;  // Get data from window object
    let scene, camera, renderer, labelRenderer, controls;

    function init() {
        // Improve rendering quality
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true; // Enable shadows
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('map').appendChild(renderer.domElement);

        // Setup Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdfe9f3);  // Sky blue color
        scene.fog = new THREE.Fog(0xdfe9f3, 400, 6000);  // Better fog control

        // Camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 100000);
        camera.position.set(0, 500, 600);  // Higher starting position

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2.1;
        controls.maxDistance = 3000;
        controls.minDistance = 50;

        // Label Renderer
        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none';
        document.getElementById('map').appendChild(labelRenderer.domElement);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xf0f0f0, 1.2);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(1000, 2000, 1000);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        scene.add(dirLight);

        createObjects();
    }

    function createObjects() {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        // Compute map boundaries
        data.buildings.forEach(b => {
            b.polygon.forEach(p => {
                minX = Math.min(minX, p[0]);
                maxX = Math.max(maxX, p[0]);
                minZ = Math.min(minZ, p[1]);
                maxZ = Math.max(maxZ, p[1]);
            });
        });

        data.roads.forEach(r => {
            r.points.forEach(p => {
                minX = Math.min(minX, p[0]);
                maxX = Math.max(maxX, p[0]);
                minZ = Math.min(minZ, p[1]);
                maxZ = Math.max(maxZ, p[1]);
            });
        });

        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const mapGroup = new THREE.Group();
        mapGroup.position.set(-centerX, 0, -centerZ);
        scene.add(mapGroup);

        // Material Improvements
        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0x999999,
            roughness: 0.5,
            metalness: 0.2
        });

        data.buildings.forEach(b => {
            const shape = new THREE.Shape();
            b.polygon.forEach((pt, i) => {
                if (i === 0) shape.moveTo(pt[0], pt[1]);
                else shape.lineTo(pt[0], pt[1]);
            });

            const geo = new THREE.ExtrudeGeometry(shape, {
                depth: b.height,
                bevelEnabled: false
            });

            geo.rotateX(-Math.PI / 2);
            const mesh = new THREE.Mesh(geo, buildingMat);
            mesh.position.y = 0; // Attach buildings to ground
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            mapGroup.add(mesh);
        });

        // Road Improvements
        const road_type_map = {
            "motorway": { color: 0xff0000, width: 6 },
            "primary": { color: 0xffa500, width: 5 },
            "secondary": { color: 0xffff00, width: 3 },
            "residential": { color: 0xffffff, width: 2 }
        };

        data.roads.forEach(r => {
            const config = road_type_map[r.type] || { color: 0xaaaaaa, width: 1 };
            const pts = r.points.map(p => new THREE.Vector3(p[0], 0.1, -p[1]));
            
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(
                geo,
                new THREE.LineBasicMaterial({
                    color: config.color,
                    linewidth: config.width
                })
            );

            mapGroup.add(line);
        });

        // Route Path Improvement
        if (data.route && data.route.length > 1) {
            const routePts = data.route.map(p => new THREE.Vector3(p[0], 0.5, -p[1]));
            const curve = new THREE.CatmullRomCurve3(routePts);
            const tubeGeo = new THREE.TubeGeometry(curve, 300, 3, 16, false);
            const routeMat = new THREE.MeshStandardMaterial({
                color: 0x0080ff,
                emissive: 0x004080,
                roughness: 0.3,
                metalness: 0.5
            });

            const routeMesh = new THREE.Mesh(tubeGeo, routeMat);
            routeMesh.receiveShadow = true;
            mapGroup.add(routeMesh);
        }

        // Set Map Scale
        const mapScale = 3;  // Increase scale for better visibility
        mapGroup.scale.set(mapScale, mapScale, mapScale);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener('resize', onResize, false);
    init();
    animate();

    """

    with open(Path("static")/"map3d.js", "w", encoding="utf-8") as f:
        f.write(js_content)

    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"/>
        <title>3D Map (Bbox approach + new code)</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css">
    </head>
    <body class="bg-light">
        <div class="container-fluid p-0">
            <iframe src="/template_proxy" style="width:100vw; height:100vh; border:none;"></iframe>
        </div>
    </body>
    </html>
    """)

@app.route("/template_proxy")
def template_proxy():
    return send_from_directory("templates", "map.html")

@app.route("/static/<path:path>")
def send_static_file_proxy(path):
    return send_from_directory("static", path)

def main():
    print("Server started on http://localhost:5000")
    app.run(debug=True)

if __name__ == "__main__":
    main()