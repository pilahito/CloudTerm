# Bloqueo de la aplicación y segundo factor

CloudTerm puede pedirte que te identifiques **antes de abrirse**. Y en cualquiera
de las dos formas, hace falta un **segundo factor**: un código de seis dígitos de
tu aplicación de autenticación.

No es opcional. Una contraseña sola no basta cuando lo que proteges es el acceso
a tus servidores.

---

## Las dos formas de identificarte

| Método | Primer factor | Segundo factor |
| --- | --- | --- |
| **Cuenta local** | Tu nombre y tu contraseña, guardados en este equipo | Código de la aplicación |
| **Google** o **GitHub** | El proveedor comprueba quién eres | Código de la aplicación |

Con la cuenta local **no hace falta cuenta en ningún sitio**: todo se queda en tu
equipo. Con un proveedor, la comodidad es no tener que recordar otra contraseña,
pero el segundo factor lo sigue pidiendo CloudTerm.

Cuando eliges un proveedor, el código **solo no abre nada**: si no hay una sesión
abierta de verdad con ese proveedor, CloudTerm lo rechaza. Si no, el segundo
factor se convertiría en el único, y eso no es doble paso.

---

## Cómo se configura

**Ajustes → Seguridad → ¿Quién te identifica?**

1. Elige el método. Si es cuenta local, escribe tu nombre de usuario y una
   contraseña de **al menos 8 caracteres**.
2. Aparece un **código QR**. Ábrelo con tu aplicación de autenticación:
   - Google Authenticator
   - Microsoft Authenticator
   - Authy, 1Password, Bitwarden, FreeOTP…

   Sirve **cualquiera** que entienda `otpauth://`, que son prácticamente todas.

   ¿No puedes escanear? Hay un botón para copiar la clave y escribirla a mano.
3. Escribe el código de 6 dígitos que te muestre la aplicación. **Hasta que no se
   compruebe, el bloqueo no se activa.** Es a propósito: si un QR se escanea mal,
   activarlo dejaría la aplicación cerrada para siempre.
4. Aparecen **8 códigos de recuperación**. Se enseñan **una sola vez**.

---

## Los códigos de recuperación

Son la salida para cuando pierdes el móvil. Cada uno sirve **una vez**, y se
guardan hasheados: ni siquiera CloudTerm puede volver a enseñártelos.

Guárdalos fuera de este equipo. Si pierdes el móvil y los códigos, no hay forma
de entrar.

---

## Qué protege y qué no

**Protege** que alguien que coja tu equipo pueda abrir CloudTerm y usar tus
servidores guardados.

**No protege**:

- **Tus contraseñas de servidor**, que viven en el llavero del sistema. Si el
  llavero está desbloqueado, están accesibles para cualquier programa tuyo.
- **El fichero de configuración**, que se puede borrar. Alguien con acceso físico
  y ganas puede eliminar `~/.config/com.pilahito.cloudterm/seguridad.json` y
  entrar sin código. Es inevitable: si puede borrar archivos, puede hacer lo que
  quiera con el equipo. El bloqueo disuade y protege del acceso casual; no es
  cifrado de disco.
- **La copia de seguridad en la nube**: los hosts se suben sin cifrar. Las
  credenciales no se suben nunca, pero los nombres y direcciones de tus
  servidores sí.

---

## Dónde se guarda

`~/.config/com.pilahito.cloudterm/seguridad.json`, con permisos **`0600`** (solo
lo puede leer tu usuario).

Dentro van el hash **Argon2id** de la contraseña, el secreto del segundo factor y
los hashes de los códigos de recuperación. La contraseña no se guarda nunca en
claro.

El secreto del segundo factor se guarda ahí y **no en el llavero** a propósito: en
Linux el llavero nativo es el del kernel, que se vacía al reiniciar el equipo. Si
el secreto viviera ahí, cada reinicio te dejaría fuera de tu propia aplicación.

---

## Detalles técnicos

- **TOTP según la RFC 6238**: SHA-1, 6 dígitos, pasos de 30 s. Es lo que usan
  Google y GitHub, y lo que entienden todas las aplicaciones.
- **Se tolera un paso de reloj** hacia cada lado (±30 s), porque los relojes no
  van perfectos y rechazar códigos válidos sería peor que aceptar uno de hace
  medio minuto.
- **La implementación está cubierta por los vectores oficiales de la RFC**, que
  es lo que garantiza que cualquier aplicación acepte los códigos.
- **El desbloqueo vive solo en memoria**: al cerrar CloudTerm hay que volver a
  entrar. Si se guardara, quien tuviera el equipo tendría también la sesión.
