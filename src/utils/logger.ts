let debugEnabled = false;

export function setDebugMode(enabled: boolean): void {
  debugEnabled = enabled;
}

/** Always logs — for important events and errors */
export function log(message: string): void {
  console.log(`BookBridge: ${message}`);
}

/** Only logs when debug mode is enabled — for verbose details */
export function debug(message: string): void {
  if (debugEnabled) {
    console.log(`BookBridge: [DEBUG] ${message}`);
  }
}

/** Always logs warnings */
export function warn(message: string): void {
  console.warn(`BookBridge: ${message}`);
}
