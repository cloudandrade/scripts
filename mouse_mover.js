#!/usr/bin/env node
/**
 * Script mouse_mover - Impede a tela de apagar por ociosidade (Windows + Node).
 *
 * Mantém o display ligado via SetThreadExecutionState e move o mouse
 * por 5 segundos a cada intervalo de espera.
 *
 * Uso: node mouse_mover.js
 */

const { spawn } = require("child_process");
const readline = require("readline");

const STEP_SIZE = 1;
const STEP_DELAY_MS = 100;
const OSCILLATION_RANGE = 50;
const WAIT_SECONDS = 240;
const MOVE_DURATION_SECONDS = 5;

const POWERSHELL_BRIDGE = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
}
"@
function Send-Line([string]$text) {
  [Console]::Out.WriteLine($text)
  [Console]::Out.Flush()
}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Trim() -split ' '
  $cmd = $parts[0]
  if ($cmd -eq 'GET') {
    $p = New-Object Win32+POINT
    [void][Win32]::GetCursorPos([ref]$p)
    Send-Line ("{0} {1}" -f $p.X, $p.Y)
  } elseif ($cmd -eq 'SET') {
    [void][Win32]::SetCursorPos([int]$parts[1], [int]$parts[2])
    Send-Line 'OK'
  } elseif ($cmd -eq 'AWAKE') {
    [void][Win32]::SetThreadExecutionState(2147483651)
    Send-Line 'OK'
  } elseif ($cmd -eq 'SLEEP') {
    [void][Win32]::SetThreadExecutionState(2147483648)
    Send-Line 'OK'
  } elseif ($cmd -eq 'QUIT') {
    Send-Line 'OK'
    break
  } else {
    Send-Line 'ERR'
  }
}
`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsedTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function nextOffset(currentOffset, direction) {
  let offset = currentOffset + direction * STEP_SIZE;
  if (offset >= OSCILLATION_RANGE) {
    return { offset: OSCILLATION_RANGE, direction: -1 };
  }
  if (offset <= -OSCILLATION_RANGE) {
    return { offset: -OSCILLATION_RANGE, direction: 1 };
  }
  return { offset, direction };
}

function createWin32Bridge() {
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_BRIDGE],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  const rl = readline.createInterface({ input: child.stdout });
  const waiters = [];
  let stderrBuffer = "";

  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(line.trim());
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
  });

  child.on("exit", (code) => {
    const err = new Error(
      `Bridge PowerShell encerrou (code ${code}). ${stderrBuffer}`.trim()
    );
    while (waiters.length) {
      waiters.shift().reject(err);
    }
  });

  function send(command) {
    return new Promise((resolve, reject) => {
      if (child.exitCode !== null) {
        reject(new Error("Bridge PowerShell já foi encerrada."));
        return;
      }
      waiters.push({ resolve, reject });
      child.stdin.write(`${command}\n`);
    });
  }

  return {
    send,
    close() {
      try {
        child.stdin.write("QUIT\n");
      } catch (_error) {
        // ignore
      }
      child.kill();
    },
  };
}

async function waitWithCountdown(bridge, seconds) {
  let remaining = seconds;
  while (remaining > 0) {
    await bridge.send("AWAKE");
    process.stdout.write(
      `Próximo movimento do mouse em ${formatCountdown(remaining)}   \r`
    );
    await sleep(1000);
    remaining -= 1;
  }
  process.stdout.write(`${" ".repeat(48)}\r`);
}

async function moveMouseFor(bridge, durationSeconds, initialX, initialY, state) {
  console.log(`Movendo o mouse por ${durationSeconds}s...`);
  const deadline = Date.now() + durationSeconds * 1000;
  let { offset, direction } = state;

  while (Date.now() < deadline) {
    await bridge.send("AWAKE");
    const next = nextOffset(offset, direction);
    offset = next.offset;
    direction = next.direction;
    const newX = Math.max(1, initialX + offset);
    await bridge.send(`SET ${newX} ${initialY}`);
    await sleep(STEP_DELAY_MS);
  }

  console.log("Movimento concluído.");
  return { offset, direction };
}

async function run() {
  const startTime = Date.now();
  const bridge = createWin32Bridge();
  let shuttingDown = false;

  async function shutdown(exitCode) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await bridge.send("SLEEP");
    } catch (_error) {
      // ignore
    }
    bridge.close();
    process.exit(exitCode);
  }

  process.on("SIGINT", async () => {
    const elapsed = formatElapsedTime((Date.now() - startTime) / 1000);
    process.stdout.write("\n");
    console.log("=".repeat(60));
    console.log(
      `Script mouse_mover interrompido pelo usuário - Tempo total: ${elapsed}`
    );
    console.log("=".repeat(60));
    await shutdown(0);
  });

  try {
    await bridge.send("AWAKE");
    const position = await bridge.send("GET");
    const [initialX, initialY] = position.split(" ").map(Number);

    console.log("=".repeat(60));
    console.log("Script mouse_mover iniciado");
    console.log("Tela mantida ligada (SetThreadExecutionState)");
    console.log(`Posição inicial do mouse: (${initialX}, ${initialY})`);
    console.log(
      `Ciclo: move ${MOVE_DURATION_SECONDS}s, espera ${WAIT_SECONDS}s`
    );
    console.log("Pressione Ctrl+C para parar o script");
    console.log("=".repeat(60));

    let state = { offset: 0, direction: 1 };
    while (!shuttingDown) {
      state = await moveMouseFor(
        bridge,
        MOVE_DURATION_SECONDS,
        initialX,
        initialY,
        state
      );
      await waitWithCountdown(bridge, WAIT_SECONDS);
    }
  } catch (error) {
    console.error(`Erro inesperado: ${error.message}`);
    await shutdown(1);
  }
}

function main() {
  if (process.platform !== "win32") {
    console.error("Este script só impede o desligamento da tela no Windows.");
    process.exit(1);
  }
  run();
}

main();
