#!/usr/bin/env python3
"""Local relay: lets the Clean TV Home module open real TV apps.

The TizenBrew module webview on this TV does not expose the Tizen app API,
so the module cannot launch apps by itself. Instead it sends a request here,
and this relay forwards an `execute` command over the TV's authorized
developer (SDB) connection.

Run on the same network as the TV while the TV's Host PC IP points here:
    python3 relay.py --tv 10.0.0.37 --port 8799

No Samsung account or signing is involved. Keep this terminal running while
using the module. Ctrl+C to stop.
"""

import argparse
import json
import socket
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

def _compile_allow():
    import re
    # Tizen application IDs look like "<package>.<AppName>".
    return re.compile(r"^[A-Za-z0-9_.-]{1,128}$")


ALLOW_ID = _compile_allow()


def read_exact(sock, size):
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise EOFError("developer connection closed")
        data += chunk
    return data


def send(sock, command, arg0=0, arg1=0, payload=b""):
    number = int.from_bytes(command.encode(), "little")
    header = struct.pack(
        "<6I", number, arg0, arg1, len(payload),
        sum(payload) & 0xFFFFFFFF, number ^ 0xFFFFFFFF)
    sock.sendall(header + payload)


def receive(sock):
    command, a, b, size, checksum, magic = struct.unpack("<6I", read_exact(sock, 24))
    if size > 16 * 1024 * 1024:
        raise RuntimeError("unexpected developer packet size")
    return command.to_bytes(4, "little").decode(), a, b, read_exact(sock, size)


def run_service(tv_host, service, timeout=20):
    """Open one developer service and return its full output."""
    output = bytearray()
    with socket.create_connection((tv_host, 26101), timeout=timeout) as sock:
        send(sock, "CNXN", 0x01000000, 4096, b"host::\0")
        while True:
            command, remote, local, payload = receive(sock)
            if command == "CNXN":
                break
            if command == "AUTH":
                raise RuntimeError("TV asked for authentication")
        send(sock, "OPEN", 1, 0, service.encode() + b"\0")
        while True:
            command, remote, local, payload = receive(sock)
            if command == "WRTE":
                output.extend(payload)
                send(sock, "OKAY", 1, remote)
            elif command == "CLSE":
                send(sock, "CLSE", 1, remote)
                break
    return bytes(output)


class Handler(BaseHTTPRequestHandler):
    tv_host = "10.0.0.37"
    lock = threading.Lock()

    def log_message(self, *_):
        pass

    def _headers(self, status=200, content_type="application/json"):
        body = getattr(self, "_body", b"")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def respond(self, status, obj):
        self._body = json.dumps(obj).encode()
        self._headers(status)

    def do_OPTIONS(self):
        self._body = b""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/health":
            return self.respond(200, {"ok": True, "tv": self.tv_host})
        if path != "/launch":
            return self.respond(404, {"error": "unknown route"})
        query = parse_qs(urlsplit(self.path).query)
        app_id = (query.get("appid") or [""])[0]
        if not ALLOW_ID.match(app_id):
            return self.respond(400, {"error": "invalid app id"})
        try:
            with self.lock:
                run_service(self.tv_host, "shell:0 execute 0 " + app_id)
        except Exception as error:
            return self.respond(502, {"error": "TV command failed: %s" % error})
        return self.respond(200, {"ok": True, "appid": app_id})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tv", default="10.0.0.37")
    parser.add_argument("--port", type=int, default=8799)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()
    Handler.tv_host = args.tv
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("Clean TV relay: http://127.0.0.1:%d (TV %s)" % (args.port, args.tv), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
