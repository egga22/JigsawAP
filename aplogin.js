window.set_ap_image = false;

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};


document.getElementById('hostport').value = getUrlParameter('hostport') || localStorage.getItem("hostport") || "archipelago.gg:38281";

document.getElementById('name').value = getUrlParameter('name') || localStorage.getItem("name") || 'Player1';

document.getElementById('password').value = getUrlParameter('password') || '';

document.getElementById("loginbutton").addEventListener("click", pressed_login);

document.getElementById("solobutton").addEventListener("click", pressed_solo);

document.getElementById('name').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default form submission
        document.getElementById('loginbutton').click(); // Click the login button
    }
});

function isMobile() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) { 
            document.documentElement.webkitRequestFullscreen(); // Safari
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { 
            document.webkitExitFullscreen(); // Safari
        }
    }
}

// Show the fullscreen button only on mobile devices
window.addEventListener('load', () => {
    if (isMobile()) {
        document.getElementById('m11').style.display = 'inline-block';
        document.getElementById('m11a').style.display = 'inline-block';
        setTimeout(() => window.scrollTo(0, 1), 100); // URL bar hiding trick
    }
});

document.getElementById("m11").addEventListener("click", toggleFullscreen);


function pressed_login(){
    localStorage.setItem("hostport", document.getElementById("hostport").value);
    localStorage.setItem("name", document.getElementById("name").value);

    login();
}

window.play_solo = false;
window._soloYamlSettings = null;

// Resolve an Archipelago weighted option value.
// Weighted options look like: { "option_a": 50, "option_b": 0, "random": 0 }
// or can be a plain value (number/string/boolean).
function resolveWeightedOption(val) {
    if (val === undefined || val === null) return undefined;
    // Plain value
    if (typeof val !== "object" || Array.isArray(val)) return val;
    // Weighted map: pick the key with the highest weight, resolving "random" specially
    const entries = Object.entries(val);
    if (entries.length === 0) return undefined;
    // Filter out zero-weight entries
    let candidates = entries.filter(([k, w]) => typeof w === "number" && w > 0);
    if (candidates.length === 0) {
        // All zero weights — just pick the first key
        candidates = entries;
    }
    // Sum weights for weighted random selection
    const totalWeight = candidates.reduce((sum, [, w]) => sum + (typeof w === "number" && w > 0 ? w : 1), 0);
    let roll = Math.random() * totalWeight;
    for (const [key, weight] of candidates) {
        const w = (typeof weight === "number" && weight > 0) ? weight : 1;
        roll -= w;
        if (roll <= 0) {
            // Handle special string keys
            if (key === "random") return "random";
            if (key === "random-low") return "random-low";
            if (key === "random-high") return "random-high";
            if (key === "true") return true;
            if (key === "false") return false;
            if (key === "disabled") return 0;
            if (key === "normal") return 50;
            if (key === "extreme") return 99;
            // Try parsing as number
            const num = Number(key);
            if (!isNaN(num)) return num;
            return key;
        }
    }
    return entries[0][0];
}

// Resolve a numeric weighted option, handling "random" within a min/max range
function resolveNumericOption(val, min, max) {
    const resolved = resolveWeightedOption(val);
    if (resolved === undefined) return undefined;
    if (resolved === "random") return Math.floor(Math.random() * (max - min + 1)) + min;
    if (resolved === "random-low") return Math.floor(Math.random() * ((min + max) / 2 - min + 1)) + min;
    if (resolved === "random-high") return Math.floor(Math.random() * (max - (min + max) / 2 + 1)) + Math.ceil((min + max) / 2);
    const num = Number(resolved);
    if (!isNaN(num)) return Math.max(min, Math.min(max, num));
    return undefined;
}

// Grid type and rotation mapping from the combined YAML option
const GRID_ROTATION_MAP = {
    "square_no_rotation":              { grid: 4, rotation: 0 },
    "square_180_rotation":             { grid: 4, rotation: 180 },
    "square_90_rotation":              { grid: 4, rotation: 90 },
    "hex_no_rotation":                 { grid: 6, rotation: 0 },
    "hex_180_rotation":                { grid: 6, rotation: 180 },
    "hex_120_rotation":                { grid: 6, rotation: 120 },
    "hex_60_rotation":                 { grid: 6, rotation: 60 },
    "meme_one_row_no_rotation":        { grid: 4, rotation: 0, meme: "row" },
    "meme_one_row_180_rotation":       { grid: 4, rotation: 180, meme: "row" },
    "meme_one_column_no_rotation":     { grid: 4, rotation: 0, meme: "col" },
    "meme_one_column_180_rotation":    { grid: 4, rotation: 180, meme: "col" },
};

// Border type name to index mapping
const BORDER_TYPE_MAP = {
    "classic": 1, "triangle": 2, "curved": 3, "diagonal": 4, "straight": 5, "chaos": 6
};

// Compute nx, ny from number_of_pieces and orientation aspect ratio
function computeGridDimensions(numPieces, orientation) {
    const ratios = {
        "square":         { w: 1,   h: 1 },
        "landscape":      { w: 1.5, h: 1 },
        "portrait":       { w: 0.8, h: 1 },
        "more_landscape": { w: 2,   h: 1 },
        "more_portrait":  { w: 0.5, h: 1 },
    };
    const ratio = ratios[orientation] || ratios["landscape"];
    // ny = sqrt(numPieces * h / w), nx = numPieces / ny
    let ny = Math.max(2, Math.round(Math.sqrt(numPieces * ratio.h / ratio.w)));
    let nx = Math.max(2, Math.round(numPieces / ny));
    return { nx, ny };
}

