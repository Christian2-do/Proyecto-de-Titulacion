let indiceExamenEnEdicion = null;
let indicePruebaActiva = null;
let examenPruebaEnVentana = null;
let suscripcionReportesProfesor = null;
let preguntasPruebaSistema = [];
let respuestasPruebaSistema = [];
let indicePreguntaPruebaActual = 0;
let streamCamaraSistema = null;
let temporizadorPrueba = null;
let pruebaIniciada = false;
let entregaPruebaEnCurso = false;
let paginaPruebaInicializada = false;
let nombreEstudiantePrueba = "";
let cambiosPestana = 0;
let movimientosCamara = 0;
let eventosSupervision = [];
let eventosOmitidos = 0;
let inicioPruebaMilisegundos = null;
let ultimoEventoMovimiento = 0;
let monitoreoCamara = null;
let avisosExamenEnviados = new Set();
let intervaloAvisosExamen = null;
const CORREO_ADMINISTRADOR = "christianandrango23.24@gmail.com";

// LOGIN
async function login() {
    const user = document.getElementById("usuario").value.trim().toLowerCase();
    const pass = document.getElementById("password").value;
    const rol = obtenerRolPorCorreo(user);
    sessionStorage.removeItem("sesionSistema");

    if (!rol) {
        alert("Usuario o correo no autorizado");
        return;
    }

    try {
        const credencial = await autenticarCuentaFirebase(user, pass);
        if (rol === "admin" && !credencial.user.emailVerified) {
            await credencial.user.sendEmailVerification();
            await firebaseAuth.signOut();
            alert("Te enviamos un correo para verificar la cuenta administradora. Verifícalo y vuelve a iniciar sesión.");
            return;
        }
        if (rol === "admin") await credencial.user.getIdToken(true);
        await registrarUsuarioFirebase(credencial.user, rol);
        sessionStorage.setItem("sesionSistema", JSON.stringify({ correo: user, rol, uid: credencial.user.uid }));
        window.location.href = "dashboard.html?v=12";
    } catch (error) {
        alert(`No se pudo iniciar sesión o crear la cuenta. Verifica el correo y la contraseña. ${error.message || error.code || ""}`);
    }
}

async function restablecerContrasena() {
    const campoCorreo = document.getElementById("usuario");
    const correo = campoCorreo.value.trim().toLowerCase();
    if (!correo) {
        alert("Escribe tu correo en Nombre de usuario.");
        campoCorreo.focus();
        return;
    }

    try {
        await firebaseAuth.sendPasswordResetEmail(correo);
        alert("Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña.");
    } catch (error) {
        if (error.code === "auth/user-not-found") {
            alert("Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña.");
            return;
        }
        const mensaje = error.code === "auth/invalid-email"
            ? "El correo no tiene un formato válido."
            : error.code === "auth/too-many-requests"
                ? "Hubo demasiados intentos. Espera un momento y vuelve a intentarlo."
                : `No se pudo enviar el correo de restablecimiento. ${error.message || error.code || ""}`;
        alert(mensaje);
    }
}

async function autenticarCuentaFirebase(correo, password) {
    try {
        return await firebaseAuth.signInWithEmailAndPassword(correo, password);
    } catch (error) {
        if (error.code !== "auth/user-not-found" && error.code !== "auth/invalid-credential") throw error;
        return firebaseAuth.createUserWithEmailAndPassword(correo, password);
    }
}

async function registrarUsuarioFirebase(usuario, rol) {
    const referencia = firebaseDb.collection("usuarios").doc(usuario.uid);
    const existente = await referencia.get();
    const ahora = firebase.firestore.FieldValue.serverTimestamp();
    if (existente.exists) {
        const actualizacion = {
            ultimoAcceso: ahora,
            enLinea: true,
            cantidadAccesos: firebase.firestore.FieldValue.increment(1)
        };
        if (rol === "admin") actualizacion.rol = "admin";
        await referencia.update(actualizacion);
    } else {
        await referencia.set({ correo: usuario.email, rol, primerAcceso: ahora, ultimoAcceso: ahora, enLinea: true, cantidadAccesos: 1 });
    }
}

async function actualizarPresencia(enLinea) {
    if (typeof firebaseDb === "undefined" || !firebaseAuth.currentUser) return;
    await firebaseDb.collection("usuarios").doc(firebaseAuth.currentUser.uid).update({ enLinea, ultimaActividad: firebase.firestore.FieldValue.serverTimestamp() });
}

async function cargarEstadisticas() {
    const panel = document.getElementById("estadisticas-panel");
    if (!panel || !esAdministrador()) return;
    panel.hidden = false;

    let totalExamenes = obtenerExamenes().length;
    let totalRegistrados = obtenerUsuarios().length;
    let totalEnLinea = obtenerSesion().correo ? 1 : 0;

    if (typeof firebaseDb !== "undefined" && firebaseAuth.currentUser) {
        const [examenes, usuarios, enLinea] = await Promise.all([
            firebaseDb.collection("examenes").get(),
            firebaseDb.collection("usuarios").get(),
            firebaseDb.collection("usuarios").where("enLinea", "==", true).get()
        ]);
        totalExamenes = examenes.size;
        totalRegistrados = usuarios.size;
        totalEnLinea = enLinea.size;
    }

    document.getElementById("total-examenes").textContent = totalExamenes;
    document.getElementById("total-en-linea").textContent = totalEnLinea;
    document.getElementById("total-registrados").textContent = totalRegistrados;
}

function registrarAcceso(correo, rol) {
    const usuarios = obtenerUsuarios();
    const ahora = new Date().toISOString();
    const usuarioExistente = usuarios.find((usuario) => usuario.correo === correo);

    if (usuarioExistente) {
        usuarioExistente.ultimoAcceso = ahora;
        usuarioExistente.cantidadAccesos += 1;
    } else {
        usuarios.push({
            correo,
            rol,
            primerAcceso: ahora,
            ultimoAcceso: ahora,
            cantidadAccesos: 1
        });
    }
    localStorage.setItem("usuariosSistema", JSON.stringify(usuarios));
}

function obtenerUsuarios() {
    const usuariosGuardados = localStorage.getItem("usuariosSistema");
    return usuariosGuardados ? JSON.parse(usuariosGuardados) : [];
}

async function cargarUsuarios() {
    const lista = document.getElementById("lista-usuarios");
    if (!lista || !esAdministrador()) return;

    let usuarios = obtenerUsuarios();
    if (typeof firebaseDb !== "undefined" && firebaseAuth.currentUser) {
        const snapshot = await firebaseDb.collection("usuarios").get();
        usuarios = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    }
    lista.innerHTML = usuarios.length ? usuarios.map((usuario) => `
        <article class="usuario-item">
            <div>
                <strong>${escaparHtml(usuario.correo)}</strong>
                <span>${usuario.rol === "admin" ? "Administrador" : usuario.rol === "maestro" ? "Maestro" : "Estudiante"}</span>
            </div>
            <p>${usuario.cantidadAccesos} acceso(s) | Último: ${new Date(usuario.ultimoAcceso).toLocaleString("es-EC")}</p>
        </article>
    `).join("") : "<p class=\"sin-preguntas\">Todavía no hay accesos registrados.</p>";
}

