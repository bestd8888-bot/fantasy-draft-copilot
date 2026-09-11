const PREFIX = "[draft-copilot]";

let verbose = false;

export function setVerbose(on: boolean): void {
  verbose = on;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (verbose) console.debug(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
};
