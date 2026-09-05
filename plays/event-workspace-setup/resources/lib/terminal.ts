export class PromptCancelled extends Error {
  constructor() {
    super("Cancelled; no further action taken");
  }
}

/** Terminal interaction stays on the controlling TTY; stdout remains the Play receipt. */
export function displayText(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim()
    .slice(0, 120);
}

export class Terminal {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private pending = "";
  private closed = false;
  private stop = () => {
    this.close();
    Deno.exit(130);
  };
  constructor(
    private input: Deno.FsFile,
    private output: Deno.FsFile,
    private restore: () => void = () => {},
  ) {
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", this.stop);
      Deno.addSignalListener("SIGINT", this.stop);
    }
  }
  private static foreground(): () => void {
    if (Deno.build.os === "windows") return () => {};
    // Rote isolates process groups. Borrow the controlling terminal for this
    // prompt, then return it to Rote before the next step; otherwise reads stop
    // on SIGTTIN. No subprocess or extra runtime is required.
    const library = Deno.dlopen(
      Deno.build.os === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
      {
        open: { parameters: ["buffer", "i32"], result: "i32" },
        close: { parameters: ["i32"], result: "i32" },
        getpgrp: { parameters: [], result: "i32" },
        tcgetpgrp: { parameters: ["i32"], result: "i32" },
        tcsetpgrp: { parameters: ["i32", "i32"], result: "i32" },
        signal: { parameters: ["i32", "pointer"], result: "pointer" },
      },
    );
    const fd = library.symbols.open(new TextEncoder().encode("/dev/tty\0"), 2);
    const previous = library.symbols.tcgetpgrp(fd);
    // POSIX SIGTTOU is 22 on the supported Darwin/Linux platforms. A JS signal
    // listener still interrupts tcsetpgrp; SIG_IGN is required for job control.
    const previousHandler = library.symbols.signal(
      22,
      Deno.UnsafePointer.create(1n),
    );
    if (
      fd < 0 || previous < 0 ||
      library.symbols.tcsetpgrp(fd, library.symbols.getpgrp()) !== 0
    ) {
      library.symbols.signal(22, previousHandler);
      library.symbols.close(fd);
      library.close();
      throw new Error("Could not acquire the interactive terminal");
    }
    return () => {
      library.symbols.tcsetpgrp(fd, previous);
      library.symbols.signal(22, previousHandler);
      library.symbols.close(fd);
      library.close();
    };
  }
  static open(): Terminal | null {
    if (Deno.env.get("EVENT_READY_WORKSPACE_INTERACTIVE") === "0") return null;
    let input: Deno.FsFile | undefined;
    let output: Deno.FsFile | undefined;
    try {
      input = Deno.openSync(
        Deno.build.os === "windows" ? "CONIN$" : "/dev/tty",
        { read: true },
      );
      output = Deno.openSync(
        Deno.build.os === "windows" ? "CONOUT$" : "/dev/tty",
        { write: true },
      );
      if (!input.isTerminal() || !output.isTerminal()) {
        input.close();
        output.close();
        return null;
      }
      return new Terminal(input, output, Terminal.foreground());
    } catch {
      input?.close();
      output?.close();
      return null;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.input.setRaw(false);
    this.write("\x1b[?25h");
    if (Deno.build.os !== "windows") {
      Deno.removeSignalListener("SIGTERM", this.stop);
      Deno.removeSignalListener("SIGINT", this.stop);
    }
    this.restore();
    this.input.close();
    this.output.close();
  }
  write(text: string): void {
    this.output.writeSync(this.encoder.encode(text));
  }
  private async key(): Promise<string> {
    while (!this.pending) {
      const bytes = new Uint8Array(64);
      const count = await this.input.read(bytes);
      if (count === null) {
        throw new Error("Terminal closed; no further action taken");
      }
      this.pending += this.decoder.decode(bytes.subarray(0, count));
    }
    if (this.pending.startsWith("\x1b") && this.pending.length < 3) {
      const bytes = new Uint8Array(8);
      const count = await this.input.read(bytes);
      if (count) this.pending += this.decoder.decode(bytes.subarray(0, count));
    }
    const length = this.pending.startsWith("\x1b[") ? 3 : 1;
    const key = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    if (key === "\x03" || key === "\x04") {
      throw new PromptCancelled();
    }
    return key;
  }
  private label(value: string): string {
    let columns = 80;
    try {
      columns = Deno.consoleSize().columns;
    } catch { /* stdout is a receipt pipe */ }
    const clean = displayText(value);
    const width = Math.max(16, columns - 4);
    return clean.length > width ? `${clean.slice(0, width - 1)}…` : clean;
  }
  async choose(title: string, options: string[], initial = 0): Promise<number> {
    if (!options.length) throw new Error("No options are available");
    let selected = Math.min(initial, options.length - 1);
    const visible = Math.min(options.length, 9);
    let rendered = false;
    const render = () => {
      const first = Math.min(
        Math.max(0, selected - visible + 1),
        options.length - visible,
      );
      let screen = rendered ? `\x1b[${visible + 2}A\r\x1b[J` : "\r\x1b[2K";
      screen += `\n${this.label(title)}\n`;
      for (let i = first; i < first + visible; i++) {
        screen += `${i === selected ? "❯" : " "} ${this.label(options[i])}\n`;
      }
      // Leave a spare line for Rote's progress indicator, keeping prompts intact.
      this.write(screen);
      rendered = true;
    };
    this.input.setRaw(true);
    this.write("\x1b[?25l");
    try {
      render();
      while (true) {
        const key = await this.key();
        if (key === "\r" || key === "\n") {
          this.write(`\r\x1b[2K  Selected: ${this.label(options[selected])}\n`);
          return selected;
        }
        if (key === "\x1b[A" || key === "k") {
          selected = (selected + options.length - 1) % options.length;
        } else if (key === "\x1b[B" || key === "j") {
          selected = (selected + 1) % options.length;
        } else continue;
        render();
      }
    } finally {
      this.input.setRaw(false);
      this.write("\x1b[?25h");
    }
  }
  async ask(title: string, initial = ""): Promise<string> {
    let value = "";
    let rendered = false;
    const render = () => {
      const prefix = rendered ? "\x1b[3A\r\x1b[J" : "\r\x1b[2K";
      this.write(
        `${prefix}\n${this.label(title)}\n› ${this.label(value || initial)}\n`,
      );
      rendered = true;
    };
    this.input.setRaw(true);
    this.write("\x1b[?25l");
    try {
      render();
      while (true) {
        const key = await this.key();
        if (key === "\r" || key === "\n") {
          this.write("\r\x1b[2K");
          return value.trim() || initial;
        }
        if (key === "\x7f" || key === "\b") {
          value = value.slice(0, -1);
        } else if (!/[\x00-\x1f\x7f-\x9f]/.test(key) && value.length < 1000) {
          value += key;
        } else continue;
        render();
      }
    } finally {
      this.input.setRaw(false);
      this.write("\x1b[?25h");
    }
  }
}

export type Prompts = {
  write(text: string): void;
  choose(
    title: string,
    options: string[],
    initial?: number,
  ): number | Promise<number>;
  ask(title: string, initial?: string): string | Promise<string>;
};
