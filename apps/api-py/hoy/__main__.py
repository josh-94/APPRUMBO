import logging
import sys

import uvicorn

from .api import build
from .config import load

logging.basicConfig(level=logging.INFO)


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "vapid":
        _print_vapid()
        return
    cfg = load()
    host = "0.0.0.0"
    port = 8080
    addr = cfg.addr
    if addr.startswith(":"):
        port = int(addr[1:])
    elif ":" in addr:
        host, raw_port = addr.rsplit(":", 1)
        port = int(raw_port)
    uvicorn.run(build(cfg), host=host, port=port, workers=1)


def _print_vapid() -> None:
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    print("VAPID_PUBLIC_KEY=" + base64.urlsafe_b64encode(public).decode().rstrip("="))
    print("VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(private).decode().rstrip("="))


if __name__ == "__main__":
    main()
