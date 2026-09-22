import { useState } from "react";
import { detectarHardware, recomendarModelo, modelosCompatibles, type HardwareInfo, type ModeloSugerido } from "../../lib/aiHardware";

/**
 * Panel "Detectar hardware": mira RAM, nucleos y espacio libre del dispositivo y
 * dice que modelo local (GGUF para llama.cpp) puede mover, con enlace de descarga.
 */
export function HardwarePanel() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [elegido, setElegido] = useState<ModeloSugerido | null>(null);
  const [opciones, setOpciones] = useState<ModeloSugerido[]>([]);
  const [mirando, setMirando] = useState(false);

  async function detectar() {
    setMirando(true);
    try {
      const info = await detectarHardware();
      setHardware(info);
      setElegido(recomendarModelo(info));
      setOpciones(modelosCompatibles(info));
    } finally {
      setMirando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Modelo local (llama.cpp)</div>
          <div className="text-xs opacity-70">
            Se mira la RAM, los núcleos y el espacio libre para elegir el modelo que tu móvil aguanta.
          </div>
        </div>
        <button type="button" className="rounded-md border border-white/15 px-3 py-1.5 text-sm" onClick={() => void detectar()}>
          {mirando ? "Mirando…" : "Detectar hardware"}
        </button>
      </div>

      {hardware && (
        <div className="text-xs opacity-80">
          {hardware.ramGb} GB de RAM · {hardware.nucleos} núcleos · {hardware.libreGb} GB libres · {hardware.arquitectura}
        </div>
      )}

      {elegido && (
        <div className="flex flex-col gap-1">
          <div className="text-sm">
            Recomendado: <strong>{elegido.nombre}</strong> ({elegido.cuantizacion}, {elegido.tamanoGb} GB, contexto {elegido.contexto})
          </div>
          <div className="text-xs opacity-70">{elegido.motivo}</div>
          <div className="flex gap-2">
            <a className="rounded-md border border-white/15 px-3 py-1.5 text-sm" href={elegido.url} target="_blank" rel="noreferrer">
              Descargar modelo
            </a>
            {opciones.length > 1 && (
              <select
                className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-sm"
                value={elegido.id}
                onChange={(evento) => {
                  const otro = opciones.find((modelo) => modelo.id === evento.target.value);
                  if (otro) {
                    setElegido(otro);
                  }
                }}
              >
                {opciones.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.nombre} · {modelo.tamanoGb} GB
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="text-xs opacity-60">
            Luego arráncalo con: llama-server -m modelo.gguf --host 127.0.0.1 --port 8080 -c {elegido.contexto}
          </div>
        </div>
      )}
    </div>
  );
}

export default HardwarePanel;
