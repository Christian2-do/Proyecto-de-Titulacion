/* =====================================================
   Módulos del panel: navegación por vistas, clases por
   maestro, asistencia, papelera (30 días) e inicio
   ===================================================== */
(function () {
    "use strict";
    if (!document.getElementById("sidebar")) return;

    const TITULOS = {
        inicio: "Inicio", examenes: "Exámenes", calificaciones: "Mis calificaciones", clases: "Clases",
        reportes: "Reportes", monitoreo: "Cámaras en vivo", asistencia: "Asistencia", personas: "Personas", papelera: "Papelera"
    };
    const DIAS_PAPELERA = 30;
    let clasesCache = [];
    let registrosHoy = [];
    let filasAsistencia = [];
    let metaAsistencia = { dia: "", clase: "" };
    let modulosIniciados = false;

    const $ = (id) => document.getElementById(id);
    const esc = (t) => escaparHtml(String(t == null ? "" : t));
    const textoRequerido = (id, etiqueta, maximo, minimo) => {
        const valor = $(id).value.trim();
        if (!valor) throw new Error("Completa el campo «" + etiqueta + "».");
        if (minimo && valor.length < minimo) throw new Error(etiqueta + " debe tener al menos " + minimo + " caracteres.");
        if (valor.length > maximo) throw new Error(etiqueta + " no puede superar " + maximo + " caracteres.");
        return valor;
    };
    const rol = () => obtenerRolActual();
    const db = () => firebaseDb;
    const correoActual = () => String((firebaseAuth.currentUser && firebaseAuth.currentUser.email) || obtenerSesion().correo || "").toLowerCase();
    const aFecha = (v) => (v && v.toDate ? v.toDate() : v ? new Date(v) : null);
    const hoyClave = (d) => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    const horaTexto = (d) => d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
    const rolTexto = (r) => (r === "admin" ? "Administrador" : r === "maestro" ? "Maestro" : "Estudiante");
    const estado = (id, mensaje, error) => {
        const el = $(id);
        if (!el) return;
        el.textContent = mensaje || "";
        el.hidden = !mensaje;
        el.classList.toggle("estado-error", Boolean(error));
    };
    const iconoNav = (vista) => {
        const svg = document.querySelector('.nav-item[data-vista="' + vista + '"] .nav-icono svg');
        return svg ? svg.outerHTML : "";
    };

    // ---------- Navegación ----------
    function aplicarRolesNavegacion() {
        const r = rol();
        document.querySelectorAll("[data-roles]").forEach((el) => {
            el.hidden = !el.dataset.roles.split(" ").includes(r);
        });
        const textoClases = $("nav-texto-clases");
        if (textoClases) textoClases.textContent = r === "admin" ? "Clases y maestros" : "Mis clases";
    }

    window.mostrarVista = function (nombre) {
        if (!TITULOS[nombre]) nombre = "inicio";
        const boton = document.querySelector('.nav-item[data-vista="' + nombre + '"]');
        if (boton && boton.hidden) nombre = "inicio";
        document.querySelectorAll(".vista").forEach((v) => { v.hidden = v.dataset.vista !== nombre; });
        document.querySelectorAll(".nav-item").forEach((b) => {
            const activo = b.dataset.vista === nombre;
            b.classList.toggle("activo", activo);
            if (activo) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
        });
        const titulo = $("titulo-vista");
        if (titulo) titulo.textContent = nombre === "clases" && rol() === "admin" ? "Clases y maestros" : TITULOS[nombre];
        document.body.classList.remove("menu-abierto");
        try { history.replaceState(null, "", location.pathname + location.search + "#" + nombre); } catch (e) { /* ignorar */ }
        window.scrollTo({ top: 0, behavior: "smooth" });
        alEntrarVista(nombre);
    };

    function alEntrarVista(nombre) {
        if (nombre === "monitoreo" && typeof cargarMonitoreoEnVivo === "function") cargarMonitoreoEnVivo();
        else if (typeof detenerMonitoreoEnVivo === "function") detenerMonitoreoEnVivo();
        if (nombre === "calificaciones") cargarCalificaciones();
        if (nombre === "clases") cargarClases();
        if (nombre === "reportes") {
            const panel = $("reportes-panel");
            if (panel) panel.hidden = false;
            if (typeof cargarReportesProfesor === "function") cargarReportesProfesor();
        }
        if (nombre === "asistencia") {
            const fecha = $("asistencia-fecha");
            if (fecha && !fecha.value) fecha.value = hoyClave();
            cargarAsistencia();
        }
        if (nombre === "personas") {
            const panel = $("usuarios-panel");
            if (panel) panel.hidden = false;
            if (typeof cargarUsuarios === "function") cargarUsuarios();
        }
        if (nombre === "papelera") cargarPapelera();
    }

    // Sustituye el comportamiento anterior del panel de calificaciones
    window.mostrarCalificaciones = function () {
        if (typeof cerrarMenuCuenta === "function") cerrarMenuCuenta();
        window.mostrarVista("calificaciones");
    };
    window.cerrarCalificaciones = function () { window.mostrarVista("inicio"); };

    // ---------- Accesos rápidos ----------
    function renderAccesosRapidos() {
        const contenedor = $("accesos-rapidos");
        if (!contenedor) return;
        const nuevoExamen = () => { window.mostrarVista("examenes"); setTimeout(() => { if (typeof mostrarFormularioExamen === "function") mostrarFormularioExamen(); }, 150); };
        const catalogo = {
            nuevo: ["Crear examen", "Prepara una nueva prueba para tus estudiantes", "examenes", nuevoExamen],
            examenes: ["Exámenes", rol() === "estudiante" ? "Realiza tus pruebas disponibles" : "Crea, edita y elimina pruebas", "examenes"],
            calificaciones: ["Mis calificaciones", "Revisa tus notas y resultados", "calificaciones"],
            clases: [rol() === "admin" ? "Clases y maestros" : "Mis clases", rol() === "admin" ? "Asigna asignaturas y estudiantes a cada maestro" : rol() === "maestro" ? "Asignaturas que te asignó el administrador" : "Asignaturas en las que estás inscrito", "clases"],
            reportes: ["Reportes", "Entregas, supervisión y calificaciones", "reportes"],
            monitoreo: ["Cámaras en vivo", "Supervisa las cámaras de estudiantes en pruebas activas", "monitoreo"],
            asistencia: ["Asistencia", "Quién ingresó hoy al sistema", "asistencia"],
            personas: ["Personas", "Registra estudiantes y maestros", "personas"],
            papelera: ["Papelera", "Recupera exámenes eliminados (30 días)", "papelera"]
        };
        const porRol = {
            estudiante: ["examenes", "calificaciones", "clases"],
            maestro: ["nuevo", "examenes", "reportes", "monitoreo", "clases", "asistencia", "papelera"],
            admin: ["clases", "asistencia", "personas", "examenes", "reportes", "monitoreo", "papelera"]
        };
        contenedor.innerHTML = "";
        (porRol[rol()] || porRol.estudiante).forEach((clave, i) => {
            const [titulo, descripcion, vista, accion] = catalogo[clave];
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "acceso";
            boton.style.animationDelay = (i * 70) + "ms";
            boton.innerHTML = '<span class="acceso-icono">' + iconoNav(vista) + "</span><strong></strong><span></span>";
            boton.querySelector("strong").textContent = titulo;
            boton.lastElementChild.textContent = descripcion;
            boton.addEventListener("click", accion || (() => window.mostrarVista(vista)));
            contenedor.appendChild(boton);
        });
    }

    // ---------- Clases ----------
    async function cargarOpcionesMaestros() {
        const mapa = new Map();
        const leer = async (coleccion) => {
            try {
                const datos = await db().collection(coleccion).get();
                datos.docs.forEach((d) => {
                    const x = d.data();
                    if (x.rol === "maestro" && x.correo) mapa.set(String(x.correo).toLowerCase(), x.nombreCompleto || x.correo);
                });
            } catch (e) { /* sin permiso o vacío */ }
        };
        await Promise.all([leer("usuarios"), leer("usuariosPendientes")]);
        return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }

    function poblarSelectsClases() {
        const examen = $("clase-examen");
        if (examen) {
            const actual = examen.value;
            examen.innerHTML = '<option value="">Sin clase asignada</option>';
            clasesCache.forEach((c) => {
                const o = document.createElement("option");
                o.value = c.id;
                o.textContent = c.asignatura + " · " + c.carrera + (c.ciclo ? " (" + c.ciclo + ")" : "");
                examen.appendChild(o);
            });
            examen.value = actual;
        }
        const asistencia = $("asistencia-clase");
        if (asistencia) {
            const actual = asistencia.value;
            asistencia.innerHTML = '<option value="">Todos los ingresos del día</option>';
            clasesCache.forEach((c) => {
                const o = document.createElement("option");
                o.value = c.id;
                o.textContent = c.asignatura + " · " + c.carrera;
                asistencia.appendChild(o);
            });
            asistencia.value = actual;
        }
        const total = $("total-clases");
        if (total) animarNumero(total, clasesCache.length);
    }

    window.cargarClases = async function () {
        const lista = $("lista-clases");
        if (!lista || typeof firebaseDb === "undefined") return;
        const r = rol();
        $("boton-nueva-clase").hidden = r !== "admin";
        $("clases-descripcion").textContent = r === "admin"
            ? "Asigna a cada maestro las asignaturas y carreras que imparte, e inscribe a sus estudiantes."
            : r === "maestro" ? "Asignaturas que el administrador te asignó." : "Asignaturas en las que estás inscrito.";
        try {
            const datos = await db().collection("clases").get();
            let clases = datos.docs.map((d) => Object.assign({ id: d.id }, d.data()));
            const correo = correoActual();
            if (r === "maestro") clases = clases.filter((c) => String(c.maestroCorreo || "").toLowerCase() === correo);
            if (r === "estudiante") clases = clases.filter((c) => (c.estudiantes || []).map((x) => String(x).toLowerCase()).includes(correo));
            clases.sort((a, b) => (a.carrera + a.asignatura).localeCompare(b.carrera + b.asignatura));
            clasesCache = clases;
            poblarSelectsClases();
            estado("estado-clases", "");
            renderClases();
            pintarResumenHoy();
        } catch (error) {
            estado("estado-clases", "No se pudieron cargar las clases. " + (error.message || error.code || ""), true);
        }
    };

    function renderClases() {
        const lista = $("lista-clases");
        const r = rol();
        if (!clasesCache.length) {
            lista.innerHTML = '<p class="sin-preguntas">' + (r === "admin" ? "Aún no hay clases. Crea la primera con «Nueva clase»." : r === "maestro" ? "El administrador todavía no te asignó clases." : "Todavía no estás inscrito en ninguna clase.") + "</p>";
            return;
        }
        lista.innerHTML = clasesCache.map((c, i) => {
            const nEst = (c.estudiantes || []).length;
            const acciones = [];
            if (r !== "estudiante") {
                acciones.push('<button type="button" class="btn-secondary btn-sm" data-accion="asistencia">Ver asistencia</button>');
                acciones.push('<button type="button" class="btn-run btn-sm" data-accion="examen">Crear examen</button>');
            }
            if (r === "admin") {
                acciones.push('<button type="button" class="btn-download btn-sm" data-accion="gestionar">Gestionar</button>');
                acciones.push('<button type="button" class="btn-delete btn-sm" data-accion="eliminar">Eliminar</button>');
            }
            return '<article class="tarjeta-clase" data-id="' + esc(c.id) + '" style="animation-delay:' + (i * 60) + 'ms">' +
                '<div class="clase-cabecera"><div class="clase-icono">' + iconoNav("clases") + '</div><div class="clase-info">' +
                "<h3>" + esc(c.asignatura) + "</h3><p>" + esc(c.carrera) + (c.ciclo ? " · " + esc(c.ciclo) : "") + "</p>" +
                '<div class="examen-meta"><span class="chip chip-morado">Maestro: ' + esc(c.maestroNombre || c.maestroCorreo) + '</span><span class="chip">' + nEst + " estudiante(s)</span></div></div></div>" +
                (acciones.length ? '<div class="clase-acciones">' + acciones.join("") + "</div>" : "") +
                (r === "admin" ? '<div class="clase-editor" hidden>' +
                    '<div class="fila"><div><label>Cambiar de maestro</label><select data-campo="maestro"></select></div><button type="button" class="btn-secondary btn-sm" data-accion="cambiar-maestro">Asignar</button></div>' +
                    '<div><label>Estudiantes inscritos (un correo por línea)</label><textarea data-campo="estudiantes" placeholder="alumno1@estud.tesa.edu.ec&#10;alumno2@estud.tesa.edu.ec">' + esc((c.estudiantes || []).join("\n")) + '</textarea></div>' +
                    '<div class="form-actions" style="margin-top:0"><button type="button" class="btn-primary btn-sm" data-accion="guardar-estudiantes">Guardar estudiantes</button></div></div>' : "") +
                "</article>";
        }).join("");
    }

    async function alClickClase(evento) {
        const boton = evento.target.closest("button[data-accion]");
        if (!boton) return;
        const tarjeta = boton.closest(".tarjeta-clase");
        const clase = clasesCache.find((c) => c.id === tarjeta.dataset.id);
        if (!clase) return;
        const accion = boton.dataset.accion;
        try {
            if (accion === "asistencia") {
                window.mostrarVista("asistencia");
                $("asistencia-clase").value = clase.id;
                cargarAsistencia();
            } else if (accion === "examen") {
                window.mostrarVista("examenes");
                setTimeout(() => {
                    if (typeof mostrarFormularioExamen === "function") mostrarFormularioExamen();
                    $("clase-examen").value = clase.id;
                    window.alAsignarClaseExamen();
                }, 150);
            } else if (accion === "gestionar") {
                const editor = tarjeta.querySelector(".clase-editor");
                editor.hidden = !editor.hidden;
                if (!editor.hidden) {
                    const select = editor.querySelector('select[data-campo="maestro"]');
                    const maestros = await cargarOpcionesMaestros();
                    select.innerHTML = maestros.map(([correo, nombre]) => '<option value="' + esc(correo) + '">' + esc(nombre) + "</option>").join("");
                    select.value = String(clase.maestroCorreo || "").toLowerCase();
                }
            } else if (accion === "eliminar") {
                const ok = await confirmarAccion({ titulo: "¿Eliminar esta clase?", mensaje: "Se quitará la asignación de «" + clase.asignatura + "». Los exámenes ya creados no se borran.", confirmar: "Eliminar clase", peligro: true });
                if (!ok) return;
                await db().collection("clases").doc(clase.id).delete();
                notificar("Clase eliminada", "ok");
                cargarClases();
            } else if (accion === "cambiar-maestro") {
                const select = tarjeta.querySelector('select[data-campo="maestro"]');
                const nombre = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : select.value;
                await db().collection("clases").doc(clase.id).update({ maestroCorreo: select.value, maestroNombre: nombre });
                notificar("Maestro actualizado", "ok");
                cargarClases();
            } else if (accion === "guardar-estudiantes") {
                const texto = tarjeta.querySelector('textarea[data-campo="estudiantes"]').value;
                const correos = [...new Set(texto.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
                const invalidos = correos.filter((c) => !/^[^@\s]+@estud\.tesa\.edu\.ec$/.test(c));
                if (invalidos.length) { notificar("Correos no válidos: " + invalidos.slice(0, 3).join(", "), "error"); return; }
                await db().collection("clases").doc(clase.id).update({ estudiantes: correos });
                notificar(correos.length + " estudiante(s) inscritos", "ok");
                cargarClases();
            }
        } catch (error) {
            notificar("No se pudo completar la acción. " + (error.message || error.code || ""), "error");
        }
    }

    window.mostrarFormularioClase = async function () {
        const form = $("formulario-clase");
        form.hidden = false;
        const select = $("clase-maestro");
        const maestros = await cargarOpcionesMaestros();
        select.innerHTML = '<option value="">' + (maestros.length ? "Selecciona un maestro" : "Aún no hay maestros registrados") + "</option>" +
            maestros.map(([correo, nombre]) => '<option value="' + esc(correo) + '">' + esc(nombre) + "</option>").join("");
        $("clase-carrera").focus();
    };
    window.ocultarFormularioClase = function () { $("formulario-clase").hidden = true; $("formulario-clase").reset(); };

    window.guardarClase = async function (evento) {
        evento.preventDefault();
        if (rol() !== "admin") return;
        const select = $("clase-maestro");
        if (!select.value || select.selectedIndex < 1 || !/^[^@\s]+@tesa\.edu\.ec$/i.test(select.value)) {
            notificar("Selecciona un maestro con correo institucional válido.", "error");
            return;
        }
        try {
            const ciclo = $("clase-ciclo").value.trim();
            if (ciclo.length > 40) throw new Error("El ciclo o paralelo no puede superar 40 caracteres.");
            await db().collection("clases").add({
                carrera: textoRequerido("clase-carrera", "La carrera", 80, 2),
                asignatura: textoRequerido("clase-asignatura", "La asignatura", 80, 2),
                ciclo,
                maestroCorreo: select.value,
                maestroNombre: select.options[select.selectedIndex].textContent,
                estudiantes: [],
                creadaPor: firebaseAuth.currentUser.uid,
                creadaEn: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.ocultarFormularioClase();
            notificar("Clase asignada correctamente", "ok");
            cargarClases();
        } catch (error) {
            notificar("No se pudo guardar la clase. " + (error.message || error.code || ""), "error");
        }
    };

    window.datosClaseExamen = function () {
        const select = $("clase-examen");
        const clase = select && clasesCache.find((c) => c.id === select.value);
        return clase ? { claseId: clase.id, claseNombre: clase.asignatura, carrera: clase.carrera, ciclo: clase.ciclo || "" } : {};
    };
    window.alAsignarClaseExamen = function () {
        const clase = clasesCache.find((c) => c.id === ($("clase-examen") || {}).value);
        if (clase) $("materia-examen").value = clase.asignatura;
    };

    // ---------- Asistencia ----------
    async function registrarAsistencia(usuario) {
        const hero = $("hero-asistencia");
        if (new URLSearchParams(location.search).has("vista")) return;
        const dia = hoyClave();
        const ref = db().collection("asistencias").doc(usuario.uid + "_" + dia);
        let hora = null;
        try {
            const existente = await ref.get();
            if (existente.exists) {
                hora = aFecha(existente.data().fecha);
            } else {
                let nombre = "";
                try {
                    const perfil = await db().collection("usuarios").doc(usuario.uid).get();
                    nombre = perfil.exists ? String(perfil.data().nombreCompleto || "") : "";
                } catch (e) { /* sin nombre */ }
                await ref.set({
                    uid: usuario.uid, correo: usuario.email, nombre: nombre, rol: obtenerSesion().rol || "estudiante",
                    dia: dia, fecha: firebase.firestore.FieldValue.serverTimestamp()
                });
                hora = new Date();
                notificar("Asistencia registrada a las " + horaTexto(hora), "ok");
            }
        } catch (error) {
            console.warn("No se pudo registrar la asistencia:", error);
        }
        if (hero && hora) {
            hero.hidden = false;
            $("asistencia-hoy-hora").textContent = "Registrada a las " + horaTexto(hora);
        }
    }

    function filaAsistenciaHTML(f, i) {
        const iniciales = escaparHtml(obtenerIniciales(f.nombre, f.correo));
        return '<div class="fila-asistencia' + (f.presente ? "" : " ausente") + '" style="animation-delay:' + Math.min(i * 30, 400) + 'ms">' +
            '<span class="avatar avatar-sm">' + iniciales + "</span>" +
            '<div class="fila-datos"><strong>' + esc(f.nombre || f.correo) + "</strong><span>" + esc(f.correo) + "</span></div>" +
            '<span class="chip chip-morado">' + rolTexto(f.rol) + "</span>" +
            '<span class="chip ' + (f.presente ? "chip-ok" : "chip-off") + '">' + (f.presente ? "Presente" : "Ausente") + "</span>" +
            '<div class="fila-hora">' + (f.hora ? horaTexto(f.hora) : "—") + "</div></div>";
    }

    window.cargarAsistencia = async function () {
        const lista = $("lista-asistencia");
        if (!lista || typeof firebaseDb === "undefined") return;
        const dia = $("asistencia-fecha").value || hoyClave();
        const claseId = $("asistencia-clase").value;
        try {
            const datos = await db().collection("asistencias").where("dia", "==", dia).get();
            const registros = datos.docs.map((d) => d.data()).sort((a, b) => (aFecha(a.fecha) || 0) - (aFecha(b.fecha) || 0));
            const porCorreo = new Map(registros.map((r) => [String(r.correo).toLowerCase(), r]));
            const clase = clasesCache.find((c) => c.id === claseId);
            let filas;
            if (clase) {
                const lista = [clase.maestroCorreo].concat(clase.estudiantes || []).filter(Boolean);
                filas = lista.map((correo, i) => {
                    const r = porCorreo.get(String(correo).toLowerCase());
                    return { nombre: r ? r.nombre : "", correo: correo, rol: i === 0 ? "maestro" : "estudiante", presente: Boolean(r), hora: r ? aFecha(r.fecha) : null };
                });
                if (clase.maestroNombre && filas[0] && !filas[0].nombre) filas[0].nombre = clase.maestroNombre;
            } else {
                filas = registros.map((r) => ({ nombre: r.nombre, correo: r.correo, rol: r.rol, presente: true, hora: aFecha(r.fecha) }));
            }
            filasAsistencia = filas;
            metaAsistencia = { dia: dia, clase: clase ? clase.asignatura + " · " + clase.carrera : "Todos los ingresos" };
            const presentes = filas.filter((f) => f.presente).length;
            const chips = [];
            chips.push('<div class="dato ok"><strong>' + presentes + "</strong><span>Presentes</span></div>");
            if (clase) chips.push('<div class="dato mal"><strong>' + (filas.length - presentes) + "</strong><span>Ausentes</span></div>");
            else {
                chips.push('<div class="dato"><strong>' + filas.filter((f) => f.rol === "maestro" || f.rol === "admin").length + "</strong><span>Maestros</span></div>");
                chips.push('<div class="dato"><strong>' + filas.filter((f) => f.rol === "estudiante").length + "</strong><span>Estudiantes</span></div>");
            }
            $("resumen-asistencia").innerHTML = chips.join("");
            lista.innerHTML = filas.length ? filas.map(filaAsistenciaHTML).join("") : '<p class="sin-preguntas">No hay ingresos registrados para esta fecha.</p>';
        } catch (error) {
            lista.innerHTML = '<p class="sin-preguntas">No se pudo cargar la asistencia. ' + esc(error.message || error.code || "") + "</p>";
        }
    };

    window.exportarAsistenciaCSV = function () {
        if (!filasAsistencia.length) { notificar("No hay datos para exportar.", "error"); return; }
        const celda = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
        const filas = [["Fecha", "Clase", "Nombre", "Correo", "Rol", "Estado", "Hora"]].concat(filasAsistencia.map((f) => [
            metaAsistencia.dia, metaAsistencia.clase, f.nombre || "", f.correo, rolTexto(f.rol), f.presente ? "Presente" : "Ausente", f.hora ? horaTexto(f.hora) : ""
        ]));
        const csv = "\ufeff" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        enlace.download = "asistencia-" + metaAsistencia.dia + ".csv";
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        notificar("Reporte de asistencia descargado", "ok");
    };

    function pintarResumenHoy() {
        const panel = $("resumen-asistencia-hoy");
        if (!panel || rol() !== "admin") return;
        panel.hidden = false;
        const maestros = registrosHoy.filter((r) => r.rol === "maestro" || r.rol === "admin").length;
        const estudiantes = registrosHoy.filter((r) => r.rol === "estudiante").length;
        $("resumen-hoy").innerHTML =
            '<div class="dato ok"><strong>' + registrosHoy.length + '</strong><span>ingresos hoy</span></div>' +
            '<div class="dato"><strong>' + maestros + '</strong><span>maestros</span></div>' +
            '<div class="dato"><strong>' + estudiantes + '</strong><span>estudiantes</span></div>';
        $("resumen-hoy").classList.add("resumen-chips");
        const presentes = new Set(registrosHoy.map((r) => String(r.correo).toLowerCase()));
        const ausentes = [...new Map(clasesCache.map((c) => [String(c.maestroCorreo).toLowerCase(), c.maestroNombre || c.maestroCorreo])).entries()]
            .filter(([correo]) => !presentes.has(correo)).map(([, nombre]) => nombre);
        const caja = $("ausentes-hoy");
        caja.hidden = !ausentes.length;
        if (ausentes.length) caja.textContent = "Maestros con clases asignadas que aún no ingresaron hoy: " + ausentes.join(", ") + ".";
        const insignia = $("insignia-asistencia");
        if (insignia) { insignia.textContent = registrosHoy.length; insignia.hidden = !registrosHoy.length; }
    }

    function iniciarResumenAdmin(usuario) {
        let primera = true;
        try {
            db().collection("asistencias").where("dia", "==", hoyClave()).onSnapshot((snap) => {
                registrosHoy = snap.docs.map((d) => d.data());
                if (!primera && snap.docChanges) {
                    snap.docChanges().forEach((cambio) => {
                        const r = cambio.doc.data();
                        if (cambio.type === "added" && r.uid !== usuario.uid) notificar((r.nombre || r.correo) + " (" + rolTexto(r.rol) + ") registró su ingreso", "info");
                    });
                }
                primera = false;
                pintarResumenHoy();
            }, (error) => console.warn("Resumen de asistencia:", error));
        } catch (error) { console.warn(error); }
    }

    // ---------- Papelera ----------
    window.moverAPapelera = async function (examen) {
        const usuario = firebaseAuth.currentUser;
        if (!usuario || !examen || !examen.id) return;
        const datos = Object.assign({}, examen);
        delete datos.id;
        const expira = new Date(Date.now() + DIAS_PAPELERA * 86400000);
        await db().collection("papelera").add(Object.assign(datos, {
            examenIdOriginal: examen.id, eliminadoPorUid: usuario.uid, eliminadoPorCorreo: usuario.email,
            eliminadoEn: firebase.firestore.FieldValue.serverTimestamp(),
            expiraEn: firebase.firestore.Timestamp.fromDate(expira)
        }));
    };

    window.cargarPapelera = async function () {
        const lista = $("lista-papelera");
        if (!lista || typeof firebaseDb === "undefined" || !firebaseAuth.currentUser) return;
        try {
            const coleccion = db().collection("papelera");
            const datos = rol() === "admin" ? await coleccion.get() : await coleccion.where("eliminadoPorUid", "==", firebaseAuth.currentUser.uid).get();
            const ahora = Date.now();
            const vigentes = [];
            for (const d of datos.docs) {
                const item = Object.assign({ id: d.id }, d.data());
                const expira = aFecha(item.expiraEn);
                if (expira && expira.getTime() < ahora) { db().collection("papelera").doc(d.id).delete().catch(() => {}); continue; }
                vigentes.push(item);
            }
            vigentes.sort((a, b) => (aFecha(b.eliminadoEn) || 0) - (aFecha(a.eliminadoEn) || 0));
            estado("estado-papelera", "");
            lista.innerHTML = vigentes.length ? vigentes.map((item, i) => {
                const expira = aFecha(item.expiraEn);
                const dias = expira ? Math.max(0, Math.ceil((expira.getTime() - ahora) / 86400000)) : DIAS_PAPELERA;
                const eliminado = aFecha(item.eliminadoEn);
                return '<article class="tarjeta-papelera" data-id="' + esc(item.id) + '" style="animation-delay:' + (i * 50) + 'ms">' +
                    '<div class="examen-info"><h3>' + esc(item.nombre) + '</h3><p>' + esc(item.materia) + (eliminado ? " · eliminado el " + eliminado.toLocaleDateString("es-EC") : "") + (rol() === "admin" ? " · por " + esc(item.eliminadoPorCorreo) : "") + "</p>" +
                    '<div class="examen-meta"><span class="chip ' + (dias <= 5 ? "chip-off" : "chip-warn") + '">Se borra en ' + dias + " día(s)</span>" + '<span class="chip">' + (item.preguntas || []).length + " pregunta(s)</span></div></div>" +
                    '<div class="examen-actions"><button type="button" class="btn-run btn-sm" data-accion="restaurar">Restaurar</button><button type="button" class="btn-delete btn-sm" data-accion="borrar">Eliminar definitivamente</button></div></article>';
            }).join("") : '<p class="sin-preguntas">La papelera está vacía. Los exámenes que elimines aparecerán aquí durante 30 días.</p>';
            lista._items = vigentes;
        } catch (error) {
            estado("estado-papelera", "No se pudo cargar la papelera. " + (error.message || error.code || ""), true);
        }
    };

    async function alClickPapelera(evento) {
        const boton = evento.target.closest("button[data-accion]");
        if (!boton) return;
        const id = boton.closest(".tarjeta-papelera").dataset.id;
        const item = ($("lista-papelera")._items || []).find((x) => x.id === id);
        if (!item) return;
        try {
            if (boton.dataset.accion === "restaurar") {
                const datos = Object.assign({}, item);
                ["id", "eliminadoPorUid", "eliminadoPorCorreo", "eliminadoEn", "expiraEn", "examenIdOriginal"].forEach((k) => delete datos[k]);
                const usuario = firebaseAuth.currentUser;
                if (!datos.maestroUid) { datos.maestroUid = usuario.uid; datos.maestroCorreo = usuario.email; }
                await db().collection("examenes").add(datos);
                await db().collection("papelera").doc(id).delete();
                notificar("Examen «" + item.nombre + "» restaurado", "ok");
                if (typeof cargarExamenes === "function") await cargarExamenes();
            } else {
                const ok = await confirmarAccion({ titulo: "¿Eliminar definitivamente?", mensaje: "«" + item.nombre + "» se borrará para siempre y ya no se podrá recuperar.", confirmar: "Eliminar para siempre", peligro: true });
                if (!ok) return;
                await db().collection("papelera").doc(id).delete();
                notificar("Examen eliminado definitivamente", "ok");
            }
            cargarPapelera();
        } catch (error) {
            notificar("No se pudo completar la acción. " + (error.message || error.code || ""), "error");
        }
    }

    // ---------- Inicio ----------
    function iniciarInterfaz() {
        aplicarRolesNavegacion();
        document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => window.mostrarVista(b.dataset.vista)));
        const saludo = $("saludo-hora");
        if (saludo) saludo.textContent = saludoSegunHora() + " 👋";
        renderAccesosRapidos();
        $("lista-clases").addEventListener("click", alClickClase);
        $("lista-papelera").addEventListener("click", alClickPapelera);
        window.mostrarVista((location.hash || "").replace("#", "") || "inicio");
        window.addEventListener("hashchange", () => {
            const v = (location.hash || "").replace("#", "");
            if (TITULOS[v]) window.mostrarVista(v);
        });
    }

    async function iniciarModulos(usuario) {
        if (modulosIniciados) return;
        modulosIniciados = true;
        await cargarClases();
        registrarAsistencia(usuario);
        if (rol() === "admin") iniciarResumenAdmin(usuario);
        if (location.hash === "#monitoreo" && typeof cargarMonitoreoEnVivo === "function") cargarMonitoreoEnVivo();
    }

    iniciarInterfaz();
    if (typeof firebaseAuth !== "undefined") {
        firebaseAuth.onAuthStateChanged((usuario) => { if (usuario) iniciarModulos(usuario); });
    }
})();
