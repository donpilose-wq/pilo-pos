// Panel de Administración -punto de venta
const PIN_ADMIN = "1234";

// Control de acceso seguro
const acceso = prompt("Ingrese PIN de administrador para acceder a este panel:");
if (acceso !== PIN_ADMIN) {
    alert("❌ Acceso denegado. Código PIN incorrecto.");
    window.location.href = "index.html";
}

// Configuración de sincronización de GitHub (Valores por defecto)
const DEFAULT_USERNAME = "donpilose-wq";
const DEFAULT_REPO = "pilo-pos";

const RUTA_A_ARCHIVO = {
    '/api/inventario': 'productos.json',
    '/api/ventas': 'ventas.json',
    '/api/fiados': 'fiados.json',
    '/api/historial-cierres': 'historial_cierres.json'
};

let inventario = [];
let fiados = [];
let ventas = [];
let historialCierres = [];

// --- GESTIÓN DE CONFIGURACIÓN DE GITHUB ---
function guardarConfiguracionGitHub() {
    const userEl = document.getElementById('gh-username');
    const repoEl = document.getElementById('gh-repo');
    const tokenEl = document.getElementById('gh-token');

    if (userEl) localStorage.setItem('github_username', userEl.value.trim());
    if (repoEl) localStorage.setItem('github_repo', repoEl.value.trim());
    if (tokenEl) localStorage.setItem('github_token', tokenEl.value.trim());

    validarToken();
}

// GuardarToken antiguo para compatibilidad por si se llama desde algún lado
function guardarToken() {
    guardarConfiguracionGitHub();
}

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

async function validarToken() {
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username') || DEFAULT_USERNAME;
    const repo = localStorage.getItem('github_repo') || DEFAULT_REPO;

    const ghUserEl = document.getElementById('gh-username');
    const ghRepoEl = document.getElementById('gh-repo');
    const ghTokenEl = document.getElementById('gh-token');

    if (ghUserEl && !ghUserEl.value) ghUserEl.value = localStorage.getItem('github_username') || "";
    if (ghRepoEl && !ghRepoEl.value) ghRepoEl.value = localStorage.getItem('github_repo') || "";
    if (ghTokenEl && !ghTokenEl.value) ghTokenEl.value = token || "";

    const statusSpan = document.getElementById('token-status');
    if (!statusSpan) return;

    if (!token) {
        statusSpan.innerText = "❌ (Sin configurar)";
        statusSpan.style.color = "var(--text-secondary)";
        return;
    }

    if (!navigator.onLine) {
        statusSpan.innerText = "🔌 (Offline - Sin Internet)";
        statusSpan.style.color = "var(--danger)";
        return;
    }

    try {
        const res = await fetchWithTimeout(`https://api.github.com/repos/${username}/${repo}`, {
            headers: { Authorization: `token ${token}` }
        });
        if (res.ok) {
            statusSpan.innerText = "✅ (Conectado)";
            statusSpan.style.color = "var(--success)";
        } else {
            statusSpan.innerText = "❌ (Repo/Token inválido)";
            statusSpan.style.color = "var(--danger)";
        }
    } catch (e) {
        statusSpan.innerText = "⚠️ (Conexión lenta/error)";
        statusSpan.style.color = "var(--warning)";
    }
}