// Handle YAML file upload
document.getElementById("yamlFileInput").addEventListener("change", function(event) {
    const file = event.target.files[0];
    const statusEl = document.getElementById("yamlStatus");
    if (!file) {
        window._soloYamlSettings = null;
        statusEl.textContent = "";
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = jsyaml.load(e.target.result);
            // Find the Jigsaw settings section — look for a "Jigsaw" key or the game name key
            let settings = null;
            if (parsed && typeof parsed === "object") {
                if (parsed["Jigsaw"] && typeof parsed["Jigsaw"] === "object") {
                    settings = parsed["Jigsaw"];
                } else {
                    // Try to find a key that contains known Jigsaw options
                    const knownKeys = ["number_of_pieces", "grid_type_and_rotations", "border_type",
                                       "uniform_piece_size", "enable_clues", "which_image",
                                       "nx", "ny", "grid_type", "rotations"];
                    for (const key of Object.keys(parsed)) {
                        if (typeof parsed[key] === "object" && parsed[key] !== null && !Array.isArray(parsed[key])) {
                            if (knownKeys.some(k => parsed[key][k] !== undefined)) {
                                settings = parsed[key];
                                break;
                            }
                        }
                    }
                    // If still not found, check if top-level has known keys
                    if (!settings && knownKeys.some(k => parsed[k] !== undefined)) {
                        settings = parsed;
                    }
                }
            }

            if (!settings) {
                statusEl.style.color = "#ff4444";
                statusEl.textContent = "✗ No Jigsaw settings found in YAML";
                window._soloYamlSettings = null;
                return;
            }

            // Resolve all weighted options
            const resolved = {};
            // Number of pieces
            resolved.number_of_pieces = resolveNumericOption(settings.number_of_pieces, 4, 2000);

            // Grid type and rotations (combined option)
            const gridRotVal = resolveWeightedOption(settings.grid_type_and_rotations);
            if (gridRotVal && gridRotVal !== "random" && GRID_ROTATION_MAP[gridRotVal]) {
                const gr = GRID_ROTATION_MAP[gridRotVal];
                resolved.grid = gr.grid;
                resolved.rotation = gr.rotation;
                resolved.meme = gr.meme || null;
            } else if (gridRotVal === "random") {
                const allOptions = Object.keys(GRID_ROTATION_MAP);
                const pick = allOptions[Math.floor(Math.random() * allOptions.length)];
                const gr = GRID_ROTATION_MAP[pick];
                resolved.grid = gr.grid;
                resolved.rotation = gr.rotation;
                resolved.meme = gr.meme || null;
            } else {
                // Fallback: check separate grid_type and rotations
                const gt = resolveWeightedOption(settings.grid_type);
                if (gt !== undefined) resolved.grid = (parseInt(gt) === 6) ? 6 : 4;
                const rot = resolveWeightedOption(settings.rotations);
                if (rot !== undefined) resolved.rotation = parseInt(rot) || 0;
            }

            // Orientation and image
            resolved.orientation = resolveWeightedOption(settings.orientation_of_image);
            if (resolved.orientation === "random") {
                const opts = ["square", "landscape", "portrait", "more_landscape", "more_portrait"];
                resolved.orientation = opts[Math.floor(Math.random() * opts.length)];
            }
            resolved.which_image = resolveNumericOption(settings.which_image, 1, 54);

            // Other options
            resolved.uniform_piece_size = resolveWeightedOption(settings.uniform_piece_size);
            const bt = resolveWeightedOption(settings.border_type);
            if (bt === "random") {
                resolved.border_type = Math.floor(Math.random() * 6) + 1;
            } else if (typeof bt === "string" && BORDER_TYPE_MAP[bt] !== undefined) {
                resolved.border_type = BORDER_TYPE_MAP[bt];
            } else if (typeof bt === "number") {
                resolved.border_type = bt;
            }
            resolved.enable_clues = resolveWeightedOption(settings.enable_clues);
            resolved.total_size_of_image = resolveNumericOption(settings.total_size_of_image, 30, 100);

            // Direct nx/ny overrides (non-standard but convenient)
            if (settings.nx !== undefined) resolved.direct_nx = resolveNumericOption(settings.nx, 2, 20);
            if (settings.ny !== undefined) resolved.direct_ny = resolveNumericOption(settings.ny, 2, 20);

            window._soloYamlSettings = resolved;

            // Compute grid dimensions from number_of_pieces + orientation
            let nx = 6, ny = 4;
            if (resolved.direct_nx !== undefined && resolved.direct_ny !== undefined) {
                nx = resolved.direct_nx;
                ny = resolved.direct_ny;
            } else if (resolved.number_of_pieces) {
                const dims = computeGridDimensions(resolved.number_of_pieces, resolved.orientation || "landscape");
                nx = dims.nx;
                ny = dims.ny;
                // Handle meme modes
                if (resolved.meme === "row") { nx = resolved.number_of_pieces; ny = 1; }
                if (resolved.meme === "col") { nx = 1; ny = resolved.number_of_pieces; }
            }

            // Update UI controls to reflect resolved settings
            document.getElementById("solo_nx").value = nx;
            document.getElementById("solo_ny").value = ny;

            if (resolved.grid !== undefined) {
                document.getElementById("solo_grid_type").value = (resolved.grid === 6) ? "6" : "4";
            }
            if (resolved.rotation !== undefined) {
                const rotSel = document.getElementById("solo_rotations");
                setSelectClosest(rotSel, resolved.rotation);
            }
            if (resolved.uniform_piece_size !== undefined) {
                document.getElementById("solo_uniform").checked = !!resolved.uniform_piece_size;
            }

            let summary = file.name;
            if (resolved.number_of_pieces) summary += " | ~" + (nx * ny) + " pieces (" + nx + "×" + ny + ")";
            statusEl.style.color = "#4caf50";
            statusEl.textContent = "✓ " + summary;
        } catch (err) {
            window._soloYamlSettings = null;
            statusEl.style.color = "#ff4444";
            statusEl.textContent = "✗ Error parsing YAML: " + err.message;
        }
    };
    reader.readAsText(file);
});

