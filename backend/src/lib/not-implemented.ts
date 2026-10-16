export class NotImplementedError extends Error {
  constructor(operation: string) {
    super(
      `${operation} is not implemented. This scaffold must not simulate a successful result.`,
    );
    this.name = "NotImplementedError";
  }
}

export function notImplemented(operation: string): Promise<never> {
  return Promise.reject(new NotImplementedError(operation));
}
