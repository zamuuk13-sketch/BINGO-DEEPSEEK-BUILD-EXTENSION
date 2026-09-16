from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable


class PermissionManager:
    """Central interactive permission gate for the desktop Agent Runtime."""

    def __init__(self, parent: tk.Misc, config: dict, on_change: Callable[[], None] | None = None):
        self.parent = parent
        self.config = config
        self.on_change = on_change

    def _category(self, operation: str) -> str:
        if operation.startswith("process."):
            return "terminal"
        if operation.startswith("internet."):
            return "internet"
        if operation.startswith("install."):
            return "installations"
        if operation.startswith("computer."):
            return "computer"
        return "computer"

    def request(self, operation: str, reason: str, details: str = "") -> bool:
        if operation.startswith(("fs.", "project.")):
            return True
        category = self._category(operation)
        value = self.config.setdefault("permissions", {}).get(category, "approval")
        if value is True or value == "allow":
            return True
        if value in (False, "deny"):
            return False
        return self._dialog(operation, reason, details, category)

    def _dialog(self, operation: str, reason: str, details: str, category: str) -> bool:
        result = {"allowed": False, "remember": False}
        dialog = tk.Toplevel(self.parent)
        dialog.title("BINGO • Permissão necessária")
        dialog.geometry("560x330")
        dialog.resizable(False, False)
        dialog.configure(bg="#0f1115")
        dialog.transient(self.parent)
        dialog.grab_set()

        tk.Label(dialog, text="BINGO PRECISA DE PERMISSÃO", bg="#0f1115", fg="#f2f4f8", font=("Segoe UI", 16, "bold")).pack(anchor="w", padx=24, pady=(24, 8))
        tk.Label(dialog, text=f"Operação: {operation}", bg="#0f1115", fg="#55d187", font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=24)
        tk.Label(dialog, text=reason or "O agente solicitou acesso a este recurso.", bg="#0f1115", fg="#e8ebf0", justify="left", wraplength=500, anchor="w").pack(fill="x", padx=24, pady=(14, 4))
        if details:
            tk.Label(dialog, text=details, bg="#171a21", fg="#9299a8", justify="left", wraplength=480, anchor="w").pack(fill="x", padx=24, pady=8, ipady=10)

        remember = tk.BooleanVar(value=False)
        ttk.Checkbutton(dialog, text="Permitir automaticamente esta categoria nesta sessão", variable=remember).pack(anchor="w", padx=24, pady=8)
        buttons = tk.Frame(dialog, bg="#0f1115")
        buttons.pack(fill="x", padx=24, pady=14)

        def finish(allowed: bool):
            result["allowed"] = allowed
            result["remember"] = remember.get()
            if allowed and result["remember"]:
                self.config.setdefault("permissions", {})[category] = "allow"
                if self.on_change:
                    self.on_change()
            dialog.destroy()

        ttk.Button(buttons, text="Negar", command=lambda: finish(False)).pack(side="right", padx=(8, 0))
        ttk.Button(buttons, text="Permitir", command=lambda: finish(True)).pack(side="right")
        dialog.protocol("WM_DELETE_WINDOW", lambda: finish(False))
        dialog.wait_window()
        return result["allowed"]

    def settings(self) -> dict:
        return dict(self.config.get("permissions", {}))