// Helper: set a <select> to the closest available value
function setSelectClosest(sel, value) {
    let bestIdx = 0, bestDiff = Infinity;
    for (let i = 0; i < sel.options.length; i++) {
        const diff = Math.abs(parseInt(sel.options[i].value) - value);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    sel.selectedIndex = bestIdx;
}

// Auto-select hex shape when hex grid is chosen
document.getElementById("solo_grid_type").addEventListener("change", function() {
    if (this.value === "6") {
        document.getElementById("solo_rotations").value = "60";
    } else {
        if (document.getElementById("solo_rotations").value === "60") {
            document.getElementById("solo_rotations").value = "0";
        }
    }
});

function pressed_solo(){
    window.play_solo = true;

    // Read settings from UI controls (which may have been set by YAML)
    const nx = parseInt(document.getElementById("solo_nx").value) || 6;
    const ny = parseInt(document.getElementById("solo_ny").value) || 4;
    const gridType = parseInt(document.getElementById("solo_grid_type").value) || 4;
    const rotationVal = parseInt(document.getElementById("solo_rotations").value) || 0;
    const uniformSize = document.getElementById("solo_uniform").checked;

    // Also read YAML-only settings (already resolved from weighted format)
    const yaml = window._soloYamlSettings || {};

    // Apply grid type
    if (gridType === 6) {
        window.pieceSides = 6;
        window.make_pieces_square = true;
        document.getElementById("shape").value = "5";
    }

    // Apply rotations
    if (rotationVal > 0) {
        window.rotations = rotationVal;
        window.zero_list = rotationVal === 180 ? [0, 0] : [0, 0, 0];
    }

    // Apply uniform piece size
    if (uniformSize) {
        window.make_pieces_square = true;
    }

    // Apply border/shape from YAML
    if (yaml.border_type !== undefined) {
        const shapeSelect = document.getElementById("shape");
        const index = parseInt(yaml.border_type, 10) - 1;
        if (index >= 0 && index < shapeSelect.options.length) {
            shapeSelect.selectedIndex = index;
        }
    }

    // Apply total_size_of_image from YAML
    if (yaml.total_size_of_image !== undefined) {
        window.downsize_to_fit = yaml.total_size_of_image / 100;
        if (window.pieceSides === 6) {
            window.downsize_to_fit *= Math.min(nx / (nx + (1 - Math.sqrt(3) / 3) * 0.5), ny / (ny + 1));
        }
    }

    // Apply clues from YAML
    if (yaml.enable_clues !== undefined) {
        window.show_clue = (yaml.enable_clues === 1 || yaml.enable_clues === true);
    }

    const totalPieces = nx * ny;

    if(window.pieceSides == 6){
        window.possible_merges = [];
        window.actual_possible_merges = [];
    }else{
        // Generate possible_merges based on the actual piece count
        const totalMerges = totalPieces - 1;
        let merges = [];
        for (let i = 0; i < totalMerges; i++) {
            merges.push(i);
        }
        window.possible_merges = merges;
        window.actual_possible_merges = merges.slice();
    }

    window.fake_pieces_mimic = [];

    closeMenus();

    window.set_puzzle_dim(nx, ny);

    // Generate piece order: shuffled array of all piece indices
    let allPieces = [];
    for (let i = 0; i < totalPieces; i++) {
        allPieces.push(i);
    }
    // Fisher-Yates shuffle
    for (let i = allPieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPieces[i], allPieces[j]] = [allPieces[j], allPieces[i]];
    }

    // Unlock a portion of pieces initially (roughly 1/4 of total, minimum 1)
    const initialUnlock = Math.max(1, Math.floor(totalPieces / 4));
    for (let i = 0; i < initialUnlock; i++) {
        window.unlockPiece(allPieces[i]);
    }
    window.updateMergesLabels();

    // Remaining pieces to unlock via merges
    let remainingPieces = allPieces.slice(initialUnlock);

    function sendCheck(numberOfMerges){
        if (remainingPieces.length > 0) {
            // Unlock a piece at certain merge milestones
            const mergesNeeded = totalPieces - 1;
            // Calculate how often to unlock: spread remaining pieces across remaining merges
            const unlockInterval = Math.max(1, Math.floor(mergesNeeded / (remainingPieces.length + 1)));
            if (numberOfMerges % unlockInterval === 0 || numberOfMerges >= mergesNeeded - remainingPieces.length) {
                const piece = remainingPieces.shift();
                if (piece !== undefined) {
                    setTimeout(() => {
                        window.unlockPiece(piece);
                        playNewItemSound();
                        window.updateMergesLabels();
                    }, 300);
                }
            }
        }
    }
    function sendGoal(){
        console.log("You won!")
    }

    // Choose image
    let ind = Math.floor(Math.random() * window.possibleImages.length);
    let imagePath = window.possibleImages[ind];
    document.getElementById("defaultImageIndex").selectedIndex = ind;
    window.defaultImagePath = imagePath;

    // YAML image override
    if (yaml.which_image !== undefined) {
        const imgIdx = parseInt(yaml.which_image);
        if (imgIdx >= 1 && imgIdx <= window.possibleImages.length) {
            imagePath = window.possibleImages[imgIdx - 1];
            document.getElementById("defaultImageIndex").selectedIndex = imgIdx - 1;
            window.defaultImagePath = imagePath;
        }
    }

    const overrideImage = getUrlParameter('image');
    if (overrideImage !== '') {
        imagePath = overrideImage;
    }

    setImage(imagePath);


    window.sendCheck = sendCheck;
    window.sendGoal = sendGoal;

    apstatus = "Playing solo";
    document.getElementById("m6").innerText = apstatus;

    // document.getElementById('taskbar1').style.display = "flex";
    document.getElementById('taskbar2').style.display = "flex";
    document.getElementById('taskbar3').style.display = "flex";

    
    const messages = [
        "When will you add deathlink?",
        "When will you add trap items?",
        "How do I unlock more pieces?",
        "Can I change the puzzle image?",
        "What is the next feature update?",
        "Why is the sky blue?",
        "Can I play this on my phone?",
        "How do I connect to the server?",
        "What does AP stand for?",
        "Is there a way to reset progress?"
    ];

    setInterval(() => {
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        const jsonList = [{ type: "text", text: randomMessage }];
        window.jsonListener("", jsonList);
    }, 1500);

}

