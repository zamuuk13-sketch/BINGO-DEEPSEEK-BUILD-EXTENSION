from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
import tkinter as tk
from tkinter import messagebox, ttk

from .agent_runtime import AgentRuntime

RELAY = "http://127.0.0.1:8766"


def request(method: str, path: str, payload=None, timeout=2):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(RELAY + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class DeepSeekChat(tk.Toplevel):
    """Desktop chat surface backed by DeepSeek plus the local Agent Runtime."""

    def __init__(self, master, project_name="", runtime: AgentRuntime | None = None):
        super().__init__(master)
        self.master_app = master
        self.title("BINGO • DeepSeek")
        self.geometry("820x680")
        self.minsize(650, 500)
        self.configure(bg="#0f1115")
        self.project_name = project_name
        self.runtime = runtime
        self.running = True
        self.connected = False
        self._build()
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.after(500, self.poll)
        self.connect()

    def _build(self):
        top = tk.Frame(self, bg="#171a21", height=54)
        top.pack(fill="x")
        top.pack_propagate(False)
        tk.Label(top, text="BINGO", bg="#171a21", fg="#f2f4f8", font=("Segoe UI", 14, "bold")).pack(side="left", padx=(16, 4))
        tk.Label(top, text="DEEPSEEK", bg="#171a21", fg="#55d187", font=("Segoe UI", 10, "bold")).pack(side="left")
        self.status = tk.Label(top, text="● desconectado", bg="#171a21", fg="#9299a8", font=("Segoe UI", 9))
        self.status.pack(side="right", padx=14)

        self.chat = tk.Text(self, bg="#0b0d11", fg="#e8ebf0", insertbackground="#55d187", relief="flat", wrap="word", font=("Segoe UI", 10), padx=16, pady=14, state="disabled")
        self.chat.pack(fill="both", expand=True, padx=10, pady=(10, 0))
        self.chat.tag_configure("user", foreground="#55d187", spacing1=10, spacing3=5)
        self.chat.tag_configure("assistant", foreground="#e8ebf0", spacing1=10, spacing3=12)
        self.chat.tag_configure("system", foreground="#9299a8", spacing1=8, spacing3=8)

        bottom = tk.Frame(self, bg="#171a21", height=92)
        bottom.pack(fill="x", padx=10, pady=10)
        self.input = tk.Text(bottom, height=3, bg="#0f1115", fg="#e8ebf0", insertbackground="#55d187", relief="flat", wrap="word", font=("Segoe UI", 10), padx=10, pady=8)
        self.input.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        self.input.bind("<Control-Return>", lambda _e: self.send())
        ttk.Button(bottom, text="Enviar\nCtrl+Enter", style="Bingo.TButton", command=self.send).pack(side="right", padx=8, pady=8)

    def add(self, speaker, text, tag):
        self.chat.configure(state="normal")
        self.chat.insert("end", f"{speaker}\n", tag)
        self.chat.insert("end", f"{text}\n\n", tag)
        self.chat.configure(state="disabled")
        self.chat.see("end")

    def connect(self):
        try:
            data = request("POST", "/connect", {"chat_name": self.project_name or "DeepSeek", "connection_id": f"desktop-{id(self)}"})
            self.connected = bool(data.get("connected"))
            self.status.config(text="● conectado" if self.connected else "● desconectado", fg="#55d187" if self.connected else "#9299a8")
            if self.runtime:
                self.runtime.record("deepseek.connect", data)
                self.add("BINGO", "Agent Runtime ativo. Contexto, memória, plano e permissões ficam fora do chat visível.", "system")
            else:
                self.add("BINGO", "Conexão DeepSeek estabelecida. O navegador ainda é o transporte da sessão nesta etapa.", "system")
        except (OSError, urllib.error.URLError) as exc:
            self.status.config(text="● relay offline", fg="#ff8f8f")
            self.add("BINGO", f"Relay offline: {exc}", "system")

    def send(self):
        text = self.input.get("1.0", "end-1c").strip()
        if not text:
            return
        try:
            if self.runtime:
                self.runtime.record("chat.user", {"text": text})
                # The full runtime context stays local. The browser remains the
                # transport in Stage 6; no system prompt is rendered in this UI.
            request("POST", "/send", {"text": text})
            self.input.delete("1.0", "end")
            self.add("Você", text, "user")
        except OSError as exc:
            messagebox.showerror("BINGO DeepSeek", f"Não foi possível enviar:\n{exc}")

    def poll(self):
        if not self.running:
            return
        try:
            while True:
                data = request("GET", "/inbound", timeout=1)
                msg = data.get("message")
                if not msg:
                    break
                text = msg.get("text", "")
                if self.runtime:
                    self.runtime.record("chat.assistant", {"text": text[-4000:]})
                self.add("DeepSeek", text, "assistant")
        except OSError:
            pass
        self.after(500, self.poll)

    def close(self):
        self.running = False
        if self.runtime:
            self.runtime.save()
        try:
            request("POST", "/disconnect", {})
        except OSError:
            pass
        self.destroy()
