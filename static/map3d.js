let map, scene, camera, renderer, controls;
let is3DMode = false;
const mapContainer = document.getElementById("map-container");

// Initialize Leaflet (2D Map)
function initMap() {
    map = L.map(mapContainer).setView([13.7563, 100.5018], 5); // Center on Thailand

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    map.on("zoomend", () => {
        if (map.getZoom() >= 14 && !is3DMode) {
            switchTo3D();
        }
    });
}

// Switch from 2D to 3D Mode
function switchTo3D() {
    is3DMode = true;
    mapContainer.innerHTML = ""; // Clear Leaflet map

    // Initialize Three.js Scene
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f3);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(0, 500, 1000);

    // ✅ Fix OrbitControls issue
    try {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
    } catch (error) {
        console.error("Error initializing OrbitControls:", error);
        controls = null; // Ensure it's defined but null if initialization fails
    }

    // Auto-detect city and load buildings
    const center = map.getCenter();
    getCityName(center.lat, center.lng);

    animate();
}



// Fetch city name from OpenStreetMap (Reverse Geocoding)
function getCityName(lat, lon) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`)
        .then(response => response.json())
        .then(data => {
            if (data.address && data.address.city) {
                const cityName = data.address.city;
                console.log("Detected City:", cityName);
                loadCityBuildings(cityName);
            } else {
                console.warn("City not found, defaulting to 'Bangkok'");
                loadCityBuildings("Bangkok"); // Fallback to Bangkok if no city detected
            }
        })
        .catch(error => {
            console.error("Error fetching city name:", error);
            loadCityBuildings("Bangkok"); // Fallback in case of error
        });
}

// Fetch & Render 3D Buildings
function loadCityBuildings(cityName) {
    fetch(`/api/city?name=${cityName}`)
        .then(response => response.json())
        .then(data => {
            console.log("City Data Loaded:", data); // Debugging output
            data.elements.forEach(element => {
                if (element.type === "way" && element.tags.building) {
                    const shape = new THREE.Shape();
                    element.nodes.forEach((nodeId, i) => {
                        const node = data.elements.find(n => n.id === nodeId && n.type === "node");
                        if (node) {
                            let [x, z] = latLonToXZ(node.lat, node.lon);
                            if (i === 0) shape.moveTo(x, z);
                            else shape.lineTo(x, z);
                        }
                    });

                    const geo = new THREE.ExtrudeGeometry(shape, { depth: 30, bevelEnabled: false });
                    const mat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.6 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotateX(-Math.PI / 2);
                    scene.add(mesh);
                }
            });
        });
}

// Convert lat/lon to XZ coordinates
function latLonToXZ(lat, lon) {
    const scale = 50000;
    return [lon * scale, -lat * scale];
}

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    
    if (controls) {
        controls.update();
    } else {
        console.warn("Skipping controls.update() because controls is undefined");
    }
    
    renderer.render(scene, camera);
}


initMap();