var KEY = 31817;
function pad5(n) {
    return String(n).padStart(5, '0');
}

function hakurei(input) {
    const code = input.trim();
    if (!code) {
        elResult.textContent = 'Enter a code to decrypt.';
        return;
    }
    const parsed = parseInt(code, 36);
    if (Number.isNaN(parsed)) {
        elResult.textContent = 'Code invalid (not base36).';
        return;
    }
    const original = parsed ^ KEY;
    const portStr = pad5(original);
    return portStr;
}

var connectionInfo = null;
function login() {
    // Create a new Archipelago client
    var hostport1 = localStorage.getItem("hostport") || "archipelago.gg:38281";
    if (hostport1.includes(";")) {
        var partAfter_semi = hostport1.split(";");
        hostport1 = partAfter_semi[0] + ":" + hakurei(partAfter_semi[1]);
    }
    connectionInfo = {
        hostport: hostport1, // Default hostpost
        game: "Jigsaw", // Replace with the game name for this player.
        name: localStorage.getItem("name") || "Player1", // Default player name
        password: document.getElementById("password").value,
        items_handling: 0b111,
    };

    document.getElementById('loginbutton').value  = "Connecting...";
    document.getElementById('loginbutton').style.backgroundColor = "orange";

    // Connect to the Archipelago server
    connectToServer();
}

// server stuff:
import {
    Client
} from "./archipelago.js";

var client = null;
var apstatus = "?";
window.is_connected = false;

function getAPClient(){
    return client;
}
window.getAPClient = getAPClient;

function closeMenus(){
    document.getElementById("login-container").style.display = "none";
    document.getElementById("puzzleDIV").style.display = "block";
    window.dispatchEvent(new Event("resize"));
}

function connectToServer(firsttime = true) {
    client = new Client();
    client.items.on("itemsReceived", receiveditemsListener);
    client.socket.on("connected", connectedListener);
    client.socket.on("disconnected", disconnectedListener);
    client.socket.on("bounced", bouncedListener);
    
    client.messages.on("message", jsonListener);
    client.deathLink.on("deathReceived", deathListener)
    
    client
    .login(connectionInfo.hostport, connectionInfo.name, connectionInfo.game, {password: connectionInfo.password, tags: ["DeathLink"]})
        .then(() => {
            console.log("Connected to the server");
            document.getElementById('loginbutton').value = "Connected to the server";

            closeMenus();
        })
        .catch((error) => {
            console.log("Failed to connect", error)
            let errorMessage = "Failed: " + error;

            document.getElementById('error-label').innerText = errorMessage + "\n Common remedies: refresh room and check login info.";
            
            document.getElementById('loginbutton').style.backgroundColor = "#4caf50";
            document.getElementById('loginbutton').value = "Login & Connect again";
            
        });


}

const receiveditemsListener = (items, index) => {
    console.log("ReceivedItems packet: ", items, index);
    newItems(items, index);
};

let puzzlePieceOrder = [];
let receive_death_link = false;

