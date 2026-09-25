# OAuth2 de escritorio · CloudTerm

Flujo oficial (RFC 8252): se abre el navegador del sistema, el usuario entra, Google/GitHub redirigen a `http://127.0.0.1:<puerto>/callback` y CloudTerm canjea el código con PKCE. No hay que copiar códigos en la app.

## Lo que ya está en el programa

- Redirect loopback `127.0.0.1`
- PKCE S256
- Google: `openid email profile drive.appdata` + refresh token
- GitHub: `read:user user:email gist`
- Tokens en el llavero del sistema, no en disco
- Credenciales integradas de fábrica: el usuario pulsa y entra, sin configurar nada

## Identificadores integrados (para que el usuario no configure nada)

El orden de prioridad es: **lo que el usuario haya guardado en Ajustes → lo
integrado en el build → error**. Quien quiera usar su propia aplicación de Google
o GitHub sigue pudiendo hacerlo desde Ajustes → Cuenta.

> **Esto se configura UNA sola vez, y lo hace el autor del proyecto — nunca
> quien instala CloudTerm.** Los identificadores se incrustan en el binario
> publicado, así que quien descarga el programa abre, pulsa **Iniciar sesión** y
> entra: no ve campos que rellenar ni tiene que pasar por Google Cloud.

Para que el binario oficial traiga los identificadores, se definen al compilar
(así no quedan escritos en el repositorio):

| Variable de entorno | Para qué |
| --- | --- |
| `CLOUDTERM_GOOGLE_CLIENT_ID` | Google en escritorio |
| `CLOUDTERM_GOOGLE_ANDROID_CLIENT_ID` | Google en Android (credencial distinta) |
| `CLOUDTERM_GITHUB_CLIENT_ID` | GitHub |

```powershell
$env:CLOUDTERM_GOOGLE_CLIENT_ID = "1234567890-abc.apps.googleusercontent.com"
$env:CLOUDTERM_GOOGLE_ANDROID_CLIENT_ID = "9876543210-xyz.apps.googleusercontent.com"
$env:CLOUDTERM_GITHUB_CLIENT_ID = "Ov23liXXXXXXXXXXXXXX"
cargo tauri build
```

También se pueden pegar directamente en `src-tauri/src/auth/clients.rs`.

### En GitHub Actions (recomendado)

Los flujos `.github/workflows/build-installers.yml` (escritorio) y
`android.yml` (APK) ya leen esos valores de los **secretos del repositorio**:

**Settings → Secrets and variables → Actions → New repository secret**

| Secreto | Valor |
| --- | --- |
| `CLOUDTERM_GOOGLE_CLIENT_ID` | Client ID de la app de escritorio |
| `CLOUDTERM_GOOGLE_ANDROID_CLIENT_ID` | Client ID de la app Android |
| `CLOUDTERM_GITHUB_CLIENT_ID` | Client ID de la OAuth App |

Al publicar una etiqueta (`git tag v1.0.10 && git push --tags`), los
instaladores y el APK salen ya con los identificadores dentro.

El **Client ID no es un secreto**: viaja en la URL de autorización y se puede
leer del binario. Lo que protege el flujo es el PKCE. El *client secret* de
GitHub sí es secreto y nunca va aquí: se guarda en el llavero desde Ajustes.

## Lo que solo puede crear el autor (una vez)

Google y GitHub no emiten tokens a una app que no exista en su consola.

### Google — escritorio (Windows / Linux / macOS)

1. [Credenciales](https://console.cloud.google.com/apis/credentials)
2. Tipo **Aplicación de escritorio**
3. Activar **Google Drive API**
4. Guardar el Client ID como secreto de Actions: `CLOUDTERM_GOOGLE_CLIENT_ID`

### Google — Android

En el móvil Google **no acepta** la redirección a `127.0.0.1` (loopback) que
usa el escritorio: la bloquea en el navegador. CloudTerm usa en su lugar un
**esquema propio** (`cloudterm://callback`) que Android entrega a la app.

Hace falta **otra credencial**, distinta de la de escritorio:

1. [Credenciales](https://console.cloud.google.com/apis/credentials) →
   Crear credenciales → **ID de cliente de OAuth** → Tipo **Aplicación Android**.
2. **Nombre del paquete:** `com.pilahito.cloudterm`
3. **Huella SHA-1** del certificado con el que se firma el APK. Se obtiene con:
   ```bash
   keytool -list -v -keystore src-tauri/gen/android/keystore.jks -alias cloudterm
   ```
4. En **URI de redireccionamiento autorizadas** añade `cloudterm://callback`.
5. Guarda el Client ID como secreto de Actions:
   `CLOUDTERM_GOOGLE_ANDROID_CLIENT_ID` (distinto del de escritorio).

El esquema `cloudterm://callback` ya está declarado en `tauri.conf.json`
(`plugins.deep-link.mobile`) y el backend lo espera en `google.rs` con la
constante `ANDROID_REDIRECT_URI`. No hay que tocarlo: solo registrar la URI en
Google Cloud para el cliente Android.

### GitHub

1. [OAuth Apps](https://github.com/settings/developers)
2. Homepage `https://github.com/pilahito/CloudTerm`
3. Callback `http://127.0.0.1/callback`
4. Enable Device Authorization Grant
5. Secretos: `CLOUDTERM_GITHUB_CLIENT_ID` y, si usas code flow, el client secret en el llavero / CI

Cuando esos secretos estén en el build, el usuario solo pulsa **Iniciar sesión**.
