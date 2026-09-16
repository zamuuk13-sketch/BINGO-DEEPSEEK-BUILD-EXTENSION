from __future__ import annotations

import json
import os
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import APP_NAME, APP_VERSION


APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "BingoClient"
CONFIG_FILE = APP_DIR / "config.json"


DEFAULT_CONFIG = {
    "theme": "dark",
    "last_project": "",
    "deepseek": {
        "status": "disconnected",
        "chat_name": "",
        "connection_id": "",
    },
    "permissions": {
        "scope": "project",
        "terminal": False,
        "internet": "approval",
        "installations": "approval",
        "computer": False,
    },
}


class ConfigStore:
    def __init__(self, path: Path = CONFIG_FILE):
        self.path = path
        self.data = self._load()

    def _load(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._save(DEFAULT_CONFIG.copy())
            return json.loads(json.dumps(DEFAULT_CONFIG))
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            merged = json.loads(json.dumps(DEFAULT_CONFIG))
            self._merge(merged, data)
            return merged
        except (OSError, json.JSONDecodeError):
            return json.loads(json.dumps(DEFAULT_CONFIG))

    def _merge(self, target, source):
        for key, value in source.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                self._merge(target[key], value)
            else:
                target[key] = value

    def _save(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def save(self):
        self._save(self.data)


class BingoClient(tk.Tk):
    BG = "#0f1115"
    PANEL = "#171a21"
    PANEL_2 = "#1d212a"
    BORDER = "#2b313d"
    TEXT = "#f2f4f8"
    MUTED = "#9299a8"
    ACCENT = "#55d187"

    def __init__(self):
        super().__init__()
        self.config_store = ConfigStore()
        self.project_path: Path | None = None
        self.project_name = "Nenhum projeto"

        self.title(f"{APP_NAME}  •  Foundation {APP_VERSION}")
        self.geometry("1280x760")
        self.minsize(1000, 620)
        self.configure(bg=self.BG)
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        self._configure_ttk()
        self._build_ui()
        self._restore_project()

    def _configure_ttk(self):
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Bingo.TButton", background=self.PANEL_2, foreground=self.TEXT,
                        bordercolor=self.BORDER, padding=(12, 8), relief="flat")
        style.map("Bingo.TButton", background=[("active", "#272d38")])
        style.configure("Bingo.Treeview", background=self.PANEL, foreground=self.TEXT,
                        fieldbackground=self.PANEL, bordercolor=self.BORDER, rowheight=28)
        style.map("Bingo.Treeview", background=[("selected", "#27372f")],
                  foreground=[("selected", self.TEXT)])

    def _build_ui(self):
        top = tk.Frame(self, bg=self.PANEL, height=54)
        top.pack(fill="x", side="top")
        top.pack_propagate(False)

        tk.Label(top, text="BINGO", bg=self.PANEL, fg=self.TEXT,
                 font=("Segoe UI", 16, "bold")).pack(side="left", padx=(18, 4))
        tk.Label(top, text="CLIENT", bg=self.PANEL, fg=self.ACCENT,
                 font=("Segoe UI", 10, "bold")).pack(side="left", padx=(0, 20))

        self.project_label = tk.Label(top, text="Nenhum projeto aberto", bg=self.PANEL,
                                      fg=self.MUTED, font=("Segoe UI", 10))
        self.project_label.pack(side="left")

        ttk.Button(top, text="Abrir pasta", style="Bingo.TButton",
                   command=self.choose_project).pack(side="right", padx=8, pady=9)
        ttk.Button(top, text="Configurações", style="Bingo.TButton",
                   command=self.show_settings).pack(side="right", padx=0, pady=9)

        body = tk.Frame(self, bg=self.BG)
        body.pack(fill="both", expand=True, padx=10, pady=10)

        explorer = tk.Frame(body, bg=self.PANEL, width=245,
                            highlightbackground=self.BORDER, highlightthickness=1)
        explorer.pack(side="left", fill="y")
        explorer.pack_propagate(False)

        tk.Label(explorer, text="EXPLORER", bg=self.PANEL, fg=self.MUTED,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        self.tree = ttk.Treeview(explorer, style="Bingo.Treeview", show="tree")
        self.tree.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.tree.insert("", "end", text="📁  Nenhum projeto", open=True)

        center = tk.Frame(body, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1)
        center.pack(side="left", fill="both", expand=True, padx=10)

        self.editor_title = tk.Label(center, text="BINGO Workspace", bg=self.PANEL,
                                     fg=self.TEXT, font=("Segoe UI", 11, "bold"))
        self.editor_title.pack(anchor="w", padx=16, pady=(14, 8))

        welcome = tk.Frame(center, bg=self.PANEL_2)
        welcome.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        tk.Label(welcome, text="BINGO Client", bg=self.PANEL_2, fg=self.TEXT,
                 font=("Segoe UI", 25, "bold")).pack(pady=(80, 8))
        tk.Label(welcome, text="Foundation • Etapa 1", bg=self.PANEL_2, fg=self.ACCENT,
                 font=("Segoe UI", 11, "bold")).pack()
        tk.Label(welcome,
                 text="Abra uma pasta local para iniciar um workspace.\n"
                      "O chat, agente, permissões e terminal serão conectados nas próximas etapas.",
                 bg=self.PANEL_2, fg=self.MUTED, justify="center",
                 font=("Segoe UI", 10)).pack(pady=18)
        ttk.Button(welcome, text="Escolher pasta do projeto", style="Bingo.TButton",
                   command=self.choose_project).pack()

        right = tk.Frame(body, bg=self.PANEL, width=310,
                         highlightbackground=self.BORDER, highlightthickness=1)
        right.pack(side="right", fill="y")
        right.pack_propagate(False)

        tk.Label(right, text="AGENT STATUS", bg=self.PANEL, fg=self.MUTED,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        status = tk.Frame(right, bg=self.PANEL_2)
        status.pack(fill="x", padx=12)
        tk.Label(status, text="●", bg=self.PANEL_2, fg=self.MUTED,
                 font=("Segoe UI", 14)).pack(side="left", padx=(12, 7), pady=10)
        tk.Label(status, text="DeepSeek desconectado", bg=self.PANEL_2, fg=self.TEXT,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=10)

        tk.Label(right, text="WORKSPACE", bg=self.PANEL, fg=self.MUTED,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(20, 8))
        self.workspace_value = tk.Label(right, text="Nenhuma pasta selecionada", bg=self.PANEL_2,
                                        fg=self.MUTED, justify="left", anchor="w", wraplength=270)
        self.workspace_value.pack(fill="x", padx=12, ipady=12, ipadx=10)

        bottom = tk.Frame(self, bg=self.PANEL, height=30)
        bottom.pack(fill="x", side="bottom")
        bottom.pack_propagate(False)
        self.status_label = tk.Label(bottom, text="BINGO Client pronto", bg=self.PANEL,
                                     fg=self.MUTED, font=("Segoe UI", 8))
        self.status_label.pack(side="left", padx=12)
        tk.Label(bottom, text=f"Foundation {APP_VERSION} • Python", bg=self.PANEL,
                 fg=self.MUTED, font=("Segoe UI", 8)).pack(side="right", padx=12)

    def _restore_project(self):
        raw = self.config_store.data.get("last_project", "")
        if raw and Path(raw).is_dir():
            self.open_project(Path(raw))

    def choose_project(self):
        selected = filedialog.askdirectory(title="Escolha a pasta do projeto")
        if selected:
            self.open_project(Path(selected))

    def open_project(self, path: Path):
        self.project_path = path.resolve()
        self.project_name = self.project_path.name or str(self.project_path)
        self.config_store.data["last_project"] = str(self.project_path)
        self.config_store.save()
        self.project_label.config(text=self.project_name)
        self.workspace_value.config(text=str(self.project_path), fg=self.TEXT)
        self.status_label.config(text=f"Workspace aberto: {self.project_path}")
        self._refresh_tree()

    def _refresh_tree(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        if not self.project_path:
            self.tree.insert("", "end", text="📁  Nenhum projeto")
            return
        root = self.tree.insert("", "end", text=f"📁  {self.project_path.name}", open=True)
        try:
            entries = sorted(self.project_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
            for entry in entries[:250]:
                icon = "📄" if entry.is_file() else "📁"
                self.tree.insert(root, "end", text=f"{icon}  {entry.name}")
        except OSError as exc:
            self.status_label.config(text=f"Não foi possível listar a pasta: {exc}")

    def show_settings(self):
        dialog = tk.Toplevel(self)
        dialog.title("BINGO Client • Configurações")
        dialog.geometry("500x330")
        dialog.resizable(False, False)
        dialog.configure(bg=self.BG)
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(dialog, text="Configurações", bg=self.BG, fg=self.TEXT,
                 font=("Segoe UI", 17, "bold")).pack(anchor="w", padx=24, pady=(22, 4))
        tk.Label(dialog, text="A Etapa 1 prepara o armazenamento das futuras permissões do agente.",
                 bg=self.BG, fg=self.MUTED, font=("Segoe UI", 9)).pack(anchor="w", padx=24)

        box = tk.Frame(dialog, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1)
        box.pack(fill="x", padx=24, pady=20)
        tk.Label(box, text="Sessão DeepSeek", bg=self.PANEL, fg=self.TEXT,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=14, pady=(14, 4))
        tk.Label(box, text="Desconectado • conexão será implementada na Etapa 5",
                 bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9)).pack(anchor="w", padx=14, pady=(0, 14))

        tk.Label(box, text="Escopo de acesso", bg=self.PANEL, fg=self.TEXT,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=14, pady=(0, 4))
        scope = tk.StringVar(value=self.config_store.data["permissions"]["scope"])
        ttk.Combobox(box, textvariable=scope, values=("project", "computer"), state="readonly")\
            .pack(anchor="w", padx=14, pady=(0, 14))

        def save_and_close():
            self.config_store.data["permissions"]["scope"] = scope.get()
            self.config_store.save()
            dialog.destroy()
            self.status_label.config(text="Configurações salvas")

        ttk.Button(dialog, text="Salvar", style="Bingo.TButton", command=save_and_close).pack(anchor="e", padx=24)

    def on_close(self):
        self.config_store.save()
        self.destroy()


def main():
    app = BingoClient()
    app.mainloop()


if __name__ == "__main__":
    main()
