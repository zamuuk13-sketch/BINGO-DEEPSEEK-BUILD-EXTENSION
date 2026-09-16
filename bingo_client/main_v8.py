from __future__ import annotations

from tkinter import messagebox

from .agent_runtime import AgentRuntime
from .autonomy import AutonomyEngine
from .chat import DeepSeekChat
from .deepseek import start_server
from .main import BingoClient
from .permissions import PermissionManager


class BingoClientV8(BingoClient):
    """Stage 8: bounded autonomous project execution."""

    def __init__(self):
        self.deepseek_server = start_server()
        self.deepseek_window = None
        self.agent_runtime = None
        self.permission_manager = None
        self.autonomy = None
        super().__init__()
        self.permission_manager = PermissionManager(self, self.config_store.data, self.config_store.save)
        self._sync_runtime()
        self.bind_all("<Control-Shift-d>", lambda _e: self.open_deepseek() or "break")
        self.bind_all("<Control-Shift-r>", lambda _e: self.show_runtime_status() or "break")
        self.bind_all("<Control-Shift-p>", lambda _e: self.show_permissions() or "break")
        self.bind_all("<Control-Shift-a>", lambda _e: self.show_autonomy() or "break")
        self.after(350, self.open_deepseek)

    def _sync_runtime(self):
        self.agent_runtime = AgentRuntime(self.project_path, self.config_store.data, permission_request=self._request_permission)
        self.autonomy = AutonomyEngine(self.agent_runtime, self._request_permission)
        if self.project_path:
            self.set_status("Agent Runtime ativo • autonomia protegida")

    def _request_permission(self, operation: str, reason: str, details: str = "") -> bool:
        return self.permission_manager.request(operation, reason, details)

    def open_project(self, path):
        super().open_project(path)
        self._sync_runtime()
        if self.deepseek_window and self.deepseek_window.winfo_exists():
            self.deepseek_window.runtime = self.agent_runtime

    def open_deepseek(self):
        if self.deepseek_window and self.deepseek_window.winfo_exists():
            self.deepseek_window.runtime = self.agent_runtime
            self.deepseek_window.lift()
            self.deepseek_window.focus_force()
            return
        project_name = self.project_path.name if self.project_path else "DeepSeek"
        self.deepseek_window = DeepSeekChat(self, project_name=project_name, runtime=self.agent_runtime)

    def show_runtime_status(self):
        if not self.agent_runtime:
            self.set_status("Agent Runtime: nenhum workspace selecionado")
            return
        status = self.agent_runtime.status()
        self.set_status(f"Runtime v{status['version']} • {status['tasks']} tarefas • {status['events']} eventos")

    def show_permissions(self):
        permissions = self.config_store.data.setdefault("permissions", {})
        messagebox.showinfo("BINGO • Permissões", "\n".join([
            f"Terminal: {permissions.get('terminal', False)}",
            f"Internet: {permissions.get('internet', 'approval')}",
            f"Instalações: {permissions.get('installations', 'approval')}",
            f"Computador: {permissions.get('computer', False)}",
        ]))

    def show_autonomy(self):
        if not self.autonomy:
            return
        status = self.autonomy.status()
        messagebox.showinfo("BINGO • Autonomia", "\n".join([
            f"Ativa: {status['active']}",
            f"Objetivo: {status['goal'] or '(nenhum)'}",
            f"Passos: {status['steps']} / {status['maxSteps']}",
            f"Projeto: {status['project'] or '(nenhum)'}",
            "",
            "A autonomia é limitada por sessão e cada operação privilegiada passa pelo Permission Manager.",
        ]))

    def on_close(self):
        try:
            if self.autonomy and self.autonomy.active:
                self.autonomy.stop("client_close")
            if self.deepseek_window and self.deepseek_window.winfo_exists():
                self.deepseek_window.close()
            if self.agent_runtime:
                self.agent_runtime.save()
        finally:
            super().on_close()


def main():
    BingoClientV8().mainloop()


if __name__ == "__main__":
    main()
