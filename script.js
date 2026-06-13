// El cerebro del Mostrador - Kiosco El Cholo
function normalizarTexto(texto) {
    if (!texto) return '';
    return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

let productosDB = [];
let carrito = [];
let totalVenta = 0;
let ultimoEscaneo = "";
let timeoutEscaneo = null;
let fiados = [];

// --- SISTEMA DE AUDIO (Efectos de sonido táctiles) ---
function reproducirSonido(tipo) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (tipo === 'scanner') {
            // Sonido corto de escaneo (Beep de supermercado)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // Tono agudo y limpio
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } else if (tipo === 'exito') {
            // Chime de éxito (Venta finalizada)
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
            osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08); // E5
            osc1.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.16); // G5

            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.16); // C6

            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(audioCtx.currentTime + 0.4);
            osc2.stop(audioCtx.currentTime + 0.4);
        } else if (tipo === 'alerta') {
            // Sonido de error/alerta (Tono grave doble)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, audioCtx.currentTime); // Tono grave
            osc.frequency.setValueAtTime(180, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
        }
    } catch (e) {
        console.warn("AudioContext no iniciado aún por políticas del navegador.", e);
    }
}

// --- CONFIGURACIÓN DE SINCRONIZACIÓN DE GITHUB (Valores por defecto) ---
const DEFAULT_USERNAME = "donpilose-wq";
const DEFAULT_REPO = "pilo-pos";

const RUTA_A_ARCHIVO = {
    '/api/inventario': 'productos.json',
    '/api/ventas': 'ventas.json',
    '/api/fiados': 'fiados.json',
    '/api/historial-cierres': 'historial_cierres.json'
};

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
            return []; // Retorna vacío si no existe el archivo
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

    // 2. Intentar buscar un archivo local estático (solo para inventario)
    if (ruta === '/api/inventario') {
        try {
            const response = await fetch('./productos.json');
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem(fallbackKey, JSON.stringify(data));
                console.log(`✅ Inventario cargado desde productos.json local estático`);
                return data;
            }
        } catch (e) {
            console.warn(`No se pudo leer productos.json estático`, e);
        }
    }

    // 3. Fallback a localStorage
    console.warn(`⚠️ Usando caché de localStorage para ${ruta}`);
    return JSON.parse(localStorage.getItem(fallbackKey)) || [];
}

async function apiPost(ruta, data, fallbackKey) {
    localStorage.setItem(fallbackKey, JSON.stringify(data));

    const fileName = RUTA_A_ARCHIVO[ruta];
    let githubOk = false;

    // Guardar en GitHub si hay internet y token
    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        console.log(`☁️ Intentando subir ${fileName} a GitHub...`);
        githubOk = await guardarEnGitHub(fileName, data, `Actualización de ${fileName} - Mostrador`);
        if (githubOk) {
            console.log(`✅ ${fileName} sincronizado con GitHub`);
        } else {
            console.warn(`⚠️ No se pudo guardar ${fileName} en GitHub`);
        }
    }

    return githubOk;
}

// 1. CARGA DE DATOS INTELIGENTE
async function cargarInventario() {
    productosDB = await apiGet('/api/inventario', 'inventario');
}

async function cargarFiados() {
    fiados = await apiGet('/api/fiados', 'fiados');
}

// 2. ESCUCHA DE LA PISTOLITA Y BÚSQUEDA MANUAL
const inputCodigo = document.getElementById('codigo');
if (inputCodigo) {
    inputCodigo.addEventListener('input', () => {
        clearTimeout(timeoutEscaneo);

        timeoutEscaneo = setTimeout(() => {
            const valor = inputCodigo.value.trim();
            if (!valor) {
                ocultarSugerencias();
                return;
            }

            const valorNorm = normalizarTexto(valor);
            const exacto = productosDB.find(p => normalizarTexto(p.id) === valorNorm);
            if (exacto) {
                procesarEscaneo(valor);
                inputCodigo.value = '';
                ocultarSugerencias();
            } else {
                mostrarSugerencias(valor);
            }
        }, 100);
    });

    inputCodigo.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const valor = inputCodigo.value.trim();
            if (valor !== "") {
                procesarEscaneo(valor);
                inputCodigo.value = '';
                ocultarSugerencias();
            }
        }
    });
}

