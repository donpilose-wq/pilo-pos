// Registros de Ventas - Kiosco El Cholo
const DEFAULT_USERNAME = "donpilose-wq";
const DEFAULT_REPO = "pilo-pos";

const RUTA_A_ARCHIVO = {
    '/api/ventas': 'ventas.json'
};

let ventas = [];

function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

// --- UTILERÍAS DE CONTROL DE TIEMPO (TIMEOUT) ---
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

// --- APIS DE PERSISTENCIA HYBRID (GitHub / LocalStorage / Server Local) ---
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

    // 1. Intentar con GitHub si hay internet y token
    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        console.log(`☁️ Intentando cargar ${fileName} desde GitHub...`);
        const dataGithub = await leerDesdeGitHub(fileName);
        if (dataGithub !== null) {
            localStorage.setItem(fallbackKey, JSON.stringify(dataGithub));
            console.log(`✅ ${fileName} cargado exitosamente desde GitHub`);
            return dataGithub;
        }
    }

    // 2. Intentar cargar desde el archivo local de la caja (server.py o archivo estático)
    if (fileName) {
        try {
            const response = await fetch(`./${fileName}`);
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem(fallbackKey, JSON.stringify(data));
                console.log(`✅ ${fileName} cargado exitosamente desde servidor local`);
                return data;
            }
        } catch (e) {
            console.warn(`No se pudo leer localmente ${fileName}:`, e);
        }
    }

    // 3. Fallback a la caché local de localStorage
    console.warn(`⚠️ Usando caché de localStorage para ${ruta}`);
    return JSON.parse(localStorage.getItem(fallbackKey)) || [];
}

async function apiPost(ruta, data, fallbackKey) {
    // Guardar siempre en caché local de inmediato
    localStorage.setItem(fallbackKey, JSON.stringify(data));

    const fileName = RUTA_A_ARCHIVO[ruta];
    let githubOk = false;

    // 1. Guardar en GitHub si hay internet y token
    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        console.log(`☁️ Intentando subir ${fileName} a GitHub...`);
        githubOk = await guardarEnGitHub(fileName, data, `Actualización de ${fileName} - Registros de Ventas`);
        if (githubOk) {
            console.log(`✅ ${fileName} sincronizado con GitHub`);
        } else {
            console.warn(`⚠️ No se pudo guardar ${fileName} en GitHub`);
        }
    }

    return githubOk;
}

