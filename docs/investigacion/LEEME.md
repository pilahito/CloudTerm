# Investigación de las librerías

Estos dos informes los escribieron agentes de investigación leyendo **el código
fuente de las librerías** antes de escribir el panel de SFTP:

| Informe | Qué contiene |
| --- | --- |
| [`russh-0.63.3-client-api.md`](./russh-0.63.3-client-api.md) | La API del cliente SSH: el *trait* `Handler`, `Config`, `connect`, `Handle`, `Channel`, carga de claves, trampas conocidas y un ejemplo completo |
| [`russh-sftp-3.0.0-api-findings.md`](./russh-sftp-3.0.0-api-findings.md) | La API de SFTP: construcción de la sesión, firmas exactas, semántica de `read_dir`, errores y tiempos de espera |

No son documentación de CloudTerm, sino **notas de trabajo**: la referencia que se
consultó para que el código compilara a la primera en vez de a base de intentos.

Se conservan porque son útiles para lo que queda por hacer —copia recursiva de
carpetas, cancelar y reanudar transferencias, FTP/FTPS— y porque el segundo
termina con una sección **«UNCONFIRMED items»** que separa lo que se leyó del
código de lo que no se llegó a comprobar. Esa honestidad vale la pena guardarla.

> Las versiones citadas son las que se usaron entonces. Si se actualiza alguna
> dependencia, conviene volver a leer el código en vez de fiarse de esto.
