#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script port_clear - Libera uma porta TCP matando o processo que a está usando (Windows).

Uso:
  python port_clear.py
  python port_clear.py --port 3001
  python port_clear.py --port=3001
"""

from __future__ import annotations

import argparse
import subprocess
import sys

DEFAULT_PORT = 3000

BLUE = "\x1b[34m"
RED = "\x1b[31m"
YELLOW = "\x1b[1;33m"
GREEN = "\x1b[0;32m"
RESET = "\x1b[0m"

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Libera uma porta matando o processo que a está usando."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Porta a liberar (padrão: {DEFAULT_PORT})",
    )
    return parser.parse_args(argv)


def validate_port(port: int) -> None:
    if port <= 0 or port > 65535:
        print(
            f"{RED} Porta inválida. Use --port=<número> (ex: --port=3001){RESET}"
        )
        sys.exit(1)


def local_address_matches_port(local_address: str, port: int) -> bool:
    # Formatos comuns: 0.0.0.0:3000, [::]:3000, 127.0.0.1:3000
    if local_address.startswith("[") and "]:" in local_address:
        port_part = local_address.rsplit("]:", 1)[-1]
    elif ":" in local_address:
        port_part = local_address.rsplit(":", 1)[-1]
    else:
        return False

    return port_part.isdigit() and int(port_part) == port


def find_pids_on_port(port: int) -> list[int]:
    result = subprocess.run(
        ["netstat", "-ano"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if result.stderr.strip():
        print(f"{RED} stderr: {result.stderr.strip()}{RESET}")

    print(f"{BLUE} Buscando processos para a porta:{RESET}")
    matching_lines: list[str] = []
    pids: set[int] = set()

    for line in result.stdout.splitlines():
        parts = line.split()
        # TCP: Proto Local Foreign State PID | UDP: Proto Local Foreign PID
        if len(parts) < 4:
            continue

        proto = parts[0].upper()
        if proto not in ("TCP", "UDP"):
            continue

        local_address = parts[1]
        pid_str = parts[-1]
        if not pid_str.isdigit():
            continue

        if not local_address_matches_port(local_address, port):
            continue

        pid = int(pid_str)
        if pid == 0:
            continue

        matching_lines.append(line.strip())
        pids.add(pid)

    if matching_lines:
        print("\n".join(matching_lines))
    else:
        print("(nenhuma linha encontrada)")

    return sorted(pids)


def kill_pids(pids: list[int], port: int) -> None:
    if not pids:
        print(
            f"{BLUE} Não foi encontrado nenhum processo usando esta porta!{RESET}"
        )
        return

    print(f"{YELLOW} Filtrando processos...{RESET}")

    for pid in pids:
        kill_result = subprocess.run(
            ["taskkill", "/F", "/PID", str(pid)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        if kill_result.returncode == 0:
            print(f"{GREEN} .. .{RESET}")
            print(
                f" Porta liberada, o processo {pid} ocupando a porta {port} foi finalizado"
            )
        else:
            err = (kill_result.stderr or kill_result.stdout or "").strip()
            print(f"{RED} Falha ao finalizar PID {pid}: {err}{RESET}")


def main() -> None:
    args = parse_args()
    validate_port(args.port)

    print(f"{BLUE} Porta alvo: {args.port}{RESET}")
    pids = find_pids_on_port(args.port)
    kill_pids(pids, args.port)


if __name__ == "__main__":
    main()
