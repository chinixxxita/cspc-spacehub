// Minimal, safe CSV writer for report exports.

// Spreadsheets run cells that begin with = + - @ (or a tab / carriage return) as
// formulas. A user-typed value like =HYPERLINK(...) would execute when an admin opens
// the file ("CSV injection"). Prefixing an apostrophe forces plain text.
function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  // Check the raw value first: leading whitespace or line breaks before the
  // formula character ("\n=cmd") must not hide it, and a leading tab/CR is itself unsafe.
  const risky = /^\s*[=+\-@]/.test(s) || /^[\t\r]/.test(s);
  s = s.replace(/\r\n|\r|\n/g, " ");
  if (risky) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (names with accents) correctly; CRLF per RFC 4180.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

module.exports = { csvCell, toCsv };
