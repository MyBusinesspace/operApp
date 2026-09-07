export class Base44Error extends Error {
  constructor(message, status, code, data, originalError) {
    super(message);
    this.name = "Base44Error";
    this.status = status;
    this.code = code;
    this.data = data;
    this.originalError = originalError;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      data: this.data,
    };
  }
}

export function toBase44Error(error, fallbackStatus = 500) {
  if (error instanceof Base44Error) return error;
  const status = error?.status ?? error?.statusCode ?? fallbackStatus;
  const message = error?.message || "Request failed";
  const code = error?.code || "ERROR";
  const data = error?.data ?? { message, extra_data: error?.extra_data };
  return new Base44Error(message, status, code, data, error);
}
