export type CliContext = {
  json: boolean;
};

export class CliCommandError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code = "ERROR", details?: unknown) {
    super(message);
    this.name = "CliCommandError";
    this.code = code;
    this.details = details;
  }
}

export function fail(message: string, code = "ERROR", details?: unknown): never {
  throw new CliCommandError(message, code, details);
}

