// Gestión de Inventario - punto de venta
const DEFAULT_USERNAME = "donpilose-wq";
const DEFAULT_REPO = "menuclick";

const RUTA_A_ARCHIVO = {
    '/api/inventario': 'productos.json'
};

let inventario = [];
let editandoCodigo = null; // Guardar código del producto que se está editando

const PLACEHOLDER_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='%231b2537'><rect width='400' height='260' fill='%23131a26'/><circle cx='200' cy='105' r='42' fill='%231b2537' stroke='%232e3c51' stroke-width='2'/><text x='50%' y='113' dominant-baseline='middle' text-anchor='middle' font-size='34'>🍽️</text><text x='50%' y='172' dominant-baseline='middle' text-anchor='middle' fill='%23f59e0b' font-family='sans-serif' font-weight='bold' font-size='16'>DON PILO</text><text x='50%' y='196' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='sans-serif' font-size='12'>Rotiser%C3%ADa &amp; Pastas</text></svg>";

function resolverRutaImagen(src) {
    if (!src || src === 'img/.jpg') return PLACEHOLDER_IMG;
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
    let rel = src;
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel;
}

function handleImageFallback(imgEl, originalPath) {
    imgEl.onerror = null;
    let clean = (originalPath || '').replace(/^(\.\.\/|\.\/|img\/)/, '');
    if (clean && !clean.startsWith('http') && clean !== '.jpg') {
        imgEl.src = 'https://donpilose-wq.github.io/menuclick/img/' + encodeURIComponent(clean);
        imgEl.onerror = function () {
            this.onerror = null;
            this.src = PLACEHOLDER_IMG;
        };
    } else {
        imgEl.src = PLACEHOLDER_IMG;
    }
}

function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

// --- UTILERÍAS DE NAVEGACIÓN ---
function expandirFormulario() {
    const card = document.getElementById('form-panel-card');
    if (card) {
        card.style.display = 'block';
    }
}

function colapsarFormulario() {
    const card = document.getElementById('form-panel-card');
    if (card) {
        card.style.display = 'none';
    }
}

