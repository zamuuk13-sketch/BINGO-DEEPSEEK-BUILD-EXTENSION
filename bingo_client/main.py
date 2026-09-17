from __future__ import annotations

import json
import os
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import APP_NAME, APP_VERSION
from .editor import CodeEditor
from .terminal import TerminalPanel
from .workspace import Workspace

APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "BingoClient"
CONFIG_FILE = APP_DIR / "config.json"
DEFAULT_CONFIG = {
    "theme": "dark", "last_project": "",
    "deepseek": {"status": "disconnected", "chat_name": "", "connection_id": ""},
    "permissions": {"scope": "project", "terminal": True, "internet": "approval", "installations": "approval", "computer": False},
}


class ConfigStore:
    def __init__(self, path: Path = CONFIG_FILE): self.path = path; self.data = self._load()
    def _merge(self, target, source):
        for key, value in source.items():
            if isinstance(value, dict) and isinstance(target.get(key), dict): self._merge(target[key], value)
            else: target[key] = value
    def _load(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            data = json.loads(json.dumps(DEFAULT_CONFIG)); self._save(data); return data
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")); merged = json.loads(json.dumps(DEFAULT_CONFIG)); self._merge(merged, data); return merged
        except (OSError, json.JSONDecodeError): return json.loads(json.dumps(DEFAULT_CONFIG))
    def _save(self, data): self.path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    def save(self): self.path.parent.mkdir(parents=True, exist_ok=True); self._save(self.data)


class BingoClient(tk.Tk):
    BG, PANEL, PANEL_2, BORDER = "#0f1115", "#171a21", "#1d212a", "#2b313d"
    TEXT, MUTED, ACCENT = "#f2f4f8", "#9299a8", "#55d187"

    def __init__(self):
        super().__init__(); self.config_store = ConfigStore(); self.project_path = None; self.workspace = None; self.terminal_visible = False
        self.title(f"{APP_NAME} • {APP_VERSION}"); self.geometry("1360x820"); self.minsize(1050, 680); self.configure(bg=self.BG)
        self.protocol("WM_DELETE_WINDOW", self.on_close); self._configure_ttk(); self._build_ui()
        # Restore the previous project only after all subclasses have finished
        # building their additional UI. Stage 9/10 create dashboard widgets
        # after super().__init__(), so restoring here would call them too early.
        self.after_idle(self._restore_project)
        self.bind_all("<Control-`>", lambda _e: self.toggle_terminal() or "break")

    def _configure_ttk(self):
        style = ttk.Style(self)
        try: style.theme_use("clam")
        except tk.TclError: pass
        style.configure("Bingo.TButton", background=self.PANEL_2, foreground=self.TEXT, bordercolor=self.BORDER, padding=(10, 7), relief="flat")
        style.map("Bingo.TButton", background=[("active", "#27302c")])
        style.configure("Bingo.Treeview", background=self.PANEL, foreground=self.TEXT, fieldbackground=self.PANEL, bordercolor=self.BORDER, rowheight=27)
        style.map("Bingo.Treeview", background=[("selected", "#27372f")], foreground=[("selected", self.TEXT)])

    def _build_ui(self):
        top = tk.Frame(self, bg=self.PANEL, height=54); top.pack(fill="x"); top.pack_propagate(False)
        tk.Label(top, text="BINGO", bg=self.PANEL, fg=self.TEXT, font=("Segoe UI", 16, "bold")).pack(side="left", padx=(18, 4))
        tk.Label(top, text="CLIENT", bg=self.PANEL, fg=self.ACCENT, font=("Segoe UI", 10, "bold")).pack(side="left", padx=(0, 18))
        self.project_label = tk.Label(top, text="Nenhum projeto aberto", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 10)); self.project_label.pack(side="left")
        ttk.Button(top, text="Terminal  Ctrl+`", style="Bingo.TButton", command=self.toggle_terminal).pack(side="right", padx=4, pady=9)
        ttk.Button(top, text="Abrir pasta", style="Bingo.TButton", command=self.choose_project).pack(side="right", padx=4, pady=9)
        ttk.Button(top, text="Configurações", style="Bingo.TButton", command=self.show_settings).pack(side="right", padx=4, pady=9)

        body = tk.Frame(self, bg=self.BG); body.pack(fill="both", expand=True, padx=10, pady=10)
        explorer = tk.Frame(body, bg=self.PANEL, width=270, highlightbackground=self.BORDER, highlightthickness=1); explorer.pack(side="left", fill="y"); explorer.pack_propagate(False)
        tk.Label(explorer, text="EXPLORER", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        bar = tk.Frame(explorer, bg=self.PANEL); bar.pack(fill="x", padx=7, pady=(0, 7))
        for label, cmd in (("+ Arquivo", self.new_file), ("+ Pasta", self.new_folder), ("Renomear", self.rename_selected), ("Excluir", self.delete_selected), ("↻", self._refresh_tree)): ttk.Button(bar, text=label, style="Bingo.TButton", command=cmd).pack(side="left", padx=1)
        self.tree = ttk.Treeview(explorer, style="Bingo.Treeview", show="tree"); self.tree.pack(fill="both", expand=True, padx=7, pady=(0, 7))
        self.tree.bind("<Double-1>", self.on_tree_open); self.tree.bind("<Button-3>", self.on_tree_context); self.tree.bind("<<TreeviewOpen>>", self.on_tree_expand); self.tree.insert("", "end", iid="empty", text="📁  Nenhum projeto", open=True)

        center = tk.Frame(body, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1); center.pack(side="left", fill="both", expand=True, padx=10)
        self.editor = CodeEditor(center, on_status=self.set_status); self.editor.pack(fill="both", expand=True, padx=1, pady=1)
        self.terminal = TerminalPanel(center, get_cwd=lambda: self.project_path or Path.cwd(), on_status=self.set_status)

        right = tk.Frame(body, bg=self.PANEL, width=270, highlightbackground=self.BORDER, highlightthickness=1); right.pack(side="right", fill="y"); right.pack_propagate(False)
        tk.Label(right, text="AGENT STATUS", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(14, 8))
        status = tk.Frame(right, bg=self.PANEL_2); status.pack(fill="x", padx=12)
        tk.Label(status, text="●", bg=self.PANEL_2, fg=self.MUTED, font=("Segoe UI", 14)).pack(side="left", padx=(12, 7), pady=10); tk.Label(status, text="DeepSeek desconectado", bg=self.PANEL_2, fg=self.TEXT, font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=10)
        tk.Label(right, text="WORKSPACE", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(20, 8))
        self.workspace_value = tk.Label(right, text="Nenhuma pasta selecionada", bg=self.PANEL_2, fg=self.MUTED, justify="left", anchor="w", wraplength=235); self.workspace_value.pack(fill="x", padx=12, ipady=12, ipadx=10)
        self.item_count = tk.Label(right, text="0 itens", bg=self.PANEL_2, fg=self.MUTED, anchor="w"); self.item_count.pack(fill="x", padx=12, ipady=10, ipadx=10, pady=(8, 0))
        tk.Label(right, text="TERMINAL", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(20, 8)); tk.Label(right, text="Ctrl+`  •  Abrir/fechar\nEnter  •  Executar\nParar  •  Encerrar processo", bg=self.PANEL_2, fg=self.MUTED, justify="left", anchor="w").pack(fill="x", padx=12, ipady=12, ipadx=10)

        bottom = tk.Frame(self, bg=self.PANEL, height=30); bottom.pack(fill="x"); bottom.pack_propagate(False)
        self.status_label = tk.Label(bottom, text="BINGO Client pronto", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 8)); self.status_label.pack(side="left", padx=12)
        self.terminal_state = tk.Label(bottom, text="Terminal oculto", bg=self.PANEL, fg=self.MUTED, font=("Segoe UI", 8)); self.terminal_state.pack(side="right", padx=12)

    def set_status(self, text): self.status_label.config(text=str(text))
    def toggle_terminal(self):
        if self.terminal_visible:
            self.terminal.pack_forget(); self.terminal_visible = False; self.terminal_state.config(text="Terminal oculto")
        else:
            self.terminal.pack(fill="both", expand=True, padx=1, pady=1); self.terminal_visible = True; self.terminal_state.config(text="Terminal aberto"); self.terminal._refresh_cwd(); self.set_status("Terminal integrado aberto")
    def _restore_project(self):
        raw = self.config_store.data.get("last_project", "")
        if raw and Path(raw).is_dir(): self.open_project(Path(raw))
    def choose_project(self):
        selected = filedialog.askdirectory(title="Escolha a pasta do projeto")
        if selected: self.open_project(Path(selected))
    def open_project(self, path: Path):
        self.project_path = path.resolve(); self.workspace = Workspace(self.project_path); self.config_store.data["last_project"] = str(self.project_path); self.config_store.save(); self.project_label.config(text=self.project_path.name or str(self.project_path)); self.workspace_value.config(text=str(self.project_path), fg=self.TEXT); self.set_status(f"Workspace aberto: {self.project_path}"); self._refresh_tree(); self.terminal._refresh_cwd()
    def _refresh_tree(self):
        for item in self.tree.get_children(): self.tree.delete(item)
        if not self.workspace: self.tree.insert("", "end", iid="empty", text="📁  Nenhum projeto", open=True); self.item_count.config(text="0 itens"); return
        root = "root"; self.tree.insert("", "end", iid=root, text=f"📁  {self.project_path.name}", open=True, values=(str(self.project_path),))
        try:
            entries = self.workspace.list_children()
            for p in entries: self._insert_entry(root, p)
            self.item_count.config(text=f"{len(entries)} itens na raiz")
        except OSError as exc: self.set_status(f"Erro ao listar: {exc}")
    def _insert_entry(self, parent, path: Path):
        iid = f"path:{path}"
        if path.is_dir(): self.tree.insert(parent, "end", iid=iid, text=f"📁  {path.name}", values=(str(path),)); self.tree.insert(iid, "end", iid=f"dummy:{path}", text="carregando…")
        else: self.tree.insert(parent, "end", iid=iid, text=f"📄  {path.name}", values=(str(path),))
    def on_tree_expand(self, _event):
        item = self.tree.focus()
        if item: self._expand_directory(item)
    def _expand_directory(self, item):
        if not self.workspace: return
        children = self.tree.get_children(item)
        if len(children) == 1 and str(children[0]).startswith("dummy:"):
            self.tree.delete(children[0]); path = Path(self.tree.item(item, "values")[0])
            try:
                for child in self.workspace.list_children(path): self._insert_entry(item, child)
            except OSError as exc: self.set_status(f"Erro ao expandir: {exc}")
    def on_tree_open(self, _event):
        item = self.tree.focus(); values = self.tree.item(item, "values") if item else ()
        if not values or not self.workspace: return
        path = Path(values[0])
        if path.is_dir(): self._expand_directory(item)
        else: self.editor.open_file(path)
    def on_tree_context(self, event):
        item = self.tree.identify_row(event.y)
        if item: self.tree.selection_set(item); self.tree.focus(item)
    def _selected_path(self):
        item = self.tree.focus()
        if not item or not self.workspace: return None
        values = self.tree.item(item, "values"); return Path(values[0]) if values else None
    def _ask_name(self, title, prompt, initial=""):
        dialog = tk.Toplevel(self); dialog.title(title); dialog.geometry("420x145"); dialog.configure(bg=self.BG); dialog.transient(self); dialog.grab_set(); tk.Label(dialog, text=prompt, bg=self.BG, fg=self.TEXT).pack(anchor="w", padx=20, pady=(18, 6)); value = tk.StringVar(value=initial); entry = ttk.Entry(dialog, textvariable=value); entry.pack(fill="x", padx=20); entry.focus_set(); result = []
        def accept():
            if value.get().strip(): result.append(value.get().strip()); dialog.destroy()
        ttk.Button(dialog, text="OK", style="Bingo.TButton", command=accept).pack(anchor="e", padx=20, pady=12); dialog.bind("<Return>", lambda _e: accept()); dialog.wait_window(); return result[0] if result else None
    def new_file(self):
        if not self.workspace: return messagebox.showinfo("Workspace", "Abra uma pasta primeiro.")
        name = self._ask_name("Novo arquivo", "Nome do arquivo:")
        if not name: return
        selected = self._selected_path(); base = selected if selected and selected.is_dir() else self.project_path
        try: path = self.workspace.create_file(str(base.relative_to(self.project_path) / name)); self._refresh_tree(); self.editor.open_file(path); self.set_status(f"Arquivo criado: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))
    def new_folder(self):
        if not self.workspace: return messagebox.showinfo("Workspace", "Abra uma pasta primeiro.")
        name = self._ask_name("Nova pasta", "Nome da pasta:")
        if not name: return
        selected = self._selected_path(); base = selected if selected and selected.is_dir() else self.project_path
        try: self.workspace.create_folder(str(base.relative_to(self.project_path) / name)); self._refresh_tree(); self.set_status(f"Pasta criada: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))
    def rename_selected(self):
        path = self._selected_path()
        if not path or path == self.project_path: return
        name = self._ask_name("Renomear", "Novo nome:", path.name)
        if not name: return
        try: self.workspace.rename(path, name); self._refresh_tree(); self.set_status(f"Renomeado: {name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))
    def delete_selected(self):
        path = self._selected_path()
        if not path or path == self.project_path: return
        if not messagebox.askyesno("Excluir", f"Excluir permanentemente:\n{path.name}?"): return
        try: self.workspace.delete(path); self._refresh_tree(); self.set_status(f"Excluído: {path.name}")
        except Exception as exc: messagebox.showerror("Erro", str(exc))
    def show_settings(self):
        dialog = tk.Toplevel(self); dialog.title("BINGO Client • Configurações"); dialog.geometry("500x360"); dialog.resizable(False, False); dialog.configure(bg=self.BG); dialog.transient(self); dialog.grab_set(); tk.Label(dialog, text="Configurações", bg=self.BG, fg=self.TEXT, font=("Segoe UI", 17, "bold")).pack(anchor="w", padx=24, pady=(22, 4)); tk.Label(dialog, text="Permissões serão usadas pelo Agent Runtime.", bg=self.BG, fg=self.MUTED).pack(anchor="w", padx=24)
        box = tk.Frame(dialog, bg=self.PANEL, highlightbackground=self.BORDER, highlightthickness=1); box.pack(fill="x", padx=24, pady=20); tk.Label(box, text="Escopo de acesso", bg=self.PANEL, fg=self.TEXT, font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=14, pady=(14, 4)); scope = tk.StringVar(value=self.config_store.data["permissions"]["scope"]); ttk.Combobox(box, textvariable=scope, values=("project", "computer"), state="readonly").pack(anchor="w", padx=14, pady=(0, 12)); terminal = tk.BooleanVar(value=self.config_store.data["permissions"].get("terminal", True)); tk.Checkbutton(box, text="Permitir terminal integrado", variable=terminal, bg=self.PANEL, fg=self.TEXT, selectcolor=self.PANEL_2, activebackground=self.PANEL, activeforeground=self.TEXT).pack(anchor="w", padx=14, pady=(0, 14))
        def save(): self.config_store.data["permissions"]["scope"] = scope.get(); self.config_store.data["permissions"]["terminal"] = terminal.get(); self.config_store.save(); dialog.destroy(); self.set_status("Configurações salvas")
        ttk.Button(dialog, text="Salvar", style="Bingo.TButton", command=save).pack(anchor="e", padx=24)
    def on_close(self):
        if self.editor.current and self.editor.current in self.editor.files and self.editor.files[self.editor.current]["dirty"] and not messagebox.askyesno("BINGO Client", "Existem alterações não salvas. Fechar mesmo assim?"): return
        self.config_store.save(); self.destroy()


def main(): BingoClient().mainloop()

if __name__ == "__main__": main()
