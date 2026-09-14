// CloudTerm · github.com/pilahito/cloudterm
// © 2026 DavidPilahito7 · AGPL-3.0-or-later · Ver LICENSE

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Eraser,
  Wand2,
  Copy,
  Square,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Settings2,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { useAiStore } from "../../stores/aiStore";
import { splitMarkdown } from "../../lib/ai";
import { copyToClipboard } from "../../lib/links";
import { cx } from "../../lib/utils";
import { useT } from "../../i18n";

const SUGGESTIONS = [
  "ai.suggestionSystemctl",
  "ai.suggestionPorts",
  "ai.suggestionPermissions",
  "ai.suggestionCompose",
];

/** Markdown ligero: bloques de código cercados y prosa. */
function MessageBody({ text }: { text: string }) {
  const blocks = splitMarkdown(text);
  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <pre
            key={index}
            className="my-1.5 overflow-x-auto rounded-md border border-border bg-bg/70 p-2 font-mono text-[10px] leading-relaxed text-text"
          >
            {block.code}
          </pre>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {block.text}
          </p>
        ),
      )}
    </>
  );
}

export function AIPanel() {
  const t = useT();
  const aiEnabled = useSettingsStore((s) => s.settings.aiEnabled);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const pushToast = useUiStore((s) => s.pushToast);

  const config = useAiStore((s) => s.config);
  const messages = useAiStore((s) => s.messages);
  const models = useAiStore((s) => s.models);
  const streaming = useAiStore((s) => s.streaming);
  const streamId = useAiStore((s) => s.streamId);
  const error = useAiStore((s) => s.error);
  const load = useAiStore((s) => s.load);
  const send = useAiStore((s) => s.send);
  const cancel = useAiStore((s) => s.cancel);
  const clear = useAiStore((s) => s.clear);
  const listen = useAiStore((s) => s.listen);
  const refreshModels = useAiStore((s) => s.refreshModels);
  const setProviderModel = useAiStore((s) => s.setProviderModel);
  const updateConfig = useAiStore((s) => s.updateConfig);

  const [draft, setDraft] = useState("");
  const [showModels, setShowModels] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // El evento de fragmentos se engancha una sola vez por panel montado.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let disposed = false;
    void listen().then((off) => {
      if (disposed) off();
      else stop = off;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [listen]);

  // Autoscroll mientras llega texto.
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, streaming]);

  const provider = config?.providers.find((item) => item.id === config.activeId);
  const busy = Boolean(streamId);

  const submit = (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    if (!aiEnabled) {
      pushToast("warning", t("ai.disabledTitle"), t("ai.disabledDescription"));
      return;
    }
    setDraft("");
    void send(content);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles size={13} className="text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t("ai.title")}
        </span>

        {provider && (
          <span
            className={cx(
              "ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
              streamId
                ? "bg-accent/20 text-accent"
                : error
                  ? "bg-danger/20 text-danger"
                  : "bg-border/60 text-muted",
            )}
            title={provider.baseUrl}
          >
            {streamId && <Loader2 size={9} className="animate-spin" />}
            {provider.label}
          </span>
        )}

        <button
          type="button"
          title={t("ai.clearChat")}
          aria-label={t("ai.clearChat")}
          onClick={clear}
          className={cx(
            "grid h-6 w-6 place-items-center rounded text-muted hover:bg-elevated hover:text-text",
            !provider && "ml-auto",
          )}
        >
          <Eraser size={12} />
        </button>
      </div>

      {/* Selector de proveedor y modelo */}
      {provider && (
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
          <select
            value={provider.id}
            onChange={(event) => void updateConfig({ activeId: event.target.value })}
            className="min-w-0 rounded-md border border-border bg-bg/60 px-1.5 py-1 text-[10px] text-text focus:border-accent/60 focus:outline-none"
          >
            {config?.providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          <input
            value={provider.model}
            onChange={(event) => void setProviderModel(event.target.value)}
            placeholder={t("ai.modelPlaceholder")}
            list="ai-model-options"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg/60 px-1.5 py-1 font-mono text-[10px] text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />
          <datalist id="ai-model-options">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>

          <button
            type="button"
            title={t("ai.viewModels")}
            aria-label={t("ai.viewModels")}
            onClick={() => {
              setShowModels((value) => !value);
              void refreshModels();
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
          >
            <RefreshCw size={11} />
          </button>
          <button
            type="button"
            title={t("ai.settings")}
            aria-label={t("ai.settings")}
            onClick={() => setSettingsOpen(true)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:bg-elevated hover:text-text"
          >
            <Settings2 size={11} />
          </button>
        </div>
      )}

      {showModels && models.length > 0 && (
        <div className="max-h-24 overflow-y-auto border-b border-border px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {models.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => {
                  void setProviderModel(model);
                  setShowModels(false);
                }}
                className={cx(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                  model === provider?.model
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted hover:text-text",
                )}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {!provider && (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <AlertTriangle size={20} className="text-warning" />
            <p className="text-[11px] leading-relaxed text-muted">
              {t("ai.configLoadFailed")}
            </p>
          </div>
        )}

        {provider && messages.length === 0 && !streaming && (
          <div className="space-y-1.5 pt-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Wand2 size={12} /> {t("ai.tryWith")}
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(t(suggestion))}
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-left text-[11px] text-muted transition-colors hover:border-accent/60 hover:text-text"
              >
                {t(suggestion)}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={cx(
              "group relative rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
              message.role === "user"
                ? "ml-4 border-accent/40 bg-accent/10 text-text"
                : "mr-2 border-border bg-bg/50 text-muted",
            )}
          >
            <MessageBody text={message.content} />
            {message.role === "assistant" && (
              <button
                type="button"
                title={t("common.copy")}
                aria-label={t("ai.copyResponse")}
                onClick={() =>
                  void copyToClipboard(message.content).then((ok) =>
                    pushToast(
                      ok ? "success" : "warning",
                      ok ? t("common.copied") : t("common.copyManual"),
                    ),
                  )
                }
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded text-muted opacity-0 transition-opacity hover:bg-border hover:text-text group-hover:opacity-100"
              >
                <Copy size={10} />
              </button>
            )}
          </div>
        ))}

        {/* Respuesta en curso */}
        {streaming && (
          <div className="mr-2 rounded-lg border border-accent/40 bg-accent/5 px-2.5 py-2 text-[11px] leading-relaxed text-text">
            <MessageBody text={streaming} />
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" />
          </div>
        )}

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[10px] leading-relaxed text-danger">
            {error}
          </p>
        )}
      </div>

      {/* Entrada */}
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-1.5 rounded-md border border-border bg-bg/60 p-1.5 focus-within:border-accent/60">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            rows={2}
            placeholder={
              !aiEnabled
                ? t("ai.placeholderDisabled")
                : busy
                  ? t("ai.placeholderBusy")
                  : t("ai.placeholderIdle")
            }
            className="max-h-32 w-full resize-none bg-transparent text-[11px] text-text placeholder:text-muted focus:outline-none"
          />

          {busy ? (
            <button
              type="button"
              onClick={() => void cancel()}
              title={t("common.cancel")}
              aria-label={t("common.cancel")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-danger text-danger transition-colors hover:bg-danger hover:text-white"
            >
              <Square size={11} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(draft)}
              disabled={!aiEnabled}
              title={t("ai.send")}
              aria-label={t("ai.send")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accentfg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AIPanel;
