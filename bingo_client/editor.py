from __future__ import annotations

import re
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk


class CodeEditor(tk.Frame):
    """Lightweight IDE editor with tabs, line numbers, search and save."""

    def __init__(self, master, on_status=None, **kwargs):
        super().__init__(master, bg="#171a21", **kwargs)
        self.on_status = on_status or (lambda _text: None)
        self.files: dict[str, dict] = {}
        self.current: str | None = None
        self._build()

    def _build(self):
        self.tabbar = tk.Frame(self, bg="#111318", height=36)
        self.tabbar.pack(fill="x", side="top")
        self.tabbar.pack_propagate(False)
        self.tabs = tk.Frame(self.tabbar, bg="#111318")
        self.tabs.pack(side="left", fill="y")
        ttk.Button(self.tabbar, text="×", command=self.close_current, style="Bingo.TButton").pack(side="right", padx=4, pady=4)
        self.search = tk.Frame(self, bg="#1d212a", height=34)
        self.search.pack(fill="x", side="top")
        self.search.pack_propagate(False)
        self.search_var = tk.StringVar()
        entry = ttk.Entry(self.search, textvariable=self.search_var)
        entry.pack(side="left", padx=8, pady=5, fill="x", expand=True)
        entry.bind("<Return>", lambda _e: self.find_next())
        ttk.Button(self.search, text="Localizar", command=self.find_next, style="Bingo.TButton").pack(side="left", padx=3)
        ttk.Button(self.search, text="Salvar  Ctrl+S", command=self.save_current, style="Bingo.TButton").pack(side="left", padx=3)
        self.search.pack_forget()

        editor = tk.Frame(self, bg="#0f1115")
        editor.pack(fill="both", expand=True)
        self.lines = tk.Text(editor, width=5, bg="#111318", fg="#687080", insertbackground="#687080", relief="flat", bd=0, state="disabled", takefocus=0, font=("Consolas", 10), padx=10, pady=10)
        self.lines.pack(side="left", fill="y")
        self.text = tk.Text(editor, bg="#0f1115", fg="#e8ebf0", insertbackground="#55d187", selectbackground="#29483a", relief="flat", undo=True, wrap="none", font=("Consolas", 10), padx=8, pady=10)
        self.text.pack(side="left", fill="both", expand=True)
        self.vscroll = ttk.Scrollbar(editor, orient="vertical", command=self._yview)
        self.vscroll.pack(side="right", fill="y")
        self.text.configure(yscrollcommand=self._scroll_changed)
        self.text.bind("<Control-s>", lambda _e: self.save_current() or "break")
        self.text.bind("<Control-f>", lambda _e: self.toggle_search() or "break")
        self.text.bind("<<Modified>>", self._modified)
        self.text.bind("<KeyRelease>", lambda _e: self.update_lines())
        self.text.bind("<MouseWheel>", lambda _e: self.after_idle(self.update_lines))
        self._highlight_tags()

    def _yview(self, *args):
        self.text.yview(*args); self.lines.yview_moveto(self.text.yview()[0])

    def _scroll_changed(self, first, last):
        self.vscroll.set(first, last); self.lines.yview_moveto(first)

    def _highlight_tags(self):
        self.text.tag_configure("keyword", foreground="#7db7ff")
        self.text.tag_configure("string", foreground="#b8d88a")
        self.text.tag_configure("comment", foreground="#687080")

    def _modified(self, _event=None):
        if not self.text.edit_modified(): return
        self.text.edit_modified(False)
        if self.current in self.files:
            self.files[self.current]["dirty"] = True
            self._render_tabs()
        self.update_lines()

    def update_lines(self):
        count = int(self.text.index("end-1c").split(".")[0])
        value = "\n".join(str(i) for i in range(1, count + 1))
        self.lines.configure(state="normal")
        self.lines.delete("1.0", "end")
        self.lines.insert("1.0", value)
        self.lines.configure(state="disabled")
        self.lines.yview_moveto(self.text.yview()[0])

    def open_file(self, path: Path):
        key = str(path.resolve())
        if key not in self.files:
            try:
                raw = path.read_bytes()
                if b"\x00" in raw[:8192]: raise UnicodeError("binary")
                content = raw.decode("utf-8")
            except UnicodeDecodeError:
                content = raw.decode("utf-8", errors="replace")
            except OSError as exc:
                messagebox.showerror("BINGO Editor", str(exc)); return
            self.files[key] = {"path": path.resolve(), "content": content, "dirty": False}
        self._select(key)

    def _select(self, key: str):
        if key not in self.files: return
        self.current = key
        data = self.files[key]
        self.text.delete("1.0", "end")
        self.text.insert("1.0", data["content"])
        self.text.edit_modified(False)
        self._render_tabs(); self.update_lines(); self._highlight_current()
        self.on_status(f"Editando: {data['path']}")

    def _render_tabs(self):
        for child in self.tabs.winfo_children(): child.destroy()
        for key, data in self.files.items():
            active = key == self.current
            title = data["path"].name + (" ●" if data["dirty"] else "")
            button = tk.Button(self.tabs, text=title, bg="#252b35" if active else "#171a21", fg="#f2f4f8" if active else "#9299a8", relief="flat", bd=0, padx=12, command=lambda k=key: self._select(k))
            button.pack(side="left", fill="y")

    def _highlight_current(self):
        # Basic lexical highlighting; deliberately lightweight for large files.
        for tag in ("keyword", "string", "comment"):
            self.text.tag_remove(tag, "1.0", "end")
        content = self.text.get("1.0", "end-1c")
        for pattern, tag in [(r"#[^\n]*|//[^\n]*|/\*[\s\S]*?\*/", "comment"), (r"(['\"])(?:\\.|(?!\1).)*\1", "string")]:
            for match in re.finditer(pattern, content):
                self.text.tag_add(tag, f"1.0+{match.start()}c", f"1.0+{match.end()}c")
        self.text.tag_add("keyword", "1.0", "1.0") if False else None

    def save_current(self):
        if not self.current or self.current not in self.files: return
        data = self.files[self.current]
        try:
            data["path"].write_text(self.text.get("1.0", "end-1c"), encoding="utf-8")
            data["content"] = self.text.get("1.0", "end-1c")
            data["dirty"] = False
            self._render_tabs(); self.on_status(f"Salvo: {data['path']}")
        except OSError as exc:
            messagebox.showerror("BINGO Editor", str(exc))

    def close_current(self):
        if not self.current: return
        data = self.files[self.current]
        if data["dirty"] and not messagebox.askyesno("Alterações", f"Salvar alterações em {data['path'].name}?"):
            pass
        elif data["dirty"]:
            self.save_current()
        self.files.pop(self.current, None)
        self.current = next(iter(self.files), None)
        if self.current: self._select(self.current)
        else:
            self.text.delete("1.0", "end"); self.update_lines(); self._render_tabs()

    def toggle_search(self):
        if self.search.winfo_ismapped(): self.search.pack_forget()
        else: self.search.pack(fill="x", side="top", before=self.master if False else None)
        self.search_var.set(self.search_var.get())

    def find_next(self):
        needle = self.search_var.get()
        if not needle: return
        start = self.text.index("insert")
        pos = self.text.search(needle, start, stopindex="end", nocase=True)
        if not pos: pos = self.text.search(needle, "1.0", stopindex=start, nocase=True)
        if pos:
            end = f"{pos}+{len(needle)}c"
            self.text.tag_remove("sel", "1.0", "end"); self.text.tag_add("sel", pos, end); self.text.mark_set("insert", end); self.text.see(pos)
