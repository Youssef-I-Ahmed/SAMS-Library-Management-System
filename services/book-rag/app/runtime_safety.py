"""Local-only, extractive runtime policy. No credentials or payload logging."""
import ipaddress
import os
import socket

_installed = False
_denied = 0
_db_peers = set()


def database_host_allowed(host, port):
    # Only this fixed Compose alias is added; no arbitrary LAN/public host option.
    return (_local(host) or (os.environ.get("BOOK_RAG_CONTAINER") == "1"
                            and host == "postgres" and int(port) == 5432))


def network_status():
    return {"denied_attempts": _denied, "offline": True}


def _local(host):
    if host is None or host in ("localhost", b"localhost"):
        return True
    try:
        return ipaddress.ip_address(host.decode() if isinstance(host, bytes) else host).is_loopback
    except (ValueError, TypeError):
        return False


def install():
    global _installed, _db_peers
    if _installed:
        return
    if os.environ.get("LLM_PROVIDER", "extractive") != "extractive":
        raise RuntimeError("This service supports local extractive operation only")
    os.environ.update(LLM_PROVIDER="extractive", HF_HUB_OFFLINE="1",
                      TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    resolve, connect, connect_ex = socket.getaddrinfo, socket.socket.connect, socket.socket.connect_ex
    if os.environ.get("BOOK_RAG_CONTAINER") == "1":
        if os.environ.get("BOOK_RAG_PGHOST") != "postgres" or os.environ.get("BOOK_RAG_PGPORT") != "5432":
            raise RuntimeError("Invalid isolated database endpoint")
        peers = resolve("postgres", 5432, type=socket.SOCK_STREAM)
        _db_peers = {peer[4][0] for peer in peers}
        if not _db_peers or any(not ipaddress.ip_address(p).is_private for p in _db_peers):
            raise RuntimeError("Invalid isolated database peer")

    def deny():
        global _denied
        _denied += 1
        raise OSError("External network disabled")

    def allowed_address(address):
        return isinstance(address, tuple) and (_local(address[0]) or
                (address[0] in _db_peers and address[1] == 5432))

    def local_resolve(host, *args, **kwargs):
        if host == "postgres" and _db_peers and args and int(args[0]) == 5432:
            return [peer for peer in resolve(host, *args, **kwargs) if peer[4][0] in _db_peers]
        if not _local(host):
            deny()
        return resolve(host, *args, **kwargs)

    def local_connect(sock, address):
        if not allowed_address(address):
            deny()
        return connect(sock, address)

    def local_connect_ex(sock, address):
        if not allowed_address(address):
            deny()
        return connect_ex(sock, address)

    socket.getaddrinfo = local_resolve
    socket.socket.connect = local_connect
    socket.socket.connect_ex = local_connect_ex
    _installed = True
