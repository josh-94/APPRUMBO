import logging
import threading

from .config import load
from .notify import connect_redis, run_worker
from .store import connect

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("hoy")


def main() -> None:
    cfg = load()
    store = connect(cfg.database_url)
    client = connect_redis(cfg.redis_url)
    stop = threading.Event()
    log.info("worker")
    run_worker(store, client, cfg.vapid_public, cfg.vapid_private, cfg.vapid_subject, stop)


if __name__ == "__main__":
    main()
