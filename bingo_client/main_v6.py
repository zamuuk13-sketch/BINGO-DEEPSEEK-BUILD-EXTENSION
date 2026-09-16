from __future__ import annotations

from tkinter import messagebox

from .agent_runtime import AgentRuntime
from .chat import DeepSeekChat
from .deepseek import start_server
from .main import BingoClient
from .permissions import PermissionManager


class BingoClientV6(BingoClient):
    """Stage 7: desktop Agent Runtime with interactive permission gates."""

    def __init__(self):
        self.deepseek_server = start_server()
        self.deepseek_window = None
        self.agent_runtime = None
        self.permission_manager = None
        super().__init__()
        self.permission_manager = PermissionManager(self, self.config_store.data, self.config_store.save)
        self._sync_runtime()
        self.bind_all("<Control-Shift-d>", lambda _e: self.open_deepseek() or "break")
        self.bind_all("<Control-Shift-r>", lambda _e: self.show_runtime_status() or "break")
        self.bind_all("<Control-Shift-p>", lambda _e: self.show_permissions() or "break")
        self.after(350, self.open_deepseek)

    def _sync_runtime(self):
        self.agent_runtime = AgentRuntime(self.project_path, self.config_store.data, permission_request=self._request_permission)
        if self.project_path:
            self.set_status("Agent Runtime ativo • permissões protegidas")

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
        self.set_status(f"Agent Runtime v{status['version']} • sessão {status['sessionId']} • {status['tasks']} tarefas • {status['events']} eventos")

    def show_permissions(self):
        permissions = self.config_store.data.setdefault("permissions", {})
        lines = [
            f"Terminal: {permissions.get('terminal', False)}",
            f"Internet: {permissions.get('internet', 'approval')}",
            f"Instalações: {permissions.get('installations', 'approval')}",
            f"Computador: {permissions.get('computer', False)}",
        ]
        messagebox.showinfo("BINGO • Permissões", "\n".join(lines) + "\n\nO Runtime pedirá aprovação quando uma operação exigir acesso.")

    def on_close(self):
        try:
            if self.deepseek_window and self.deepseek_window.winfo_exists():
                self.deepseek_window.close()
            if self.agent_runtime:
                self.agent_runtime.save()
        finally:
            super().on_close()


def main():
    BingoClientV6().mainloop()


if __name__ == "__main__":
    main()
