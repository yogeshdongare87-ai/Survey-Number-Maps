// =====================================================
// GITHUB REPOSITORY CONFIGURATION
// =====================================================
const GITHUB_USERNAME = "yogeshdongare87-ai";
const GITHUB_REPO = "Survey-Number-Maps";
const GITHUB_BRANCH = "main"; 

// GitHub REST API for reading folder listings dynamically
const API_BASE_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/data/maps`;

// Raw GitHub URL for fetching GeoJSON file content
const RAW_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/data/maps`;

let polygonLayer = null;
let lineLayer = null;
let pointLayer = null;
let selectedFeatureLayer = null;
let selectedFeatureType = null;

// DOM Elements
const districtSelect = document.getElementById("districtSelect");
const talukaSelect = document.getElementById("talukaSelect");
const villageSelect = document.getElementById("villageSelect");
const loadMapBtn = document.getElementById("loadMapBtn");
const surveySearch = document.getElementById("surveySearch");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const infoPanel = document.getElementById("infoPanel");
const geojsonInput = document.getElementById("geojsonInput");

// =====================================================
// MAP INITIALIZATION
// =====================================================
const map = L.map("map").setView([20.9374, 77.7796], 8);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors"
}).addTo(map);

// =====================================================
// GITHUB DIRECTORY FETCHER (Replaces locations.json)
// =====================================================
async function fetchFoldersFromGitHub(subPath = "") {
    const url = subPath ? `${API_BASE_URL}/${subPath}` : API_BASE_URL;
    const res = await fetch(url);
    
    if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}`);
    }
    
    const items = await res.json();
    // Return only folder names (filter out loose files)
    return items.filter(item => item.type === "dir").map(item => item.name);
}

// =====================================================
// DYNAMIC DROPDOWN POPULATION
// =====================================================
async function loadDistricts() {
    try {
        districtSelect.innerHTML = `<option value="">Loading Districts...</option>`;
        const districts = await fetchFoldersFromGitHub("");
        
        districtSelect.innerHTML = `<option value="">Select District</option>`;
        districts.sort().forEach(d => {
            districtSelect.innerHTML += `<option value="${d}">${d}</option>`;
        });
    } catch (err) {
        console.error("Error loading districts:", err);
        districtSelect.innerHTML = `<option value="">Failed to load</option>`;
        alert("Failed to read district folders from GitHub repository.");
    }
}

districtSelect.addEventListener("change", async function () {
    talukaSelect.innerHTML = `<option value="">Loading Talukas...</option>`;
    villageSelect.innerHTML = `<option value="">Select Village</option>`;
    talukaSelect.disabled = true;
    villageSelect.disabled = true;
    loadMapBtn.disabled = true;

    if (!this.value) {
        talukaSelect.innerHTML = `<option value="">Select Taluka</option>`;
        return;
    }

    try {
        const path = encodeURIComponent(this.value);
        const talukas = await fetchFoldersFromGitHub(path);
        
        talukaSelect.innerHTML = `<option value="">Select Taluka</option>`;
        talukas.sort().forEach(t => {
            talukaSelect.innerHTML += `<option value="${t}">${t}</option>`;
        });
        talukaSelect.disabled = false;
    } catch (err) {
        console.error("Error loading talukas:", err);
        talukaSelect.innerHTML = `<option value="">Failed to load</option>`;
    }
});

talukaSelect.addEventListener("change", async function () {
    villageSelect.innerHTML = `<option value="">Loading Villages...</option>`;
    villageSelect.disabled = true;
    loadMapBtn.disabled = true;

    if (!this.value) {
        villageSelect.innerHTML = `<option value="">Select Village</option>`;
        return;
    }

    try {
        const path = `${encodeURIComponent(districtSelect.value)}/${encodeURIComponent(this.value)}`;
        const villages = await fetchFoldersFromGitHub(path);
        
        villageSelect.innerHTML = `<option value="">Select Village</option>`;
        villages.sort().forEach(v => {
            villageSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        villageSelect.disabled = false;
    } catch (err) {
        console.error("Error loading villages:", err);
        villageSelect.innerHTML = `<option value="">Failed to load</option>`;
    }
});

villageSelect.addEventListener("change", function () {
    loadMapBtn.disabled = !this.value;
});

// Initialize Districts on Startup
loadDistricts();

loadMapBtn.addEventListener("click", loadVillageMap);

// =====================================================
// FETCH GEOJSON MAP DATA FROM GITHUB
// =====================================================
async function loadVillageMap() {
    const d = districtSelect.value;
    const t = talukaSelect.value;
    const v = villageSelect.value;

    clearMapLayers();

    const folderPath = `${RAW_BASE_URL}/${encodeURIComponent(d)}/${encodeURIComponent(t)}/${encodeURIComponent(v)}`;

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
            alert(`No polygon.geojson or line.geojson found in folder "${v}".`);
        }

    } catch (error) {
        console.error("Error fetching map files:", error);
        alert("Failed to load map layers from GitHub.");
    }
}

// =====================================================
// FEATURE SELECTION & MAP EVENTS
// =====================================================
function setupFeatureEvents(feature, layer, type) {
    layer.on({
        click: function (e) {
            L.DomEvent.stopPropagation(e);
            selectFeature(feature, layer, type);
        }
    });
}

function selectFeature(feature, layer, type) {
    if (selectedFeatureLayer) {
        if (selectedFeatureType === 'polygon' && polygonLayer) {
            polygonLayer.resetStyle(selectedFeatureLayer);
        } else if (selectedFeatureType === 'line' && lineLayer) {
            lineLayer.resetStyle(selectedFeatureLayer);
        }
    }

    selectedFeatureLayer = layer;
    selectedFeatureType = type;

    if (type === 'polygon') {
        layer.setStyle({ color: "#fbbf24", weight: 3, fillColor: "#fef3c7", fillOpacity: 0.7 });
    } else if (type === 'line') {
        layer.setStyle({ color: "#fbbf24", weight: 6 });
    }

    layer.bringToFront();

    if (layer.getBounds) {
        map.fitBounds(layer.getBounds(), { maxZoom: 18 });
    }

    showFeatureDashboard(feature.properties, type);
}

// =====================================================
// DASHBOARD DETAILS
// =====================================================
function showFeatureDashboard(properties, type) {
    let title = type === 'polygon' ? "🌾 Parcel / Gat Details" : "🛣️ Road / Line Details";
    infoPanel.innerHTML = `<h2>${title}</h2>`;

    if (!properties || Object.keys(properties).length === 0) {
        infoPanel.innerHTML += `<div class="empty-state">No detailed information available for this selection.</div>`;
        return;
    }

    let html = "";
    Object.entries(properties).forEach(([key, value]) => {
        html += `
        <div class="info-row">
            <span class="info-label">${key}</span>
            <span class="info-value">${value !== null ? value : "-"}</span>
        </div>`;
    });
    infoPanel.innerHTML += html;
}

function showInitialDashboardInfo(d, t, v) {
    infoPanel.innerHTML = `
        <h2>🌍 Loaded Area</h2>
        <div class="info-row"><span class="info-label">District</span><span class="info-value">${d}</span></div>
        <div class="info-row"><span class="info-label">Taluka</span><span class="info-value">${t}</span></div>
        <div class="info-row"><span class="info-label">Village</span><span class="info-value">${v}</span></div>
        <div class="empty-state">👆 Click on any Parcel or Road to view its details here.</div>
    `;
}

// =====================================================
// SEARCH FUNCTIONALITY
// =====================================================
searchBtn.addEventListener("click", searchSurveyNumber);
surveySearch.addEventListener("keydown", (e) => { if (e.key === "Enter") searchSurveyNumber(); });

function searchSurveyNumber() {
    const searchValue = surveySearch.value.trim().toLowerCase();
    if (!searchValue) return alert("Enter Survey / Gat Number.");
    if (!polygonLayer) return alert("Please load a village map first.");

    let found = false;
    const searchFields = ["gat_no", "gat", "survey_no", "surveynumber", "gatno", "surveyno"];

    polygonLayer.eachLayer(layer => {
        const props = layer.feature.properties;
        if (!props) return;

        for (let key of Object.keys(props)) {
            if (searchFields.includes(key.toLowerCase())) {
                if (String(props[key]).trim().toLowerCase() === searchValue) {
                    selectFeature(layer.feature, layer, 'polygon');
                    found = true;
                    return;
                }
            }
        }
    });

    if (!found) alert(`Survey/Gat Number "${surveySearch.value}" not found.`);
}

clearBtn.addEventListener("click", function () {
    surveySearch.value = "";
    if (selectedFeatureLayer) {
        if (selectedFeatureType === 'polygon' && polygonLayer) polygonLayer.resetStyle(selectedFeatureLayer);
        if (selectedFeatureType === 'line' && lineLayer) lineLayer.resetStyle(selectedFeatureLayer);
    }
    selectedFeatureLayer = null;
    selectedFeatureType = null;
    infoPanel.innerHTML = `
        <h2>📋 Dashboard Details</h2>
        <div class="empty-state">Select a parcel (land) or road on the map to see details here.</div>
    `;
});

function clearMapLayers() {
    if (polygonLayer) map.removeLayer(polygonLayer);
    if (lineLayer) map.removeLayer(lineLayer);
    if (pointLayer) map.removeLayer(pointLayer);
    polygonLayer = lineLayer = pointLayer = null;
    selectedFeatureLayer = selectedFeatureType = null;
}

// =====================================================
// MANUAL LOCAL GEOJSON UPLOAD
// =====================================================
if (geojsonInput) {
    geojsonInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const geojsonData = JSON.parse(event.target.result);
                clearMapLayers();

                const polyFeatures = [];
                const lineFeatures = [];
                const features = geojsonData.type === "FeatureCollection" ? geojsonData.features : [geojsonData];

                features.forEach(f => {
                    if (f.geometry) {
                        if (f.geometry.type.includes("Line")) {
                            lineFeatures.push(f);
                        } else if (f.geometry.type.includes("Polygon")) {
                            polyFeatures.push(f);
                        }
                    }
                });

                if (polyFeatures.length > 0) {
                    polygonLayer = L.geoJSON({ type: "FeatureCollection", features: polyFeatures }, {
                        style: { color: "#4f46e5", weight: 1, fillColor: "#818cf8", fillOpacity: 0.4 },
                        onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, 'polygon')
                    }).addTo(map);
                }

                if (lineFeatures.length > 0) {
                    lineLayer = L.geoJSON({ type: "FeatureCollection", features: lineFeatures }, {
                        style: { color: "#e11d48", weight: 3 },
                        onEachFeature: (feature, layer) => setupFeatureEvents(feature, layer, 'line')
                    }).addTo(map);
                }

                let boundsGroup = L.featureGroup([
                    ...(polygonLayer ? [polygonLayer] : []),
                    ...(lineLayer ? [lineLayer] : [])
                ]);

                if (boundsGroup.getLayers().length > 0) {
                    map.fitBounds(boundsGroup.getBounds(), { padding: [20, 20] });
                }

                infoPanel.innerHTML = `
                    <h2>📁 Uploaded File</h2>
                    <div class="info-row"><span class="info-label">File Name</span><span class="info-value">${file.name}</span></div>
                    <div class="empty-state">👆 Click on any Parcel or Road on the map to view details.</div>
                `;

            } catch (err) {
                alert("Failed to read GeoJSON file.");
                console.error(err);
            }
        };

        reader.readAsText(file);
    });
}
