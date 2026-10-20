// Panel de Administración -puntode venta
const PIN_ADMIN = "123";

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
    '/api/historial-cierres': 'historial_cierres.json'
};

let inventario = [];
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
    const tipo = document.getElementById('gasto-tipo').value;
    const det = document.getElementById('gasto-detalle').value.trim();
    const mon = parseFloat(document.getElementById('gasto-monto').value);

    if (!det || isNaN(mon) || mon <= 0) {
        const errorMsg = tipo === 'adelanto'
            ? "⚠️ Por favor, complete el nombre del empleado y el monto del adelanto."
            : "⚠️ Por favor, complete el detalle y el monto del pago correctamente.";
        alert(errorMsg);
        return;
    }

    const confirmMsg = tipo === 'adelanto'
        ? `¿Confirmas registrar el adelanto de sueldo de $${mon.toLocaleString('es-AR')} para: "${det}"?\n(Se descontará de la caja diaria)`
        : `¿Confirmas el registro del pago de $${mon.toLocaleString('es-AR')} por: "${det}"?`;

    if (confirm(confirmMsg)) {
        // Cargar ventas actuales
        ventas = await apiGet('/api/ventas', 'ventas_realizadas');

        const prefijo = tipo === 'adelanto' ? 'ADELANTO SUELDO' : 'GASTO';
        const nuevoGasto = {
            total: -mon, // Monto negativo representa salida de caja
            metodo: 'efectivo',
            fecha: new Date().toLocaleString(),
            detalle: `${prefijo}: ${det}`
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

function toggleTipoGasto() {
    const tipo = document.getElementById('gasto-tipo').value;
    const detInput = document.getElementById('gasto-detalle');
    if (!detInput) return;
    if (tipo === 'adelanto') {
        detInput.placeholder = "Nombre del empleado (Ej: Juan Pérez)";
    } else {
        detInput.placeholder = "Detalle del gasto (Ej: Panadería, Coca-cola, Gas, Luz)";
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

    if (confirm(`¿CERRAR CAJA DE HOY?\n\n📊 Resumen Financiero:\n--------------------------\n💵 Efectivo Neto: $${e.toLocaleString('es-AR')}\n💳 Tarjetas/Débito: $${t.toLocaleString('es-AR')}\n📱 QR/MercadoPago: $${q.toLocaleString('es-AR')}\n➖ Gastos/Pagos: $${totalGastos.toLocaleString('es-AR')}\n--------------------------\n💰 TOTAL GENERAL: $${general.toLocaleString('es-AR')}\n🧾 Ventas realizadas: ${ventasSolo.length}\n\nSe guardará el detalle completo en historial_cierres.json`)) {

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
            }))
        };

        historialCierres.push(cierreCompleto);

        // Limpiar ventas del dia
        ventas = [];

        // Guardar historial completo (con detalle) + ventas vacias en disco (JSON)
        const okHistorial = await apiPost('/api/historial-cierres', historialCierres, 'historial_cierres');
        const okVentas = await apiPost('/api/ventas', ventas, 'ventas_realizadas');

        actualizarTodo();
        beepSuccess();

        if (okHistorial && okVentas) {
            alert(`✅ Caja cerrada y guardada correctamente en historial_cierres.json\n\n📁 Se guardaron:\n• ${cierreCompleto.cantidad_ventas} ventas del dia\n• ${gastosSolo.length} egresos/gastos\n\n💰 Total del dia: $${general.toLocaleString('es-AR')}`);
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

// --- MOSTRAR DETALLE COMPLETO DE CIERRE ---
function verDetalleCierre(index) {
    const c = historialCierres[index];
    if (!c) return;

    document.getElementById('modal-detalle-titulo').innerText = `Detalle de Cierre - ${c.fecha}`;

    const efectivo = c.efectivo || 0;
    const otros = c.otros || 0;
    const total = c.total || 0;
    const totalGastos = c.total_gastos || 0;
    const cantidadVentas = c.cantidad_ventas || 0;
    const ventasDelDia = c.ventas_del_dia || [];

    const egresos = ventasDelDia.filter(v => v.total < 0);
    const ventasSolo = ventasDelDia.filter(v => v.total > 0);

    let bodyHtml = `
        <div class="grid-reporte" style="margin-top: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
            <div class="caja-resumen" style="border-left-color: var(--success); padding: 12px; margin-bottom: 0;">
                <p style="font-size: 0.75rem; margin: 0;">💵 Efectivo Neto</p>
                <b style="font-size: 1.3rem;">$${efectivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
            </div>
            <div class="caja-resumen" style="border-left-color: var(--accent-primary); padding: 12px; margin-bottom: 0;">
                <p style="font-size: 0.75rem; margin: 0;">💳 Otros Medios</p>
                <b style="font-size: 1.3rem;">$${otros.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
            </div>
            <div class="caja-resumen" style="border-left-color: var(--danger); padding: 12px; margin-bottom: 0;">
                <p style="font-size: 0.75rem; margin: 0;">➖ Egresos / Gastos</p>
                <b style="font-size: 1.3rem; color: var(--danger);">-$${totalGastos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
            </div>
            <div class="caja-resumen" style="border-left-color: var(--warning); padding: 12px; margin-bottom: 0;">
                <p style="font-size: 0.75rem; margin: 0;">💰 Total Caja</p>
                <b style="font-size: 1.3rem; color: var(--warning);">$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b>
            </div>
        </div>
    `;

    // Sección de Egresos
    bodyHtml += `
        <div style="margin-top: 15px;">
            <h4 style="color: var(--danger); display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                💸 EGRESOS, GASTOS Y VALES (${egresos.length})
            </h4>
            <div class="contenedor-tabla" style="margin-top: 0; max-height: 200px; overflow-y: auto;">
                <table style="width: 100%;">
                    <thead>
                        <tr>
                            <th style="padding: 8px 12px; font-size: 0.8rem;">Hora</th>
                            <th style="padding: 8px 12px; font-size: 0.8rem;">Concepto</th>
                            <th style="padding: 8px 12px; font-size: 0.8rem; text-align: right;">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (egresos.length > 0) {
        egresos.forEach(eg => {
            const time = eg.fecha.split(', ')[1] || eg.fecha;
            const desc = eg.detalle.replace('GASTO: ', '').replace('ADELANTO SUELDO: ', 'Vale ');
            bodyHtml += `
                <tr>
                    <td style="padding: 8px 12px; font-size: 0.85rem;">${time}</td>
                    <td style="padding: 8px 12px; font-size: 0.85rem;">${desc}</td>
                    <td style="padding: 8px 12px; font-size: 0.85rem; color: var(--danger); font-weight: bold; text-align: right;">-$${Math.abs(eg.total).toLocaleString('es-AR')}</td>
                </tr>
            `;
        });
    } else {
        bodyHtml += `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 0.85rem;">No se registraron egresos en este turno.</td>
            </tr>
        `;
    }

    bodyHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Sección de Ventas
    bodyHtml += `
        <div style="margin-top: 15px;">
            <h4 style="color: var(--success); display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                🛒 VENTAS E INGRESOS (${ventasSolo.length})
            </h4>
            <div class="contenedor-tabla" style="margin-top: 0; max-height: 250px; overflow-y: auto;">
                <table style="width: 100%;">
                    <thead>
                        <tr>
                            <th style="padding: 8px 12px; font-size: 0.8rem;">Hora</th>
                            <th style="padding: 8px 12px; font-size: 0.8rem;">Medio</th>
                            <th style="padding: 8px 12px; font-size: 0.8rem;">Productos / Detalle</th>
                            <th style="padding: 8px 12px; font-size: 0.8rem; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (ventasSolo.length > 0) {
        ventasSolo.forEach(v => {
            const time = v.fecha.split(', ')[1] || v.fecha;
            let prodText = "";
            if (v.productos && v.productos.length > 0) {
                prodText = v.productos.map(p => `${p.nombre} (x${p.cant})`).join(', ');
            } else {
                prodText = v.detalle || 'Venta general';
            }

            let medioText = "";
            if (v.metodo === 'efectivo') medioText = '💵 Efectivo';
            else if (v.metodo === 'debito') medioText = '💳 Tarjeta';
            else medioText = '📱 QR';

            bodyHtml += `
                <tr>
                    <td style="padding: 8px 12px; font-size: 0.85rem;">${time}</td>
                    <td style="padding: 8px 12px; font-size: 0.85rem;">${medioText}</td>
                    <td style="padding: 8px 12px; font-size: 0.85rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${prodText}">${prodText}</td>
                    <td style="padding: 8px 12px; font-size: 0.85rem; color: var(--success); font-weight: bold; text-align: right;">$${v.total.toLocaleString('es-AR')}</td>
                </tr>
            `;
        });
    } else {
        bodyHtml += `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 0.85rem;">No se registraron ventas en este turno.</td>
            </tr>
        `;
    }

    bodyHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('modal-detalle-body').innerHTML = bodyHtml;
    document.getElementById('modal-detalle-overlay').style.display = 'flex';
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle-overlay').style.display = 'none';
}

// Configurar cierre del modal con clic fuera u Escape
const modalOverlay = document.getElementById('modal-detalle-overlay');
if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) cerrarModalDetalle();
    });
}
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModalDetalle();
});

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





    // 4. Tabla Historial de Cierres
    const tbodyHist = document.getElementById('cuerpo-historial');
    if (tbodyHist) {
        tbodyHist.innerHTML = '';
        [...historialCierres].reverse().forEach((c, index) => {
            const realIndex = historialCierres.length - 1 - index;

            // Obtener gastos/egresos de este cierre
            const egresos = (c.ventas_del_dia || []).filter(v => v.total < 0);
            const totalGastos = c.total_gastos || 0;

            let egresosCol = "";
            if (totalGastos > 0) {
                let egresosLista = egresos.map(eg => {
                    const desc = eg.detalle.replace('GASTO: ', '').replace('ADELANTO SUELDO: ', 'Vale ');
                    return `<div style="font-size: 0.8rem; color: var(--danger); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${desc}: $${Math.abs(eg.total).toLocaleString('es-AR')}">• ${desc} (-$${Math.abs(eg.total).toLocaleString('es-AR')})</div>`;
                }).join('');
                egresosCol = `
                    <div style="font-weight: 600; color: var(--danger);">-$${totalGastos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                    <div style="max-height: 80px; overflow-y: auto; padding-right: 4px;">${egresosLista}</div>
                `;
            } else {
                egresosCol = `<span style="color: var(--text-secondary); font-size: 0.85rem;">-</span>`;
            }

            tbodyHist.innerHTML += `
                <tr>
                    <td>${c.fecha}</td>
                    <td>$${c.efectivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>$${c.otros.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>${egresosCol}</td>
                    <td style="font-weight: 700; color: var(--success);">$${c.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-secondary btn-icon-only" onclick="verDetalleCierre(${realIndex})" title="Ver detalles del cierre">👁️</button>
                            <button class="btn btn-danger btn-icon-only" onclick="borrarCierreHistorial(${realIndex})" title="Borrar del historial">🗑️</button>
                        </div>
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
    ventas = await apiGet('/api/ventas', 'ventas_realizadas');
    historialCierres = await apiGet('/api/historial-cierres', 'historial_cierres');

    validarToken();
    actualizarTodo();
}

inicializarAdmin();