// 3. LÓGICA DE ESCANEO
function procesarEscaneo(codigo) {
    const cantInput = document.getElementById('cantidad-agregar');
    const cantidadAAgregar = cantInput ? (parseInt(cantInput.value) || 1) : 1;

    const codigoNorm = normalizarTexto(codigo);
    const producto = productosDB.find(p =>
        normalizarTexto(p.id) === codigoNorm ||
        normalizarTexto(p.nombre) === codigoNorm
    );

    if (producto) {
        if (producto.tipo === "variable") {
            reproducirSonido('scanner');
            const precioManual = parseFloat(prompt(`Precio para ${producto.nombre}:`));
            if (!isNaN(precioManual) && precioManual > 0 && precioManual < 10000000) {
                agregarAlCarrito(producto.id, producto.nombre, precioManual, cantidadAAgregar);
            } else {
                reproducirSonido('alerta');
            }
        } else {
            reproducirSonido('scanner');
            agregarAlCarrito(producto.id, producto.nombre, producto.precio, cantidadAAgregar);
        }

        // Reset a 1
        if (cantInput) cantInput.value = 1;
    } else {
        reproducirSonido('alerta');
        alert(`Código o producto "${codigo}" no encontrado en el inventario.`);
    }
}

// 4. MANEJO DEL CARRITO Y CANTIDADES MANUALES
function agregarAlCarrito(id, nombre, precio, cantidad = 1) {
    const existente = carrito.find(item => item.id === id);

    if (existente) {
        existente.cantidad += cantidad;
        existente.subtotal = existente.cantidad * existente.precio;
    } else {
        carrito.push({
            id: id,
            nombre: nombre,
            precio: precio,
            cantidad: cantidad,
            subtotal: precio * cantidad
        });
    }

    renderizarCarrito();
}

function actualizarCantidad(index, nuevaCantidad) {
    const qty = parseInt(nuevaCantidad);
    if (isNaN(qty) || qty <= 0) {
        quitarItemCompleto(index);
        return;
    }

    const item = carrito[index];
    item.cantidad = qty;
    item.subtotal = item.cantidad * item.precio;
    renderizarCarrito();
}

