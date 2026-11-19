"""Run Basalt's server with the Strata host's stdin pipe as a lifeline."""

import _thread
import os
import sys
from threading import Thread
from time import sleep


def host_gone():
    sys.stdin.buffer.read()
    _thread.interrupt_main()
    sleep(12)
    os._exit(1)


if __name__ == "__main__":
    release = sys.argv.pop(1)
    sys.path.insert(0, release)
    from serve.server import main

    sys.argv.extend(("--api-key", os.environ.pop("STRATA_MANAGED_BASALT_KEY")))
    Thread(target=host_gone, daemon=True).start()
    sys.exit(main())
