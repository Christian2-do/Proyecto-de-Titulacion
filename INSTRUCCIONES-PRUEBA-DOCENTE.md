# Cuenta docente de prueba

La aplicación autentica con Firebase Authentication y no contiene credenciales demo incrustadas. Para revisar el rol docente sin debilitar la seguridad, crea un usuario de prueba en Firebase Console → Authentication → Users (proveedor Email/Password habilitado) con correo que termine en `@tesa.edu.ec` y una contraseña temporal que controles. Luego inicia sesión desde `index.html` con esas credenciales.

Al primer ingreso la aplicación registra el rol docente a partir del dominio institucional. Puedes asignarle asignaturas desde la cuenta administradora en **Clases y maestros**. La cuenta debe eliminarse o cambiar su contraseña al terminar la revisión.

La función **Activar alarmas** solicita permiso al navegador y programa avisos locales en ese dispositivo para exámenes con fecha de apertura. El navegador debe permanecer abierto; no equivale a notificaciones push del servidor.
