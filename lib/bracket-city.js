var fs = require("fs");
var crypto = require("crypto");
var https = require("https");
var path = require("path");

var sourceBase = process.env.BRACKET_CITY_PUZZLE_URL || "https://d2gknrezp32xyk.cloudfront.net/puzzles";
var puzzleDirectory = path.join(__dirname, "..", "data", "puzzles");
var startDate = process.env.PUZZLE_START_DATE || "2026-07-14";
var pending = new Map();

function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }

function easternDate(now) {
  var parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now || new Date()).reduce(function (result, part) {
    result[part.type] = part.value; return result;
  }, {});
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function requestJson(url) {
  return new Promise(function (resolve, reject) {
    var request = https.get(url, { headers: { "User-Agent": "BracketVerified/1.0" } }, function (response) {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume(); return requestJson(new URL(response.headers.location, url).toString()).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume(); var error = new Error("Bracket City returned HTTP " + response.statusCode); error.statusCode = response.statusCode; return reject(error);
      }
      var body = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error("Puzzle response was too large."));
      });
      response.on("end", function () {
        try { resolve(JSON.parse(body)); } catch (_) { reject(new Error("Bracket City returned invalid JSON.")); }
      });
    });
    request.setTimeout(10000, function () { request.destroy(new Error("Bracket City request timed out.")); });
    request.on("error", reject);
  });
}

function validate(raw, date) {
  if (!raw || raw.puzzleDate !== date || typeof raw.initialPuzzle !== "string" || typeof raw.puzzleSolution !== "string" || !raw.solutions || typeof raw.solutions !== "object") {
    throw new Error("Bracket City returned an invalid puzzle for " + date + ".");
  }
  return raw;
}

function parseParts(text, cursor, stopAtBracket) {
  var parts = [], buffer = "";
  function pushText() { if (buffer) { parts.push({ text: buffer }); buffer = ""; } }
  while (cursor.index < text.length) {
    var character = text[cursor.index++];
    if (character === "[") {
      pushText();
      parts.push({ node: { parts: parseParts(text, cursor, true) } });
    } else if (character === "]" && stopAtBracket) {
      pushText(); return parts;
    } else buffer += character;
  }
  if (stopAtBracket) throw new Error("Puzzle has an unmatched bracket.");
  pushText(); return parts;
}

function toPuzzle(raw) {
  var counter = 0;
  function finishNode(node) {
    node.id = "c" + (++counter);
    node.children = node.parts.filter(function (part) { return part.node; }).map(function (part) { return finishNode(part.node); });
    var childIndex = 0;
    node.segments = node.parts.map(function (part) {
      if (part.text !== undefined) return { text: part.text };
      return { childId: node.children[childIndex++].id };
    });
    node.clue = node.parts.map(function (part) { return part.text !== undefined ? part.text : part.node.answer; }).join("");
    node.answer = raw.solutions[node.clue];
    if (typeof node.answer !== "string") throw new Error("No solution found for clue: " + node.clue);
    delete node.parts;
    return node;
  }

  var topParts = parseParts(raw.initialPuzzle, { index: 0 }, false);
  var root = { id: "root", synthetic: true, children: [] };
  root.children = topParts.filter(function (part) { return part.node; }).map(function (part) { return finishNode(part.node); });
  var topChildIndex = 0;
  root.segments = topParts.map(function (part) {
    if (part.text !== undefined) return { text: part.text };
    return { childId: root.children[topChildIndex++].id };
  });
  var fact = [raw.completionText, raw.puzzleSolution].filter(Boolean).join(" ");
  if (fact && !/[.!?]$/.test(fact)) fact += ".";
  return {
    date: raw.puzzleDate,
    sourceId: crypto.createHash("sha256").update(raw.puzzleDate + "\n" + raw.initialPuzzle).digest("hex"),
    title: "Bracket City",
    fact: fact,
    completionURL: raw.completionURL || null,
    author: raw.author || null,
    root: root
  };
}

async function read(date) {
  try { return validate(JSON.parse(await fs.promises.readFile(path.join(puzzleDirectory, date + ".json"), "utf8")), date); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function importDate(date) {
  if (!isDate(date) || date < startDate) return null;
  if (pending.has(date)) return pending.get(date);
  var operation = (async function () {
    var raw;
    try { raw = validate(await requestJson(sourceBase + "/" + date + ".json"), date); }
    catch (error) { if (error.statusCode === 403 || error.statusCode === 404) return null; throw error; }
    toPuzzle(raw);
    await fs.promises.mkdir(puzzleDirectory, { recursive: true });
    var destination = path.join(puzzleDirectory, date + ".json"), temporary = destination + ".tmp";
    await fs.promises.writeFile(temporary, JSON.stringify(raw, null, 2) + "\n");
    await fs.promises.rename(temporary, destination);
    return raw;
  })();
  pending.set(date, operation);
  try { return await operation; } finally { pending.delete(date); }
}

async function get(date) {
  if (!isDate(date) || date < startDate) return null;
  var raw = await read(date);
  if (!raw) raw = await importDate(date);
  return raw ? toPuzzle(raw) : null;
}

module.exports = { easternDate: easternDate, get: get, importDate: importDate, startDate: startDate, toPuzzle: toPuzzle };