async function registrarPersona(event) {
    event.preventDefault();
    if (!esAdministrador()) {
        alert("Solo el administrador puede registrar personas.");
        return;
    }
    const correo = document.getElementById("correo-persona").value.trim().toLowerCase();
    const rol = obtenerRolPorCorreo(correo);
    const dominioValido = Boolean(rol);

    if (!dominioValido) {
        alert("El correo debe terminar en @estud.tesa.edu.ec o @tesa.edu.ec.");
        return;
    }
    if (typeof firebaseDb === "undefined" || !firebaseAuth.currentUser) {
        alert("La cuenta admin debe estar autenticada en Firebase. Activa Email/Password y vuelve a entrar como admin.");
        return;
    }

    await firebaseDb.collection("usuariosPendientes").doc(correo).set({ correo, rol, agregadoPor: firebaseAuth.currentUser.uid, fechaRegistro: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById("formulario-usuario").reset();
    alert("Persona registrada. Podrá crear su cuenta con ese correo institucional.");
}

function obtenerRolPorCorreo(correo) {
    if (correo === CORREO_ADMINISTRADOR) return "admin";
    if (correo.endsWith("@estud.tesa.edu.ec")) return "estudiante";
    if (correo.endsWith("@tesa.edu.ec")) return "maestro";
    return "";
}

function actualizarRolPersona() {
    const correo = document.getElementById("correo-persona").value.trim().toLowerCase();
    const rol = obtenerRolPorCorreo(correo);
    const selector = document.getElementById("rol-persona");
    if (rol) selector.value = rol;
}

function obtenerSesion() {
    const sesionGuardada = sessionStorage.getItem("sesionSistema");
    return sesionGuardada ? JSON.parse(sesionGuardada) : { correo: "", rol: "estudiante" };
}

function esMaestro() {
    return ["maestro", "admin"].includes(obtenerRolActual());
}

function esAdministrador() {
    return obtenerRolActual() === "admin";
}

function obtenerRolActual() {
    const sesion = obtenerSesion();
    const vista = new URLSearchParams(window.location.search).get("vista");
    if ((sesion.rol === "admin" || sesion.rol === "maestro") && (vista === "estudiante" || vista === "maestro")) return vista;
    return sesion.rol;
}

function abrirVistaPrevia(rol) {
    window.open(`dashboard.html?vista=${rol}`, "_blank");
}

function alternarMenuCuenta(event) {
    event.stopPropagation();
    const boton = document.getElementById("cuenta-menu-boton");
    const panel = document.getElementById("cuenta-menu-panel");
    panel.hidden = !panel.hidden;
    boton.setAttribute("aria-expanded", String(!panel.hidden));
}

function cerrarMenuCuenta() {
    const boton = document.getElementById("cuenta-menu-boton");
    const panel = document.getElementById("cuenta-menu-panel");
    if (!boton || !panel) return;
    panel.hidden = true;
    boton.setAttribute("aria-expanded", "false");
}

async function cargarPerfil() {
    const usuario = typeof firebaseAuth !== "undefined" ? firebaseAuth.currentUser : null;
    if (!usuario || typeof firebaseDb === "undefined") return;
    const campo = document.getElementById("perfil-nombre");
    const bienvenida = document.querySelector(".dashboard-card h3");
    try {
        const perfil = await firebaseDb.collection("usuarios").doc(usuario.uid).get();
        const nombre = perfil.exists ? perfil.data().nombreCompleto || "" : "";
        nombreEstudiantePrueba = nombre;
        if (campo) campo.value = nombre;
        if (bienvenida) bienvenida.textContent = nombre ? `Bienvenido, ${nombre}` : "Bienvenido";
    } catch (error) {
        const estado = document.getElementById("estado-perfil");
        if (estado) estado.textContent = `No se pudo cargar el perfil. ${error.message || error.code || ""}`;
    }
}

async function guardarPerfil(event) {
    event.preventDefault();
    const usuario = typeof firebaseAuth !== "undefined" ? firebaseAuth.currentUser : null;
    const nombre = document.getElementById("perfil-nombre").value.trim();
    const estado = document.getElementById("estado-perfil");
    if (!usuario || !nombre) {
        estado.textContent = "Escribe tu nombre completo e inicia sesión para guardar el perfil.";
        return;
    }
    try {
        await firebaseDb.collection("usuarios").doc(usuario.uid).set({ nombreCompleto: nombre }, { merge: true });
        nombreEstudiantePrueba = nombre;
        const bienvenida = document.querySelector(".dashboard-card h3");
        if (bienvenida) bienvenida.textContent = `Bienvenido, ${nombre}`;
        estado.textContent = "Perfil guardado.";
    } catch (error) {
        estado.textContent = `No se pudo guardar el perfil. ${error.message || error.code || ""}`;
    }
}

function mostrarCalificaciones() {
    cerrarMenuCuenta();
    const panel = document.getElementById("calificaciones-panel");
    if (!panel) return;
    panel.hidden = false;
    cargarCalificaciones();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarCalificaciones() {
    document.getElementById("calificaciones-panel").hidden = true;
}

function mostrarExamenes() {
    const panel = document.querySelector(".examenes-panel");
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function activarNotificacionesExamen() {
    const boton = document.getElementById("activar-notificaciones");
    if (!("Notification" in window)) {
        alert("Este navegador no admite notificaciones.");
        return;
    }
    const permiso = await Notification.requestPermission();
    if (permiso === "granted") {
        new Notification("Avisos de exámenes activados", {
            body: "Recibirás avisos antes de que cierre un examen."
        });
        if (boton) {
            boton.textContent = "Avisos activos";
            boton.disabled = true;
        }
        iniciarAvisosExamenes();
    } else {
        if (boton) boton.textContent = "Permiso denegado";
    }
}

function iniciarAvisosExamenes() {
    if (intervaloAvisosExamen) clearInterval(intervaloAvisosExamen);
    revisarAvisosExamenes();
    intervaloAvisosExamen = setInterval(revisarAvisosExamenes, 60000);
}

function revisarAvisosExamenes() {
    if (!firebaseAuth.currentUser || esMaestro()) return;
    firebaseDb.collection("examenes").get().then((snapshot) => {
        const ahora = Date.now();
        const avisos = [];
        snapshot.docs.forEach((documento) => {
            const examen = { id: documento.id, ...documento.data() };
            if (!examen.cierraEn) return;
            const cierre = new Date(examen.cierraEn).getTime();
            if (Number.isNaN(cierre)) return;
            const minutos = Math.ceil((cierre - ahora) / 60000);
            if (minutos > 0 && minutos <= 30) {
                const clave = `${examen.id}-30`;
                const mensaje = `El examen "${examen.nombre || "Prueba"}" cierra en ${minutos} minuto${minutos === 1 ? "" : "s"}.`;
                avisos.push(mensaje);
                if (!avisosExamenEnviados.has(clave) && "Notification" in window && Notification.permission === "granted") {
                    avisosExamenEnviados.add(clave);
                    new Notification("Examen por cerrar", { body: mensaje });
                }
            } else if (minutos <= 0 && minutos > -15) {
                const clave = `${examen.id}-cerrado`;
                const mensaje = `El examen "${examen.nombre || "Prueba"}" cerró.`;
                avisos.push(mensaje);
                if (!avisosExamenEnviados.has(clave) && "Notification" in window && Notification.permission === "granted") {
                    avisosExamenEnviados.add(clave);
                    new Notification("Examen cerrado", { body: mensaje });
                }
            }
        });
        const contenedor = document.getElementById("avisos-examenes");
        if (!contenedor) return;
        contenedor.hidden = avisos.length === 0;
        contenedor.replaceChildren();
        avisos.forEach((mensaje) => {
            const aviso = document.createElement("p");
            aviso.textContent = mensaje;
            contenedor.appendChild(aviso);
        });
    }).catch(() => {});
}

function establecerEstadoCalificaciones(mensaje, error = false) {
    const estado = document.getElementById("estado-calificaciones");
    estado.textContent = mensaje;
    estado.hidden = !mensaje;
    estado.classList.toggle("estado-error", error);
}

async function cargarCalificaciones() {
    const lista = document.getElementById("lista-calificaciones");
    lista.replaceChildren();
    establecerEstadoCalificaciones("Cargando calificaciones...");

    if (typeof firebaseDb === "undefined" || !firebaseAuth.currentUser) {
        establecerEstadoCalificaciones("No se pudo verificar tu sesión. Cierra sesión e ingresa nuevamente para consultar tus calificaciones.", true);
        return;
    }

    try {
        const snapshot = await firebaseDb.collection("resultados")
            .where("estudianteUid", "==", firebaseAuth.currentUser.uid)
            .get();
        const resultados = snapshot.docs
            .map((documento) => documento.data())
            .sort((a, b) => {
                const fechaA = a.fechaEntrega && a.fechaEntrega.toMillis ? a.fechaEntrega.toMillis() : 0;
                const fechaB = b.fechaEntrega && b.fechaEntrega.toMillis ? b.fechaEntrega.toMillis() : 0;
                return fechaB - fechaA;
            });

        if (!resultados.length) {
            establecerEstadoCalificaciones("Todavía no tienes pruebas entregadas.");
            return;
        }

        establecerEstadoCalificaciones("");
        resultados.forEach((resultado) => {
            const elemento = document.createElement("article");
            elemento.className = "calificacion-item";
            const detalle = document.createElement("div");
            const nombre = document.createElement("strong");
            const estado = document.createElement("span");
            const fecha = document.createElement("time");
            const nota = document.createElement("strong");
            const fechaEntrega = resultado.fechaEntrega && resultado.fechaEntrega.toDate
                ? resultado.fechaEntrega.toDate()
                : null;

            nombre.textContent = resultado.examenNombre || "Prueba";
            estado.textContent = resultado.estado === "pendiente" ? "Pendiente de revisión" : "Calificada";
            fecha.textContent = fechaEntrega ? fechaEntrega.toLocaleString("es-EC") : "Fecha no disponible";
            nota.textContent = typeof resultado.calificacion === "number"
                ? `${resultado.calificacion.toFixed(2)}/10`
                : "Pendiente";
            if (fechaEntrega) fecha.dateTime = fechaEntrega.toISOString();
            detalle.append(nombre, estado, fecha);
            (resultado.calificacionesComplexivas || []).forEach((revision) => {
                if (!revision.comentario) return;
                const comentario = document.createElement("span");
                comentario.textContent = `Pregunta ${revision.indicePregunta + 1}: ${revision.comentario}`;
                detalle.appendChild(comentario);
            });
            elemento.append(detalle, nota);
            lista.appendChild(elemento);
        });
    } catch (error) {
        establecerEstadoCalificaciones(`No se pudieron cargar las calificaciones. ${error.message || error.code || ""}`, true);
    }
}

async function cargarReportesProfesor() {
    const lista = document.getElementById("lista-reportes");
    const estado = document.getElementById("estado-reportes");
    if (!lista || !estado || !esMaestro()) return;
    lista.replaceChildren();
    estado.hidden = false;
    estado.classList.remove("estado-error");
    estado.textContent = "Cargando reportes...";
    if (!firebaseAuth.currentUser) {
        estado.textContent = "Inicia sesión para consultar los reportes.";
        return;
    }
    try {
        const consulta = firebaseDb.collection("resultados");
        const snapshot = esAdministrador()
            ? await consulta.get()
            : await consulta.where("maestroUid", "==", firebaseAuth.currentUser.uid).get();
        const reportes = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        const consultaEnVivo = esAdministrador()
            ? consulta
            : consulta.where("maestroUid", "==", firebaseAuth.currentUser.uid);
        if (!suscripcionReportesProfesor) {
            suscripcionReportesProfesor = consultaEnVivo.onSnapshot(
                () => cargarReportesProfesor(),
                (error) => {
                    estado.hidden = false;
                    estado.textContent = `No se pudieron actualizar los reportes en tiempo real. ${error.message || error.code || ""}`;
                    estado.classList.add("estado-error");
                }
            );
        }
        const grupos = new Map();
        reportes.forEach((reporte) => {
            const clave = reporte.examenId || reporte.examenNombre || "sin-examen";
            if (!grupos.has(clave)) grupos.set(clave, []);
            grupos.get(clave).push(reporte);
        });
        if (!reportes.length) {
            estado.textContent = "Todavía no hay intentos entregados para tus exámenes.";
            return;
        }
        estado.hidden = true;
        grupos.forEach((intentos) => {
            const panel = document.createElement("section");
            panel.className = "reporte-examen";
            const titulo = document.createElement("h3");
            const participantes = new Set(intentos.map((intento) => intento.estudianteUid)).size;
            titulo.textContent = `${intentos[0].examenNombre || "Prueba"} — ${participantes} participante(s), ${intentos.length} intento(s)`;
            panel.appendChild(titulo);
            intentos.sort((a, b) => fechaMilisegundos(b.fechaEntrega) - fechaMilisegundos(a.fechaEntrega));
            intentos.forEach((intento) => {
                const fila = document.createElement("article");
                fila.className = "reporte-intento";
                const datos = document.createElement("div");
                const nombre = document.createElement("strong");
                const correo = document.createElement("span");
                const fecha = document.createElement("time");
                const calificacion = document.createElement("span");
                const fechaEntrega = intento.fechaEntrega && intento.fechaEntrega.toDate
                    ? intento.fechaEntrega.toDate()
                    : null;
                nombre.textContent = intento.nombreCompleto || "Nombre no registrado";
                correo.textContent = intento.estudianteCorreo || "Correo no disponible";
                fecha.textContent = fechaEntrega ? fechaEntrega.toLocaleString("es-EC") : "Fecha no disponible";
                calificacion.textContent = typeof intento.calificacion === "number"
                    ? `${intento.calificacion.toFixed(2)}/10`
                    : "Pendiente de revisión";
                if (fechaEntrega) fecha.dateTime = fechaEntrega.toISOString();
                datos.append(nombre, correo, fecha, calificacion);
                fila.appendChild(datos);
                const respuestas = intento.respuestasDetalle || (intento.respuestas || []).map((respuesta, indice) => ({
                    indice,
                    pregunta: `Pregunta ${indice + 1}`,
                    respuesta: respuesta || "Sin respuesta",
                    tipo: intento.formato === "complexiva" ? "complexiva" : "opcion-multiple"
                }));
                if (respuestas.length) {
                    const detalle = document.createElement("details");
                    const resumen = document.createElement("summary");
                    const listaRespuestas = document.createElement("ol");
                    resumen.textContent = `Ver respuestas (${respuestas.length})`;
                    respuestas.forEach((respuesta) => {
                        const elemento = document.createElement("li");
                        const pregunta = document.createElement("strong");
                        const textoRespuesta = document.createElement("p");
                        const tipo = document.createElement("span");
                        pregunta.textContent = `Pregunta ${(respuesta.indice ?? 0) + 1}: ${respuesta.pregunta || "Pregunta"}`;
                        tipo.textContent = respuesta.tipo === "complexiva" ? "Respuesta complexiva" : "Opción múltiple";
                        textoRespuesta.textContent = respuesta.respuesta || "Sin respuesta";
                        elemento.append(pregunta, tipo, textoRespuesta);
                        if (respuesta.tipo !== "complexiva" && typeof respuesta.correcta === "boolean") {
                            const evaluacion = document.createElement("p");
                            evaluacion.textContent = respuesta.correcta
                                ? "Respuesta correcta."
                                : `Respuesta incorrecta. Respuesta esperada: ${respuesta.respuestaCorrecta || "No definida"}`;
                            elemento.appendChild(evaluacion);
                        }
                        const notaComplexiva = (intento.calificacionesComplexivas || []).find((nota) =>
                            nota.indicePregunta === respuesta.indice);
                        if (notaComplexiva) {
                            const calificacionComplexiva = document.createElement("p");
                            calificacionComplexiva.textContent = `Calificación: ${notaComplexiva.calificacion.toFixed(2)}/10${notaComplexiva.comentario ? ` — ${notaComplexiva.comentario}` : ""}`;
                            elemento.appendChild(calificacionComplexiva);
                        }
                        listaRespuestas.appendChild(elemento);
                    });
                    detalle.append(resumen, listaRespuestas);
                    fila.appendChild(detalle);
                }
                const supervision = document.createElement("details");
                supervision.className = "reporte-supervision";
                const resumenSupervision = document.createElement("summary");
                const listaEventos = document.createElement("ul");
                const motivo = intento.motivoEntrega === "tiempo_agotado"
                    ? "Entregado al agotarse el tiempo"
                    : intento.motivoEntrega === "bloqueada_por_cambios"
                        ? "Entrega automática tras tres cambios de pestaña"
                        : intento.motivoEntrega === "entrega_manual" ? "Entrega manual" : "No disponible";
                const fechaInicio = obtenerFechaResultado(intento.fechaInicio);
                const resumenFecha = document.createElement("p");
                resumenSupervision.textContent = `Informe de supervisión: ${intento.cambiosPestana || 0} cambio(s) de pestaña, ${intento.movimientosCamara || 0} variación(es) de imagen`;
                resumenFecha.textContent = `Inicio: ${fechaInicio ? fechaInicio.toLocaleString("es-EC") : "No disponible"} | Duración: ${formatearDuracion(intento.duracionSegundos)} | Motivo: ${motivo}`;
                (intento.eventosSupervision || []).forEach((evento) => {
                    const elemento = document.createElement("li");
                    const cuando = evento.fecha ? new Date(evento.fecha).toLocaleString("es-EC") : "Hora no disponible";
                    elemento.textContent = `${cuando} — ${evento.detalle || evento.tipo || "Evento de supervisión"}`;
                    listaEventos.appendChild(elemento);
                });
                if (intento.eventosOmitidos) {
                    const elemento = document.createElement("li");
                    elemento.textContent = `${intento.eventosOmitidos} eventos adicionales resumidos para mantener el informe compacto.`;
                    listaEventos.appendChild(elemento);
                }
                supervision.append(resumenSupervision, resumenFecha, listaEventos);
                fila.appendChild(supervision);
                const preguntasComplexivas = respuestas.filter((respuesta) =>
                    respuesta.tipo === "complexiva"
                    || (!respuesta.tipo && intento.formato === "complexiva"));
                if (preguntasComplexivas.length && intento.estado === "pendiente") {
                    fila.appendChild(crearFormularioCalificacion(intento, preguntasComplexivas));
                } else if (intento.calificacionesComplexivas && intento.calificacionesComplexivas.length) {
                    const revision = document.createElement("p");
                    revision.className = "resumen-calificacion-maestro";
                    revision.textContent = `Calificación final registrada: ${Number(intento.calificacion).toFixed(2)}/10`;
                    fila.appendChild(revision);
                }
                panel.appendChild(fila);
            });
            lista.appendChild(panel);
        });
    } catch (error) {
        estado.hidden = false;
        estado.textContent = `No se pudieron cargar los reportes. ${error.message || error.code || ""}`;
        estado.classList.add("estado-error");
    }
}

function fechaMilisegundos(fecha) {
    if (fecha && typeof fecha.toMillis === "function") return fecha.toMillis();
    if (fecha && typeof fecha.toDate === "function") return fecha.toDate().getTime();
    return 0;
}

function obtenerFechaResultado(fecha) {
    if (fecha && typeof fecha.toDate === "function") return fecha.toDate();
    if (!fecha) return null;
    const resultado = new Date(fecha);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
}

function formatearDuracion(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos} min ${resto} s`;
}

function crearFormularioCalificacion(reporte, preguntasComplexivas) {
    const formulario = document.createElement("form");
    formulario.className = "formulario-calificar-complexiva";
    const titulo = document.createElement("strong");
    titulo.textContent = "Calificar respuestas complexivas (0 a 10 por pregunta)";
    formulario.appendChild(titulo);
    preguntasComplexivas.forEach((respuesta) => {
        const indice = Number.isInteger(respuesta.indice) ? respuesta.indice : 0;
        const grupo = document.createElement("div");
        const label = document.createElement("label");
        const nota = document.createElement("input");
        const comentario = document.createElement("textarea");
        label.textContent = `Pregunta ${indice + 1}: ${respuesta.pregunta || "Respuesta complexiva"}`;
        nota.type = "number";
        nota.min = "0";
        nota.max = "10";
        nota.step = "0.01";
        nota.required = true;
        nota.dataset.indicePregunta = String(indice);
        nota.setAttribute("aria-label", `Nota de la pregunta ${indice + 1}`);
        comentario.rows = 2;
        comentario.placeholder = "Comentario para el estudiante (opcional)";
        comentario.dataset.comentarioPregunta = String(indice);
        comentario.setAttribute("aria-label", `Comentario de la pregunta ${indice + 1}`);
        grupo.append(label, nota, comentario);
        formulario.appendChild(grupo);
    });
    const guardar = document.createElement("button");
    guardar.type = "submit";
    guardar.className = "btn-primary";
    guardar.textContent = "Guardar calificación";
    formulario.appendChild(guardar);
    formulario.addEventListener("submit", (event) => guardarCalificacionComplexiva(event, reporte));
    return formulario;
}

async function guardarCalificacionComplexiva(event, reporte) {
    event.preventDefault();
    if (!esMaestro() || reporte.estado !== "pendiente") return;
    const formulario = event.currentTarget;
    const entradas = Array.from(formulario.querySelectorAll("input[data-indice-pregunta]"));
    const calificaciones = entradas.map((entrada) => {
        const calificacion = Number(entrada.value);
        const indicePregunta = Number(entrada.dataset.indicePregunta);
        const comentario = formulario.querySelector(`[data-comentario-pregunta="${indicePregunta}"]`).value.trim();
        return { indicePregunta, calificacion, comentario };
    });
    if (calificaciones.some((item) => !Number.isFinite(item.calificacion) || item.calificacion < 0 || item.calificacion > 10)) {
        alert("Cada respuesta complexiva debe tener una nota entre 0 y 10.");
        return;
    }
    const estado = document.createElement("p");
    estado.setAttribute("role", "status");
    formulario.appendChild(estado);
    try {
        const calificacionFinal = calcularCalificacionFinal(
            reporte.totalPreguntas,
            reporte.respuestasCorrectas,
            calificaciones
        );
        await firebaseDb.collection("resultados").doc(reporte.id).update({
            calificacionesComplexivas: calificaciones,
            calificacion: calificacionFinal,
            estado: "calificada",
            calificadaPorUid: firebaseAuth.currentUser.uid,
            fechaCalificacion: firebase.firestore.FieldValue.serverTimestamp()
        });
        await cargarReportesProfesor();
    } catch (error) {
        estado.textContent = `No se pudo guardar la calificación. ${error.message || error.code || ""}`;
    }
}

function calcularCalificacionFinal(totalPreguntas, respuestasCorrectas, calificacionesComplexivas) {
    if (!Number.isInteger(totalPreguntas) || totalPreguntas < 1) {
        throw new Error("El examen no tiene un total válido de preguntas.");
    }
    const suma = respuestasCorrectas * 10
        + calificacionesComplexivas.reduce((total, item) => total + item.calificacion, 0);
    return Number((suma / totalPreguntas).toFixed(2));
}

async function cerrarSesion() {
    if (suscripcionReportesProfesor) {
        suscripcionReportesProfesor();
        suscripcionReportesProfesor = null;
    }
    try {
        if (typeof firebaseAuth !== "undefined") await firebaseAuth.signOut();
    } catch (error) {
        alert(`No se pudo cerrar la sesión. ${error.message || error.code || ""}`);
        return;
    }
    sessionStorage.removeItem("sesionSistema");
    window.location.href = "index.html";
}

// ADMINISTRACION DE EXAMENES
function obtenerExamenes() {
    const examenesGuardados = localStorage.getItem("examenes");
    if (!examenesGuardados) return [];

    const examenes = JSON.parse(examenesGuardados);
    const examenesActualizados = examenes.filter((examen) => examen.nombre !== "Examen de cultura general");
    if (examenesActualizados.length !== examenes.length) {
        localStorage.setItem("examenes", JSON.stringify(examenesActualizados));
    }
    return examenesActualizados;
}

function establecerEstadoExamenes(mensaje, error = false) {
    const estado = document.getElementById("estado-examenes");
    if (!estado) return;
    estado.textContent = mensaje;
    estado.hidden = !mensaje;
    estado.classList.toggle("estado-error", error);
}

async function cargarExamenes() {
    const lista = document.getElementById("lista-examenes");
    if (!lista) return;

    const maestro = esMaestro();
    let examenes = obtenerExamenes();
    try {
        if (typeof firebaseDb !== "undefined" && firebaseAuth.currentUser) {
            const snapshot = await firebaseDb.collection("examenes").get();
            examenes = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
            localStorage.setItem("examenes", JSON.stringify(examenes));
        }
        establecerEstadoExamenes("");
    } catch (error) {
        establecerEstadoExamenes(`No se pudieron cargar los exámenes. ${error.message || error.code || ""}`, true);
    }
    lista.innerHTML = "";
    examenes.forEach((examen, indice) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "examen-item";
        tarjeta.innerHTML = `
            <div>
                <h3></h3>
                <span></span>
                <p></p>
            </div>
            <div class="examen-actions">
                <button type="button" class="btn-run" aria-label="Realizar examen">Realizar</button>
                ${maestro ? '<button type="button" class="btn-download" aria-label="Descargar archivo del examen">Descargar</button><button type="button" class="btn-delete" aria-label="Eliminar examen">Eliminar</button>' : ""}
            </div>
        `;
        tarjeta.querySelector("h3").textContent = examen.nombre;
        tarjeta.querySelector("span").textContent = `${examen.materia} | ${obtenerTextoFormatoExamen(examen)}`;
        tarjeta.querySelector("p").textContent = examen.descripcion;
        tarjeta.querySelector(".btn-run").addEventListener("click", () => abrirPruebaSistema(indice));
        if (maestro) {
            tarjeta.querySelector(".btn-download").addEventListener("click", () => descargarExamen(examen));
            tarjeta.querySelector(".btn-delete").addEventListener("click", () => eliminarExamen(indice));
            tarjeta.addEventListener("click", (event) => {
                if (!event.target.closest("button")) abrirEditorExamen(indice);
            });
        }
        lista.appendChild(tarjeta);
    });
}

function mostrarFormularioExamen() {
    if (!esMaestro()) return;
    const formulario = document.getElementById("formulario-examen");
    if (!formulario) return;
    formulario.hidden = false;
    document.getElementById("nombre-examen").focus();
}

function ocultarFormularioExamen() {
    const formulario = document.getElementById("formulario-examen");
    if (!formulario) return;
    formulario.reset();
    formulario.hidden = true;
}

function leerConfiguracionHorario(idApertura, idCierre, idLimite) {
    const aperturaLocal = document.getElementById(idApertura).value;
    const cierreLocal = document.getElementById(idCierre).value;
    const limiteTexto = document.getElementById(idLimite).value;
    const apertura = aperturaLocal ? new Date(aperturaLocal) : null;
    const cierre = cierreLocal ? new Date(cierreLocal) : null;
    const limite = limiteTexto ? Number(limiteTexto) : null;
    if ((apertura && Number.isNaN(apertura.getTime())) || (cierre && Number.isNaN(cierre.getTime()))) {
        throw new Error("Las fechas de disponibilidad no son válidas.");
    }
    if (apertura && cierre && cierre <= apertura) {
        throw new Error("La fecha de cierre debe ser posterior a la fecha de apertura.");
    }
    if (limite !== null && (!Number.isInteger(limite) || limite < 1 || limite > 480)) {
        throw new Error("El límite debe estar entre 1 y 480 minutos.");
    }
    return {
        abreEn: apertura ? apertura.toISOString() : null,
        cierraEn: cierre ? cierre.toISOString() : null,
        limiteMinutos: limite
    };
}

async function guardarExamen(event) {
    event.preventDefault();
    if (!esMaestro()) {
        establecerEstadoExamenes("Solo el maestro puede agregar exámenes.", true);
        return;
    }
    const nuevoExamen = {
        nombre: document.getElementById("nombre-examen").value.trim(),
        materia: document.getElementById("materia-examen").value.trim(),
        formato: document.getElementById("formato-examen").value,
        descripcion: document.getElementById("descripcion-examen").value.trim(),
        maestroUid: firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : "",
        maestroCorreo: firebaseAuth.currentUser ? firebaseAuth.currentUser.email : ""
    };
    try {
        Object.assign(nuevoExamen, leerConfiguracionHorario("abre-examen", "cierra-examen", "limite-examen"));
    } catch (error) {
        establecerEstadoExamenes(error.message, true);
        return;
    }
    const examenes = obtenerExamenes();
    try {
        if (typeof firebaseDb !== "undefined") {
            if (!firebaseAuth.currentUser) throw new Error("La sesión de Firebase expiró. Cierra sesión e ingresa nuevamente.");
            const referencia = await firebaseDb.collection("examenes").add(nuevoExamen);
            nuevoExamen.id = referencia.id;
        }
        examenes.push(nuevoExamen);
        localStorage.setItem("examenes", JSON.stringify(examenes));
        ocultarFormularioExamen();
        await cargarExamenes();
        if (document.getElementById("estado-examenes").hidden) {
            establecerEstadoExamenes("Examen guardado. Puedes descargarlo desde el botón de cada examen.");
        }
    } catch (error) {
        establecerEstadoExamenes(`No se pudo guardar el examen. ${error.message || error.code || ""}`, true);
    }
}

function obtenerTextoFormato(formato) {
    return formato === "complexiva" ? "Complexiva" : "Opción múltiple";
}

function obtenerTextoFormatoExamen(examen) {
    const formatos = new Set((examen.preguntas || []).map((pregunta) => pregunta.tipo || examen.formato));
    if (formatos.size > 1) return "Opción múltiple y complexiva";
    return obtenerTextoFormato(formatos.values().next().value || examen.formato);
}

function escaparHtml(texto) {
    return texto.replace(/[&<>'"]/g, (caracter) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    })[caracter]);
}

function crearNombreArchivo(nombre) {
    return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "examen";
}

function crearPreguntasParaArchivo(examen) {
    const preguntas = examen.preguntas || [];
    if (!preguntas.length) {
        return `<p class="empty-state">Este examen todavía no tiene preguntas. Agrégalas desde el dashboard.</p>`;
    }

    return preguntas.map((pregunta, indice) => {
        const texto = escaparHtml(pregunta.texto || "Pregunta sin título");
        if (pregunta.tipo === "complexiva") {
            return `<article class="question complexiva"><h2>Pregunta ${indice + 1}</h2><p>${texto}</p><textarea class="student-answer" placeholder="Escribe tu respuesta"></textarea></article>`;
        }

        const opciones = (pregunta.opciones || []).map((opcion, opcionIndice) => {
            const letra = String.fromCharCode(65 + opcionIndice);
            return `<label><input type="radio" name="pregunta-${indice}" value="${letra}"> ${letra}) ${escaparHtml(opcion)}</label>`;
        }).join("");
        return `<fieldset class="question multiple-choice" data-correct="${escaparHtml(pregunta.correcta || "")}"><legend>Pregunta ${indice + 1}: ${texto}</legend>${opciones}</fieldset>`;
    }).join("");
}

function descargarExamen(examen) {
    const nombre = escaparHtml(examen.nombre);
    const materia = escaparHtml(examen.materia);
    const descripcion = escaparHtml(examen.descripcion);
    const formato = obtenerTextoFormatoExamen(examen);
    const preguntas = crearPreguntasParaArchivo(examen);
    const archivo = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nombre}</title>
<style>
body{font-family:Arial,sans-serif;background:#edf2f7;color:#17233d;margin:0;padding:32px}.exam{max-width:820px;margin:auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 18px #17233d33}h1{margin:0 0 8px;color:#244a6d}.meta{color:#7b2c83;font-weight:bold;margin-bottom:18px}.description{padding:14px;background:#f7f1c6;border-left:4px solid #f3c623}.question{display:grid;gap:10px;margin-top:18px;padding:18px;border:1px solid #d5dce5;border-radius:8px}legend{font-weight:bold}.question label{display:block;padding:8px;background:#f5f7fa;border-radius:5px}textarea{width:100%;min-height:110px;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #bbc6d3;border-radius:6px;resize:vertical}.camera{margin-top:20px;padding:18px;background:#17233d;color:#fff;border-radius:8px}.camera video{display:block;width:100%;max-height:280px;background:#000;border-radius:6px;margin:12px 0;object-fit:cover}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}button{border:0;border-radius:6px;padding:11px 16px;background:#f3c623;color:#17233d;font-weight:bold;cursor:pointer}button.secondary{background:#244a6d;color:#fff}.result{margin-top:20px;padding:18px;background:#e5f4e8;border-left:4px solid #218739;font-weight:bold}.empty-state{padding:18px;background:#f5f7fa;border-radius:8px}@media print{.actions,.camera{display:none}body{background:#fff;padding:0}.exam{box-shadow:none}}
</style>
</head>
<body>
<main class="exam">
<h1>${nombre}</h1>
<div class="meta">Materia: ${materia} | Formato: ${formato}</div>
<div class="description">${descripcion}</div>
<section id="questions">${preguntas}</section>
<section class="camera"><strong>Control de cámara</strong><video id="camera" autoplay muted playsinline></video><p id="camera-status">Enciende la cámara antes de comenzar.</p><button type="button" onclick="startTest()">Iniciar prueba</button></section>
<div class="actions"><button type="button" class="secondary" id="finish" onclick="finishTest()" disabled>Entregar prueba</button><button type="button" class="secondary" onclick="window.print()">Imprimir / Guardar PDF</button></div>
<div id="result" class="result" hidden></div>
</main>
<script>
let cameraStream=null;let started=false;
async function startTest(){const status=document.getElementById('camera-status');try{if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('secure');cameraStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});document.getElementById('camera').srcObject=cameraStream;status.textContent='Cámara activa durante la prueba.';started=true;document.getElementById('finish').disabled=false}catch(error){status.textContent='No se pudo activar la cámara. Abre este archivo desde localhost o HTTPS y concede el permiso.'}}
function finishTest(){if(!started)return;const questions=[...document.querySelectorAll('.multiple-choice')];let correct=0;questions.forEach(question=>{const answer=question.querySelector('input:checked');if(answer&&answer.value===question.dataset.correct)correct++});if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());const result=document.getElementById('result');const complexiva=document.querySelectorAll('.complexiva').length;if(complexiva){result.textContent='Prueba entregada. La parte complexiva queda pendiente de revisión del maestro.'}else{const note=questions.length?((correct/questions.length)*10).toFixed(2):'0.00';result.textContent='Prueba entregada. Nota final: '+note+'/10 ('+correct+'/'+questions.length+' respuestas correctas).'}result.hidden=false;document.getElementById('finish').disabled=true}
</script>
</body>
</html>`;
    const archivoBlob = new Blob([archivo], { type: "text/html;charset=utf-8" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivoBlob);
    enlace.download = `${crearNombreArchivo(examen.nombre)}.html`;
    document.body.appendChild(enlace);
    enlace.click();
    setTimeout(() => {
        URL.revokeObjectURL(enlace.href);
        enlace.remove();
    }, 1000);
}

async function eliminarExamen(indiceParaEliminar) {
    const examenes = obtenerExamenes();
    try {
        if (typeof firebaseDb !== "undefined") {
            if (!firebaseAuth.currentUser) throw new Error("La sesión de Firebase expiró. Cierra sesión e ingresa nuevamente.");
            if (examenes[indiceParaEliminar]?.id) {
                await firebaseDb.collection("examenes").doc(examenes[indiceParaEliminar].id).delete();
            }
        }
        examenes.splice(indiceParaEliminar, 1);
        localStorage.setItem("examenes", JSON.stringify(examenes));
        if (indiceExamenEnEdicion === indiceParaEliminar) {
            cerrarEditorExamen();
        } else if (indiceExamenEnEdicion !== null && indiceExamenEnEdicion > indiceParaEliminar) {
            indiceExamenEnEdicion -= 1;
        }
        if (indicePruebaActiva === indiceParaEliminar) {
            cerrarPruebaSistema();
        } else if (indicePruebaActiva !== null && indicePruebaActiva > indiceParaEliminar) {
            indicePruebaActiva -= 1;
        }
        await cargarExamenes();
        if (document.getElementById("estado-examenes").hidden) establecerEstadoExamenes("Examen eliminado.");
    } catch (error) {
        establecerEstadoExamenes(`No se pudo eliminar el examen. ${error.message || error.code || ""}`, true);
    }
}

function abrirEditorExamen(indice) {
    const examenes = obtenerExamenes();
    const examen = examenes[indice];
    if (!examen) return;
    if (!puedeEditarExamen(examen)) {
        establecerEstadoExamenes("Solo el profesor responsable puede editar este examen.", true);
        return;
    }

    indiceExamenEnEdicion = indice;
    document.getElementById("editor-examen").hidden = false;
    document.getElementById("formulario-pregunta").hidden = true;
    document.getElementById("boton-agregar-pregunta").hidden = false;
    document.getElementById("editor-titulo").textContent = examen.nombre;
    document.getElementById("editor-formato").textContent = `${examen.materia} | ${obtenerTextoFormatoExamen(examen)}`;
    document.getElementById("editar-abre-examen").value = fechaParaCampo(examen.abreEn);
    document.getElementById("editar-cierra-examen").value = fechaParaCampo(examen.cierraEn);
    document.getElementById("editar-limite-examen").value = examen.limiteMinutos || "";
    renderizarCamposPregunta(examen.formato, (examen.preguntas || []).length + 1);
    renderizarPreguntasGuardadas(examen.preguntas || [], examen.formato);
    document.getElementById("editor-examen").scrollIntoView({ behavior: "smooth", block: "start" });
}

function puedeEditarExamen(examen) {
    return esAdministrador() || !examen.maestroUid || examen.maestroUid === (firebaseAuth.currentUser && firebaseAuth.currentUser.uid);
}

function fechaParaCampo(fecha) {
    if (!fecha) return "";
    const valor = new Date(fecha);
    if (Number.isNaN(valor.getTime())) return "";
    return new Date(valor.getTime() - valor.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function guardarConfiguracionExamen(event) {
    event.preventDefault();
    if (indiceExamenEnEdicion === null) return;
    const examenes = obtenerExamenes();
    const examen = examenes[indiceExamenEnEdicion];
    if (!examen || !puedeEditarExamen(examen)) {
        establecerEstadoExamenes("No tienes permiso para cambiar este examen.", true);
        return;
    }
    let configuracion;
    try {
        configuracion = leerConfiguracionHorario("editar-abre-examen", "editar-cierra-examen", "editar-limite-examen");
    } catch (error) {
        establecerEstadoExamenes(error.message, true);
        return;
    }
    if (typeof firebaseAuth !== "undefined" && firebaseAuth.currentUser) {
        Object.assign(configuracion, {
            maestroUid: examen.maestroUid || firebaseAuth.currentUser.uid,
            maestroCorreo: examen.maestroCorreo || firebaseAuth.currentUser.email
        });
    }

    const boton = document.getElementById("boton-guardar-configuracion");
    if (boton) {
        boton.disabled = true;
        boton.textContent = "Guardando...";
    }

    try {
        Object.assign(examen, configuracion);
        localStorage.setItem("examenes", JSON.stringify(examenes));

        if (typeof firebaseDb !== "undefined" && typeof firebaseAuth !== "undefined"
            && firebaseAuth.currentUser && examen.id) {
            await firebaseDb.collection("examenes").doc(examen.id).update(configuracion);
        }

        establecerEstadoExamenes("Configuración guardada correctamente.");
        await cargarReportesProfesor();
    } catch (error) {
        establecerEstadoExamenes(`No se pudo guardar la configuración. ${error.message || error.code || ""}`, true);
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = "Guardar configuración";
        }
    }
}

function cerrarEditorExamen() {
    indiceExamenEnEdicion = null;
    document.getElementById("editor-examen").hidden = true;
}

function mostrarFormularioPregunta() {
    if (indiceExamenEnEdicion === null || !esMaestro()) return;
    const examen = obtenerExamenes()[indiceExamenEnEdicion];
    if (!examen) return;
    const formulario = document.getElementById("formulario-pregunta");
    const tipo = document.getElementById("tipo-pregunta");
    tipo.value = examen.formato === "complexiva" ? "complexiva" : "opcion-multiple";
    renderizarCamposPregunta(tipo.value, (examen.preguntas || []).length + 1);
    formulario.hidden = false;
    document.getElementById("boton-agregar-pregunta").hidden = true;
    document.getElementById("texto-pregunta").focus();
}

function actualizarTipoPregunta() {
    if (indiceExamenEnEdicion === null) return;
    const examen = obtenerExamenes()[indiceExamenEnEdicion];
    if (!examen) return;
    const tipo = document.getElementById("tipo-pregunta").value;
    renderizarCamposPregunta(tipo, (examen.preguntas || []).length + 1);
}

function cancelarPregunta() {
    document.getElementById("formulario-pregunta").reset();
    document.getElementById("formulario-pregunta").hidden = true;
    document.getElementById("boton-agregar-pregunta").hidden = false;
}

function renderizarCamposPregunta(formato, numeroPregunta = 1) {
    const campos = document.getElementById("campos-pregunta");
    const esComplexiva = formato === "complexiva";
    campos.innerHTML = `
        <h4>Pregunta ${numeroPregunta}</h4>
        <label for="texto-pregunta">Pregunta</label>
        <textarea id="texto-pregunta" rows="3" placeholder="Escribe la pregunta" required></textarea>
        ${esComplexiva ? `
            <label for="respuesta-complexiva">Respuesta esperada</label>
            <textarea id="respuesta-complexiva" rows="5" placeholder="Escribe la respuesta o criterios de evaluación" required></textarea>
        ` : `
            <label>Respuestas</label>
            <input type="text" id="opcion-a" placeholder="Respuesta A" required>
            <input type="text" id="opcion-b" placeholder="Respuesta B" required>
            <input type="text" id="opcion-c" placeholder="Respuesta C" required>
            <input type="text" id="opcion-d" placeholder="Respuesta D" required>
            <label for="respuesta-correcta">Respuesta correcta</label>
            <select id="respuesta-correcta" required>
                <option value="A">Respuesta A</option>
                <option value="B">Respuesta B</option>
                <option value="C">Respuesta C</option>
                <option value="D">Respuesta D</option>
            </select>
        `}
    `;
}

async function guardarPregunta(event) {
    event.preventDefault();
    if (indiceExamenEnEdicion === null) return;
    if (!esMaestro()) {
        establecerEstadoExamenes("Solo el maestro puede editar preguntas.", true);
        return;
    }

    const examenes = obtenerExamenes();
    const examen = examenes[indiceExamenEnEdicion];
    if (!examen) return;
    if (!puedeEditarExamen(examen)) {
        establecerEstadoExamenes("Solo el profesor responsable puede editar este examen.", true);
        return;
    }
    const tipo = document.getElementById("tipo-pregunta").value;
    const esComplexiva = tipo === "complexiva";
    const pregunta = {
        texto: document.getElementById("texto-pregunta").value.trim(),
        tipo
    };

    if (esComplexiva) {
        pregunta.respuesta = document.getElementById("respuesta-complexiva").value.trim();
    } else {
        pregunta.opciones = ["A", "B", "C", "D"].map((letra) => document.getElementById(`opcion-${letra.toLowerCase()}`).value.trim());
        pregunta.correcta = document.getElementById("respuesta-correcta").value;
    }

    examen.preguntas = examen.preguntas || [];
    examen.preguntas.push(pregunta);
    try {
        if (typeof firebaseDb !== "undefined") {
            if (!firebaseAuth.currentUser) throw new Error("La sesión de Firebase expiró. Cierra sesión e ingresa nuevamente.");
            if (!examen.id) throw new Error("El examen todavía no está sincronizado con Firebase.");
            await firebaseDb.collection("examenes").doc(examen.id).update({
                preguntas: examen.preguntas,
                maestroUid: examen.maestroUid || firebaseAuth.currentUser.uid,
                maestroCorreo: examen.maestroCorreo || firebaseAuth.currentUser.email
            });
            examen.maestroUid = examen.maestroUid || firebaseAuth.currentUser.uid;
            examen.maestroCorreo = examen.maestroCorreo || firebaseAuth.currentUser.email;
        }
        localStorage.setItem("examenes", JSON.stringify(examenes));
        document.getElementById("formulario-pregunta").reset();
        document.getElementById("formulario-pregunta").hidden = true;
        document.getElementById("boton-agregar-pregunta").hidden = false;
        renderizarPreguntasGuardadas(examen.preguntas, examen.formato);
        establecerEstadoExamenes(`Pregunta guardada. El examen tiene ${examen.preguntas.length} pregunta(s).`);
    } catch (error) {
        establecerEstadoExamenes(`No se pudo guardar la pregunta. ${error.message || error.code || ""}`, true);
    }
}

function renderizarPreguntasGuardadas(preguntas, formato) {
    const contenedor = document.getElementById("preguntas-guardadas");
    contenedor.innerHTML = preguntas.length ? `<h4>Preguntas guardadas: ${preguntas.length}</h4>` : "";
    preguntas.forEach((pregunta, indice) => {
        const elemento = document.createElement("p");
        const tipo = pregunta.tipo || formato || "opcion-multiple";
        const respuesta = tipo === "complexiva"
            ? `Respuesta esperada: ${pregunta.respuesta || "No definida"}`
            : `Respuesta correcta: ${pregunta.correcta || "No definida"}${pregunta.opciones && pregunta.opciones["ABCD".indexOf(pregunta.correcta)] ? ` — ${pregunta.opciones["ABCD".indexOf(pregunta.correcta)]}` : ""}`;
        elemento.textContent = `${indice + 1}. ${pregunta.texto} | ${respuesta}`;
        contenedor.appendChild(elemento);
    });
}

function obtenerEstadoDisponibilidad(examen) {
    const ahora = Date.now();
    const apertura = examen.abreEn ? new Date(examen.abreEn).getTime() : null;
    const cierre = examen.cierraEn ? new Date(examen.cierraEn).getTime() : null;
    if ((apertura !== null && Number.isNaN(apertura)) || (cierre !== null && Number.isNaN(cierre))) {
        return { disponible: false, mensaje: "El horario del examen tiene una fecha inválida. Contacta al profesor." };
    }
    if (apertura !== null && ahora < apertura) {
        return { disponible: false, mensaje: `El examen estará disponible el ${new Date(apertura).toLocaleString("es-EC")}.` };
    }
    if (cierre !== null && ahora >= cierre) {
        return { disponible: false, mensaje: "El plazo para realizar este examen ya terminó." };
    }
    return { disponible: true, mensaje: "" };
}

function inicializarPaginaPrueba() {
    const idExamen = new URLSearchParams(window.location.search).get("examen");
    const estado = document.getElementById("estado-carga-prueba");
    if (!idExamen) {
        estado.textContent = "Falta el identificador de la prueba. Regresa al panel y ábrela desde el botón Realizar.";
        return;
    }
    if (typeof firebaseAuth === "undefined" || typeof firebaseDb === "undefined") {
        estado.textContent = "No se pudo conectar con Firebase. Recarga la página o vuelve a iniciar sesión.";
        return;
    }
    firebaseAuth.onAuthStateChanged(async (usuario) => {
        if (paginaPruebaInicializada) return;
        if (!usuario) {
            estado.textContent = "Tu sesión no está activa. Vuelve al panel e inicia sesión para realizar la prueba.";
            return;
        }
        paginaPruebaInicializada = true;
        try {
            const [documentoExamen, documentoPerfil] = await Promise.all([
                firebaseDb.collection("examenes").doc(idExamen).get(),
                firebaseDb.collection("usuarios").doc(usuario.uid).get()
            ]);
            if (!documentoExamen.exists) throw new Error("No se encontró la prueba solicitada.");
            const perfil = documentoPerfil.exists ? documentoPerfil.data() : {};
            nombreEstudiantePrueba = typeof perfil.nombreCompleto === "string" ? perfil.nombreCompleto.trim() : "";
            if (!nombreEstudiantePrueba) {
                estado.textContent = "Antes de rendir, regresa al panel, abre Cuenta y guarda tu nombre completo.";
                return;
            }
            examenPruebaEnVentana = { id: documentoExamen.id, ...documentoExamen.data() };
            if (!examenPruebaEnVentana.maestroUid) {
                throw new Error("El profesor debe guardar la configuración del examen antes de que puedas realizarlo.");
            }
            const disponibilidad = obtenerEstadoDisponibilidad(examenPruebaEnVentana);
            if (!disponibilidad.disponible) throw new Error(disponibilidad.mensaje);
            preguntasPruebaSistema = examenPruebaEnVentana.preguntas || [];
            if (!preguntasPruebaSistema.length) throw new Error("Este examen todavía no tiene preguntas.");
            respuestasPruebaSistema = preguntasPruebaSistema.map(() => "");
            indicePreguntaPruebaActual = 0;
            cambiosPestana = 0;
            movimientosCamara = 0;
            eventosSupervision = [];
            eventosOmitidos = 0;
            inicioPruebaMilisegundos = null;
            ultimoEventoMovimiento = 0;
            document.getElementById("prueba-titulo").textContent = examenPruebaEnVentana.nombre || "Prueba";
            document.getElementById("prueba-formato").textContent = `${examenPruebaEnVentana.materia || ""} | ${obtenerTextoFormatoExamen(examenPruebaEnVentana)}`;
            document.getElementById("resultado-prueba").hidden = true;
            document.getElementById("prueba-examen").classList.remove("resultado-entregado");
            document.getElementById("finalizar-prueba").disabled = true;
            document.getElementById("aviso-cambio-pestana").hidden = true;
            renderizarPreguntasPrueba(preguntasPruebaSistema, examenPruebaEnVentana.formato);
            estado.hidden = true;
            document.getElementById("prueba-examen").hidden = false;
            const acepto = window.confirm(
                "Antes de iniciar: la cámara estará activa solo en esta pestaña para supervisión en vivo. No se grabará ni se guardará video. El informe registrará las respuestas, cambios de pestaña y movimientos detectados. ¿Aceptas y deseas comenzar?"
            );
            if (!acepto) {
                document.getElementById("camera-sistema-status").textContent = "No aceptaste la supervisión con cámara. La prueba no se inició.";
                document.getElementById("estado-supervision").textContent = "La cámara no se activó y no se almacena video.";
                return;
            }
            await iniciarPruebaSistema();
        } catch (error) {
            estado.hidden = false;
            estado.textContent = error.message || "No se pudo abrir la prueba.";
        }
    });
}

function abrirPruebaSistema(indice) {
    const examen = obtenerExamenes()[indice];
    if (!examen) {
        establecerEstadoExamenes("No se encontró el examen seleccionado.", true);
        return;
    }
    if (!examen.id) {
        establecerEstadoExamenes("Este examen no está sincronizado con Firebase y no se puede abrir en otra pestaña.", true);
        return;
    }
    const disponibilidad = obtenerEstadoDisponibilidad(examen);
    if (!disponibilidad.disponible) {
        establecerEstadoExamenes(disponibilidad.mensaje, true);
        return;
    }
    const ventana = window.open(`prueba.html?examen=${encodeURIComponent(examen.id)}`, "_blank");
    if (!ventana) {
        establecerEstadoExamenes("El navegador bloqueó la nueva pestaña. Permite ventanas emergentes para abrir la prueba.", true);
        return;
    }
    ventana.opener = null;
    establecerEstadoExamenes("La prueba se abrió en otra pestaña. Esta pestaña del panel sigue disponible.");
}

function cerrarPruebaSistema() {
    detenerCamaraSistema();
    clearInterval(temporizadorPrueba);
    temporizadorPrueba = null;
    indicePruebaActiva = null;
    examenPruebaEnVentana = null;
    pruebaIniciada = false;
    const prueba = document.getElementById("prueba-examen");
    if (prueba) prueba.hidden = true;
}

function renderizarPreguntasPrueba(preguntas, formato) {
    const contenedor = document.getElementById("preguntas-prueba");
    const navegacion = document.getElementById("navegacion-preguntas");
    if (!preguntas.length) {
        contenedor.innerHTML = "<p class=\"sin-preguntas\">Este examen todavía no tiene preguntas. Ciérralo y agrega al menos una pregunta.</p>";
        navegacion.hidden = true;
        return;
    }

    const pregunta = preguntas[indicePreguntaPruebaActual];
    const tipo = pregunta.tipo || formato;
    const respuesta = respuestasPruebaSistema[indicePreguntaPruebaActual] || "";
    navegacion.hidden = false;
    document.getElementById("contador-preguntas").textContent = `Pregunta ${indicePreguntaPruebaActual + 1} de ${preguntas.length}`;
    document.getElementById("pregunta-anterior").disabled = indicePreguntaPruebaActual === 0;
    document.getElementById("pregunta-siguiente").disabled = indicePreguntaPruebaActual === preguntas.length - 1;

    if (tipo === "complexiva") {
        contenedor.innerHTML = `<article class="pregunta-prueba complexiva-prueba"><h4>Pregunta ${indicePreguntaPruebaActual + 1}</h4><p>${escaparHtml(pregunta.texto)}</p><textarea class="respuesta-complexiva-prueba" placeholder="Escribe tu respuesta">${escaparHtml(respuesta)}</textarea></article>`;
        contenedor.querySelector("textarea").addEventListener("input", (event) => {
            respuestasPruebaSistema[indicePreguntaPruebaActual] = event.target.value;
            actualizarEstadoEntregaPrueba();
        });
        actualizarEstadoEntregaPrueba();
        return;
    }

    const opciones = (pregunta.opciones || []).map((opcion, opcionIndice) => {
        const letra = String.fromCharCode(65 + opcionIndice);
        const checked = respuesta === letra ? " checked" : "";
        return `<label class="opcion-prueba"><input type="radio" name="pregunta-sistema-${indicePreguntaPruebaActual}" value="${letra}"${checked}><span class="opcion-respuesta">${letra}) ${escaparHtml(opcion)}</span></label>`;
    }).join("");
    contenedor.innerHTML = `<fieldset class="pregunta-prueba multiple-prueba"><legend>Pregunta ${indicePreguntaPruebaActual + 1}: ${escaparHtml(pregunta.texto)}</legend>${opciones}</fieldset>`;
    contenedor.querySelectorAll("input[type=radio]").forEach((opcion) => {
        opcion.addEventListener("change", (event) => {
            respuestasPruebaSistema[indicePreguntaPruebaActual] = event.target.value;
            actualizarEstadoEntregaPrueba();
        });
    });
    actualizarEstadoEntregaPrueba();
}

function actualizarEstadoEntregaPrueba() {
    const botonFinalizar = document.getElementById("finalizar-prueba");
    if (!botonFinalizar) return;
    const todasRespondidas = preguntasPruebaSistema.length > 0
        && preguntasPruebaSistema.every((_, indice) => {
            const respuesta = respuestasPruebaSistema[indice];
            return typeof respuesta === "string" && respuesta.trim().length > 0;
        });
    botonFinalizar.disabled = !pruebaIniciada || !todasRespondidas;
}

function navegarPreguntaPrueba(desplazamiento) {
    const siguienteIndice = indicePreguntaPruebaActual + desplazamiento;
    if (siguienteIndice < 0 || siguienteIndice >= preguntasPruebaSistema.length) return;
    indicePreguntaPruebaActual = siguienteIndice;
    const examen = examenPruebaEnVentana || obtenerExamenes()[indicePruebaActiva];
    renderizarPreguntasPrueba(preguntasPruebaSistema, examen ? examen.formato : "opcion-multiple");
}

function registrarEventoSupervision(tipo, detalle) {
    if (eventosSupervision.length >= 200) {
        eventosOmitidos += 1;
        return;
    }
    eventosSupervision.push({ tipo, detalle, fecha: new Date().toISOString() });
}

async function iniciarPruebaSistema() {
    const estado = document.getElementById("camera-sistema-status");
    try {
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("La cámara requiere abrir el sitio mediante HTTPS o localhost.");
        }
        streamCamaraSistema = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById("camera-sistema").srcObject = streamCamaraSistema;
        estado.textContent = "Cámara activa para supervisión local. No se graba ni se guarda video.";
        document.getElementById("estado-supervision").textContent = "Supervisión activa; no se almacena video.";
        inicioPruebaMilisegundos = Date.now();
        registrarEventoSupervision("camara_activada", "El estudiante autorizó la cámara; la vista permanece local y no se graba.");
        iniciarMonitoreoCamara();
        pruebaIniciada = true;
        actualizarEstadoEntregaPrueba();
        iniciarTemporizadorPrueba(examenPruebaEnVentana);
    } catch (error) {
        detenerCamaraSistema();
        estado.textContent = `No se inició la prueba. ${error.message || error.name || ""}`;
        document.getElementById("estado-supervision").textContent = "No se activó la cámara; la prueba no comenzó.";
    }
}

function iniciarTemporizadorPrueba(examen) {
    const indicador = document.getElementById("temporizador-prueba");
    if (!examen || !Number.isInteger(Number(examen.limiteMinutos)) || Number(examen.limiteMinutos) < 1) return;
    let segundos = Number(examen.limiteMinutos) * 60;
    indicador.hidden = false;
    const actualizar = () => {
        const minutos = Math.floor(segundos / 60).toString().padStart(2, "0");
        const resto = (segundos % 60).toString().padStart(2, "0");
        indicador.textContent = `Tiempo restante: ${minutos}:${resto}`;
        if (segundos <= 0) {
            clearInterval(temporizadorPrueba);
            temporizadorPrueba = null;
            indicador.textContent = "Tiempo agotado. Entregando la prueba...";
            finalizarPruebaSistema("tiempo_agotado");
            return;
        }
        segundos -= 1;
    };
    actualizar();
    temporizadorPrueba = setInterval(actualizar, 1000);
}

async function finalizarPruebaSistema(motivoEntrega = "entrega_manual") {
    if (!pruebaIniciada || entregaPruebaEnCurso) return;
    if (motivoEntrega === "entrega_manual") {
        const todasRespondidas = preguntasPruebaSistema.every((_, indice) => {
            const respuesta = respuestasPruebaSistema[indice];
            return typeof respuesta === "string" && respuesta.trim().length > 0;
        });
        if (!todasRespondidas) {
            actualizarEstadoEntregaPrueba();
            return;
        }
    }
    entregaPruebaEnCurso = true;
    clearInterval(temporizadorPrueba);
    temporizadorPrueba = null;
    registrarEventoSupervision("prueba_finalizada", motivoEntrega === "tiempo_agotado"
        ? "La prueba terminó al agotarse el tiempo."
        : motivoEntrega === "bloqueada_por_cambios"
            ? "La prueba se entregó automáticamente después de tres cambios de pestaña."
            : "El estudiante entregó la prueba manualmente.");
    const examen = examenPruebaEnVentana || obtenerExamenes()[indicePruebaActiva];
    let totalOpcionMultiple = 0;
    let correctas = 0;
    const contieneComplexivas = preguntasPruebaSistema.some((pregunta) =>
        (pregunta.tipo || examen?.formato) === "complexiva");
    preguntasPruebaSistema.forEach((pregunta, indice) => {
        if ((pregunta.tipo || examen?.formato) === "complexiva") return;
        totalOpcionMultiple += 1;
        if (respuestasPruebaSistema[indice] === pregunta.correcta) correctas += 1;
    });
    const totalPreguntas = preguntasPruebaSistema.length;
    const resultado = document.getElementById("resultado-prueba");
    const botonFinalizar = document.getElementById("finalizar-prueba");
    botonFinalizar.disabled = true;
    resultado.hidden = false;
    resultado.textContent = "Guardando el informe de la prueba...";

    try {
        if (!examen) throw new Error("No se encontró el examen que estás realizando.");
        if (typeof firebaseDb === "undefined" || !firebaseAuth.currentUser) {
            throw new Error("No se pudo verificar tu sesión. Ingresa nuevamente antes de entregar la prueba.");
        }
        detenerCamaraSistema();
        const calificacion = contieneComplexivas
            ? null
            : Number((totalOpcionMultiple ? (correctas / totalOpcionMultiple) * 10 : 0).toFixed(2));
        const respuestasDetalle = preguntasPruebaSistema.map((pregunta, indice) => {
            const tipo = pregunta.tipo || examen.formato;
            const respuesta = respuestasPruebaSistema[indice];
            if (tipo === "complexiva") {
                return { indice, tipo, pregunta: pregunta.texto, respuesta: respuesta || "Sin respuesta" };
            }
            const opciones = pregunta.opciones || [];
            const respuestaIndice = respuesta ? respuesta.charCodeAt(0) - 65 : -1;
            const indiceCorrecto = (pregunta.correcta || "").charCodeAt(0) - 65;
            return {
                indice,
                tipo,
                pregunta: pregunta.texto,
                respuesta: respuestaIndice >= 0 ? `${respuesta}) ${opciones[respuestaIndice] || ""}`.trim() : "Sin respuesta",
                respuestaCorrecta: indiceCorrecto >= 0 ? `${pregunta.correcta}) ${opciones[indiceCorrecto] || ""}`.trim() : "No definida",
                correcta: Boolean(respuesta) && respuesta === pregunta.correcta
            };
        });
        await firebaseDb.collection("resultados").add({
            estudianteUid: firebaseAuth.currentUser.uid,
            estudianteCorreo: firebaseAuth.currentUser.email || obtenerSesion().correo,
            nombreCompleto: nombreEstudiantePrueba,
            maestroUid: examen.maestroUid,
            maestroCorreo: examen.maestroCorreo || "",
            examenId: examen.id || "",
            examenNombre: examen.nombre,
            formato: examen.formato,
            respuestasCorrectas: correctas,
            totalPreguntas,
            calificacion,
            respuestas: respuestasPruebaSistema,
            respuestasDetalle,
            cambiosPestana,
            movimientosCamara,
            eventosSupervision,
            eventosOmitidos,
            fechaInicio: firebase.firestore.Timestamp.fromDate(new Date(inicioPruebaMilisegundos)),
            duracionSegundos: Math.max(0, Math.floor((Date.now() - inicioPruebaMilisegundos) / 1000)),
            motivoEntrega,
            estado: contieneComplexivas ? "pendiente" : "calificada",
            fechaEntrega: firebase.firestore.FieldValue.serverTimestamp()
        });

        pruebaIniciada = false;
        entregaPruebaEnCurso = false;
        document.getElementById("estado-supervision").textContent = "Informe enviado al panel del profesor. No se guardó video.";
        document.getElementById("finalizar-prueba").disabled = true;
        document.getElementById("prueba-examen").classList.add("resultado-entregado");
        const duracionSegundos = Math.max(0, Math.floor((Date.now() - inicioPruebaMilisegundos) / 1000));
        const motivo = motivoEntrega === "tiempo_agotado"
            ? "Tiempo agotado"
            : motivoEntrega === "bloqueada_por_cambios"
                ? "Tres cambios de pestaña"
                : "Entrega manual";
        const nota = contieneComplexivas
            ? "Pendiente de revisión"
            : `${calificacion.toFixed(2)} / 10`;
        resultado.innerHTML = `
            <h2>Resultado de tu prueba</h2>
            <p class="resultado-etiqueta">Tu calificación</p>
            <strong class="resultado-nota">${nota}</strong>
            <div class="resultado-informe">
                <h3>Informe de la prueba</h3>
                <p>Examen: ${escaparHtml(examen.nombre || "Prueba")}</p>
                <p>Duración: ${formatearDuracion(duracionSegundos)}</p>
                <p>Entrega: ${motivo}</p>
                <p>Cambios de pestaña: ${cambiosPestana}</p>
                <p>Variaciones detectadas: ${movimientosCamara}</p>
            </div>
            <p id="resultado-redireccion">Volviendo a la página inicial en 5 segundos...</p>
            <button type="button" class="btn-primary" id="resultado-volver" onclick="window.location.href='index.html'">Volver ahora</button>
        `;

        let segundosRestantes = 5;
        const cuentaRegresiva = setInterval(() => {
            segundosRestantes -= 1;
            const indicador = document.getElementById("resultado-redireccion");
            if (indicador) {
                indicador.textContent = segundosRestantes > 0
                    ? `Volviendo a la página inicial en ${segundosRestantes} segundos...`
                    : "Volviendo a la página inicial...";
            }
            if (segundosRestantes <= 0) {
                clearInterval(cuentaRegresiva);
                window.location.href = "index.html";
            }
        }, 1000);
    } catch (error) {
        resultado.textContent = `No se pudo guardar la prueba. ${error.message || error.code || ""}`;
        botonFinalizar.disabled = false;
        entregaPruebaEnCurso = false;
    }
}

function detenerCamaraSistema() {
    clearInterval(monitoreoCamara);
    monitoreoCamara = null;
    const video = document.getElementById("camera-sistema");
    if (video) video.srcObject = null;
    if (!streamCamaraSistema) return;
    streamCamaraSistema.getTracks().forEach((track) => track.stop());
    streamCamaraSistema = null;
}

function iniciarMonitoreoCamara() {
    const video = document.getElementById("camera-sistema");
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 24;
    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexto) throw new Error("No se pudo iniciar el análisis local de la cámara.");
    let imagenAnterior = null;
    monitoreoCamara = setInterval(() => {
        if (!streamCamaraSistema || video.readyState < 2) return;
        contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagenActual = contexto.getImageData(0, 0, canvas.width, canvas.height).data;
        if (imagenAnterior) {
            let diferencia = 0;
            for (let indice = 0; indice < imagenActual.length; indice += 4) diferencia += Math.abs(imagenActual[indice] - imagenAnterior[indice]);
            if (diferencia / (imagenActual.length / 4) > 22 && Date.now() - ultimoEventoMovimiento >= 5000) {
                movimientosCamara += 1;
                ultimoEventoMovimiento = Date.now();
                const detalle = `Variación de imagen detectada por la cámara (${movimientosCamara}).`;
                document.getElementById("camera-sistema-status").textContent = detalle;
                registrarEventoSupervision("cambio_imagen", detalle);
            }
        }
        imagenAnterior = new Uint8ClampedArray(imagenActual);
    }, 1000);
}

document.addEventListener("visibilitychange", () => {
    if (!pruebaIniciada || entregaPruebaEnCurso || document.getElementById("prueba-examen")?.hidden) return;
    const aviso = document.getElementById("aviso-cambio-pestana");
    if (!document.hidden) {
        if (cambiosPestana > 0 && aviso) aviso.focus();
        return;
    }

    if (document.hidden) {
        cambiosPestana += 1;
        registrarEventoSupervision("cambio_pestana", `Cambio de pestaña detectado (${cambiosPestana}).`);
        const estado = document.getElementById("camera-sistema-status");
        if (aviso) {
            aviso.hidden = false;
            aviso.textContent = cambiosPestana >= 3
                ? "Aviso 3/3: la prueba se entregará automáticamente y se enviará el informe al profesor."
                : `Aviso ${cambiosPestana}/3: detectamos un cambio de pestaña. Vuelve a la prueba y continúa en esta ventana.`;
        }
        if (estado) estado.textContent = `Cambio de pestaña detectado (${cambiosPestana}/3).`;
        if (cambiosPestana >= 3) {
            finalizarPruebaSistema("bloqueada_por_cambios");
        }
    }
});

document.addEventListener("copy", bloquearPortapapeles);
document.addEventListener("cut", bloquearPortapapeles);
document.addEventListener("paste", bloquearPortapapeles);
document.addEventListener("contextmenu", (event) => {
    if (pruebaIniciada && !document.getElementById("prueba-examen")?.hidden) event.preventDefault();
});

function bloquearPortapapeles(event) {
    if (pruebaIniciada && !document.getElementById("prueba-examen")?.hidden) event.preventDefault();
}

if (window.location.pathname.includes("dashboard.html") || window.location.pathname.endsWith("/dashboard")) {
    const sesion = obtenerSesion();
    const rolActual = obtenerRolActual();
    const rolElemento = document.getElementById("rol-usuario");
    const tituloPanel = document.querySelector("#examenes-titulo");
    const descripcionPanel = document.querySelector(".examenes-panel .panel-heading p");
    const vistaPrevia = document.getElementById("vista-previa-panel");
    const cuentaCorreo = document.getElementById("cuenta-correo");
    const cuentaRol = document.getElementById("cuenta-rol");
    if (rolElemento) rolElemento.textContent = rolActual === "admin" ? "Administrador" : rolActual === "maestro" ? "Maestro" : "Estudiante";
    if (cuentaCorreo) cuentaCorreo.textContent = sesion.correo || "Cuenta institucional";
    if (cuentaRol) cuentaRol.textContent = rolElemento ? rolElemento.textContent : "";
    if (vistaPrevia && sesion.rol === "admin" && !new URLSearchParams(window.location.search).has("vista")) vistaPrevia.hidden = false;
    if (!esMaestro()) {
        document.querySelector(".btn-add").hidden = true;
        document.getElementById("formulario-examen").hidden = true;
        if (tituloPanel) tituloPanel.textContent = "Exámenes disponibles";
        if (descripcionPanel) descripcionPanel.textContent = "Selecciona un examen para rendirlo dentro del sistema.";
    }
    if (rolActual === "admin") {
        document.getElementById("usuarios-panel").hidden = false;
        cargarUsuarios();
        cargarEstadisticas();
    }
    if (esMaestro()) {
        const reportes = document.getElementById("reportes-panel");
        if (reportes) reportes.hidden = false;
        cargarReportesProfesor();
        const botonAvisos = document.getElementById("activar-notificaciones");
        if (botonAvisos) botonAvisos.hidden = true;
    } else if ("Notification" in window && Notification.permission === "granted") {
        const botonAvisos = document.getElementById("activar-notificaciones");
        if (botonAvisos) {
            botonAvisos.textContent = "Avisos activos";
            botonAvisos.disabled = true;
        }
        iniciarAvisosExamenes();
    }
    cargarExamenes();
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".cuenta-menu")) cerrarMenuCuenta();
    });
    if (typeof firebaseAuth !== "undefined") {
        firebaseAuth.onAuthStateChanged(async (usuario) => {
            if (usuario) {
                try {
                    await actualizarPresencia(true);
                    await cargarPerfil();
                } catch (error) {
                    establecerEstadoExamenes(`No se pudo actualizar tu sesión. ${error.message || error.code || ""}`, true);
                }
            }
            cargarExamenes();
            if (esMaestro()) cargarReportesProfesor();
            cargarUsuarios();
            cargarEstadisticas();
        });
    }
}

if (window.location.pathname.includes("prueba.html") || window.location.pathname.endsWith("/prueba")) {
    inicializarPaginaPrueba();
}

if (window.location.pathname.includes("dashboard.html") || window.location.pathname.endsWith("/dashboard")) {
    window.addEventListener("beforeunload", () => actualizarPresencia(false));
}
document.addEventListener("visibilitychange", () => {
    const panelPrueba = document.getElementById("prueba-examen");
    if (document.body.classList.contains("pagina-prueba")) {
        actualizarPresencia(!document.hidden);
    } else if (!panelPrueba || panelPrueba.hidden) {
        actualizarPresencia(!document.hidden);
    }
});
window.addEventListener("beforeunload", (event) => {
    if (document.body.classList.contains("pagina-prueba") && pruebaIniciada) {
        event.preventDefault();
        event.returnValue = "";
    }
});

