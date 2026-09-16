let cambiosPestana = 0;
let indiceExamenEnEdicion = null;
let indicePruebaActiva = null;
let streamCamaraSistema = null;
let pruebaIniciada = false;

// LOGIN
function login() {
    let user = document.getElementById("usuario").value.trim().toLowerCase();
    let pass = document.getElementById("password").value;
    const dominioEstudiante = "@estud.tesa.edu.ec";
    const dominioMaestro = "@tesa.edu.ec";
    let rol;

    if (user === "admin") {
        rol = "maestro";
    } else if (user.endsWith(dominioEstudiante)) {
        rol = "estudiante";
    } else if (user.endsWith(dominioMaestro)) {
        rol = "maestro";
    } else {
        alert("Usuario o correo no autorizado");
        return;
    }

    if(pass === "1234") {
        registrarAcceso(user, rol);
        sessionStorage.setItem("sesionSistema", JSON.stringify({ correo: user, rol }));
        window.location.href = "dashboard.html";
    } else {
        alert("❌ Credenciales incorrectas");
    }
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

function cargarUsuarios() {
    const lista = document.getElementById("lista-usuarios");
    if (!lista || !esMaestro()) return;

    const usuarios = obtenerUsuarios();
    lista.innerHTML = usuarios.length ? usuarios.map((usuario) => `
        <article class="usuario-item">
            <div>
                <strong>${escaparHtml(usuario.correo)}</strong>
                <span>${usuario.rol === "maestro" ? "Maestro" : "Estudiante"}</span>
            </div>
            <p>${usuario.cantidadAccesos} acceso(s) | Último: ${new Date(usuario.ultimoAcceso).toLocaleString("es-EC")}</p>
        </article>
    `).join("") : "<p class=\"sin-preguntas\">Todavía no hay accesos registrados.</p>";
}

function obtenerSesion() {
    const sesionGuardada = sessionStorage.getItem("sesionSistema");
    return sesionGuardada ? JSON.parse(sesionGuardada) : { correo: "", rol: "estudiante" };
}

function esMaestro() {
    return obtenerSesion().rol === "maestro";
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

function cargarExamenes() {
    const lista = document.getElementById("lista-examenes");
    if (!lista) return;

    const maestro = esMaestro();
    lista.innerHTML = "";
    obtenerExamenes().forEach((examen, indice) => {
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
        tarjeta.querySelector("span").textContent = `${examen.materia} | ${obtenerTextoFormato(examen.formato)}`;
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

function guardarExamen(event) {
    event.preventDefault();
    const nuevoExamen = {
        nombre: document.getElementById("nombre-examen").value.trim(),
        materia: document.getElementById("materia-examen").value.trim(),
        formato: document.getElementById("formato-examen").value,
        descripcion: document.getElementById("descripcion-examen").value.trim()
    };
    const examenes = obtenerExamenes();
    examenes.push(nuevoExamen);
    localStorage.setItem("examenes", JSON.stringify(examenes));
    descargarExamen(nuevoExamen);
    ocultarFormularioExamen();
    cargarExamenes();
}

function obtenerTextoFormato(formato) {
    return formato === "complexiva" ? "Complexiva" : "Opción múltiple";
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
    const formato = obtenerTextoFormato(examen.formato);
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

function eliminarExamen(indiceParaEliminar) {
    const examenes = obtenerExamenes();
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
    cargarExamenes();
}

function abrirEditorExamen(indice) {
    const examenes = obtenerExamenes();
    const examen = examenes[indice];
    if (!examen) return;

    indiceExamenEnEdicion = indice;
    document.getElementById("editor-examen").hidden = false;
    document.getElementById("editor-titulo").textContent = examen.nombre;
    document.getElementById("editor-formato").textContent = `${examen.materia} | ${obtenerTextoFormato(examen.formato)}`;
    renderizarCamposPregunta(examen.formato, (examen.preguntas || []).length + 1);
    renderizarPreguntasGuardadas(examen.preguntas || []);
    document.getElementById("editor-examen").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarEditorExamen() {
    indiceExamenEnEdicion = null;
    document.getElementById("editor-examen").hidden = true;
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

function guardarPregunta(event) {
    event.preventDefault();
    if (indiceExamenEnEdicion === null) return;

    const examenes = obtenerExamenes();
    const examen = examenes[indiceExamenEnEdicion];
    const esComplexiva = examen.formato === "complexiva";
    const pregunta = {
        texto: document.getElementById("texto-pregunta").value.trim(),
        tipo: examen.formato
    };

    if (esComplexiva) {
        pregunta.respuesta = document.getElementById("respuesta-complexiva").value.trim();
    } else {
        pregunta.opciones = ["A", "B", "C", "D"].map((letra) => document.getElementById(`opcion-${letra.toLowerCase()}`).value.trim());
        pregunta.correcta = document.getElementById("respuesta-correcta").value;
    }

    examen.preguntas = examen.preguntas || [];
    examen.preguntas.push(pregunta);
    localStorage.setItem("examenes", JSON.stringify(examenes));
    document.getElementById("formulario-pregunta").reset();
    renderizarCamposPregunta(examen.formato, examen.preguntas.length + 1);
    renderizarPreguntasGuardadas(examen.preguntas);
    descargarExamen(examen);
}

function renderizarPreguntasGuardadas(preguntas) {
    const contenedor = document.getElementById("preguntas-guardadas");
    contenedor.innerHTML = preguntas.length ? `<h4>Preguntas guardadas: ${preguntas.length}</h4>` : "";
    preguntas.forEach((pregunta, indice) => {
        const elemento = document.createElement("p");
        elemento.textContent = `${indice + 1}. ${pregunta.texto}`;
        contenedor.appendChild(elemento);
    });
}

function abrirPruebaSistema(indice) {
    const examen = obtenerExamenes()[indice];
    if (!examen) return;

    indicePruebaActiva = indice;
    pruebaIniciada = false;
    document.getElementById("editor-examen").hidden = true;
    document.getElementById("prueba-examen").hidden = false;
    document.getElementById("prueba-titulo").textContent = examen.nombre;
    document.getElementById("prueba-formato").textContent = `${examen.materia} | ${obtenerTextoFormato(examen.formato)}`;
    document.getElementById("resultado-prueba").hidden = true;
    document.getElementById("finalizar-prueba").disabled = true;
    renderizarPreguntasPrueba(examen.preguntas || [], examen.formato);
    document.getElementById("prueba-examen").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarPruebaSistema() {
    detenerCamaraSistema();
    indicePruebaActiva = null;
    pruebaIniciada = false;
    document.getElementById("prueba-examen").hidden = true;
}

function renderizarPreguntasPrueba(preguntas, formato) {
    const contenedor = document.getElementById("preguntas-prueba");
    if (!preguntas.length) {
        contenedor.innerHTML = "<p class=\"sin-preguntas\">Este examen todavía no tiene preguntas. Ciérralo y agrega al menos una pregunta.</p>";
        return;
    }

    contenedor.innerHTML = preguntas.map((pregunta, indice) => {
        if (formato === "complexiva") {
            return `<article class="pregunta-prueba complexiva-prueba"><h4>Pregunta ${indice + 1}</h4><p>${escaparHtml(pregunta.texto)}</p><textarea class="respuesta-complexiva-prueba" data-indice="${indice}" placeholder="Escribe tu respuesta"></textarea></article>`;
        }
        const opciones = (pregunta.opciones || []).map((opcion, opcionIndice) => {
            const letra = String.fromCharCode(65 + opcionIndice);
            return `<label><input type="radio" name="pregunta-sistema-${indice}" value="${letra}"> ${letra}) ${escaparHtml(opcion)}</label>`;
        }).join("");
        return `<fieldset class="pregunta-prueba multiple-prueba" data-correcta="${escaparHtml(pregunta.correcta || "")}"><legend>Pregunta ${indice + 1}: ${escaparHtml(pregunta.texto)}</legend>${opciones}</fieldset>`;
    }).join("");
}

async function iniciarPruebaSistema() {
    const estado = document.getElementById("camera-sistema-status");
    const habilitarPrueba = () => {
        pruebaIniciada = true;
        document.getElementById("finalizar-prueba").disabled = false;
    };
    const limiteCamara = setTimeout(() => {
        estado.textContent = "Cámara no disponible en este archivo local. Puedes continuar, o abrirlo desde localhost para activar la cámara.";
        habilitarPrueba();
    }, 1500);

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("secure-context");
        streamCamaraSistema = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        clearTimeout(limiteCamara);
        document.getElementById("camera-sistema").srcObject = streamCamaraSistema;
        estado.textContent = "Cámara activa durante la prueba.";
        habilitarPrueba();
    } catch (error) {
        clearTimeout(limiteCamara);
        estado.textContent = "Cámara no disponible en este archivo local. Puedes continuar, o abrirlo desde localhost para activar la cámara.";
        habilitarPrueba();
    }
}

function finalizarPruebaSistema() {
    if (!pruebaIniciada) return;
    const preguntas = document.querySelectorAll(".multiple-prueba");
    let correctas = 0;
    preguntas.forEach((pregunta) => {
        const respuesta = pregunta.querySelector("input:checked");
        if (respuesta && respuesta.value === pregunta.dataset.correcta) correctas += 1;
    });
    detenerCamaraSistema();
    const complexivas = document.querySelectorAll(".complexiva-prueba").length;
    const resultado = document.getElementById("resultado-prueba");
    resultado.hidden = false;
    resultado.textContent = complexivas
        ? "Prueba entregada. La parte complexiva queda pendiente de revisión del maestro."
        : `Prueba entregada. Nota final: ${preguntas.length ? ((correctas / preguntas.length) * 10).toFixed(2) : "0.00"}/10.`;
    document.getElementById("finalizar-prueba").disabled = true;
}

function detenerCamaraSistema() {
    if (!streamCamaraSistema) return;
    streamCamaraSistema.getTracks().forEach((track) => track.stop());
    streamCamaraSistema = null;
}

if (window.location.pathname.includes("dashboard.html")) {
    const sesion = obtenerSesion();
    const rolElemento = document.getElementById("rol-usuario");
    const tituloPanel = document.querySelector("#examenes-titulo");
    const descripcionPanel = document.querySelector(".panel-heading p");
    if (rolElemento) rolElemento.textContent = sesion.rol === "maestro" ? "Maestro" : "Estudiante";
    if (sesion.rol !== "maestro") {
        document.querySelector(".btn-add").hidden = true;
        document.getElementById("formulario-examen").hidden = true;
        if (tituloPanel) tituloPanel.textContent = "Exámenes disponibles";
        if (descripcionPanel) descripcionPanel.textContent = "Selecciona un examen para rendirlo dentro del sistema.";
    } else {
        document.getElementById("usuarios-panel").hidden = false;
        cargarUsuarios();
    }
    cargarExamenes();
}

