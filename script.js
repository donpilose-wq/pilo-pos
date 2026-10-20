// El cerebro del Mostrador - punto de venta
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

// --- GESTIÓN DE IMÁGENES Y FALLBACKS ---
const PLACEHOLDER_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260' fill='%231b2537'><rect width='400' height='260' fill='%23131a26'/><circle cx='200' cy='105' r='42' fill='%231b2537' stroke='%232e3c51' stroke-width='2'/><text x='50%' y='113' dominant-baseline='middle' text-anchor='middle' font-size='34'>🍽️</text><text x='50%' y='172' dominant-baseline='middle' text-anchor='middle' fill='%23f59e0b' font-family='sans-serif' font-weight='bold' font-size='16'>DON PILO</text><text x='50%' y='196' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='sans-serif' font-size='12'>Rotiser%C3%ADa &amp; Pastas</text></svg>";

function resolverRutaImagen(src) {
    if (!src || src === 'img/.jpg' || src === '.jpg') return PLACEHOLDER_IMG;
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
    let clean = src.replace(/^(\.\.\/|\.\/)/, '');
    if (clean.startsWith('/')) clean = clean.slice(1);
    // Asegurar que si viene como "img/foto.jpg" o solo "foto.jpg" devuelva una ruta válida
    return clean;
}

function handleImageFallback(imgEl, originalPath) {
    let clean = (originalPath || '').replace(/^(\.\.\/|\.\/|img\/)/, '');
    if (!clean || clean.startsWith('http') || clean === '.jpg') {
        imgEl.onerror = null;
        imgEl.src = PLACEHOLDER_IMG;
        return;
    }

    // Paso 1: Intentar en menuclick/img/ de GitHub Pages
    const urlMenuclick = 'https://donpilose-wq.github.io/menuclick/img/' + encodeURIComponent(clean);
    // Paso 2: Si falla, intentar en raw.githubusercontent.com de menuclick
    const urlRaw = 'https://raw.githubusercontent.com/donpilose-wq/menuclick/main/img/' + encodeURIComponent(clean);

    if (imgEl.src !== urlMenuclick && imgEl.src !== urlRaw) {
        imgEl.src = urlMenuclick;
        imgEl.onerror = function () {
            this.src = urlRaw;
            this.onerror = function () {
                this.onerror = null;
                this.src = PLACEHOLDER_IMG;
            };
        };
    } else if (imgEl.src === urlMenuclick) {
        imgEl.src = urlRaw;
        imgEl.onerror = function () {
            this.onerror = null;
            this.src = PLACEHOLDER_IMG;
        };
    } else {
        imgEl.onerror = null;
        imgEl.src = PLACEHOLDER_IMG;
    }
}

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

    // 1. Intentar con GitHub API si hay internet y token
    const token = localStorage.getItem('github_token');
    if (navigator.onLine && token && fileName) {
        console.log(`☁️ Intentando cargar ${fileName} desde GitHub API...`);
        const dataGithub = await leerDesdeGitHub(fileName);
        if (dataGithub !== null && Array.isArray(dataGithub) && dataGithub.length > 0) {
            localStorage.setItem(fallbackKey, JSON.stringify(dataGithub));
            console.log(`✅ ${fileName} cargado exitosamente desde GitHub API`);
            return dataGithub;
        }
    }

    // 2. Si es inventario y estamos online, intentar descargar productos.json desde la web pública (menuclick)
    if (ruta === '/api/inventario' && navigator.onLine) {
        try {
            const urlWeb = 'https://donpilose-wq.github.io/menuclick/productos.json?v=' + Date.now();
            const respWeb = await fetchWithTimeout(urlWeb, { timeout: 3000 });
            if (respWeb.ok) {
                const dataWeb = await respWeb.json();
                if (Array.isArray(dataWeb) && dataWeb.length > 0) {
                    localStorage.setItem(fallbackKey, JSON.stringify(dataWeb));
                    console.log(`✅ Inventario cargado desde menuclick (GitHub Pages)`);
                    return dataWeb;
                }
            }
        } catch (e) {
            console.warn(`No se pudo leer productos.json desde menuclick GitHub Pages`, e);
        }

        try {
            const urlRaw = 'https://raw.githubusercontent.com/donpilose-wq/menuclick/main/productos.json?v=' + Date.now();
            const respRaw = await fetchWithTimeout(urlRaw, { timeout: 3000 });
            if (respRaw.ok) {
                const dataRaw = await respRaw.json();
                if (Array.isArray(dataRaw) && dataRaw.length > 0) {
                    localStorage.setItem(fallbackKey, JSON.stringify(dataRaw));
                    console.log(`✅ Inventario cargado desde menuclick (raw)`);
                    return dataRaw;
                }
            }
        } catch (e) {
            console.warn(`No se pudo leer productos.json desde raw GitHub`, e);
        }
    }

    // 3. Intentar buscar un archivo local estático (./productos.json)
    if (ruta === '/api/inventario') {
        try {
            const response = await fetch('./productos.json');
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    localStorage.setItem(fallbackKey, JSON.stringify(data));
                    console.log(`✅ Inventario cargado desde productos.json local estático`);
                    return data;
                }
            }
        } catch (e) {
            console.warn(`No se pudo leer productos.json estático local`, e);
        }
    }

    // 4. Fallback a localStorage
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
                agregarAlCarrito(producto.id, producto.nombre, precioManual, cantidadAAgregar, producto.imagen);
            } else {
                reproducirSonido('alerta');
            }
        } else {
            reproducirSonido('scanner');
            agregarAlCarrito(producto.id, producto.nombre, producto.precio, cantidadAAgregar, producto.imagen);
        }

        // Reset a 1
        if (cantInput) cantInput.value = 1;
    } else {
        reproducirSonido('alerta');
        alert(`Código o producto "${codigo}" no encontrado en el inventario.`);
    }
}