const connectedListener = (packet) => {
    apstatus = "AP: Connected";

    window.apseed = packet.slot_data.seed_name;
    window.slot = packet.slot;
    if(packet.slot_data.fake_pieces_mimic){
        window.fake_pieces_mimic = packet.slot_data.fake_pieces_mimic;
    }else{
        window.fake_pieces_mimic = [];
    }
    if(packet.slot_data.grid_type == 6){
        window.pieceSides = 6;
    }

    let apworld = packet.slot_data.ap_world_version_2 ? packet.slot_data.ap_world_version_2 : packet.slot_data.ap_world_version;
    window.apworld = apworld;
    if(!apworld || ["0.0.0", "0.0.1", "0.0.2", "0.0.3", "0.0.4", "0.1.0", "0.1.1"].includes(apworld)){
        if(!localStorage.getItem("referredTo011")){
            alert("You are using an older apworld, you will be forwarded to the backup version. You will only see this message once.")
            localStorage.setItem("referredTo011", true);
        }
        window.location.href = "/index011.html";
        return;
    }
    if(["0.0.6", "0.2.0"].includes(apworld)){
        if(!localStorage.getItem("referredTo020")){
            alert("You are using an older apworld, you will be forwarded to the backup version. You will only see this message once.")
            localStorage.setItem("referredTo020", true);
        }
        window.location.href = "/index020.html";
        return;
    }
    if(["0.3.0", "0.4.0", "0.4.1", "0.5.0"].includes(apworld)){
        if(!localStorage.getItem("1referredTo030")){
            alert("This apworld is VERY old, please update it.")
            localStorage.setItem("1referredTo030", true);
        }
    }
    if(["0.6.0", "0.6.1"].includes(apworld)){
        if(!localStorage.getItem("1referredTo060")){
            alert("This apworld is VERY old, please update it.")
            localStorage.setItem("1referredTo060", true);
        }
    }
    if(["0.6.2"].includes(apworld)){
        if(!localStorage.getItem("1referredTo062")){
            alert("This apworld is VERY old, please update it.")
            localStorage.setItem("1referredTo062", true);
        }
    }
    if(["0.6.3", "0.6.4", "0.6.5"].includes(apworld)){
        if(!localStorage.getItem("1referredTo063")){
            alert("This apworld is very old, please update it.")
            localStorage.setItem("1referredTo063", true);
        }
    }
    if(["0.7.0", "0.7.1", "0.7.2"].includes(apworld)){
        if(!localStorage.getItem("1referredTo072")){
            alert("This apworld is old, please update it if you can. The new version has hexagons! You will need a new yaml.")
            localStorage.setItem("1referredTo072", true);
        }
    }
    if(["0.8.0"].includes(apworld)){
        if(!localStorage.getItem("1referredTo080")){
            alert("New apworld version released with proper rotations for hexagons and other stuff! You will need a new yaml. Please update if you can, this version still works though :3")
            localStorage.setItem("1referredTo080", true);
        }
    }
    if(["0.9.0"].includes(apworld)){
        if(!localStorage.getItem("1referredTo090")){
            alert("New apworld version released, small bugfix for 'meme one row' and 'meme one column' options. This version still works though :3")
            localStorage.setItem("1referredTo090", true);
        }
    }
    

    console.log("This apworld version should work", packet.slot_data.ap_world_version, packet.slot_data.ap_world_version_2)
    

    document.getElementById("m6").innerText = apstatus;
    

    console.log("Connected packet:",packet);
    window.set_puzzle_dim(packet.slot_data.nx, packet.slot_data.ny);

    if(packet.slot_data.total_size_of_image){
        window.downsize_to_fit = packet.slot_data.total_size_of_image / 100;
        if(window.pieceSides == 6){
            window.downsize_to_fit *= Math.min(packet.slot_data.nx / (packet.slot_data.nx + (1-Math.sqrt(3)/3) * 0.5), packet.slot_data.ny / (packet.slot_data.ny + 1));
        }
    }
    if (packet.slot_data.enable_clues !== undefined) {
        window.show_clue = packet.slot_data.enable_clues === 1;
    }

    if (packet.slot_data.rotations){
        window.rotations = packet.slot_data.rotations;
        if(window.rotations > 0){
            window.zero_list = [0,0,0];
        }
    }

    if (packet.slot_data.uniform_piece_size !== undefined){
        window.make_pieces_square = packet.slot_data.uniform_piece_size === 1;
    }

    const shapeParam2 = getUrlParameter("shape");
    if (!shapeParam2) {
        if(packet.slot_data.border_type){
            const shapeSelect = document.getElementById("shape");
            if (shapeSelect) {
                const index = parseInt(packet.slot_data.border_type, 10) - 1;
                if (index >= 0 && index < shapeSelect.options.length) {
                    shapeSelect.selectedIndex = index;
                    console.log("SET!s")
                }
            }
        }
    }
    
    puzzlePieceOrder = packet.slot_data.piece_order;
    console.log(puzzlePieceOrder);

    window.possible_merges = packet.slot_data.possible_merges;
    window.actual_possible_merges = packet.slot_data.actual_possible_merges;

    receive_death_link = 0
    if(packet.slot_data.death_link){
        receive_death_link = packet.slot_data.death_link;
    }
    if(receive_death_link > 0){
        console.log("Receive death link (yes):", receive_death_link);
    }else{
        console.log("no death link");
    }
    let imagePath = "https://images.pexels.com/photos/147411/italy-mountains-dawn-daybreak-147411.jpeg";

    if(packet.slot_data.orientation < 1){
        imagePath = "https://images.pexels.com/photos/1658967/pexels-photo-1658967.jpeg";
    }else if (packet.slot_data.orientation == 1){
        imagePath = "https://images.pexels.com/photos/3209471/pexels-photo-3209471.jpeg"
    }else if(packet.slot_data.orientation > 1){  // landscape, choose a random one
        let ind = packet.slot_data.which_image;
        imagePath = window.possibleImages[ind-1]
        document.getElementById("defaultImageIndex").selectedIndex = ind - 1;
    }
    window.defaultImagePath = imagePath;

    console.log("Start loading image", apworld)  
    if(apworld == "0.2.0" || apworld == "0.3.0"){
        const overrideImage = getUrlParameter('image');
        if (overrideImage !== '') {
            imagePath = overrideImage;
            window.imagePath = imagePath;
            setImage(imagePath);
            console.log(window.imagePath);
        }else{
            if(localStorage.getItem(`image_${window.apseed}_${window.slot}`)){
                imagePath = localStorage.getItem(`image_${window.apseed}_${window.slot}`);
            }
            window.imagePath = imagePath;
            setImage(imagePath);
            console.log(window.imagePath);
        }
    }else{

        console.log("Start loading image")    
        const overrideImage = getUrlParameter('image');
        if (overrideImage !== '') {
            imagePath = overrideImage;
            window.imagePath = imagePath;
            setImage(imagePath);
            console.log(window.imagePath);
        }else{
            const dbRequest = indexedDB.open("ImageDatabase", 1);

            dbRequest.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("images")) {
                    db.createObjectStore("images", { keyPath: "id" });
                }
            };

            dbRequest.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(["images"], "readonly");
                const store = transaction.objectStore("images");
                const getRequest = store.get(`${window.apseed}_${window.slot}`);

                getRequest.onsuccess = () => {
                    if (getRequest.result) {
                        imagePath = getRequest.result.imagePath;
                    } else {
                        console.log("Image not found in IndexedDB, using default image.");
                    }
                    window.imagePath = imagePath;
                    setImage(imagePath);
                    console.log(window.imagePath);
                };

                getRequest.onerror = () => {
                    console.log("Error retrieving image from IndexedDB.");
                    window.imagePath = imagePath;
                    setImage(imagePath);
                };
            };

            dbRequest.onerror = () => {
                console.log("Error opening IndexedDB.");
                window.imagePath = imagePath;
                setImage(imagePath);
            };
        }
    }


    
    document.getElementById('taskbar1').style.display = "flex";
    document.getElementById('taskbar2').style.display = "flex";
    document.getElementById('taskbar3').style.display = "flex";


    
    if(getUrlParameter("go") == "LS"){
        window.LoginStart = true;
    }
    window.is_connected = true;
    window.getPreviousSizeAndPosition();
};

