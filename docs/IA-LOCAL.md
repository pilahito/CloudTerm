# IA local en CloudTerm / DeepSeek Harness

Cómo está montado el modelo de lenguaje local, por qué se eligió cada pieza y
cómo cambiarlo.

| | |
| --- | --- |
| Motor | **Ollama 0.34.0** (instalación de usuario, sin root) |
| Modelo | **Qwen3 8B** · cuantización Q4_K_M · 5,0 GB |
| Endpoint | `http://127.0.0.1:11434/v1` (compatible con OpenAI) |
| Ruta en DSH | `ollama-local`, protocolo `openai-completions` |
| Arranque | servicio de usuario `ollama-cloudterm.service` |
| Verificado | tarea de agente real con llamada a herramienta, 26 s |

---

## 1. Arquitectura

```
DeepSeek Harness
   │  agent-default-model → provider: ollama-local
   ▼
dsh-llm-pi-ai  (adaptador de pi-ai)
   │  api: openai-completions   →   POST /v1/chat/completions
   ▼
Ollama  (127.0.0.1:11434)
   │
   ▼
Qwen3 8B Q4_K_M  (CPU)
```

La ruta local se **añade** a las existentes: la de DeepSeek en la nube sigue
funcionando. En el selector de modelos aparecen las dos y se cambia sin tocar
nada más.

---

## 2. Qué se instaló

### Ollama (sin root)

El instalador oficial (`install.sh`) escribe en `/usr/local/bin` y crea un
servicio de sistema, y en esta máquina `sudo` pide contraseña. Se instaló el
binario en el espacio del usuario:

```bash
mkdir -p ~/.local/opt/ollama && cd ~/.local/opt/ollama
curl -fL -o /tmp/ollama.tar.zst \
  https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst
tar --zstd -xf /tmp/ollama.tar.zst
```

Queda en `~/.local/opt/ollama/bin/ollama` y los modelos en `~/.ollama/models`.

### El modelo

```bash
cd ~/.cache/ollama-dl
curl -fL -o Qwen3-8B-Q4_K_M.gguf \
  https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf
ollama create qwen3-local:8b -f Modelfile.qwen3
```

---

## 3. Dos obstáculos reales, y cómo se resolvieron

### El registro de Ollama es inalcanzable desde esta red

`ollama pull` falla siempre con `dial tcp 172.64.x.x:443: i/o timeout`. El
registro (`registry.ollama.ai`) responde, pero los blobs redirigen a
**Cloudflare R2** (`*.r2.cloudflarestorage.com`), que está bloqueado aquí.
GitHub y HuggingFace sí funcionan.

**Solución:** descargar el GGUF directamente de HuggingFace e importarlo con
`ollama create`. Por eso el Modelfile apunta a un fichero local en vez de a un
modelo del registro.

### Qwen2.5-Coder no sirve como agente

El primer modelo probado fue `qwen2.5-coder:7b`. Con la plantilla correcta y las
herramientas declaradas, devolvía la llamada **como texto** en vez de emitir el
formato que Ollama traduce a `tool_calls`:

```
contenido: ```xml <response><function_call>{"name": "read_file", ...}</function_call></response> ```
tool_calls: null
```

Con la API nativa pasaba lo mismo, así que no era un problema del endpoint
compatible con OpenAI: **el modelo no respeta el formato**. El harness necesita
`tool_calls` de verdad, así que se descartó y se pasó a Qwen3 8B, que sí los
emite:

```
tool_calls: [{"id": "RVP4PJe...", "function": {"name": "read_file",
              "arguments": {"path": "/etc/hostname"}}}]
```

---

## 4. Configuración

### `~/.dsh/settings.yaml`

```yaml
llm-pi-ai:
  providers:
    ollama-local:
      displayName: Ollama (local)
      api: openai-completions
      baseURL: http://127.0.0.1:11434/v1
      apiKeyEnv: OLLAMA_API_KEY
      models:
        - id: qwen3-local:8b
          name: Qwen3 8B · local
          contextWindow: 32768
          maxTokens: 8192
          reasoningEfforts: false
```

El fichero se **vigila en caliente** (`dsh-settings-file` tiene `watch: true`), así
que un cambio se aplica sin reiniciar DSH.

### `~/.dsh/.credentials.yaml`

`apiKeyEnv` es **obligatorio** aunque Ollama no autentique: sin una referencia de
credencial, pi-ai aborta con `PI_AI_ERROR: No API key for provider: ollama-local`.
Se guarda un marcador:

