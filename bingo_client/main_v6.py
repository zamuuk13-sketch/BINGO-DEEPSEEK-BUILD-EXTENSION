from __future__ import annotations

from .agent_runtime import AgentRuntime
from .chat import DeepSeekChat
from .deepseek import start_server
from .main import BingoClient


class BingoClientV6(BingoClient):
    """Stage 6: desktop chat connected to the local Agent Runtime."""

    def __init__(self):
        self.deepseek_server = start_server()
        self.deepseek_window = None
        self.agent_runtime = None
        super().__init__()
        self._sync_runtime()
        self.bind_all("<Control-Shift-d>", lambda _e: self.open_deepseek() or "break")
        self.bind_all("<Control-Shift-r>", lambda _e: self.show_runtime_status() or "break")
        self.after(350, self.open_deepseek)

    def _sync_runtime(self):
        self.agent_runtime = AgentRuntime(
            self.project_path,
            self.config_store.data,
        )
        if self.project_path:
            self.set_status("Agent Runtime ativo • workspace selecionado")

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
        self.deepseek_window = DeepSeekChat(
            self,
            project_name=project_name,
            runtime=self.agent_runtime,
        )

    def show_runtime_status(self):
        if not self.agent_runtime:
            self.set_status("Agent Runtime: nenhum workspace selecionado")
            return
        status = self.agent_runtime.status()
        self.set_status(
            f"Agent Runtime v{status['version']} • sessão {status['sessionId']} • "
            f"{status['tasks']} tarefas • {status['events']} eventos"
        )

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