document.getElementById("defaultImageIndex").addEventListener("click", (event) => {
    event.stopPropagation(); // Prevent the event from bubbling up to parent elements
});
document.getElementById("defaultImageIndex").addEventListener("change", (event) => {
    const selectedIndex = event.target.selectedIndex;
    let imagePath = window.possibleImages[selectedIndex];
    setImage(imagePath);
});

function setImage(url){

    // If url is just a number, treat it as an index into possibleImages
    if (!isNaN(url)) {
        const overrideIndex = Number(url);
        if (
            Number.isInteger(overrideIndex) &&
            overrideIndex >= 1 &&
            overrideIndex <= window.possibleImages.length
        ) {
            setImage(window.possibleImages[overrideIndex - 1]);
            return;
        }
    }

    function checkImage(url, callback) {
        let img = new Image();
        img.onload = () => callback(true);  // Image loaded successfully
        img.onerror = () => callback(false); // Image failed to load
        img.src = url;
    }
            
    checkImage(url, (isValid) => {
        if (isValid) {
            imagePath = url;
            console.log("Set image!")
        } else {
            console.log("Image is a dead link.");
        }
        window.setImagePath(imagePath);
        
        window.choose_ap_image = true;
        window.set_ap_image = true;
    });
}

const bouncedListener = (packet) => {
    console.log("Bounced packet:", packet);
    if(packet){
        if (packet.data) {
            console.log(packet.data);
            if (typeof packet.data[0] === "number") {
                window.move_piece_bounced(packet.data);
            }else{
                gotRandomNumber(packet.data[0], packet.data[1]);
            }
        }
    }
}

const disconnectedListener = (packet) => {
    window.is_connected = false;
    apstatus = "AP: Disconnected. Progress saved, please refresh.";
    document.getElementById("m6").innerText = apstatus;
    menu.open();
};

var lastindex = 0;
function newItems(items, index) {
    setTimeout(() => {
        if (items && items.length) {
            if (index > lastindex) {
                alert("Something strange happened, you should have received more items already... Let's reconnect...");
                console.log("Expected index:", lastindex, "but got:", index, items);
            }
            var received_items = [];
            for (let i = lastindex - index; i < items.length; i++) {
                const item = items[i]; // Get the current item
                received_items.push([item.toString(), i, index]); // Add the item name to the 'items' array
            }
            openItems(received_items)
            lastindex = index + items.length;
        } else {
            console.log("No items received in this update...");
        }
    }, 300); // Wait for one second
}

