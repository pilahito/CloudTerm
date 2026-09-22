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

Para que el binario oficial traiga los identificadores, se definen al compilar
(así no quedan escritos en el repositorio):

```powershell
$env:CLOUDTERM_GOOGLE_CLIENT_ID = "1234567890-abc.apps.googleusercontent.com"
$env:CLOUDTERM_GITHUB_CLIENT_ID = "Ov23liXXXXXXXXXXXXXX"
cargo tauri build
```

También se pueden pegar directamente en `src-tauri/src/auth/clients.rs`.

El **Client ID no es un secreto**: viaja en la URL de autorización y se puede
leer del binario. Lo que protege el flujo es el PKCE. El *client secret* de
GitHub sí es secreto y nunca va aquí: se guarda en el llavero desde Ajustes.

## Lo que solo puede crear el autor (una vez)

Google y GitHub no emiten tokens a una app que no exista en su consola.

### Google

1. [Credenciales](https://console.cloud.google.com/apis/credentials)
2. Tipo **Aplicación de escritorio**
3. Activar **Google Drive API**
4. Guardar el Client ID como secreto de Actions: `CLOUDTERM_GOOGLE_CLIENT_ID`

### GitHub

1. [OAuth Apps](https://github.com/settings/developers)
2. Homepage `https://github.com/pilahito/CloudTerm`
3. Callback `http://127.0.0.1/callback`
4. Enable Device Authorization Grant
5. Secretos: `CLOUDTERM_GITHUB_CLIENT_ID` y, si usas code flow, el client secret en el llavero / CI

Cuando esos secretos estén en el build, el usuario solo pulsa **Iniciar sesión**.
