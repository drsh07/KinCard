"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { api } from "./shared";
import type { AiStatus } from "./shared";

export function GeminiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState<"status" | "check" | null>(null);
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  async function refreshStatus() {
    const request = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy("status");
    setStatus(null);
    setVerified(false);
    setNotice("");
    setError("");
    try {
      const result = await api("/api/ai/status", undefined, abort.signal);
      if (
        mounted.current &&
        requestId.current === request &&
        !abort.signal.aborted
      )
        setStatus(result);
    } catch (e) {
      if (
        mounted.current &&
        requestId.current === request &&
        !abort.signal.aborted
      )
        setError((e as Error).message);
    } finally {
      if (mounted.current && requestId.current === request) {
        setBusy(null);
        controller.current = null;
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    refreshStatus();
    return () => {
      mounted.current = false;
      requestId.current++;
      controller.current?.abort();
    };
  }, []);

  async function checkConnection() {
    const request = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy("check");
    setVerified(false);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/ai/check", {}, abort.signal);
      if (
        mounted.current &&
        requestId.current === request &&
        !abort.signal.aborted
      ) {
        setVerified(true);
        setStatus({ configured: true, model: result.model, mode: "gemini" });
        setNotice(result.notice);
      }
    } catch (e) {
      if (
        mounted.current &&
        requestId.current === request &&
        !abort.signal.aborted
      )
        setError((e as Error).message);
    } finally {
      if (mounted.current && requestId.current === request) {
        setBusy(null);
        controller.current = null;
      }
    }
  }

  return (
    <section
      className="panel gemini-status"
      aria-labelledby="gemini-status-title"
    >
      <div className="gemini-status-heading">
        <Sparkles size={21} />
        <div>
          <h2 id="gemini-status-title">Gemini connection</h2>
          <p role="status">
            {busy === "status"
              ? "Checking this app’s configuration…"
              : busy === "check"
                ? "Checking the connection with Gemini…"
                : verified
                  ? "Connection verified"
                  : status?.issue
                    ? "Configuration needs attention"
                    : status?.configured
                      ? "Key found · connection not checked"
                      : status
                        ? "Gemini not connected · add GEMINI_API_KEY"
                        : "Connection status unavailable"}
          </p>
        </div>
        {verified && <CheckCircle2 size={22} className="gemini-verified" />}
      </div>
      {status?.issue && <p className="inline-error">{status.issue}</p>}
      {status?.configured && (
        <p className="hint">
          Model: {status.model}. A saved key is only configuration; use Check
          connection to verify a response.
        </p>
      )}
      {status?.storage && (
        <p className="hint">
          Data storage:{" "}
          {status.storage === "databricks"
            ? "Databricks"
            : "local database (Databricks not configured)"}
          .
        </p>
      )}
      <p>
        Add your key to <code>.env.local</code> in the project folder, then stop
        and restart the app. Keep the key in that local file.
      </p>
      <div className="button-row">
        <button
          className="button secondary"
          type="button"
          disabled={!!busy}
          onClick={refreshStatus}
        >
          <RefreshCw size={15} />
          Refresh status
        </button>
        {status?.configured && (
          <button
            className="button"
            type="button"
            disabled={!!busy || !!status.issue}
            onClick={checkConnection}
          >
            {busy === "check" ? (
              <span className="spinner small" />
            ) : (
              <Sparkles size={15} />
            )}
            Check Gemini connection
          </button>
        )}
      </div>
      {notice && (
        <p className="gemini-result" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        Share a story below, review privacy, then select Generate draft care
        card. Gemini drafts are always reviewed by the family before they are
        published.
      </p>
    </section>
  );
}
