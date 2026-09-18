#!/usr/bin/env python3
"""
Script mouse_mover - Impede a tela de apagar por ociosidade.

Mantém o display ligado via SetThreadExecutionState (Windows) e move o mouse
por 5 segundos a cada 2 minutos.
"""

from __future__ import annotations

import ctypes
import logging
import sys
import time
from pynput.mouse import Controller as MouseController

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

STEP_SIZE = 1
STEP_DELAY = 0.1
OSCILLATION_RANGE = 50
WAIT_SECONDS = 240
MOVE_DURATION_SECONDS = 5

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002


def format_elapsed_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}m {secs}s"


def format_countdown(seconds: int) -> str:
    minutes, secs = divmod(max(0, seconds), 60)
    return f"{minutes:02d}:{secs:02d}"


def prevent_display_sleep() -> None:
    ctypes.windll.kernel32.SetThreadExecutionState(
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
    )


def restore_display_sleep() -> None:
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)


def next_offset(current_offset: int, direction: int) -> tuple[int, int]:
    current_offset += direction * STEP_SIZE
    if current_offset >= OSCILLATION_RANGE:
        return OSCILLATION_RANGE, -1
    if current_offset <= -OSCILLATION_RANGE:
        return -OSCILLATION_RANGE, 1
    return current_offset, direction


def wait_with_countdown(seconds: int) -> None:
    remaining = seconds
    while remaining > 0:
        prevent_display_sleep()
        print(
            f"Próximo movimento do mouse em {format_countdown(remaining)}   ",
            end="\r",
            flush=True,
        )
        time.sleep(1)
        remaining -= 1
    print(" " * 48, end="\r", flush=True)


def move_mouse_for(
    mouse: MouseController,
    duration_seconds: float,
    initial_x: int,
    initial_y: int,
    current_offset: int,
    direction: int,
) -> tuple[int, int]:
    logger.info(f"Movendo o mouse por {duration_seconds:.0f}s...")
    deadline = time.time() + duration_seconds

    while time.time() < deadline:
        prevent_display_sleep()
        current_offset, direction = next_offset(current_offset, direction)
        new_x = max(1, initial_x + current_offset)
        mouse.position = (new_x, initial_y)
        time.sleep(STEP_DELAY)

    logger.info("Movimento concluído.")
    return current_offset, direction


def run() -> None:
    start_time = time.time()
    mouse = MouseController()
    initial_x, initial_y = mouse.position
    direction = 1
    current_offset = 0

    prevent_display_sleep()

    logger.info("=" * 60)
    logger.info("Script mouse_mover iniciado")
    logger.info("Tela mantida ligada (SetThreadExecutionState)")
    logger.info(f"Posição inicial do mouse: ({initial_x}, {initial_y})")
    logger.info(
        f"Ciclo: move {MOVE_DURATION_SECONDS}s, espera {WAIT_SECONDS}s"
    )
    logger.info("Pressione Ctrl+C para parar o script")
    logger.info("=" * 60)

    try:
        while True:
            current_offset, direction = move_mouse_for(
                mouse,
                MOVE_DURATION_SECONDS,
                initial_x,
                initial_y,
                current_offset,
                direction,
            )
            wait_with_countdown(WAIT_SECONDS)
    except KeyboardInterrupt:
        elapsed_str = format_elapsed_time(time.time() - start_time)
        print()
        logger.info("=" * 60)
        logger.info(
            f"Script mouse_mover interrompido pelo usuário - Tempo total: {elapsed_str}"
        )
        logger.info("=" * 60)
        sys.exit(0)
    except Exception as e:
        logger.error(f"Erro inesperado: {e}")
        sys.exit(1)
    finally:
        restore_display_sleep()


def main() -> None:
    if sys.platform != "win32":
        logger.error("Este script só impede o desligamento da tela no Windows.")
        sys.exit(1)
    run()


if __name__ == "__main__":
    main()
