// =====================================================
// GITHUB RAW BASE URL CONFIGURATION
// Replace 'username' and 'repo-name' with your GitHub details.
// =====================================================
const GITHUB_USERNAME = "yogeshdongare87-ai";
const GITHUB_REPO = "Survey-Number-Maps";
const GITHUB_BRANCH = "main"; // or 'master' depending on your default branch

const BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/data`;

let locationData = {};
let polygonLayer = null;
let lineLayer = null;
let pointLayer = null;
let selectedFeatureLayer = null;
let selectedFeatureType = null;

const districtSelect = document.getElementById("districtSelect");
const talukaSelect = document.getElementById("talukaSelect");
const villageSelect = document.getElementById("villageSelect");
const loadMapBtn = document.getElementById("loadMapBtn");
const surveySearch = document.getElementById("surveySearch");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const infoPanel = document.getElementById("infoPanel");

// =====================================================
// MAP INITIALIZATION
// =====================================================
const map = L.map("map").setView([20.9374, 77.7796], 8);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors"
}).addTo(map);

// =====================================================
// 1. FETCH LOCATIONS.JSON FROM GITHUB
// =====================================================
fetch(`${BASE_URL}/locations.json`)
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
    })
    .then(data => {
        locationData = data;
        loadDistricts();
    })
    .catch(err => {
        console.error("Failed to load location data from GitHub:", err);
        alert("Failed to load location dropdowns. Check console for details.");
    });

function loadDistricts() {
    districtSelect.innerHTML = `<option value="">Select District</option>`;
    Object.keys(locationData).sort().forEach(d => {
        districtSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
}

districtSelect.addEventListener("change", function () {
    talukaSelect.innerHTML = `<option value="">Select Taluka</option>`;
    villageSelect.innerHTML = `<option value="">Select Village</option>`;
    talukaSelect.disabled = !this.value;
    villageSelect.disabled = true;
    loadMapBtn.disabled = true;
    if (this.value) {
        Object.keys(locationData[this.value]).sort().forEach(t => {
            talukaSelect.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }
});

talukaSelect.addEventListener("change", function () {
    villageSelect.innerHTML = `<option value="">Select Village</option>`;
    villageSelect.disabled = !this.value;
    loadMapBtn.disabled = true;
    if (this.value) {
        locationData[districtSelect.value][this.value].sort().forEach(v => {
            villageSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
    }
});

villageSelect.addEventListener("change", function () {
    loadMapBtn.disabled = !this.value;
});

loadMapBtn.addEventListener("click", loadVillageMap);

// =====================================================
// 2. FETCH GEOJSON MAP DATA FROM GITHUB
// =====================================================
async function loadVillageMap() {
    const d = districtSelect.value;
    const t = talukaSelect.value;
    const v = villageSelect.value;

    clearMapLayers();

    // Construct raw GitHub path using encodeURIComponent to encode spaces safely
    const folderPath = `${BASE_URL}/maps/${encodeURIComponent(d)}/${encodeURIComponent(t)}/${encodeURIComponent(v)}`;

    let hasLoadedData = false;

    try {
        // Load Polygon Layer (Parcels / Gat)
        const polyRes = await fetch(`${folderPath}/polygon.geojson`);
        if (polyRes.ok) {
            const polyData = await polyRes.json();
            polygonLayer = L.geoJSON(polyData, {
                style: { color: "#4f46e5", weight: 1, fillColor: "#818cf8", fillOpacity: 0.4 },
                onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, 'polygon')
            }).addTo(map);
            
            map.fitBounds(polygonLayer.getBounds(), { padding: [20, 20] });
            hasLoadedData = true;
        }

        // Load Line Layer (Roads / Rasta)
        const lineRes = await fetch(`${folderPath}/line.geojson`);
        if (lineRes.ok) {
            const lineData = await lineRes.json();
            lineLayer = L.geoJSON(lineData, {
                style: { color: "#e11d48", weight: 3 },
                onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, 'line')
            }).addTo(map);
            hasLoadedData = true;
        }

        if (hasLoadedData) {
            showInitialDashboardInfo(d, t, v);
        } else {
            alert(`No GeoJSON files found for ${v} in the GitHub repository.`);
        }

    } catch (error) {
        console.error("Error fetching map files:", error);
        alert("Failed to load map layers from GitHub.");
    }
}