// --- RENDERIZADO Y DIBUJADO DE LA TABLA ---
function renderTablaVentas(listaFiltrada) {
    const tbody = document.querySelector('#tabla-ventas tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic;">
                    No se encontraron registros de ventas o egresos.
                </td>
            </tr>
        `;
        return;
    }

    listaFiltrada.forEach((x) => {
        // Formatear Hora/Fecha
        const fechaHora = x.fecha || '';

        // Formatear Concepto / Productos
        let conceptoHtml = '';
        if (x.total < 0) {
            conceptoHtml = `<span style="color: var(--danger); font-weight: 600;">${x.detalle || 'Egreso / Pago a Proveedor'}</span>`;
        } else if (x.productos && x.productos.length > 0) {
            const items = x.productos.map(p => `<li>${p.nombre} x${p.cantidad} - $${(p.precio * p.cantidad).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</li>`).join('');
            conceptoHtml = `
                <div style="font-weight: 500;">Venta de Productos</div>
                <ul class="prod-det-list">${items}</ul>
            `;
        } else {
            conceptoHtml = `<span style="color: var(--text-secondary); font-style: italic;">${x.detalle || 'Venta general sin detalle'}</span>`;
        }

        // Formatear Medio de Pago
        let metodoBadge = '';
        if (x.total < 0) {
            metodoBadge = `<span class="metodo-badge" style="background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);">💸 EGRESO</span>`;
        } else {
            if (x.metodo === 'efectivo') {
                metodoBadge = `<span class="metodo-badge metodo-efectivo">💵 EFECTIVO</span>`;
            } else if (x.metodo === 'debito') {
                metodoBadge = `<span class="metodo-badge metodo-debito">💳 TARJETA</span>`;
            } else if (x.metodo === 'qr') {
                metodoBadge = `<span class="metodo-badge metodo-qr">📱 QR / MP</span>`;
            } else {
                metodoBadge = `<span class="metodo-badge" style="background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color);">${(x.metodo || 'EFECTIVO').toUpperCase()}</span>`;
            }
        }

        // Formatear Monto
        let montoHtml = '';
        if (x.total < 0) {
            montoHtml = `<span style="color: var(--danger); font-weight: bold;">-$${Math.abs(x.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>`;
        } else {
            montoHtml = `<span style="color: var(--success); font-weight: bold;">$${x.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fechaHora}</td>
            <td>${conceptoHtml}</td>
            <td>${metodoBadge}</td>
            <td>${montoHtml}</td>
            <td style="text-align: center;">
                <button class="btn-delete" onclick="eliminarVenta(${x.originalIndex})">🗑️ Anular</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- FILTRADO Y ACTUALIZACIÓN DE TOTALES ---
function filtrarVentas() {
    const metodoSel = document.getElementById('filtro-metodo').value;
    const textoSel = normalizarTexto(document.getElementById('filtro-texto').value.trim());

    let totalVentas = 0;
    let totalGastos = 0;
    let cantTransacciones = 0;

    const filtradas = [];

    // Recorremos las ventas al revés para ver las más recientes primero
    for (let i = ventas.length - 1; i >= 0; i--) {
        const x = ventas[i];

        // 1. Filtrar por método de pago / egresos
        if (metodoSel !== 'todos') {
            if (metodoSel === 'gastos') {
                if (x.total >= 0) continue;
            } else {
                if (x.total < 0 || x.metodo !== metodoSel) continue;
            }
        }

        // 2. Filtrar por texto de búsqueda
        if (textoSel) {
            let coincide = false;
            // Buscar en el detalle/concepto
            if (x.detalle && normalizarTexto(x.detalle).includes(textoSel)) {
                coincide = true;
            }
            // Buscar en productos de la venta
            if (x.productos && x.productos.length > 0) {
                x.productos.forEach(p => {
                    if (normalizarTexto(p.nombre).includes(textoSel)) {
                        coincide = true;
                    }
                });
            }
            if (!coincide) continue;
        }

        // Si pasa los filtros, lo agregamos al listado con su índice original
        filtradas.push({
            ...x,
            originalIndex: i
        });

        // Sumar al totalizador
        if (x.total >= 0) {
            totalVentas += x.total;
            cantTransacciones++;
        } else {
            totalGastos += Math.abs(x.total);
        }
    }

    // Actualizar los indicadores en el HTML
    document.getElementById('resumen-total-ventas').innerText = `$${totalVentas.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    document.getElementById('resumen-total-gastos').innerText = `$${totalGastos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    document.getElementById('resumen-cant-ventas').innerText = cantTransacciones;

    renderTablaVentas(filtradas);
}

// --- ELIMINAR / ANULAR TRANSACCIÓN INDIVIDUAL ---
async function eliminarVenta(originalIndex) {
    const v = ventas[originalIndex];
    if (!v) return;

    const esEgreso = v.total < 0;
    const tipoTexto = esEgreso ? "egreso/gasto" : "venta";
    const detalleTexto = esEgreso ? `"${v.detalle}"` : `Venta de productos`;
    const montoAbs = Math.abs(v.total).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    if (confirm(`¿Estás seguro de que querés anular/eliminar este ${tipoTexto}?\n\nDetalle: ${detalleTexto}\nMonto: $${montoAbs}\nFecha: ${v.fecha || 'Sin fecha'}`)) {
        // Eliminar del array original
        ventas.splice(originalIndex, 1);

        // Guardar cambios usando la API híbrida
        const ok = await apiPost('/api/ventas', ventas, 'ventas_realizadas');

        // Notificar resultado
        if (ok) {
            alert("✅ Registro eliminado y sincronizado en la nube correctamente.");
        } else {
            alert("⚠️ Registro eliminado en la memoria local, pero falló la sincronización con GitHub.");
        }

        // Recargar datos y redibujar
        filtrarVentas();
        beepSuccess();
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

// --- INICIALIZACIÓN DE LA PÁGINA ---
async function inicializarVentas() {
    ventas = await apiGet('/api/ventas', 'ventas_realizadas');
    filtrarVentas();
}

window.onload = inicializarVentas;
