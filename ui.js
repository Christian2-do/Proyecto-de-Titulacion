/* =====================================================
   UI compartida: tema claro/oscuro, fondo animado,
   notificaciones, confirmaciones, reloj y menú lateral
   ===================================================== */
(function () {
    "use strict";
    const raiz = document.documentElement;
    const reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Tema ----------
    function leerTema() {
        try { return localStorage.getItem("tema"); } catch (e) { return null; }
    }
    if (!raiz.dataset.tema) raiz.dataset.tema = leerTema() || "dark";

    window.alternarTema = function () {
        const nuevo = raiz.dataset.tema === "light" ? "dark" : "light";
        raiz.dataset.tema = nuevo;
        try { localStorage.setItem("tema", nuevo); } catch (e) { /* sin almacenamiento */ }
        document.dispatchEvent(new CustomEvent("tema-cambiado", { detail: nuevo }));
        window.notificar(nuevo === "dark" ? "Modo oscuro activado" : "Modo claro activado", "info", 1800);
    };

    // ---------- Notificaciones (toasts) ----------
    window.notificar = function (mensaje, tipo, duracion) {
        tipo = tipo || "info";
        duracion = duracion || 4200;
        let contenedor = document.getElementById("toasts");
        if (!contenedor) {
            contenedor = document.createElement("div");
            contenedor.id = "toasts";
            contenedor.setAttribute("aria-live", "polite");
            document.body.appendChild(contenedor);
        }
        const toast = document.createElement("div");
        toast.className = "toast toast-" + tipo;
        toast.setAttribute("role", tipo === "error" || tipo === "alerta" ? "alert" : "status");
        const punto = document.createElement("span");
        punto.className = "toast-punto";
        const texto = document.createElement("span");
        texto.className = "toast-texto";
        texto.textContent = mensaje;
        toast.append(punto, texto);
        contenedor.appendChild(toast);
        setTimeout(() => {
            toast.classList.add("saliendo");
            setTimeout(() => toast.remove(), 320);
        }, duracion);
    };

    // ---------- Confirmación en modal ----------
    window.confirmarAccion = function (opciones) {
        const o = Object.assign({ titulo: "¿Estás seguro?", mensaje: "", confirmar: "Confirmar", peligro: false }, opciones);
        return new Promise((resolver) => {
            const fondo = document.createElement("div");
            fondo.className = "modal-fondo";
            fondo.innerHTML = '<div class="modal-caja" role="dialog" aria-modal="true"><div class="modal-icono"></div><h2></h2><p></p><div class="modal-acciones"><button type="button" class="btn-secondary" data-no>Cancelar</button><button type="button" data-si></button></div></div>';
            const icono = fondo.querySelector(".modal-icono");
            icono.textContent = o.peligro ? "!" : "?";
            if (o.peligro) icono.classList.add("peligro");
            fondo.querySelector("h2").textContent = o.titulo;
            fondo.querySelector("p").textContent = o.mensaje;
            const si = fondo.querySelector("[data-si]");
            si.textContent = o.confirmar;
            si.className = o.peligro ? "btn-peligro" : "btn-primary";
            const cerrar = (valor) => {
                document.removeEventListener("keydown", teclas);
                fondo.remove();
                resolver(valor);
            };
            const teclas = (e) => { if (e.key === "Escape") cerrar(false); };
            fondo.querySelector("[data-no]").onclick = () => cerrar(false);
            si.onclick = () => cerrar(true);
            fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(false); });
            document.addEventListener("keydown", teclas);
            document.body.appendChild(fondo);
            si.focus();
        });
    };

    // ---------- Números animados ----------
    window.animarNumero = function (elemento, destino) {
        if (!elemento) return;
        const inicio = Number(elemento.dataset.valor || 0);
        destino = Number(destino) || 0;
        elemento.dataset.valor = destino;
        if (reducir || inicio === destino) { elemento.textContent = destino; return; }
        const t0 = performance.now();
        const duracion = 900;
        (function paso(t) {
            const p = Math.min(1, (t - t0) / duracion);
            const suave = 1 - Math.pow(1 - p, 3);
            elemento.textContent = Math.round(inicio + (destino - inicio) * suave);
            if (p < 1) requestAnimationFrame(paso);
        })(t0);
    };

    // ---------- Reloj ----------
    function actualizarReloj() {
        const reloj = document.getElementById("reloj");
        if (!reloj) return;
        const ahora = new Date();
        const fecha = ahora.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });
        const hora = ahora.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
        reloj.innerHTML = "";
        const h = document.createElement("strong");
        h.textContent = hora;
        const f = document.createElement("span");
        f.textContent = fecha;
        reloj.append(h, f);
    }
    window.saludoSegunHora = function () {
        const h = new Date().getHours();
        return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
    };

    // ---------- Menú lateral (móvil) ----------
    window.alternarMenuLateral = function () {
        document.body.classList.toggle("menu-abierto");
    };

    // ---------- Fondo animado (red de nodos + barrido de escaneo) ----------
    function iniciarFondo() {
        if (document.getElementById("fondo-animado")) return;
        const lienzo = document.createElement("canvas");
        lienzo.id = "fondo-animado";
        lienzo.setAttribute("aria-hidden", "true");
        document.body.prepend(lienzo);
        const ctx = lienzo.getContext("2d");
        let ancho = 0, alto = 0, nodos = [], t = 0, cuadro = null;
        const raton = { x: -999, y: -999 };

        function medir() {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            ancho = window.innerWidth;
            alto = window.innerHeight;
            lienzo.width = ancho * dpr;
            lienzo.height = alto * dpr;
            lienzo.style.width = ancho + "px";
            lienzo.style.height = alto + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const cantidad = Math.round(Math.min(72, Math.max(24, (ancho * alto) / 24000)));
            nodos = Array.from({ length: cantidad }, () => ({
                x: Math.random() * ancho, y: Math.random() * alto,
                vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
                r: Math.random() * 1.6 + 0.8, dorado: Math.random() < 0.18
            }));
        }

        function paleta() {
            return raiz.dataset.tema === "light"
                ? { a: "123,44,131", b: "198,148,0", linea: 0.14, punto: 0.5, barrido: 0.05 }
                : { a: "180,76,255", b: "255,211,77", linea: 0.26, punto: 0.85, barrido: 0.09 };
        }

        function dibujar() {
            const k = paleta();
            ctx.clearRect(0, 0, ancho, alto);
            const y = ((t * 0.7) % (alto + 260)) - 130;
            const g = ctx.createLinearGradient(0, y - 110, 0, y + 110);
            g.addColorStop(0, "rgba(" + k.a + ",0)");
            g.addColorStop(0.5, "rgba(" + k.a + "," + k.barrido + ")");
            g.addColorStop(1, "rgba(" + k.a + ",0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, y - 110, ancho, 220);
            for (let i = 0; i < nodos.length; i++) {
                const n = nodos[i];
                for (let j = i + 1; j < nodos.length; j++) {
                    const m = nodos[j];
                    const dx = n.x - m.x, dy = n.y - m.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 140) {
                        ctx.strokeStyle = "rgba(" + k.a + "," + ((1 - d / 140) * k.linea) + ")";
                        ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
                    }
                }
                const rx = n.x - raton.x, ry = n.y - raton.y;
                const dr = Math.sqrt(rx * rx + ry * ry);
                if (dr < 170) {
                    ctx.strokeStyle = "rgba(" + k.b + "," + ((1 - dr / 170) * k.linea * 2.2) + ")";
                    ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(raton.x, raton.y); ctx.stroke();
                }
                ctx.fillStyle = "rgba(" + (n.dorado ? k.b : k.a) + "," + k.punto + ")";
                ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
            }
        }

        function paso() {
            t += 1;
            nodos.forEach((n) => {
                n.x += n.vx; n.y += n.vy;
                if (n.x < -10) n.x = ancho + 10; else if (n.x > ancho + 10) n.x = -10;
                if (n.y < -10) n.y = alto + 10; else if (n.y > alto + 10) n.y = -10;
            });
            dibujar();
            cuadro = requestAnimationFrame(paso);
        }

        medir();
        if (reducir) { dibujar(); } else { paso(); }
        window.addEventListener("resize", () => { medir(); if (reducir) dibujar(); });
        window.addEventListener("mousemove", (e) => { raton.x = e.clientX; raton.y = e.clientY; }, { passive: true });
        window.addEventListener("mouseleave", () => { raton.x = -999; raton.y = -999; });
        document.addEventListener("visibilitychange", () => {
            if (reducir) return;
            if (document.hidden) { cancelAnimationFrame(cuadro); } else { paso(); }
        });
        document.addEventListener("tema-cambiado", () => { if (reducir) dibujar(); });
    }

    function iniciar() {
        iniciarFondo();
        actualizarReloj();
        setInterval(actualizarReloj, 20000);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.body.classList.remove("menu-abierto"); });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
