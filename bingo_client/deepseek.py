from __future__ import annotations

import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 8766


class DeepSeekRelay:
    """Loopback relay between the desktop client and the browser extension."""

    def __init__(self):
        self.lock = threading.Lock()
        self.connected = False
        self.chat_name = ""
        self.connection_id = ""
        self.connected_at = 0.0
        self.outbound: queue.Queue[dict[str, Any]] = queue.Queue()
        self.inbound: queue.Queue[dict[str, Any]] = queue.Queue()

    def connect(self, chat_name: str, connection_id: str):
        with self.lock:
            self.connected = True
            self.chat_name = chat_name or "DeepSeek"
            self.connection_id = connection_id or f"bingo-{int(time.time() * 1000)}"
            self.connected_at = time.time()
            return self.status()

    def disconnect(self):
        with self.lock:
            self.connected = False
            return self.status()

    def status(self):
        with self.lock:
            return {
                "connected": self.connected,
                "provider": "DeepSeek",
                "chat_name": self.chat_name,
                "connection_id": self.connection_id,
                "connected_at": self.connected_at,
                "relay": "online",
            }

    def push_outbound(self, text: str):
        self.outbound.put({"id": f"msg-{time.time_ns()}", "text": text, "at": time.time()})

    def pop_outbound(self):
        try:
            return self.outbound.get_nowait()
        except queue.Empty:
            return None

    def push_inbound(self, text: str):
        self.inbound.put({"id": f"reply-{time.time_ns()}", "text": text, "at": time.time()})

    def pop_inbound(self):
        try:
            return self.inbound.get_nowait()
        except queue.Empty:
            return None


RELAY = DeepSeekRelay()


def _json(handler: BaseHTTPRequestHandler, payload: dict[str, Any], status: int = 200):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_OPTIONS(self):
        _json(self, {"ok": True})

    def do_GET(self):
        if self.path == "/health" or self.path == "/status":
            _json(self, {"ok": True, **RELAY.status(), "port": PORT})
            return
        if self.path == "/outbound":
            _json(self, {"ok": True, "message": RELAY.pop_outbound()})
            return
        if self.path == "/inbound":
            _json(self, {"ok": True, "message": RELAY.pop_inbound()})
            return
        _json(self, {"ok": False, "error": "Endpoint not found."}, 404)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            _json(self, {"ok": False, "error": "JSON invalido."}, 400)
            return

        if self.path == "/connect":
            _json(self, {"ok": True, **RELAY.connect(str(body.get("chat_name", "DeepSeek")), str(body.get("connection_id", "")))})
            return
        if self.path == "/disconnect":
            _json(self, {"ok": True, **RELAY.disconnect()})
            return
        if self.path == "/send":
            text = str(body.get("text", ""))
            if not text.strip():
                _json(self, {"ok": False, "error": "Mensagem vazia."}, 400)
                return
            RELAY.push_outbound(text)
            _json(self, {"ok": True})
            return
        if self.path == "/inbound":
            text = str(body.get("text", ""))
            if text.strip(): RELAY.push_inbound(text)
            _json(self, {"ok": True})
            return
        _json(self, {"ok": False, "error": "Endpoint not found."}, 404)


def start_server():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True, name="BingoDeepSeekRelay").start()
    return server