```yaml
refs:
  OLLAMA_API_KEY: ollama
```

### El contexto debe coincidir

`contextWindow` (DSH) y `PARAMETER num_ctx` (Modelfile) valen **32768** los dos.
Si Ollama sirviera menos contexto del que DSH cree, los prompts largos se
truncarían en silencio y el agente fallaría sin decir por qué.

---

## 5. Uso

### Desde la interfaz web

El modelo aparece en el selector como **«Qwen3 8B · local»** bajo el proveedor
**«Ollama (local)»**. No hay que hacer nada más: elegirlo y ya.

### Servicio

```bash
systemctl --user status  ollama-cloudterm     # estado
systemctl --user restart ollama-cloudterm     # reiniciar
systemctl --user stop    ollama-cloudterm     # parar
journalctl --user -u ollama-cloudterm -f      # logs
```

Está **habilitado**, así que arranca al iniciar sesión. No se activó
`loginctl enable-linger`, así que no corre si no hay sesión abierta.

### Añadir otro modelo

```bash
# Desde HuggingFace (el registro de Ollama no funciona en esta red)
cd ~/.cache/ollama-dl
curl -fL -O https://huggingface.co/<repo>/resolve/main/<fichero>.gguf
printf 'FROM %s\nPARAMETER num_ctx 32768\n' "$PWD/<fichero>.gguf" > Modelfile.nuevo
~/.local/opt/ollama/bin/ollama create mi-modelo:tag -f Modelfile.nuevo
```

Y añadir una entrada en `settings.yaml` bajo `models:` con el `id` que se le haya
dado.

---

## 6. Rendimiento medido

| | i5-12400F (12 hilos), sin GPU |
| --- | --- |
| Carga inicial del modelo | ~20 s |
| Llamada a herramienta sencilla | ~2 s |
| Tarea de agente completa (2 turnos, 1 herramienta) | **26 s** |

**La GPU está desaprovechada.** `nvidia-smi` falla con
`Failed to initialize NVML: Driver/library version mismatch` (NVML 615.71): el
módulo del kernel y la librería de usuario están desincronizados, algo que se
arregla **reiniciando**. La RTX 3060 tiene 11,6 GiB de VRAM, así que tras el
reinicio Qwen3 8B Q4 cabría entero y debería ir entre 5 y 15 veces más rápido —
Ollama detecta la GPU solo, sin tocar nada.

---

## 7. El modo «thinking» de Qwen3

Qwen3 razona antes de responder, y eso se ve en la salida (`dsh: reasoning: ...`).
Mejora la calidad, pero **consume tokens y tiempo**: en CPU un turno con
razonamiento largo puede multiplicar por diez la espera.

Se comprobó que las cuatro formas de desactivarlo funcionan en el endpoint
compatible con OpenAI:

| Qué se envía | Resultado |
| --- | --- |
| (nada) | `tool_calls` correctos |
| `reasoning_effort: "none"` | `tool_calls` correctos |
| `chat_template_kwargs: {enable_thinking: false}` | `tool_calls` correctos |
| `think: false` | `tool_calls` correctos |

Si el razonamiento resulta demasiado lento, la vía más limpia es crear una
variante del modelo con la plantilla forzando `enable_thinking = false` y apuntar
`settings.yaml` a ella.

---

## 8. Alternativas que no se probaron a fondo

| Modelo | Por qué podría interesar |
| --- | --- |
| `Qwen2.5-7B-Instruct` | Sin modo thinking: turnos más rápidos. Disponible en `bartowski/Qwen2.5-7B-Instruct-GGUF`. |
| `Hermes-3-Llama-3.1-8B` | Ajustado específicamente para function calling. |
| `Qwen3-14B` | Mejor calidad; cabría en RAM pero lento en CPU (y rápido en GPU tras el reinicio). |

---

## 9. Limitaciones

- **Sin GPU hasta que reinicies.** Es el mayor lastre ahora mismo.
- **`ollama pull` no funciona** en esta red: todo modelo nuevo hay que traerlo de
  HuggingFace e importarlo.
- **Un modelo de 8B no es DeepSeek V4.** Sirve para tareas acotadas y para
  trabajar sin conexión o con datos que no deban salir de la máquina; para trabajo
  pesado, la ruta de la nube sigue siendo muy superior.
- El puerto 11434 escucha **solo en loopback**, así que no se expone a la red.
