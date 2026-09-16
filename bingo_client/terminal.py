from __future__ import annotations

import os
import queue
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk


class TerminalPanel(tk.Frame):
    """Integrated Windows terminal for the BINGO Client."""

    def __init__(self, master, get_cwd=None, on_status=None, **kwargs):
        super().__init__(master, bg="#0f1115", **kwargs)
        self.get_cwd = get_cwd or (lambda: Path.cwd())
        self.on_status = on_status or (lambda _text: None)
        self.process: subprocess.Popen | None = None
        self.output_queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self._build()
        self.after(60, self._drain_output)

    def _build(self):
        top = tk.Frame(self, bg="#171a21", height=38)
        top.pack(fill="x", side="top")
        top.pack_propagate(False)
        tk.Label(top, text="TERMINAL", bg="#171a21", fg="#9299a8", font=("Segoe UI", 9, "bold")).pack(side="left", padx=12)
        self.cwd_label = tk.Label(top, text="", bg="#171a21", fg="#55d187", font=("Consolas", 9))
        self.cwd_label.pack(side="left", padx=8)
        ttk.Button(top, text="Limpar", style="Bingo.TButton", command=self.clear).pack(side="right", padx=4, pady=4)
        ttk.Button(top, text="Parar", style="Bingo.TButton", command=self.stop).pack(side="right", padx=4, pady=4)

        self.output = tk.Text(self, bg="#0b0d11", fg="#d9dde5", insertbackground="#55d187", relief="flat", wrap="none", font=("Consolas", 10), padx=10, pady=8)
        self.output.pack(fill="both", expand=True)
        self.output.tag_configure("stdout", foreground="#d9dde5")
        self.output.tag_configure("stderr", foreground="#ff8f8f")
        self.output.tag_configure("system", foreground="#55d187")
        self.output.bind("<Control-l>", lambda _e: self.clear() or "break")

        bottom = tk.Frame(self, bg="#171a21", height=38)
        bottom.pack(fill="x", side="bottom")
        bottom.pack_propagate(False)
        self.command = ttk.Entry(bottom)
        self.command.pack(side="left", fill="x", expand=True, padx=8, pady=7)
        self.command.bind("<Return>", lambda _e: self.run_command())
        ttk.Button(bottom, text="Executar", style="Bingo.TButton", command=self.run_command).pack(side="right", padx=7, pady=5)
        self._refresh_cwd()

    def _refresh_cwd(self):
        try:
            cwd = Path(self.get_cwd()).resolve()
            self.cwd_label.config(text=str(cwd))
        except Exception:
            self.cwd_label.config(text="Workspace não definido")

    def write(self, text: str, tag="stdout"):
        self.output.insert("end", text, tag)
        self.output.see("end")

    def clear(self):
        self.output.delete("1.0", "end")
        self.on_status("Terminal limpo")

    def run_command(self):
        command = self.command.get().strip()
        if not command:
            return
        if self.process and self.process.poll() is None:
            self.write("\n[processo em execução — use Parar antes de iniciar outro]\n", "stderr")
            return
        try:
            cwd = Path(self.get_cwd()).resolve()
            if not cwd.is_dir():
                raise FileNotFoundError("O workspace atual não existe.")
        except Exception as exc:
            messagebox.showerror("BINGO Terminal", str(exc))
            return

        self.command.delete(0, "end")
        self.write(f"\n> {command}\n", "system")
        self._refresh_cwd()
        self.on_status(f"Executando: {command}")

        def worker():
            try:
                creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                self.process = subprocess.Popen(
                    ["cmd.exe", "/d", "/s", "/c", command],
                    cwd=str(cwd),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    creationflags=creationflags,
                )
                threads = []
                for stream, tag in ((self.process.stdout, "stdout"), (self.process.stderr, "stderr")):
                    thread = threading.Thread(target=self._read_stream, args=(stream, tag), daemon=True)
                    thread.start()
                    threads.append(thread)
                code = self.process.wait()
                for thread in threads:
                    thread.join(timeout=0.3)
                self.output_queue.put(("system", f"\n[processo encerrado: código {code}]\n"))
            except Exception as exc:
                self.output_queue.put(("stderr", f"\n[erro ao executar: {exc}]\n"))
            finally:
                self.process = None

        threading.Thread(target=worker, daemon=True).start()

    def _read_stream(self, stream, tag):
        if stream is None:
            return
        try:
            for line in iter(stream.readline, ""):
                if line:
                    self.output_queue.put((tag, line))
        finally:
            try:
                stream.close()
            except Exception:
                pass

    def _drain_output(self):
        try:
            while True:
                tag, text = self.output_queue.get_nowait()
                self.write(text, tag)
        except queue.Empty:
            pass
        self.after(60, self._drain_output)

    def stop(self):
        process = self.process
        if not process or process.poll() is not None:
            self.on_status("Nenhum processo em execução")
            return
        try:
            process.terminate()
            self.write("\n[processo interrompido pelo usuário]\n", "system")
            self.on_status("Processo interrompido")
        except OSError as exc:
            self.write(f"\n[erro ao parar: {exc}]\n", "stderr")