function openItems(items){
    console.log(items)
    let itemUnlocked = false;
    for (let i = 0; i < items.length; i++) {
        let firstIndex = items[i][2];
        let indexItem = items[i][1];
        let item = items[i][0];
        // Normalize "Puzzle Piece" to "1 Puzzle Piece"
        if (item === "Puzzle Piece") {
            item = "1 Puzzle Piece";
        }
        if (item === "Rotate Trap") {
            item = "1 Rotate Trap";
        }
        if (item === "Swap Trap") {
            item = "1 Swap Trap";
        }

        // Handle plural and singular forms for Puzzle Piece, Fake Puzzle Piece, Rotate Trap, Swap Trap
        // Patterns: "{i} Puzzle Piece(s)", "{i} Fake Puzzle Piece(s)", "{i} Rotate Trap(s)", "{i} Swap Trap(s)"
        let match = item.match(/^(\d+)\s+(Puzzle Piece|Fake Puzzle Piece|Rotate Trap|Swap Trap)s?$/);
        if (match) {
            let count = parseInt(match[1], 10);
            const type = match[2];
            for (let n = 0; n < count; n++) {
                if (type === "Puzzle Piece") {
                    if (puzzlePieceOrder) {
                        let piece = puzzlePieceOrder.shift();
                        if (piece !== undefined) {
                            window.unlockPiece(piece, n === count - 1);
                            itemUnlocked = true;
                        }
                    }
                } else if (type === "Fake Puzzle Piece") {
                    window.unlockFakePiece();
                    itemUnlocked = true;
                } else if (type === "Rotate Trap") {
                    if(firstIndex > 0){
                        doTrap("rotate" + firstIndex, "rotate", count);
                    }
                } else if (type === "Swap Trap") {
                    if(firstIndex > 0){
                        doTrap("swap" + firstIndex, "swap", count);
                    }
                }
            }
            continue;
        }
    }
    if(itemUnlocked){
        playNewItemSound();
        window.updateMergesLabels();
    }
}

function playNewItemSound() {
    if(!window.gameplayStarted && !window.play_solo){
        return;
    }
    const soundSources = ["Sounds/p1.mp3", "Sounds/p2.mp3", "Sounds/p3.mp3", "Sounds/p4.mp3"];
    const randomSound = soundSources[Math.floor(Math.random() * soundSources.length)];
    const newItemSound = new Audio(randomSound);

    newItemSound.play().catch(function(error) {
        // Handle the error here (e.g., log it or show a warning message)
        console.log("Could not play sound because user hasn't interacted with the website yet");
    });
}
function playNewMergeSound() {
    const soundSources = ["Sounds/m1.mp3", "Sounds/m2.mp3", "Sounds/m3.mp3", "Sounds/m4.mp3", "Sounds/m5.mp3"];
    const randomSound = soundSources[Math.floor(Math.random() * soundSources.length)];
    const newItemSound = new Audio(randomSound);

    if (!window.lastMergeSoundTime || Date.now() - window.lastMergeSoundTime > 1000) {
        newItemSound.play().catch(function(error) {
            // Handle the error here (e.g., log it or show a warning message)
            console.log("Could not play sound because user hasn't interacted with the website yet");
        });
        window.lastMergeSoundTime = Date.now();
    }
}
window.playNewMergeSound = playNewMergeSound;
function playNewGameSound() {
    const soundSources = ["Sounds/b1.mp3", "Sounds/b2.mp3"];
    const randomSound = soundSources[Math.floor(Math.random() * soundSources.length)];
    const newItemSound = new Audio(randomSound);

    newItemSound.play().catch(function(error) {
        // Handle the error here (e.g., log it or show a warning message)
        console.log("Could not play sound because user hasn't interacted with the website yet");
    });
}
window.playNewGameSound = playNewGameSound;

function sendCheck(numberOfMerges){
    if(window.is_connected){
        client.check(234782000 + numberOfMerges);
    }
}
function sendGoal(){
    client.goal();
}

window.sendCheck = sendCheck;
window.sendGoal = sendGoal;

function cleanLog() {
    var logTextarea = document.getElementById("log");
    
    // Check if logTextarea has more than 2000 children (assumed to be <span> elements)
    if (logTextarea.children.length > 2000) {
        for (var i = 0; i < 1000; i++) {
            if (logTextarea.children[0]) {
                logTextarea.removeChild(logTextarea.children[0]); // Remove the first child
            }
        }
    }
}

var classaddcolor = [
    "rgba(6, 217, 217, 1)",
    "rgba(168, 147, 228, 1)",
    "rgba(98, 122, 198, 1)",
    "rgba(255, 223, 0, 1)",
    "rgba(211, 113, 102, 1)",
    "rgba(255, 172, 28, 1)",
    "rgba(155, 89, 182, 1)",
    "rgba(128, 255, 128, 1)"]
var classaddtext = ["...", "!!", "!", "!!!", "@#!", "!?!", "@!!", "?!@"]
var classadddesc = ["Item class: normal", 
    "Item class: progression", 
    "Item class: useful", 
    "Item class: progression, useful", 
    "Item class: trap", 
    "Item class: progression, trap", 
    "Item class: useful, trap", 
    "progression, useful, trap"]
var classothercolors = [
    "rgba(100, 149, 237, 1)",
    "rgba(0, 255, 127, 1)",
    "rgba(238, 0, 238, 1)",
    "rgba(250, 250, 210, 1)"
]