// 4. MANEJO DEL CARRITO Y CANTIDADES MANUALES
function agregarAlCarrito(id, nombre, precio, cantidad = 1, imagen = '') {
    const existente = carrito.find(item => item.id === id);

    if (existente) {
        existente.cantidad += cantidad;
        existente.subtotal = existente.cantidad * existente.precio;
        if (!existente.imagen && imagen) existente.imagen = imagen;
    } else {
        carrito.push({
            id: id,
            nombre: nombre,
            precio: precio,
            cantidad: cantidad,
            imagen: imagen,
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

        const imgSrc = resolverRutaImagen(item.imagen);

        fila.innerHTML = `
            <img class="cart-item-thumb" src="${imgSrc}" onerror="handleImageFallback(this, '${item.imagen}')" alt="${item.nombre}">
            <div class="prod-info">
                <strong>${item.nombre}</strong>
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

    contenedor.innerHTML = filtrados.map(p => {
        const imgSrc = resolverRutaImagen(p.imagen);
        const precioNum = parseFloat(p.precio) || 0;
        const precioFormatted = (p.tipo === "variable") ? "Variable" : `$${precioNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        return `
        <div class="sugerencia-item" onclick="seleccionarSugerencia('${p.id}')">
            <img class="sugerencia-thumb" src="${imgSrc}" onerror="handleImageFallback(this, '${p.imagen}')" alt="${p.nombre}">
            <div class="sugerencia-info">
                <span class="sugerencia-name">${p.nombre}</span>
                <span class="sugerencia-code">Cód: ${p.id}</span>
            </div>
            <span class="sugerencia-price">${precioFormatted}</span>
        </div>
        `;
    }).join('');

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

// 6. FINALIZAR VENTA (PERSISTENCIA HYBRID EN DISCO/GITHUB + TICKET PROFESIONAL)
let ultimaVentaGenerada = null;

async function finalizarVenta() {
    if (carrito.length === 0) {
        reproducirSonido('alerta');
        alert("El carrito está vacío");
        return;
    }

    const metodo = document.getElementById('metodo-pago').value;
    const pagaConInput = document.getElementById('paga-con');
    const pagaConVal = pagaConInput && pagaConInput.value !== '' ? parseFloat(pagaConInput.value) : totalVenta;
    const vueltoVal = Math.max(0, pagaConVal - totalVenta);

    // Obtener historial de ventas de la API
    let ventasHistoricas = await apiGet('/api/ventas', 'ventas_realizadas');

    const idTicket = `TCK-${Date.now().toString().slice(-6)}`;
    const fechaStr = new Date().toLocaleString('es-AR');

    const nuevaVenta = {
        id: idTicket,
        total: totalVenta,
        metodo: metodo,
        pagaCon: pagaConVal,
        vuelto: vueltoVal,
        fecha: fechaStr,
        productos: [...carrito]
    };

    ventasHistoricas.push(nuevaVenta);

    // Guardar ventas
    const okVentas = await apiPost('/api/ventas', ventasHistoricas, 'ventas_realizadas');

    if (okVentas) {
        console.log("💾 Ventas actualizadas correctamente.");
    } else {
        console.warn("⚠️ Error subiendo datos a GitHub. Guardado en memoria local.");
    }

    reproducirSonido('exito');

    // Mostrar el modal con ticket listo para impresora térmica (80mm/58mm)
    mostrarModalTicket(nuevaVenta);

    carrito = [];
    if (pagaConInput) pagaConInput.value = '';
    renderizarCarrito();
}

function mostrarModalTicket(venta) {
    ultimaVentaGenerada = venta;
    const ticketEl = document.getElementById('ticket-paper');
    const modalEl = document.getElementById('modal-ticket-overlay');
    if (!ticketEl || !modalEl) return;

    const nroTicket = venta.id || `TCK-${Date.now().toString().slice(-6)}`;
    const metodoNombre = {
        'efectivo': '💵 EFECTIVO',
        'debito': '💳 DÉBITO / CRÉDITO',
        'qr': '📱 MERCADO PAGO / QR'
    }[venta.metodo] || (venta.metodo ? String(venta.metodo).toUpperCase() : 'EFECTIVO');

    let itemsHtml = '';
    (venta.productos || []).forEach(item => {
        const sub = (item.precio * item.cantidad);
        itemsHtml += `
            <div class="ticket-row-item">
                <div class="ticket-item-left">
                    <span class="ticket-item-qty">${item.cantidad}x</span>
                    <span class="ticket-item-name">${item.nombre}</span>
                </div>
                <div class="ticket-item-right">
                    $${sub.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
            </div>
            <div class="ticket-item-sub">PU: $${item.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
        `;
    });

    const pagaConVal = venta.pagaCon !== undefined ? venta.pagaCon : venta.total;
    const vueltoVal = venta.vuelto !== undefined ? venta.vuelto : 0;

    ticketEl.innerHTML = `
        <div class="ticket-header">
            <div class="ticket-brand">KIOSCO EL CHOLO</div>
            <div class="ticket-subtitle">COMPROBANTE DE VENTA POS</div>
            <div class="ticket-meta">
                <span>Nro: ${nroTicket}</span><br>
                <span>Fecha: ${venta.fecha || new Date().toLocaleString('es-AR')}</span>
            </div>
        </div>
        <div class="ticket-divider"></div>
        <div class="ticket-body">
            <div class="ticket-col-headers">
                <span>CANT / DESCRIPCIÓN</span>
                <span>IMPORTE</span>
            </div>
            ${itemsHtml}
        </div>
        <div class="ticket-divider"></div>
        <div class="ticket-totals">
            <div class="ticket-total-row main-total">
                <span>TOTAL:</span>
                <span>$${venta.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="ticket-total-row">
                <span>MEDIO PAGO:</span>
                <span>${metodoNombre}</span>
            </div>
            <div class="ticket-total-row">
                <span>ABONÓ CON:</span>
                <span>$${parseFloat(pagaConVal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="ticket-total-row">
                <span>VUELTO:</span>
                <span>$${parseFloat(vueltoVal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>
        <div class="ticket-divider"></div>
        <div class="ticket-footer">
            <div>¡MUCHAS GRACIAS POR SU COMPRA!</div>
            <div class="ticket-footer-sub">Conserve este comprobante</div>
        </div>
    `;

    modalEl.style.display = 'flex';
}

function cerrarModalTicket() {
    const modalEl = document.getElementById('modal-ticket-overlay');
    if (modalEl) modalEl.style.display = 'none';
    const inputCodigo = document.getElementById('codigo');
    if (inputCodigo) inputCodigo.focus();
}

function imprimirTicketActual() {
    window.print();
}

async function reimprimirUltimoTicket() {
    if (ultimaVentaGenerada) {
        mostrarModalTicket(ultimaVentaGenerada);
        return;
    }
    const ventasHistoricas = await apiGet('/api/ventas', 'ventas_realizadas');
    if (!ventasHistoricas || ventasHistoricas.length === 0) {
        reproducirSonido('alerta');
        alert("No hay ventas registradas para reimprimir.");
        return;
    }
    const ultima = ventasHistoricas[ventasHistoricas.length - 1];
    mostrarModalTicket(ultima);
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



function cancelarCarrito() {
    if (carrito.length > 0) {
        if (confirm("¿Seguro que desea vaciar el carrito?")) {
            carrito = [];
            reproducirSonido('scanner');
            renderizarCarrito();
        }
    }
}

// Cierre de modales con Escape
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modalTicket = document.getElementById('modal-ticket-overlay');
        if (modalTicket && modalTicket.style.display === 'flex') {
            cerrarModalTicket();
            return;
        }
        const modalCatalogo = document.getElementById('modal-catalogo');
        if (modalCatalogo && modalCatalogo.style.display === 'flex') {
            cerrarModalCatalogo();
            return;
        }
    }
});

// Foco automático continuo en el mostrador y cierre por clic fuera
window.onclick = function (e) {
    const modalTicket = document.getElementById('modal-ticket-overlay');
    if (modalTicket && modalTicket.style.display === 'flex') {
        if (e.target === modalTicket) {
            cerrarModalTicket();
        }
        return;
    }
    const modalCatalogo = document.getElementById('modal-catalogo');
    if (modalCatalogo && modalCatalogo.style.display === 'flex') {
        if (e.target === modalCatalogo) {
            cerrarModalCatalogo();
        }
        return;
    }
    if (inputCodigo && !['BUTTON', 'INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName) && !e.target.closest('.sugerencia-item') && !e.target.closest('.qty-input') && !e.target.closest('.tarjeta-producto')) {
        inputCodigo.focus();
    }
};

// Cargar la base de datos al inicio
async function inicializarMostrador() {
    await cargarInventario();
    renderizarCarrito();
}

inicializarMostrador();