function renderizarCarrito() {
    const lista = document.getElementById('lista-productos');
    const displayTotal = document.getElementById('total-display');

    if (!lista || !displayTotal) return;

    lista.innerHTML = '';
    totalVenta = 0;

    if (carrito.length === 0) {
        lista.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; margin-top: 60px; font-style: italic; font-size: 1.1rem;">
                Esperando lectura de código o entrada de producto...
            </p>
        `;
        displayTotal.innerText = "$0,00";
        calcularVuelto();
        return;
    }

    carrito.forEach((item, index) => {
        totalVenta += item.subtotal;

        const fila = document.createElement('div');
        fila.className = 'producto-fila';

        fila.innerHTML = `
            <div class="prod-info">
                <strong>${item.nombre}</strong>
                <br>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <input type="number" min="1" class="qty-input" value="${item.cantidad}" 
                        onchange="actualizarCantidad(${index}, this.value)" 
                        style="width: 65px; padding: 5px 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); border-radius: 8px; text-align: center; font-weight: 700; font-size: 1rem; outline: none;">
                    <span style="color: var(--text-secondary); font-size: 0.95rem;">
                        x $${item.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            <div class="prod-subtotal">
                $${item.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>

            <button class="btn-eliminar" onclick="quitarItemCompleto(${index})" title="Quitar producto">
                ❌
            </button>
        `;

        lista.appendChild(fila);
    });

    displayTotal.innerText = `$${totalVenta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    calcularVuelto();
}

function quitarItem(index) {
    if (carrito[index].cantidad > 1) {
        carrito[index].cantidad -= 1;
        carrito[index].subtotal = carrito[index].cantidad * carrito[index].precio;
    } else {
        carrito.splice(index, 1);
    }
    reproducirSonido('scanner');
    renderizarCarrito();
}

function quitarItemCompleto(index) {
    carrito.splice(index, 1);
    reproducirSonido('scanner');
    renderizarCarrito();
}

function calcularVuelto() {
    const pagaConInput = document.getElementById('paga-con');
    const vueltoDisplay = document.getElementById('vuelto-display');
    if (!pagaConInput || !vueltoDisplay) return;

    const pagaCon = parseFloat(pagaConInput.value) || 0;
    if (pagaCon < 0) {
        vueltoDisplay.innerText = "Monto inválido";
        vueltoDisplay.style.color = "var(--danger)";
        return;
    }

    const vuelto = pagaCon - totalVenta;

    if (pagaCon === 0) {
        vueltoDisplay.innerText = "$0,00";
        vueltoDisplay.style.color = "var(--text-primary)";
    } else if (vuelto < 0) {
        vueltoDisplay.innerText = "Falta dinero";
        vueltoDisplay.style.color = "var(--danger)";
    } else {
        vueltoDisplay.innerText = `$${vuelto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        vueltoDisplay.style.color = "var(--success)";
    }
}

// 5. SUGERENCIAS DE BÚSQUEDA MANUAL
function mostrarSugerencias(busqueda) {
    const contenedor = document.getElementById('lista-sugerencias');
    if (!contenedor) return;

    if (busqueda.length < 2) {
        ocultarSugerencias();
        return;
    }

    const busquedaNorm = normalizarTexto(busqueda);
    const filtrados = productosDB.filter(p =>
        normalizarTexto(p.nombre).includes(busquedaNorm) ||
        normalizarTexto(p.id).includes(busquedaNorm)
    ).slice(0, 5);

    if (filtrados.length === 0) {
        ocultarSugerencias();
        return;
    }

    contenedor.innerHTML = filtrados.map(p => `
        <div class="sugerencia-item" onclick="seleccionarSugerencia('${p.id}')">
            <span class="sugerencia-name">${p.nombre}</span>
            <span class="sugerencia-price">$${p.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
    `).join('');

    contenedor.classList.add('active');
}

function seleccionarSugerencia(id) {
    procesarEscaneo(id);
    const input = document.getElementById('codigo');
    if (input) {
        input.value = '';
        input.focus();
    }
    ocultarSugerencias();
}

function ocultarSugerencias() {
    const contenedor = document.getElementById('lista-sugerencias');
    if (contenedor) {
        contenedor.innerHTML = '';
        contenedor.classList.remove('active');
    }
}

// 6. FINALIZAR VENTA (PERSISTENCIA HYBRID EN DISCO/GITHUB)
async function finalizarVenta() {
    if (carrito.length === 0) {
        reproducirSonido('alerta');
        alert("El carrito está vacío");
        return;
    }

    const metodo = document.getElementById('metodo-pago').value;

    // Obtener historial de ventas de la API
    let ventasHistoricas = await apiGet('/api/ventas', 'ventas_realizadas');

    ventasHistoricas.push({
        total: totalVenta,
        metodo: metodo,
        fecha: new Date().toLocaleString(),
        productos: [...carrito]
    });

    // Guardar ventas
    const okVentas = await apiPost('/api/ventas', ventasHistoricas, 'ventas_realizadas');

    if (okVentas) {
        console.log("💾 Ventas actualizadas correctamente.");
    } else {
        console.warn("⚠️ Error subiendo datos a GitHub. Guardado en memoria local.");
    }

    reproducirSonido('exito');
    alert(`✅ VENTA FINALIZADA CON ÉXITO\nTotal cobrado: $${totalVenta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);

    carrito = [];
    document.getElementById('paga-con').value = '';
    renderizarCarrito();

    setTimeout(() => {
        if (inputCodigo) inputCodigo.focus();
    }, 50);
}

// Sincronización silenciosa (Mantenida por compatibilidad pero no hace falta llamada extra)
async function intentarSubirInventarioSilencioso() {
    return true;
}

// 7. ANULAR VENTA (CORREGIDA PARA TRABAJAR CON API/GITHUB)
async function anularUltimaVenta() {
    let ventas = await apiGet('/api/ventas', 'ventas_realizadas');

    if (ventas.length === 0) {
        reproducirSonido('alerta');
        alert("No hay ventas para anular.");
        return;
    }

    const ultima = ventas[ventas.length - 1];

    if (confirm(`¿Anular venta de $${ultima.total.toLocaleString('es-AR')} realizada el ${ultima.fecha}?`)) {
        ventas.pop();

        // Actualizar datos
        await apiPost('/api/ventas', ventas, 'ventas_realizadas');

        reproducirSonido('exito');
        alert("Venta anulada correctamente.");
        renderizarCarrito();
    }
}

// 8. FIADOS Y EXTRAS (CON API/GITHUB)
async function enviarAFiado() {
    if (carrito.length === 0) {
        reproducirSonido('alerta');
        alert("El carrito está vacío");
        return;
    }
    const cliente = prompt("¿Nombre del cliente para anotar el vale?");
    if (!cliente || cliente.trim() === "") return;

    fiados = await apiGet('/api/fiados', 'fiados');

    const idx = fiados.findIndex(f => f.cliente.toUpperCase() === cliente.toUpperCase().trim());

    if (idx > -1) {
        fiados[idx].monto += totalVenta;
    } else {
        fiados.push({ cliente: cliente.trim(), monto: totalVenta });
    }

    // Guardar fiados
    await apiPost('/api/fiados', fiados, 'fiados');

    reproducirSonido('exito');
    alert(`Vale anotado para: ${cliente}.\nMonto: $${totalVenta.toLocaleString('es-AR')}`);

    carrito = [];
    renderizarCarrito();
}

function cancelarCarrito() {
    if (carrito.length > 0) {
        if (confirm("¿Seguro que desea vaciar el carrito?")) {
            carrito = [];
            reproducirSonido('scanner');
            renderizarCarrito();
        }
    }
}

// Foco automático continuo en el mostrador
window.onclick = function (e) {
    if (inputCodigo && !['BUTTON', 'INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName) && !e.target.closest('.sugerencia-item') && !e.target.closest('.qty-input')) {
        inputCodigo.focus();
    }
};

// Cargar la base de datos al inicio
async function inicializarMostrador() {
    await cargarInventario();
    await cargarFiados();
    renderizarCarrito();
}

inicializarMostrador();
