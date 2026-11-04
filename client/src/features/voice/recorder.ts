/** The microphone. Only the web version records for now; on a phone build this reports "not supported". */
export interface Recording {
  /** Ends the recording and returns it as a WAV file (base64) that Meta's transcriber accepts. */
  stop: () => Promise<{ wavBase64: string; seconds: number }>;
  /** Ends the recording and throws it away. */
  cancel: () => void;
}

export interface RecordingOptions {
  /** Given 80 ms pieces of 16 kHz mono 16-bit audio as they are recorded (for live captions). */
  onFrame?: (frame: Uint8Array) => void;
}

export const voiceSupported = (): boolean => false;

export async function startRecording(_options?: RecordingOptions): Promise<Recording> {
  throw new Error("Speaking to the tutor works in the web version for now.");
}
