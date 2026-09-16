from __future__ import annotations

import json
import tkinter as tk
from tkinter import messagebox, ttk
from pathlib import Path

from .agent_runtime import AgentRuntime
from .autonomy import AutonomyEngine
from .chat import DeepSeekChat
from .deepseek import start_server
from .main import BingoClient
from .permissions import PermissionManager


class BingoClientV9(BingoClient):
    """Stage 9: professional IDE-style BINGO workspace UI."""

    def __init__(self):
        self.deepseek_server = start_server()
        self.deepseek_window = None
        self.agent_runtime = None
        self.permission_manager = None
        self.autonomy = None
        self.activity_text = None
        self.task_goal = None
        self.task_steps = None
        self.task_state = None
        super().__init__()
        self.permission_manager = PermissionManager(self, self.config_store.data, self.config_store.save)
        self._sync_runtime()
        self._upgrade_professional_ui()
        self.bind_all("<Control-Shift-d>", lambda _e: self.open_deepseek() or "break")
        self.bind_all("<Control-Shift-r>", lambda _e: self.show_runtime_status() or "break")
        self.bind_all("<Control-Shift-p>", lambda _e: self.show_permissions() or "break")
        self.bind_all("<Control-Shift-a>", lambda _e: self.show_autonomy() or "break")
        self.bind_all("<Control-Shift-k>", lambda _e: self.command_palette() or "break")
        self.after(500, self._poll_dashboard)
        self.after(350, self.open_deepseek)

    def _sync_runtime(self):
        self.agent_runtime = AgentRuntime(self.project_path, self.config_store.data, permission_request=self._request_permission)
        self.autonomy = AutonomyEngine(self.agent_runtime, self._request_permission)

    def _request_permission(self, operation: str, reason: str, details: str = "") -> bool:
        return self.permission_manager.request(operation, reason, details)

    def open_project(self, path):
        super().open_project(path)
        self._sync_runtime()
        if self.deepseek_window and self.deepseek_window.winfo_exists():
            self.deepseek_window.runtime = self.agent_runtime
        self._refresh_dashboard()

    def open_deepseek(self):
        if self.deepseek_window and self.deepseek_window.winfo_exists():
            self.deepseek_window.runtime = self.agent_runtime
            self.deepseek_window.lift()
            self.deepseek_window.focus_force()
            return
        project_name = self.project_path.name if self.project_path else "DeepSeek"
        self.deepseek_window = DeepSeekChat(self, project_name=project_name, runtime=self.agent_runtime)

    def _upgrade_professional_ui(self):
        # Turn the existing right status column into a professional dashboard.
        right = self.workspace_value.master
        for child in list(right.winfo_children()):
            child.destroy()
        right.configure(width=320)
        right.pack_propagate(False)

        header = tk.Frame(right, bg=self.PANEL)
        header.pack(fill="x", padx=12, pady=(12, 8))
        tk.Label(header, text="BINGO WORKBENCH", bg=self.PANEL, fg=self.TEXT,
                 font=("Segoe UI", 12, "bold")).pack(side="left")
        tk.Label(header, text="STAGE 9", bg=self.PANEL, fg=self.ACCENT,
                 font=("Segoe UI", 8, "bold")).pack(side="right")

        actions = tk.Frame(right, bg=self.PANEL)
        actions.pack(fill="x", padx=10, pady=(0, 8))
        for text, command in (("DeepSeek", self.open_deepseek), ("Autonomia", self.show_autonomy),
                              ("Permissões", self.show_permissions), ("Runtime", self.show_runtime_status)):
            ttk.Button(actions, text=text, style="Bingo.TButton", command=command).pack(fill="x", pady=2)

        notebook = ttk.Notebook(right)
        notebook.pack(fill="both", expand=True, padx=10, pady=(4, 10))

        agent_tab = tk.Frame(notebook, bg=self.PANEL)
        tasks_tab = tk.Frame(notebook, bg=self.PANEL)
        logs_tab = tk.Frame(notebook, bg=self.PANEL)
        notebook.add(agent_tab, text="Agent")
        notebook.add(tasks_tab, text="Tasks")
        notebook.add(logs_tab, text="Logs")

        self._build_agent_tab(agent_tab)
        self._build_tasks_tab(tasks_tab)
        self._build_logs_tab(logs_tab)

        # Upgrade the top bar with an explicit command center.
        top = self.project_label.master
        ttk.Button(top, text="⌘ Command", style="Bingo.TButton", command=self.command_palette).pack(side="left", padx=4, pady=9)
        ttk.Button(top, text="Autonomia", style="Bingo.TButton", command=self.show_autonomy).pack(side="left", padx=4, pady=9)
        self.title("BINGO Client • Professional Workbench • Stage 9")

    def _section_label(self, parent, text):
        tk.Label(parent, text=text, bg=self.PANEL, fg=self.MUTED,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=10, pady=(12, 5))

    def _build_agent_tab(self, parent):
        self._section_label(parent, "AGENT STATUS")
        self.agent_state = tk.Label(parent, text="●  Runtime ativo", bg=self.PANEL_2, fg=self.ACCENT,
                                    anchor="w", padx=10, pady=9)
        self.agent_state.pack(fill="x", padx=10)
        self._section_label(parent, "WORKSPACE")
        self.agent_workspace = tk.Label(parent, text="Nenhum projeto", bg=self.PANEL_2, fg=self.MUTED,
                                        justify="left", anchor="w", wraplength=250, padx=10, pady=10)
        self.agent_workspace.pack(fill="x", padx=10)
        self._section_label(parent, "AUTONOMIA")
        self.agent_goal = tk.Label(parent, text="Nenhum objetivo", bg=self.PANEL_2, fg=self.MUTED,
                                   justify="left", anchor="w", wraplength=250, padx=10, pady=10)
        self.agent_goal.pack(fill="x", padx=10)
        ttk.Button(parent, text="Abrir painel de autonomia", style="Bingo.TButton",
                    command=self.show_autonomy).pack(fill="x", padx=10, pady=10)

    def _build_tasks_tab(self, parent):
        self._section_label(parent, "CURRENT TASK")
        self.task_goal = tk.Label(parent, text="Nenhuma tarefa ativa", bg=self.PANEL_2, fg=self.TEXT,
                                  justify="left", anchor="w", wraplength=250, padx=10, pady=12)
        self.task_goal.pack(fill="x", padx=10)
        self.task_steps = tk.Label(parent, text="0 / 0 passos", bg=self.PANEL_2, fg=self.MUTED,
                                   anchor="w", padx=10, pady=9)
        self.task_steps.pack(fill="x", padx=10, pady=(5, 0))
        self.task_state = tk.Label(parent, text="IDLE", bg=self.PANEL_2, fg=self.MUTED,
                                   anchor="w", padx=10, pady=9, font=("Segoe UI", 9, "bold"))
        self.task_state.pack(fill="x", padx=10, pady=5)
        ttk.Button(parent, text="Iniciar/continuar autonomia", style="Bingo.TButton",
                    command=self.show_autonomy).pack(fill="x", padx=10, pady=8)

    def _build_logs_tab(self, parent):
        self._section_label(parent, "RUNTIME EVENTS")
        frame = tk.Frame(parent, bg=self.PANEL_2)
        frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.activity_text = tk.Text(frame, bg=self.PANEL_2, fg=self.MUTED, insertbackground=self.TEXT,
                                     relief="flat", wrap="word", font=("Consolas", 8), state="disabled")
        scroll = ttk.Scrollbar(frame, command=self.activity_text.yview)
        self.activity_text.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.activity_text.pack(fill="both", expand=True, padx=6, pady=6)

    def _refresh_dashboard(self):
        if not self.agent_runtime:
            return
        status = self.autonomy.status() if self.autonomy else {}
        project = str(self.project_path) if self.project_path else "Nenhum projeto"
        self.agent_workspace.config(text=project)
        self.agent_goal.config(text=status.get("goal") or "Nenhum objetivo")
        self.task_goal.config(text=status.get("goal") or "Nenhuma tarefa ativa")
        self.task_steps.config(text=f"{status.get('steps', 0)} / {status.get('maxSteps', 0)} passos")
        self.task_state.config(text="RUNNING" if status.get("active") else "IDLE",
                               fg=self.ACCENT if status.get("active") else self.MUTED)
        self.agent_state.config(text="●  Autonomia executando" if status.get("active") else "●  Runtime pronto",
                                fg=self.ACCENT if status.get("active") else self.MUTED)

        events = self.agent_runtime.memory.get("events", [])[-30:]
        if self.activity_text is not None:
            lines = []
            for event in events:
                kind = event.get("type", "event")
                stamp = event.get("time", "")
                lines.append(f"{stamp}  {kind}")
            self.activity_text.config(state="normal")
            self.activity_text.delete("1.0", "end")
            self.activity_text.insert("end", "\n".join(lines) or "Nenhum evento ainda.")
            self.activity_text.see("end")
            self.activity_text.config(state="disabled")

    def _poll_dashboard(self):
        self._refresh_dashboard()
        self.after(700, self._poll_dashboard)

    def command_palette(self):
        dialog = tk.Toplevel(self)
        dialog.title("BINGO • Command Palette")
        dialog.geometry("620x430")
        dialog.configure(bg=self.BG)
        dialog.transient(self)
        dialog.grab_set()
        tk.Label(dialog, text="Command Palette", bg=self.BG, fg=self.TEXT,
                 font=("Segoe UI", 17, "bold")).pack(anchor="w", padx=22, pady=(20, 4))
        tk.Label(dialog, text="Escolha uma ação do workbench", bg=self.BG, fg=self.MUTED).pack(anchor="w", padx=22)
        search = ttk.Entry(dialog)
        search.pack(fill="x", padx=22, pady=14)
        commands = [
            ("Abrir projeto", self.choose_project),
            ("Abrir DeepSeek", self.open_deepseek),
            ("Autonomia", self.show_autonomy),
            ("Terminal", self.toggle_terminal),
            ("Runtime status", self.show_runtime_status),
            ("Permissões", self.show_permissions),
        ]
        listbox = tk.Listbox(dialog, bg=self.PANEL, fg=self.TEXT, selectbackground="#27372f",
                             relief="flat", font=("Segoe UI", 10), activestyle="none")
        listbox.pack(fill="both", expand=True, padx=22, pady=(0, 20))
        for name, _ in commands:
            listbox.insert("end", name)
        listbox.selection_set(0)

        def refresh(_event=None):
            query = search.get().lower().strip()
            listbox.delete(0, "end")
            for name, _ in commands:
                if query in name.lower():
                    listbox.insert("end", name)

        def run(_event=None):
            selected = listbox.curselection()
            if not selected:
                return
            name = listbox.get(selected[0])
            for command_name, command in commands:
                if name == command_name:
                    dialog.destroy()
                    command()
                    return

        search.bind("<KeyRelease>", refresh)
        search.bind("<Return>", run)
        listbox.bind("<Double-1>", run)
        search.focus_set()

    def show_runtime_status(self):
        if not self.agent_runtime:
            return
        status = self.agent_runtime.status()
        messagebox.showinfo("BINGO • Runtime", "\n".join([
            f"Versão: {status.get('version')}",
            f"Sessão: {status.get('sessionId')}",
            f"Tarefas: {status.get('tasks')}",
            f"Eventos: {status.get('events')}",
            f"Workspace: {self.project_path or '(nenhum)'}",
        ]))

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
        dialog = tk.Toplevel(self)
        dialog.title("BINGO • Autonomia")
        dialog.geometry("650x520")
        dialog.configure(bg=self.BG)
        dialog.transient(self)
        dialog.grab_set()

        tk.Label(dialog, text="Autonomia", bg=self.BG, fg=self.TEXT,
                 font=("Segoe UI", 18, "bold")).pack(anchor="w", padx=24, pady=(22, 4))
        tk.Label(dialog, text="Defina o objetivo do agente e acompanhe a execução.", bg=self.BG, fg=self.MUTED).pack(anchor="w", padx=24)
        goal = tk.Text(dialog, height=5, bg=self.PANEL_2, fg=self.TEXT, insertbackground=self.TEXT,
                       relief="flat", wrap="word")
        goal.pack(fill="x", padx=24, pady=16)
        goal.insert("1.0", self.autonomy.goal)

        row = tk.Frame(dialog, bg=self.BG)
        row.pack(fill="x", padx=24)
        tk.Label(row, text="Máximo de passos", bg=self.BG, fg=self.MUTED).pack(side="left")
        steps = ttk.Spinbox(row, from_=1, to=100, width=8)
        steps.set(str(self.autonomy.max_steps))
        steps.pack(side="left", padx=10)

        state = tk.Label(dialog, text="", bg=self.PANEL_2, fg=self.MUTED, anchor="w", justify="left", padx=12, pady=12)
        state.pack(fill="x", padx=24, pady=14)

        buttons = tk.Frame(dialog, bg=self.BG)
        buttons.pack(fill="x", padx=24, pady=8)

        def refresh():
            status = self.autonomy.status()
            state.config(text=f"Estado: {'ATIVA' if status['active'] else 'PARADA'}\nPassos: {status['steps']} / {status['maxSteps']}\nÚltimo resultado: {status['lastResult'] or 'nenhum'}")
            if dialog.winfo_exists():
                dialog.after(500, refresh)

        def start():
            try:
                limit = int(steps.get())
            except ValueError:
                limit = 20
            result = self.autonomy.start(goal.get("1.0", "end").strip(), limit)
            self.set_status("Autonomia iniciada")
            self._refresh_dashboard()
            state.config(text=f"Estado: ATIVA\nObjetivo: {result['goal']}\nLimite: {result['maxSteps']} passos")

        def stop():
            self.autonomy.stop("user")
            self.set_status("Autonomia parada")
            self._refresh_dashboard()

        ttk.Button(buttons, text="Iniciar", style="Bingo.TButton", command=start).pack(side="left")
        ttk.Button(buttons, text="Parar", style="Bingo.TButton", command=stop).pack(side="left", padx=8)
        ttk.Button(buttons, text="Fechar", style="Bingo.TButton", command=dialog.destroy).pack(side="right")
        refresh()

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
    BingoClientV9().mainloop()


if __name__ == "__main__":
    main()
