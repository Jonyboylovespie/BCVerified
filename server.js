require("dotenv").config({ quiet: true });

var express = require("express");
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var game = require("./lib/game");
var bracketCity = require("./lib/bracket-city");

var app = express();
var port = Number(process.env.PORT || 3000);
var secret = process.env.SESSION_SECRET || "dev-only-change-this-secret";
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}
var storePath = process.env.STORE_PATH || path.join(__dirname, "data", "store.json");
var store = loadStore();

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

function loadStore() {
  try { return JSON.parse(fs.readFileSync(storePath, "utf8")); }
  catch (_) { return { users: [], games: {}, shares: {} }; }
}

function saveStore() {
  var temp = storePath + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, storePath);
}

function today() { return bracketCity.easternDate(); }

function emptyState(puzzle) {
  return { puzzleId: puzzle.sourceId, solved: [], peeked: [], revealed: [], wrong: [], startedAt: new Date().toISOString(), completedAt: null, shareId: null };
}

function parseCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce(function (all, pair) {
    var index = pair.indexOf("=");
    if (index > 0) all[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    return all;
  }, {});
}

function sign(value) { return crypto.createHmac("sha256", secret).update(value).digest("base64url"); }

function currentUser(req) {
  var token = parseCookies(req).bc_session;
  if (!token) return null;
  var pieces = token.split(".");
  if (pieces.length !== 2 || pieces[1].length !== sign(pieces[0]).length || !crypto.timingSafeEqual(Buffer.from(pieces[1]), Buffer.from(sign(pieces[0])))) return null;
  try {
    var payload = JSON.parse(Buffer.from(pieces[0], "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return store.users.find(function (user) { return user.id === payload.id; }) || null;
  } catch (_) { return null; }
}

function setSession(res, user) {
  var payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 30 * 86400000 })).toString("base64url");
  res.setHeader("Set-Cookie", "bc_session=" + payload + "." + sign(payload) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
}

function requireUser(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in to play and verify your score." });
  next();
}

function profile(user) {
  var completions = Object.keys(store.games).filter(function (key) {
    return key.indexOf(user.id + ":") === 0 && store.games[key].completedAt;
  }).map(function (key) { return store.games[key]; });
  var scores = completions.map(game.scoreFor);
  var puppetMasters = completions.filter(function (state) {
    return game.rankFor(game.scoreFor(state), state) === "Puppet Master";
  }).length;
  return {
    id: user.id,
    username: user.username,
    completed: completions.length,
    averageScore: scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) : null,
    puppetMasterPercent: scores.length ? Math.round(puppetMasters / scores.length * 100) : null
  };
}

function hashPassword(password, salt, callback) {
  crypto.scrypt(password, salt, 64, function (error, key) { callback(error, key && key.toString("hex")); });
}

app.post("/api/register", function (req, res) {
  var username = String(req.body.username || "").trim();
  var password = String(req.body.password || "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: "Username must be 3-20 letters, numbers, or underscores." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (store.users.some(function (user) { return user.username.toLowerCase() === username.toLowerCase(); })) return res.status(409).json({ error: "That username is taken." });
  var salt = crypto.randomBytes(16).toString("hex");
  hashPassword(password, salt, function (error, hash) {
    if (error) return res.status(500).json({ error: "Could not create account." });
    var user = { id: crypto.randomUUID(), username: username, salt: salt, passwordHash: hash, createdAt: new Date().toISOString() };
    store.users.push(user); saveStore(); setSession(res, user); res.status(201).json({ user: profile(user) });
  });
});

app.post("/api/login", function (req, res) {
  var user = store.users.find(function (item) { return item.username.toLowerCase() === String(req.body.username || "").trim().toLowerCase(); });
  if (!user) return res.status(401).json({ error: "Incorrect username or password." });
  hashPassword(String(req.body.password || ""), user.salt, function (error, hash) {
    if (error || hash.length !== user.passwordHash.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) return res.status(401).json({ error: "Incorrect username or password." });
    setSession(res, user); res.json({ user: profile(user) });
  });
});

app.post("/api/logout", function (_req, res) {
  res.setHeader("Set-Cookie", "bc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.status(204).end();
});

app.get("/api/me", function (req, res) {
  var user = currentUser(req);
  res.json({ user: user ? profile(user) : null, today: today(), startDate: bracketCity.startDate });
});

app.get("/api/puzzle/:date", requireUser, async function (req, res, next) {
  try {
  if (req.params.date > today()) return res.status(404).json({ error: "That puzzle is not available yet." });
  var puzzle = await bracketCity.get(req.params.date);
  if (!puzzle) return res.status(404).json({ error: "That puzzle is not available yet." });
  var key = req.user.id + ":" + puzzle.date;
  if (!store.games[key] || store.games[key].puzzleId !== puzzle.sourceId) { store.games[key] = emptyState(puzzle); saveStore(); }
  var state = store.games[key];
  res.json({ puzzle: game.publicPuzzle(puzzle, state), score: game.scoreFor(state), rank: game.rankFor(game.scoreFor(state), state), shareId: state.shareId });
  } catch (error) { next(error); }
});

app.post("/api/puzzle/:date/action", requireUser, async function (req, res, next) {
  try {
  if (req.params.date > today()) return res.status(404).json({ error: "Puzzle not found." });
  var puzzle = await bracketCity.get(req.params.date);
  if (!puzzle) return res.status(404).json({ error: "Puzzle not found." });
  var key = req.user.id + ":" + puzzle.date;
  var state = store.games[key] && store.games[key].puzzleId === puzzle.sourceId ? store.games[key] : emptyState(puzzle);
  if (state.completedAt) return res.status(409).json({ error: "This score is already verified." });
  var action = req.body.action;
  var nodes = game.flatten(puzzle.root);
  var solvedClueId = null;
  function ready(node) { return (node.children || []).every(function (child) { return child.synthetic || state.solved.indexOf(child.id) !== -1; }); }
  if (action === "guess") {
    var guess = game.normalize(req.body.guess);
    if (!guess) return res.status(400).json({ error: "Enter an answer." });
    var match = nodes.find(function (item) { return state.solved.indexOf(item.id) === -1 && ready(item) && guess === game.normalize(item.answer); });
    if (match) { state.solved.push(match.id); solvedClueId = match.id; }
    else if (state.wrong.indexOf(guess) === -1) state.wrong.push(guess);
  } else if (action === "peek" || action === "reveal") {
    var node = nodes.find(function (item) { return item.id === req.body.clueId; });
    if (!node) return res.status(400).json({ error: "Unknown clue." });
    if (!ready(node)) return res.status(409).json({ error: "Solve the nested clues first." });
    if (action === "peek" && state.peeked.indexOf(node.id) === -1) state.peeked.push(node.id);
    else if (action === "reveal" && state.solved.indexOf(node.id) === -1) { if (state.peeked.indexOf(node.id) === -1) state.peeked.push(node.id); state.revealed.push(node.id); state.solved.push(node.id); solvedClueId = node.id; }
  } else return res.status(400).json({ error: "Unknown action." });

  var allSolved = nodes.every(function (item) { return state.solved.indexOf(item.id) !== -1; });
  if (allSolved) {
    state.completedAt = new Date().toISOString();
    state.shareId = crypto.randomBytes(9).toString("base64url");
    var finalScore = game.scoreFor(state);
    store.shares[state.shareId] = { id: state.shareId, userId: req.user.id, username: req.user.username, date: puzzle.date, title: puzzle.title, score: finalScore, rank: game.rankFor(finalScore, state), completedAt: state.completedAt };
  }
  store.games[key] = state; saveStore();
  res.json({ puzzle: game.publicPuzzle(puzzle, state), score: game.scoreFor(state), rank: game.rankFor(game.scoreFor(state), state), shareId: state.shareId, solvedClueId: solvedClueId, user: profile(req.user) });
  } catch (error) { next(error); }
});

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]; }); }