function adjustColorBrightness(color, amount) {
    const colorParts = color.match(/[\d.]+/g);
    if (colorParts.length === 4) {
        // RGBA color
        let [r, g, b, a] = colorParts.map(Number);
        if(amount <= 0){
            amount = -amount;
            r = r * amount;
            g = g * amount;
            b = b * amount;
        }else{
            r = 255 - (255 - r) * amount;
            g = 255 - (255 - g) * amount;
            b = 255 - (255 - b) * amount;
        }
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    } else if (colorParts.length === 3) {
        // RGB color
        let [r, g, b] = colorParts.map(Number);
        if(amount <= 0){
            amount = -amount;
            r = r * amount;
            g = g * amount;
            b = b * amount;
        }else{
            r = 255 - (255 - r) * amount;
            g = 255 - (255 - g) * amount;
            b = 255 - (255 - b) * amount;
        }
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        throw new Error("Invalid color format");
    }
}

function jsonListener(text, nodes) {
    const adjustColor = 1;

    // Plaintext to console, because why not?
    const messageElement = document.createElement("div");
  
    let is_relevant = false;
    let contains_player = false;

    for (const node of nodes) {
        const nodeElement = document.createElement("span");
        nodeElement.innerText = node.text;

        switch (node.type) {
            case "entrance":
                nodeElement.style.color = adjustColorBrightness(classothercolors[0], adjustColor);
                break;

            case "location":
                nodeElement.style.color = adjustColorBrightness(classothercolors[1], adjustColor);
                break;

            case "color":
                // not really correct, but technically the only color nodes the server returns is "green" or "red"
                // so it's fine enough for an example.
                nodeElement.style.color = node.color;
                break;

            case "player":
                contains_player = true;
                nodeElement.style.fontWeight = "bold";
                if (node.player.slot === client.players.self.slot) {
                    // It's us!
                    nodeElement.style.color = adjustColorBrightness(classothercolors[2], adjustColor);
                    is_relevant = true;
                } else {
                    // It's them!
                    nodeElement.style.color = adjustColorBrightness(classothercolors[3], adjustColor);
                }
                nodeElement.innerText = node.player.alias;
                nodeElement.title = "Game: " + node.player.game;
                break;

            case "item": 
                nodeElement.style.fontWeight = "bold";
                let typenumber = node.item.progression + 2 * node.item.useful + 4 * node.item.trap
                nodeElement.style.color = adjustColorBrightness(classaddcolor[typenumber], adjustColor);
                nodeElement.title = classadddesc[typenumber];
                break;
            

            // no special coloring needed
            case "text":
                nodeElement.style.color = adjustColorBrightness("rgba(200,200,200,1)", adjustColor);
            default:
                break;
        }
        messageElement.appendChild(nodeElement);
    }

    var logTextarea = document.getElementById("log");

    var isScrolledToBottom = logTextarea.scrollHeight - logTextarea.clientHeight <= logTextarea.scrollTop + 1;
    logTextarea.appendChild(messageElement);
    
    cleanLog();
    if (isScrolledToBottom) {
        logTextarea.scrollTop = logTextarea.scrollHeight - logTextarea.clientHeight;
    }
    
}
window.jsonListener = jsonListener;

let lastrandomnumbers = {};
function doTrap(name, type, count = 1){
    lastrandomnumbers[name] = Math.random() * 4;
    console.log("my trap random number is", lastrandomnumbers[name]);
    setTimeout(() => {
        if (lastrandomnumbers[name] === null) {
            return;
        }
        sendBounceTrapRandomNumber(name, type, count, lastrandomnumbers[name]);
    }, lastrandomnumbers[name] * 1000);
}

function deathListener(source, time, cause){
    console.log("Received death link from", source, "at time", time, "due to", cause);
    if (receive_death_link > 0) {
        doTrap("death"+time, "death");
    }
}

function sendBounceTrapRandomNumber(name, type, count, number){
    client.bounce({ "slots": [window.slot] }, [name, number]);
    setTimeout(() => {
        applyTrap(name, type, count);
    }, 1000);
}

function applyTrap(name, type, count){
    if(lastrandomnumbers[name] !== null){
        if(type === "rotate"){
            for (let i = 0; i < count; i++) {
                window.doRotateTrap();
            }
        } else if(type === "swap"){
            for (let i = 0; i < count; i++) {
                window.doSwapTrap();
            }
        } else if(type === "death"){
            for (let i = 0; i < receive_death_link; i++) {
                window.doRotateTrap();
                window.doSwapTrap();
            }
        }
        lastrandomnumbers[name] = null;
    }else{
        console.log("Trap", name, "was already applied or was not valid anymore.");
    }
}

function gotRandomNumber(name, number){
    console.log("Got random number for trap", name, number);
    if(lastrandomnumbers[name] !== null){
        if(number < lastrandomnumbers[name]){
            lastrandomnumbers[name] = null;
        }
    }
}

const shapeParam = getUrlParameter("shape");
if (shapeParam) {
    const shapeSelect = document.getElementById("shape");
    if (shapeSelect) {
        const index = parseInt(shapeParam, 10) - 1;
        if (index >= 0 && index < shapeSelect.options.length) {
            shapeSelect.selectedIndex = index;
            console.log("SET!s")
        }
    }
}

if(getUrlParameter("go") == "LS"){
    pressed_login();
}

window.ignoreAspectRatio = false;
if(getUrlParameter("ratio") == "ignore"){
    window.ignoreAspectRatio = true;
}

function sendText(message){
    if(window.is_connected){
        client.messages.say(message);
    }
}
window.sendText = sendText;

if(getUrlParameter("go") == "SS"){
    window.start_solo_immediately = true;
    pressed_solo();
}

console.log("0.9.0")