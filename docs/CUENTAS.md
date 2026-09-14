# Inicio de sesión y copia de seguridad

CloudTerm puede iniciar sesión con **Google** y con **GitHub** para guardar tus
hosts y ajustes en tu propia cuenta.

No hay servidor intermedio: los datos van de tu equipo a tu cuenta. Por eso cada
usuario necesita crear **su propia aplicación de cliente** una sola vez. Son
cinco minutos y no cuesta nada.

---

## Dónde está

Hay tres sitios desde los que llegar, porque escondida en Ajustes no la
encontraba nadie:

| Sitio | Qué se ve |
| --- | --- |
| **Barra de título** | Un botón con el avatar si hay sesión, o «Cuenta» si no |
| **Pantalla de bienvenida** | «Iniciar sesión con Google o GitHub», solo si no hay sesión |
| **Paleta de comandos** (`Ctrl/Cmd + K`) | Escribe «sesión», «google» o «cuenta» |

Los tres llevan a **Ajustes → Cuenta**, que es donde se pega el identificador de
cliente y se gestionan la copia y la restauración.

---

## Por qué hay que crear una aplicación de cliente

Google y GitHub solo entregan un token a una aplicación que se hayan registrado
antes. Ese registro produce un **identificador de cliente** (un texto público,
no un secreto).

CloudTerm no reparte un identificador común a propósito: si lo hiciera, todas
las copias del programa compartirían la misma identidad y quien controlara ese
registro podría ver las autorizaciones de todo el mundo.

El identificador de cliente **no es secreto** y se guarda en
`~/.config/com.pilahito.cloudterm/auth.json`. Los tokens de acceso sí son
secretos y van al **llavero del sistema**, nunca a disco.

---

## Google

1. Entra en la [consola de credenciales de Google Cloud](https://console.cloud.google.com/apis/credentials).
2. Crea un proyecto si no tienes ninguno.
3. **Habilita las APIs** que se usan: en «APIs y servicios → Biblioteca», activa
   **Google Drive API**.
4. En «Credenciales → Crear credenciales → ID de cliente de OAuth»:
   - Tipo de aplicación: **Aplicación de escritorio**.
   - Ponle un nombre, por ejemplo `CloudTerm`.
5. Copia el **identificador de cliente** (termina en
   `.apps.googleusercontent.com`) y pégalo en Ajustes → Cuenta.

No hace falta el secreto de cliente. CloudTerm usa PKCE, que demuestra la
identidad sin custodiarlo.

### Qué se pide

```
openid email profile   https://www.googleapis.com/auth/drive.appdata
```

`drive.appdata` es una carpeta **privada de la aplicación**: no aparece en tu
Drive ni la ve nadie más, pero ocupa tu cuota.

La copia se guarda ahí, en un fichero llamado `cloudterm-backup.json`.

---

## GitHub

1. Entra en [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
   y pulsa **New OAuth App**.
2. Rellena el nombre y la URL que quieras (no se usan para nada más).
3. **Marca «Enable Device Flow»**. Es imprescindible.
4. Copia el **Client ID** y pégalo en Ajustes → Cuenta.

No hace falta el Client Secret.

### Por qué «device flow»

La forma habitual (redirección a `127.0.0.1`) obliga a GitHub a pedir el
*secreto de cliente* para canjear el código, y GitHub no admite PKCE. Un secreto
dentro de un binario de escritorio no es un secreto: cualquiera que tenga el
ejecutable puede extraerlo.

El flujo de dispositivo está pensado justo para este caso: solo necesita el
identificador de cliente. Verás un **código corto** en la aplicación, lo
escribirás en `https://github.com/login/device` y CloudTerm irá comprobando si
ya lo has autorizado.

### Qué se pide

```
read:user user:email gist
```

La copia se guarda en un **gist secreto** llamado `cloudterm-backup.json`. Un
gist secreto no aparece en tu perfil ni en las búsquedas, pero **cualquiera que
tenga el enlace puede leerlo**: no lo publiques.

---

## Sincronización

Con la sesión iniciada aparecen dos botones:

- **Guardar copia**: sube los hosts de la base local y tus ajustes.
- **Restaurar**: descarga la copia y **reemplaza** los hosts locales por los de
  la nube. Los ajustes se aplican sobre los actuales.

Una copia hecha con una cuenta se puede restaurar con la otra: el formato es el
mismo.

### Qué se guarda

```json
{
  "version": 1,
  "exportedAt": 1757755200000,
  "hosts": [ /* los hosts, tal cual están en SQLite */ ],
  "settings": { /* tema, preferencias… */ }
}
```

**Las credenciales no se sincronizan.** Ni las contraseñas, ni las passphrases,
ni las claves privadas: esas se quedan en el llavero de cada equipo, que no sale
de ahí. Al restaurar en otra máquina tendrás que volver a escribir la contraseña
de cada host.

---

## Qué pasa si algo falla

- **«falta el identificador de cliente»**: no has pegado el Client ID, o has
  pulsado «Iniciar sesión» sin guardarlo antes.
- **«la sesión ha caducado»**: el token de Google dura una hora; CloudTerm lo
  renueva solo con el de renovación. Si el de renovación se revoca, hay que
  volver a iniciar sesión.
- **«todavía no hay ninguna copia»**: le has dado a Restaurar antes de haber
  guardado nunca.
- **Error 403 de GitHub**: falta marcar «Enable Device Flow» en la OAuth App.

Para revocar el acceso, hazlo desde la cuenta del proveedor:

- Google: [Permisos de terceros](https://myaccount.google.com/permissions)
- GitHub: [Aplicaciones autorizadas](https://github.com/settings/applications)
