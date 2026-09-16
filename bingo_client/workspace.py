from __future__ import annotations

from pathlib import Path


class Workspace:
    """Safe local project workspace used by the BINGO Client."""

    IGNORED_NAMES = {
        ".git", ".godot", "node_modules", "__pycache__", ".venv", "venv",
        "build", "dist", ".bingo"
    }

    def __init__(self, root: Path):
        self.root = root.resolve()

    def safe(self, path: Path) -> Path:
        target = path.resolve()
        if target != self.root and self.root not in target.parents:
            raise PermissionError("O caminho precisa estar dentro do workspace.")
        return target

    def list_children(self, directory: Path | None = None):
        base = self.safe(directory or self.root)
        entries = [p for p in base.iterdir() if p.name not in self.IGNORED_NAMES]
        return sorted(entries, key=lambda p: (p.is_file(), p.name.lower()))

    def create_file(self, relative: str) -> Path:
        target = self.safe(self.root / relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch(exist_ok=False)
        return target

    def create_folder(self, relative: str) -> Path:
        target = self.safe(self.root / relative)
        target.mkdir(parents=True, exist_ok=False)
        return target

    def rename(self, source: Path, new_name: str) -> Path:
        if not new_name or Path(new_name).name != new_name:
            raise ValueError("Nome inválido.")
        source = self.safe(source)
        target = self.safe(source.parent / new_name)
        source.rename(target)
        return target

    def delete(self, target: Path):
        import shutil
        target = self.safe(target)
        if target == self.root:
            raise PermissionError("O workspace não pode ser excluído pelo Explorer.")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