// --- FUNCIONES API DE GITHUB ---
async function obtenerShaGitHub(filePath) {
    if (!navigator.onLine) return null;
    const token = localStorage.getItem('github_token');
    const username = localStorage.getItem('github_username') || DEFAULT_USERNAME;
    const repo = (filePath === 'productos.json') ? 'menuclick' : (localStorage.getItem('github_repo') || DEFAULT_REPO);
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
    const repo = (filePath === 'productos.json') ? 'menuclick' : (localStorage.getItem('github_repo') || DEFAULT_REPO);
    if (!token) return null;

    try {
        const url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        const response = await fetchWithTimeout(url, {
            headers: { Authorization: `token ${token}` }
        });

        if (response.status === 404) {
            return []; // Archivo nuevo no creado aún
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
    const repo = (filePath === 'productos.json') ? 'menuclick' : (localStorage.getItem('github_repo') || DEFAULT_REPO);
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

// Subir inventario actualizado a GitHub (Mantener por compatibilidad)
async function subirInventarioAGitHub() {
    return true; // Ya no se necesita subir por separado porque apiPost lo sube automáticamente.
}

// --- APIS DE PERSISTENCIA HYBRID (GitHub / LocalStorage) ---
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

    // 2. Fallback a la caché local de localStorage
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
        githubOk = await guardarEnGitHub(fileName, data, `Actualización de ${fileName} - Panel Admin`);
        if (githubOk) {
            console.log(`✅ ${fileName} sincronizado con GitHub`);
        } else {
            console.warn(`⚠️ No se pudo guardar ${fileName} en GitHub`);
        }
    }

    return githubOk;
}


// --- GESTIÓN DE GASTOS / EGRESOS ---
async function registrarGasto() {
    const det = document.getElementById('gasto-detalle').value.trim();
    const mon = parseFloat(document.getElementById('gasto-monto').value);

    if (!det || isNaN(mon) || mon <= 0) {
        alert("⚠️ Por favor, complete el detalle y el monto del pago correctamente.");
        return;
    }

    if (confirm(`¿Confirmas el registro del pago de $${mon.toLocaleString('es-AR')} por: "${det}"?`)) {
        // Cargar ventas actuales
        ventas = await apiGet('/api/ventas', 'ventas_realizadas');

        const nuevoGasto = {
            total: -mon, // Monto negativo representa salida de caja
            metodo: 'efectivo',
            fecha: new Date().toLocaleString(),
            detalle: `GASTO: ${det}`
        };

        ventas.push(nuevoGasto);

        // Guardar ventas
        await apiPost('/api/ventas', ventas, 'ventas_realizadas');

        document.getElementById('gasto-detalle').value = '';
        document.getElementById('gasto-monto').value = '';

        actualizarTodo();
        beepSuccess();
    }
}

function dibujarTablaGastos() {
    const tbodyGastos = document.getElementById('cuerpo-gastos');
    if (!tbodyGastos) return;

    tbodyGastos.innerHTML = '';

    ventas.forEach((x, index) => {
        if (x.total < 0) {
            const time = x.fecha.split(', ')[1] || x.fecha;
            tbodyGastos.innerHTML += `
                <tr>
                    <td>${time}</td> 
                    <td>${x.detalle}</td>
                    <td style="color: var(--danger); font-weight: bold;">-$${Math.abs(x.total).toLocaleString('es-AR')}</td>
                    <td>
                        <button class="btn btn-danger btn-icon-only" onclick="borrarGastoIndividual(${index})" title="Eliminar registro">🗑️</button>
                    </td>
                </tr>
            `;
        }
    });
}

async function borrarGastoIndividual(indexVentaOriginal) {
    if (confirm("¿Borrar este registro de salida de caja?")) {
        ventas.splice(indexVentaOriginal, 1);
        await apiPost('/api/ventas', ventas, 'ventas_realizadas');
        actualizarTodo();
    }
}

async function limpiarSoloGastos() {
    if (ventas.length === 0) return alert("No hay movimientos registrados.");

    if (confirm("¿Querés limpiar visualmente los registros de pagos de la lista?\n\n⚠️ NOTA: Esto limpia el listado para iniciar un nuevo turno, pero no altera el saldo neto en efectivo actual.")) {
        const ventasLimpias = ventas.filter(item => item.total >= 0);
        ventas = ventasLimpias;
        await apiPost('/api/ventas', ventas, 'ventas_realizadas');
        actualizarTodo();
        alert("Lista de egresos despejada.");
    }
}

// Las funciones de gestión de productos y cámara se movieron a inventario.js

// --- LIBRETA DE FIADOS ---
async function agregarFiado() {
    const cli = document.getElementById('fiado-cliente').value.trim();
    const mon = parseFloat(document.getElementById('fiado-monto').value);

    if (!cli || isNaN(mon) || mon <= 0) {
        alert("⚠️ Ingrese un nombre de cliente y un monto válido para el vale.");
        return;
    }

    const idx = fiados.findIndex(f => f.cliente.toUpperCase() === cli.toUpperCase());
    if (idx > -1) {
        fiados[idx].monto += mon;
    } else {
        fiados.push({ cliente: cli, monto: mon });
    }

    await apiPost('/api/fiados', fiados, 'fiados');
    document.getElementById('fiado-cliente').value = '';
    document.getElementById('fiado-monto').value = '';
    actualizarTodo();
    beepSuccess();
}

async function cobrarFiado(index) {
    const f = fiados[index];
    if (confirm(`¿Confirmas borrar/liquidar el vale de $${f.monto.toLocaleString('es-AR')} de "${f.cliente}"?\n(No se sumará a la caja, solo se descontará de su sueldo)`)) {
        fiados.splice(index, 1);
        await apiPost('/api/fiados', fiados, 'fiados');
        actualizarTodo();
        beepSuccess();
        alert(`✅ Vale de "${f.cliente}" eliminado correctamente.`);
    }
}

// --- CIERRE DE CAJA ---
async function borrarVentas() {
    if (ventas.length === 0) return alert("No hay movimientos de caja cargados en el turno de hoy.");

    let e = 0, t = 0, q = 0;
    const ventasSolo = ventas.filter(v => v.total > 0);
    const gastosSolo = ventas.filter(v => v.total < 0);

    ventas.forEach(x => {
        if (x.metodo === 'efectivo') e += x.total;
        else if (x.metodo === 'debito') t += x.total;
        else q += x.total;
    });

    const general = e + t + q;
    const totalGastos = gastosSolo.reduce((acc, g) => acc + Math.abs(g.total), 0);
    const totalFiados = fiados.reduce((acc, f) => acc + f.monto, 0);

    if (confirm(`¿CERRAR CAJA DE HOY?\n\n📊 Resumen Financiero:\n--------------------------\n💵 Efectivo Neto: $${e.toLocaleString('es-AR')}\n💳 Tarjetas/Débito: $${t.toLocaleString('es-AR')}\n📱 QR/MercadoPago: $${q.toLocaleString('es-AR')}\n➖ Gastos/Pagos: $${totalGastos.toLocaleString('es-AR')}\n--------------------------\n💰 TOTAL GENERAL: $${general.toLocaleString('es-AR')}\n🧾 Ventas realizadas: ${ventasSolo.length}\n📝 Vales pendientes: ${fiados.length} clientes ($${totalFiados.toLocaleString('es-AR')})\n\nSe guardará el detalle completo en historial_cierres.json`)) {

        // Cargar historial actual de la API
        historialCierres = await apiGet('/api/historial-cierres', 'historial_cierres');

        // --- CIERRE COMPLETO CON DETALLE ---
        const cierreCompleto = {
            // Resumen del dia
            fecha: new Date().toLocaleString(),
            efectivo: e,
            otros: t + q,
            total: general,
            total_gastos: totalGastos,
            cantidad_ventas: ventasSolo.length,

            // Detalle de cada venta/movimiento del dia
            ventas_del_dia: ventas.map(v => ({
                fecha: v.fecha || '',
                total: v.total,
                metodo: v.metodo || 'efectivo',
                detalle: v.detalle || 'Venta',
                productos: v.productos || []
            })),

            // Snapshot de fiados activos al momento del cierre
            fiados_al_cierre: fiados.map(f => ({
                cliente: f.cliente,
                deuda: f.monto
            })),
            total_fiados_pendientes: totalFiados
        };

        historialCierres.push(cierreCompleto);

        // Limpiar ventas del dia
        ventas = [];

        // Guardar historial completo (con detalle) + ventas vacias + fiados en disco (JSON)
        const okHistorial = await apiPost('/api/historial-cierres', historialCierres, 'historial_cierres');
        const okVentas = await apiPost('/api/ventas', ventas, 'ventas_realizadas');
        await apiPost('/api/fiados', fiados, 'fiados');

        actualizarTodo();
        beepSuccess();

        if (okHistorial && okVentas) {
            alert(`✅ Caja cerrada y guardada correctamente en historial_cierres.json\n\n📁 Se guardaron:\n• ${cierreCompleto.cantidad_ventas} ventas del dia\n• ${gastosSolo.length} egresos/gastos\n• ${fiados.length} vales pendientes al cierre\n\n💰 Total del dia: $${general.toLocaleString('es-AR')}`);
        } else {
            alert(`⚠️ Cierre guardado en memoria del navegador.\nAsegurate de que el servidor server.py este corriendo para guardar en los archivos JSON.`);
        }
    }
}

async function borrarCierreHistorial(index) {
    if (confirm("⚠️ ¿Estás seguro de borrar este cierre del historial?\nEsta acción es irreversible.")) {
        historialCierres.splice(index, 1);
        await apiPost('/api/historial-cierres', historialCierres, 'historial_cierres');
        actualizarTodo();
    }
}

async function anularUltimaVentaAdmin() {
    if (ventas.length === 0) return alert("No hay movimientos para anular.");

    const ultima = ventas[ventas.length - 1];

    if (confirm(`¿Anular el último movimiento registrado?\nDetalle: "${ultima.detalle || 'Venta general'}"\nMonto: $${ultima.total.toLocaleString('es-AR')}`)) {
        ventas.pop();
        await apiPost('/api/ventas', ventas, 'ventas_realizadas');
        actualizarTodo();
        alert("✅ Movimiento anulado correctamente.");
    }
}

// --- ACTUALIZAR TODO (Dibujar Tablas e Indicadores) ---
function actualizarTodo() {
    // 1. Totales de caja diaria
    let e = 0, t = 0, q = 0;
    ventas.forEach(x => {
        if (x.metodo === 'efectivo') e += x.total;
        else if (x.metodo === 'debito') t += x.total;
        else q += x.total;
    });

    document.getElementById('total-efectivo').innerText = `$${e.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    document.getElementById('total-debito').innerText = `$${t.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    document.getElementById('total-qr').innerText = `$${q.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    document.getElementById('total-general').innerText = `$${(e + t + q).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;



    // 3. Tabla de Fiados
    const tbodyFiado = document.querySelector('#tabla-fiados tbody');
    if (tbodyFiado) {
        tbodyFiado.innerHTML = '';

        // Ordenar fiados por nombre
        fiados.sort((a, b) => a.cliente.localeCompare(b.cliente));

        fiados.forEach((f, i) => {
            tbodyFiado.innerHTML += `
                <tr>
                    <td><strong>${f.cliente}</strong></td>
                    <td style="color: var(--danger); font-weight: bold;">$${f.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>
                        <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick="cobrarFiado(${i})">
                            🗑️ BORRAR
                        </button>
                    </td>
                </tr>`;
        });
    }

    // 4. Tabla Historial de Cierres
    const tbodyHist = document.getElementById('cuerpo-historial');
    if (tbodyHist) {
        tbodyHist.innerHTML = '';
        [...historialCierres].reverse().forEach((c, index) => {
            const realIndex = historialCierres.length - 1 - index;
            tbodyHist.innerHTML += `
                <tr>
                    <td>${c.fecha}</td>
                    <td>$${c.efectivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>$${c.otros.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td style="font-weight: 700; color: var(--success);">$${c.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>
                        <button class="btn btn-danger btn-icon-only" onclick="borrarCierreHistorial(${realIndex})" title="Borrar del historial">🗑️</button>
                    </td>
                </tr>`;
        });
    }

    // 5. Tabla de Gastos
    dibujarTablaGastos();
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

// Carga e inicialización inteligente en Admin comunicándose con server.py
async function inicializarAdmin() {
    // Cargar todos los datos desde el servidor API
    inventario = await apiGet('/api/inventario', 'inventario');
    fiados = await apiGet('/api/fiados', 'fiados');
    ventas = await apiGet('/api/ventas', 'ventas_realizadas');
    historialCierres = await apiGet('/api/historial-cierres', 'historial_cierres');

    validarToken();
    actualizarTodo();
}

inicializarAdmin();