app.get("/share/:id/card.svg", function (req, res) {
  var share = store.shares[req.params.id];
  if (!share) return res.status(404).end();
  var rank = escapeHtml(share.rank), username = escapeHtml(share.username), score = escapeHtml(share.score);
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=31536000, immutable").send('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#07519d"/><rect x="42" y="42" width="1116" height="546" fill="#0b5cad" stroke="#e7f3ff" stroke-width="4"/><text x="90" y="125" fill="#ffe871" font-family="Courier New" font-size="32">BRACKET VERIFIED / RECORD COPY</text><text x="90" y="260" fill="#e7f3ff" font-family="Courier New" font-size="76">'+username+'</text><text x="90" y="370" fill="#e7f3ff" font-family="Courier New" font-size="54">'+score+'/100  ·  '+rank+'</text><text x="90" y="520" fill="#9bc6e8" font-family="Courier New" font-size="28">SERVER-VERIFIED RESULT</text></svg>');
});

app.get("/share/:id", function (req, res) {
  var share = store.shares[req.params.id];
  if (!share) return res.status(404).send("Result not found");
  var origin = (process.env.PUBLIC_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "");
  var title = share.username + " scored " + share.score + "/100 · " + share.rank;
  var description = "Verified " + share.title + " result for " + share.date + ". Score recorded by Bracket Verified.";
  res.set("Cache-Control", "public, max-age=31536000, immutable").send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+escapeHtml(title)+'</title><meta name="description" content="'+escapeHtml(description)+'"><meta property="og:type" content="website"><meta property="og:site_name" content="Bracket Verified"><meta property="og:title" content="'+escapeHtml(title)+'"><meta property="og:description" content="'+escapeHtml(description)+'"><meta property="og:url" content="'+origin+'/share/'+share.id+'"><meta property="og:image" content="'+origin+'/share/'+share.id+'/card.svg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><link rel="stylesheet" href="/style.css"></head><body><main class="share-page"><p class="eyebrow">Verified result</p><section class="share-result"><div class="seal">✓</div><h1>'+escapeHtml(share.username)+'</h1><div class="share-score">'+share.score+'<span>/100</span></div><h2>'+escapeHtml(share.rank)+'</h2><p>'+escapeHtml(share.title)+' · '+share.date+'</p></section><a class="primary-link" href="/">Play today’s puzzle</a></main></body></html>');
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use(function (_req, res) { res.status(404).json({ error: "Not found." }); });
app.use(function (error, _req, res, _next) { console.error(error); res.status(502).json({ error: "The daily puzzle could not be loaded." }); });

if (require.main === module) {
  bracketCity.importDate(today()).catch(function (error) { console.error("Daily puzzle sync failed:", error.message); });
  setInterval(function () { bracketCity.importDate(today()).catch(function (error) { console.error("Daily puzzle sync failed:", error.message); }); }, 60 * 60 * 1000).unref();
  app.listen(port, function () { console.log("Bracket Verified running at http://localhost:" + port); });
}
module.exports = app;
