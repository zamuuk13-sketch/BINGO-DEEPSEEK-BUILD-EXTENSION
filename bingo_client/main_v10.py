from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk

from .main_v9 import BingoClientV9
from .production import ProductionManager


class BingoClientV10(BingoClientV9):
    """Stage 10: production-ready desktop shell with recovery and diagnostics."""

    def __init__(self):
        self.production = ProductionManager()
        super().__init__()
        self.production.begin_session(self.project_path, self.agent_runtime.status().get("sessionId", "") if self.agent_runtime else "")
        self.title("BINGO Client • Production")
        self._install_production_ui()
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        if self.production.crash_recovery_needed():
            self.after(600, self._show_recovery_notice)

    def _install_production_ui(self):
        top = self.project_label.master
        ttk.Button(top, text="Diagnostics", style="Bingo.TButton", command=self.show_diagnostics).pack(side="right", padx=4, pady=9)
        ttk.Button(top, text="Recovery", style="Bingo.TButton", command=self.show_recovery).pack(side="right", padx=4, pady=9)
        self.bind_all("<Control-Shift-L>", lambda _e: self.show_diagnostics() or "break")
        self.bind_all("<Control-Shift-U>", lambda _e: self.show_recovery() or "break")

    def _show_recovery_notice(self):
        if self.production.crash_recovery_needed():
            messagebox.showwarning("BINGO • Recuperação", "A sessão anterior não terminou normalmente.\n\nO BINGO restaurou o estado seguro e manteve o último workspace registrado. Nenhuma ação autônoma será retomada automaticamente.")
            self.production.save(clean_shutdown=True)

    def show_diagnostics(self):
        data = self.production.diagnostics()
        text = "\n".join(f"{key}: {value}" for key, value in data.items())
        messagebox.showinfo("BINGO • Diagnostics", text)

    def show_recovery(self):
        data = self.production.state
        text = (
            f"Último projeto:\n{data.get('last_project') or '(nenhum)'}\n\n"
            f"Última sessão: {data.get('last_session') or '(nenhuma)'}\n"
            f"Shutdown limpo: {data.get('clean_shutdown', True)}\n\n"
            "A recuperação é conservadora: o workspace pode ser restaurado, "
            "mas tarefas autônomas não são executadas sem nova autorização."
        )
        messagebox.showinfo("BINGO • Recovery", text)

    def open_project(self, path):
        super().open_project(path)
        if hasattr(self, "production"):
            self.production.state["last_project"] = str(self.project_path)
            self.production.save(clean_shutdown=False)

    def on_close(self):
        try:
            if self.production:
                self.production.log("session.close_requested", {})
            super().on_close()
            if self.production:
                self.production.finish_session()
        except Exception as exc:
            if self.production:
                self.production.log("session.close_error", {"error": str(exc)})
            try:
                super().destroy()
            except Exception:
                pass


def main():
    BingoClientV10().mainloop()


if __name__ == "__main__":
    main()
