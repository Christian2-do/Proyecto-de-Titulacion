let cambiosPestana = 0;

// LOGIN
function login() {
    let user = document.getElementById("usuario").value;
    let pass = document.getElementById("password").value;

    if(user === "admin" && pass === "1234") {
        window.location.href = "dashboard.html";
    } else {
        alert("❌ Credenciales incorrectas");
    }
}

// IR A EXAMEN
function irExamen() {
    window.location.href = "examen.html";
}

// RESPUESTA
function responder(opcion) {
    alert("✅ Respuesta seleccionada: " + opcion);
}

// 🚨 DETECCIÓN DE CAMBIO DE PESTAÑA
document.addEventListener("visibilitychange", () => {
    // Solo aplicar en la página de examen
    if (window.location.pathname.includes("examen.html")) {
        if (document.hidden) {
            cambiosPestana++;
            
            const alertaDiv = document.getElementById("alerta");
            if (alertaDiv) {
                alertaDiv.innerHTML = "⚠️ Saliste de la pestaña (" + cambiosPestana + " veces)";
                alertaDiv.style.display = "block";
            }
            
            // 🔥 límite antifraude
            if (cambiosPestana >= 3) {
                alert("🚫 EXAMEN BLOQUEADO por comportamiento sospechoso");
                window.location.href = "index.html";
            }
        }
    }
});