// --- APIS DE PERSISTENCIA HYBRID (GitHub / LocalStorage) ---
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 2500 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function obtenerShaGitHub(filePath) {
    if (!navigator.onLine) return null;
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username') || DEFAULT_USERNAME;
    const repo = localStorage.getItem('github_repo') || DEFAULT_REPO;
    if (!token) return null;

    try {
        const url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        const response = await fetchWithTimeout(url, {
            headers: { Authorization: `token ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            return data.sha;
        }
    } catch (e) {
        console.warn(`No se pudo obtener SHA para ${filePath}:`, e);
    }
    return null;
}

async function leerDesdeGitHub(filePath) {
    if (!navigator.onLine) return null;
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username') || DEFAULT_USERNAME;
    const repo = localStorage.getItem('github_repo') || DEFAULT_REPO;
    if (!token) return null;

    try {
        const url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        const response = await fetchWithTimeout(url, {
            headers: { Authorization: `token ${token}` }
        });

        if (response.status === 404) {
            return [];
        }

        if (response.ok) {
            const data = await response.json();
            const decodedContent = decodeURIComponent(escape(atob(data.content)));
            return JSON.parse(decodedContent);
        }
    } catch (error) {
        console.error(`Error leyendo ${filePath} desde GitHub:`, error);
    }
    return null;
}

async function guardarEnGitHub(filePath, data, mensajeCommit) {
    if (!navigator.onLine) return false;
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username') || DEFAULT_USERNAME;
    const repo = localStorage.getItem('github_repo') || DEFAULT_REPO;
    if (!token) return false;

    try {
        const sha = await obtenerShaGitHub(filePath);
        const url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        const jsonString = JSON.stringify(data, null, 2);
        const contentBase64 = btoa(unescape(encodeURIComponent(jsonString)));

        const body = {
            message: mensajeCommit,
            content: contentBase64
        };
        if (sha) {
            body.sha = sha;
        }

        const updateResponse = await fetchWithTimeout(url, {
            method: 'PUT',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        return updateResponse.ok;
    } catch (error) {
        console.error(`Error guardando ${filePath} en GitHub:`, error);
        return false;
    }
}

async function apiGet(ruta, fallbackKey) {
    const fileName = RUTA_A_ARCHIVO[ruta];

    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        const dataGithub = await leerDesdeGitHub(fileName);
        if (dataGithub !== null) {
            localStorage.setItem(fallbackKey, JSON.stringify(dataGithub));
            return dataGithub;
        }
    }

    try {
        const response = await fetch('./productos.json');
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(fallbackKey, JSON.stringify(data));
            return data;
        }
    } catch (e) { }

    return JSON.parse(localStorage.getItem(fallbackKey)) || [];
}

async function apiPost(ruta, data, fallbackKey) {
    localStorage.setItem(fallbackKey, JSON.stringify(data));

    const fileName = RUTA_A_ARCHIVO[ruta];
    let githubOk = false;

    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        githubOk = await guardarEnGitHub(fileName, data, `Actualización de productos - Inventario`);
    }

    return githubOk;
}

// --- RENDERIZADO Y FILTRADO ---
function renderTablaProductos(lista) {
    const tbody = document.querySelector('#tabla-productos tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic;">
                    No se encontraron productos en el inventario.
                </td>
            </tr>
        `;
        return;
    }

    // Ordenar alfabéticamente
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

    lista.forEach((p) => {
        const tr = document.createElement('tr');
        const imgSrc = resolverRutaImagen(p.imagen);
        const precioNum = parseFloat(p.precio) || 0;

        tr.innerHTML = `
            <td><strong>${p.id}</strong></td>
            <td>
                <img class="inventario-thumb" src="${imgSrc}" onerror="handleImageFallback(this, '${p.imagen}')" alt="${p.nombre}">
            </td>
            <td>${p.nombre}</td>
            <td>$${precioNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: center; display: flex; gap: 8px; justify-content: center; align-items: center; height: 100%;">
                <button class="btn btn-edit btn-icon-only" onclick="editarProducto('${p.id}')" title="Editar producto">✏️</button>
                <button class="btn btn-danger btn-icon-only" onclick="eliminarProducto('${p.id}')" title="Eliminar producto">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarProductos() {
    const query = document.getElementById('search-box').value.trim();

    if (!query) {
        renderTablaProductos(inventario);
        return;
    }

    const queryNorm = normalizarTexto(query);
    const filtrados = inventario.filter(p =>
        normalizarTexto(p.nombre).includes(queryNorm) ||
        normalizarTexto(p.id).includes(queryNorm)
    );

    renderTablaProductos(filtrados);
}

// --- CARGAR / GUARDAR / EDITAR / ELIMINAR ---
async function guardarProducto() {
    if (!editandoCodigo) return;

    const idInput = document.getElementById('admin-codigo');
    const nomInput = document.getElementById('admin-nombre');
    const preInput = document.getElementById('admin-precio');
    const tipInput = document.getElementById('admin-tipo');

    const id = idInput.value.trim().toUpperCase();
    const nom = nomInput.value.trim();
    const pre = parseFloat(preInput.value);
    const tip = tipInput.value;

    if (!id || !nom || isNaN(pre)) {
        alert("⚠️ Faltan completar datos obligatorios (Código, Nombre y Precio).");
        return;
    }

    if (pre < 0) {
        alert("⚠️ Valores inválidos. El precio no puede ser negativo.");
        return;
    }

    const idxExistente = inventario.findIndex(p => p.id === id);

    if (idxExistente > -1) {
        const oldProduct = inventario[idxExistente];
        inventario[idxExistente] = { ...oldProduct, id, nombre: nom, precio: pre, tipo: tip };
        delete inventario[idxExistente].stock;
    } else {
        alert("⚠️ El producto no existe en el inventario.");
        return;
    }

    // Guardar base de datos
    await apiPost('/api/inventario', inventario, 'inventario');

    cancelarEdicion();
    renderTablaProductos(inventario);
    filtrarProductos(); // Por si había algún filtro activo
    beepSuccess();
}

function editarProducto(codigo) {
    const p = inventario.find(item => item.id === codigo);
    if (!p) return;

    editandoCodigo = p.id;
    document.getElementById('admin-codigo').value = p.id;
    document.getElementById('admin-nombre').value = p.nombre;
    document.getElementById('admin-precio').value = p.precio;
    document.getElementById('admin-tipo').value = p.tipo;

    expandirFormulario();
    document.getElementById('admin-nombre').focus();
}

function cancelarEdicion() {
    editandoCodigo = null;
    document.getElementById('admin-codigo').value = '';
    document.getElementById('admin-nombre').value = '';
    document.getElementById('admin-precio').value = '';
    document.getElementById('admin-tipo').value = 'fijo';

    colapsarFormulario();
}

async function eliminarProducto(codigo) {
    const p = inventario.find(item => item.id === codigo);
    if (!p) return;

    if (confirm(`¿Está seguro de eliminar "${p.nombre}" del inventario?\nEsta acción es irreversible.`)) {
        inventario = inventario.filter(item => item.id !== codigo);
        await apiPost('/api/inventario', inventario, 'inventario');
        renderTablaProductos(inventario);
        filtrarProductos();
    }
}

function beepSuccess() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(900, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) { }
}

// --- INICIALIZACIÓN ---
async function inicializarInventario() {
    inventario = await apiGet('/api/inventario', 'inventario');
    renderTablaProductos(inventario);
}

inicializarInventario();
