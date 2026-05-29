const isDevelopment = Boolean(import.meta.env?.DEV);

export function logClientInfo(message, details) {
  if (!isDevelopment) return;

  if (details === undefined) {
    console.info(message);
    return;
  }

  console.info(message, details);
}

export function logClientWarning(message, error) {
  if (isDevelopment && error) {
    console.warn(message, error);
    return;
  }

  console.warn(message);
}
