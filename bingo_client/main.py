from __future__ import annotations

import json
import os
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import APP_NAME, APP_VERSION
from .workspace import Workspace

APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "BingoClient"
CONFIG_FILE = APP_DIR / "config.json"

DEFAULT_CONFIG = {
    "theme": "dark", "last_project": "",
    "deepseek": {"status": "disconnected", "chat_name": "", "connection_id": ""},
    "permissions": {"scope": "project", "terminal": False, "internet": "approval", "installations": "approval", "computer": False},
}


class ConfigStore:
    def __init__(self, path: Path = CONFIG_FILE):
        self.path = path
        self.data = self._load()

    def _load(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            data = json.loads(json.dumps(DEFAULT_CONFIG)); self._save(data); return data
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            merged = json.loads(json.dumps(DEFAULT_CONFIG)); self._merge(merged, data); return merged
        except (OSError, json.JSONDecodeError):
            return json.loads(json.dumps(DEFAULT_CONFIG))

    def _merge(self, target, source):
        for key, value in source.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict): self._merge(target[key], value)
            else: target[key] = value

    def _save(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def save(self): self._save(self.data)


class BingoClient(tk.Tk):
    BG, PANEL, PANEL_2, BORDER = "#0f1115", "#171a21", "#1d212a", "#2b313d"
    TEXT, MUTED, ACCENT = "#f2f4f8", "#9299a8", "#55d187"

    def __init__(self):
        super().__init__()
        self.config_store = ConfigStore()
        self.project_path: Path | None = None
        self.workspace: Workspace | None = None
        self.project_name = "Nenhum projeto"
        self.title(f"{APP_NAME}  •  Workspace {APP_VERSION}")
        self.geometry("1280x760"); self.minsize(1000, 620); self.configure(bg=self.BG)
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self._configure_ttk(); self._build_ui(); self._restore_project()

    def _configure_ttk(self):
        style = ttk.Style(self)
        try: style.theme_use("clam")
        except tk.TclError: pass
        style.configure("Bingo.TButton", background=self.PANEL_2, foreground=self.TEXT, bordercolor=self.BORDER, padding=(12, 8), relief="flat")
        style.map("Bingo.TButton", background=[("active", "#272d38")])
        style.configure("Bingo.Treeview", background=self.PANEL, foreground=self.TEXT, fieldbackground=self.PANEL, bordercolor=self.BORDER, rowheight=28)
        style.map("Bingo.Treeview", background=[("selected", "#27372f")], foreground=[("selected", self.TEXT)])

    def _build_ui(self):
        top = tk.Frame(self, bg=self.PANEL, height=54); top.pack(fill="x", side="top"); top.pack_propagate(False)
        tk.Label(top, text="BINGO", bg=self.PANEL, fg=self.TEXT, font=("Segoe UI", 16, "bold")).pack(side="left", padx=(18, 4))
        tk.Label(top, text="CLIENT", bg=self.PANEL, fg=self.ACCENT, font=("Segoe UI", 10, "bold")).pack(side="left", padx=(0, 20))
        self.project_label = tk.Label(top, text="Nenhum projeto aberto", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 10)); self.project_label.pack(side="left")
        ttk.Button(top, text="Abrir pasta", style="Bingo.TButton", command=self.choose_project).pack(side="right", padx=8, pady=9)
        ttk.Button(top, text="Configurações", style="Bingo.TButton", command=self.show_settings).pack(side="right", pady=9)

        body = tk.Frame(self, bg=self.BG); body.pack(fill="both", expand=True, padx=10, pady=10)
        explorer = tk.Frame(body, bg=self.PANEL, width=270, highlightbackground=self.BORDER, highlightthickness=1); explorer.pack(side="left", fill="y"); explorer.pack_propagate(False)
        tk.Label(explorer, text="EXPLORER", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        tools = tk.Frame(explorer, bg=self.PANEL); tools.pack(fill="x", padx=8, pady=(0, 6))
        for label, command in (("+ Arquivo", self.new_file), ("+ Pasta", self.new_folder), ("Renomear", self.rename_selected), ("Excluir", self.delete_selected), ("↻", self._refresh_tree)):
            ttk.Button(tools, text=label, style="Bingo.TButton", command=command).pack(side="left", padx=2)
        self.tree = ttk.Treeview(explorer, style="Bingo.Treeview", show="tree"); self.tree.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.tree.bind("<Double-1>", self.on_tree_open); self.tree.bind("<Button-3>", self.on_tree_context)
        self.tree.insert("", "end", iid="empty", text="📁  Nenhum projeto", open=True)

        center = tk.Frame(body, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1); center.pack(side="left", fill="both", expand=True, padx=10)
        self.editor_title = tk.Label(center, text="BINGO Workspace", bg=self.PANEL, fg=self.TEXT, font=("Segoe UI", 11, "bold")); self.editor_title.pack(anchor="w", padx=16, pady=(14, 8))
        welcome = tk.Frame(center, bg=self.PANEL_2); welcome.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        tk.Label(welcome, text="Workspace pronto", bg=self.PANEL_2, fg=self.TEXT, font=("Segoe UI", 23, "bold")).pack(pady=(70, 8))
        self.center_info = tk.Label(welcome, text="Escolha uma pasta para começar.", bg=self.PANEL_2, fg=self.MUTED, justify="center", font=("Segoe UI", 10)); self.center_info.pack(pady=12)
        ttk.Button(welcome, text="Escolher pasta do projeto", style="Bingo.TButton", command=self.choose_project).pack()

        right = tk.Frame(body, bg=self.PANEL, width=310, highlightbackground=self.BORDER, highlightthickness=1); right.pack(side="right", fill="y"); right.pack_propagate(False)
        tk.Label(right, text="AGENT STATUS", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        status = tk.Frame(right, bg=self.PANEL_2); status.pack(fill="x", padx=12)
        tk.Label(status, text="●", bg=self.PANEL_2, fg=self.MUTED, font=("Segoe UI", 14)).pack(side="left", padx=(12, 7), pady=10)
        tk.Label(status, text="DeepSeek desconectado", bg=self.PANEL_2, fg=self.TEXT, font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=10)
        tk.Label(right, text="WORKSPACE", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(20, 8))
        self.workspace_value = tk.Label(right, text="Nenhuma pasta selecionada", bg=self.PANEL_2, fg=self.MUTED, justify="left", anchor="w", wraplength=270); self.workspace_value.pack(fill="x", padx=12, ipady=12, ipadx=10)
        tk.Label(right, text="ITENS", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(20, 8))
        self.item_count = tk.Label(right, text="0 itens", bg=self.PANEL_2, fg=self.MUTED, anchor="w"); self.item_count.pack(fill="x", padx=12, ipady=10, ipadx=10)

        bottom = tk.Frame(self, bg=self.PANEL, height=30); bottom.pack(fill="x", side="bottom"); bottom.pack_propagate(False)
        self.status_label = tk.Label(bottom, text="BINGO Client pronto", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 8)); self.status_label.pack(side="left", padx=12)
        tk.Label(bottom, text=f"Workspace • Python • {APP_VERSION}", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 8)).pack(side="right", padx=12)

    def _restore_project(self):
        raw = self.config_store.data.get("last_project", "")
        if raw and Path(raw).is_dir(): self.open_project(Path(raw))

    def choose_project(self):
        selected = filedialog.askdirectory(title="Escolha a pasta do projeto")
        if selected: self.open_project(Path(selected))

    def open_project(self, path: Path):
        self.project_path = path.resolve(); self.workspace = Workspace(self.project_path); self.project_name = self.project_path.name or str(self.project_path)
        self.config_store.data["last_project"] = str(self.project_path); self.config_store.save()
        self.project_label.config(text=self.project_name); self.workspace_value.config(text=str(self.project_path), fg=self.TEXT)
        self.center_info.config(text=f"Workspace ativo: {self.project_name}\n\nUse o Explorer para criar, renomear, excluir e abrir arquivos.")
        self.status_label.config(text=f"Workspace aberto: {self.project_path}"); self._refresh_tree()

    def _refresh_tree(self):
        for item in self.tree.get_children(): self.tree.delete(item)
        if not self.workspace:
            self.tree.insert("", "end", iid="empty", text="📁  Nenhum projeto", open=True); self.item_count.config(text="0 itens"); return
        root_id = "root"; self.tree.insert("", "end", iid=root_id, text=f"📁  {self.project_path.name}", open=True, values=(str(self.project_path),))
        count = 0
        try:
            for entry in self.workspace.list_children():
                self._insert_entry(root_id, entry, depth=0); count += 1
            self.item_count.config(text=f"{count} itens na raiz")
        except OSError as exc: self.status_label.config(text=f"Erro ao listar workspace: {exc}")

    def _insert_entry(self, parent_id, entry: Path, depth=0):
        iid = f"path:{entry}"
        if entry.is_dir():
            self.tree.insert(parent_id, "end", iid=iid, text=f"📁  {entry.name}", open=False, values=(str(entry),))
            self.tree.insert(iid, "end", iid=f"dummy:{entry}", text="carregando…")
        else:
            self.tree.insert(parent_id, "end", iid=iid, text=f"📄  {entry.name}", values=(str(entry),))

    def _expand_directory(self, item_id):
        if not self.workspace: return
        children = self.tree.get_children(item_id)
        if len(children) == 1 and str(children[0]).startswith("dummy:"):
            self.tree.delete(children[0])
            path = Path(self.tree.item(item_id, "values")[0])
            try:
                for entry in self.workspace.list_children(path): self._insert_entry(item_id, entry)
            except OSError: pass

    def on_tree_open(self, _event):
        item = self.tree.focus()
        if not item or not self.workspace: return
        values = self.tree.item(item, "values")
        if not values: return
        path = Path(values[0])
        if path.is_dir(): self._expand_directory(item)
        else: self.open_file(path)

    def on_tree_context(self, event):
        item = self.tree.identify_row(event.y)
        if item: self.tree.selection_set(item); self.tree.focus(item)

    def _selected_path(self):
        if not self.workspace: return None
        item = self.tree.focus()
        if not item: return None
        values = self.tree.item(item, "values")
        return Path(values[0]) if values else None

    def new_file(self):
        if not self.workspace: return messagebox.showinfo("Workspace", "Abra uma pasta primeiro.")
        name = self._ask_name("Novo arquivo", "Nome do arquivo:")
        if not name: return
        selected = self._selected_path(); base = selected if selected and selected.is_dir() else self.project_path
        try: self.workspace.create_file(str(base.relative_to(self.project_path) / name)); self._refresh_tree(); self.status_label.config(text=f"Arquivo criado: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))

    def new_folder(self):
        if not self.workspace: return messagebox.showinfo("Workspace", "Abra uma pasta primeiro.")
        name = self._ask_name("Nova pasta", "Nome da pasta:")
        if not name: return
        selected = self._selected_path(); base = selected if selected and selected.is_dir() else self.project_path
        try: self.workspace.create_folder(str(base.relative_to(self.project_path) / name)); self._refresh_tree(); self.status_label.config(text=f"Pasta criada: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))

    def rename_selected(self):
        path = self._selected_path()
        if not path or path == self.project_path: return
        name = self._ask_name("Renomear", "Novo nome:", path.name)
        if not name: return
        try: self.workspace.rename(path, name); self._refresh_tree(); self.status_label.config(text=f"Renomeado para: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))

    def delete_selected(self):
        path = self._selected_path()
        if not path or path == self.project_path: return
        if not messagebox.askyesno("Excluir", f"Excluir permanentemente:\n{path.name}?"): return
        try: self.workspace.delete(path); self._refresh_tree(); self.status_label.config(text=f"Excluído: {path.name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))

    def _ask_name(self, title, prompt, initial=""):
        dialog = tk.Toplevel(self); dialog.title(title); dialog.geometry("420x145"); dialog.configure(bg=self.BG); dialog.transient(self); dialog.grab_set()
        tk.Label(dialog, text=prompt, bg=self.BG, fg=self.TEXT, font=("Segoe UI", 10)).pack(anchor="w", padx=20, pady=(18, 6))
        value = tk.StringVar(value=initial); entry = ttk.Entry(dialog, textvariable=value); entry.pack(fill="x", padx=20); entry.focus_set()
        result = []
        def accept():
            if value.get().strip(): result.append(value.get().strip()); dialog.destroy()
        ttk.Button(dialog, text="OK", style="Bingo.TButton", command=accept).pack(anchor="e", padx=20, pady=12)
        dialog.bind("<Return>", lambda _e: accept()); dialog.wait_window(); return result[0] if result else None

    def open_file(self, path: Path):
        try:
            size = path.stat().st_size
            if size > 2_000_000: return messagebox.showwarning("Arquivo grande", "Arquivos maiores que 2 MB serão abertos no editor da Etapa 3.")
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError: return messagebox.showwarning("Arquivo binário", "Este arquivo não é texto. O editor será implementado na Etapa 3.")
        except OSError as exc: return messagebox.showerror("Erro", str(exc))
        self.editor_title.config(text=f"{path.name}  •  somente leitura")
        self.center_info.config(text=text[:12000] if text else "Arquivo vazio.", anchor="nw", justify="left")
        self.status_label.config(text=f"Arquivo selecionado: {self.workspace.relative(path)}")

    def show_settings(self):
        dialog = tk.Toplevel(self); dialog.title("BINGO Client • Configurações"); dialog.geometry("500x330"); dialog.resizable(False, False); dialog.configure(bg=self.BG); dialog.transient(self); dialog.grab_set()
        tk.Label(dialog, text="Configurações", bg=self.BG, fg=self.TEXT, font=("Segoe UI", 17, "bold")).pack(anchor="w", padx=24, pady=(22, 4))
        tk.Label(dialog, text="As permissões serão usadas pelo Agent Runtime nas próximas etapas.", bg=self.BG, fg=self.MUTED, font=("Segoe UI", 9)).pack(anchor="w", padx=24)
        box = tk.Frame(dialog, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1); box.pack(fill="x", padx=24, pady=20)
        tk.Label(box, text="Escopo de acesso", bg=self.PANEL, fg=self.TEXT, font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=14, pady=(14, 4))
        scope = tk.StringVar(value=self.config_store.data["permissions"]["scope"])
        ttk.Combobox(box, textvariable=scope, values=("project", "computer"), state="readonly").pack(anchor="w", padx=14, pady=(0, 14))
        def save_and_close():
            self.config_store.data["permissions"]["scope"] = scope.get(); self.config_store.save(); dialog.destroy(); self.status_label.config(text="Configurações salvas")
        ttk.Button(dialog, text="Salvar", style="Bingo.TButton", command=save_and_close).pack(anchor="e", padx=24)

    def on_close(self): self.config_store.save(); self.destroy()


def main():
    BingoClient().mainloop()


if __name__ == "__main__": main()
