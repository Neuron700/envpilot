const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

export function singleLine(value: string): string {
  return value.replace(/\r\n?|\n/g, " ").replace(CONTROL_CHARACTERS, "").trim();
}

export function terminalText(value: string): string {
  return singleLine(value);
}

export function markdownText(value: string): string {
  let result = singleLine(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([\\`*_\[\]|])/g, "\\$1");

  if (/^[#+-]|^\d+\./.test(result)) {
    result = `\\${result}`;
  }

  return result;
}
