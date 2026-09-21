# OAuth2 de escritorio · CloudTerm

Flujo oficial (RFC 8252): se abre el navegador del sistema, el usuario entra, Google/GitHub redirigen a `http://127.0.0.1:<puerto>/callback` y CloudTerm canjea el código con PKCE. No hay que copiar códigos en la app.

## Lo que ya está en el programa

- Redirect loopback `127.0.0.1`
- PKCE S256
- Google: `openid email profile drive.appdata` + refresh token
- GitHub: `read:user user:email gist`
- Tokens en el llavero del sistema, no en disco

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
