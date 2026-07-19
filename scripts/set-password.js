#!/usr/bin/env node

require("dotenv").config({ quiet: true });

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var passwords = require("../lib/password");

var storePath = process.env.STORE_PATH || path.join(__dirname, "..", "data", "store.json");

function usage() {
  console.error("Usage: npm run set-password -- <username> [new-password]");
  console.error("Omit new-password to enter it without displaying it.");
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    process.stderr.write(prompt);
    return new Promise(function (resolve) {
      var input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", function (chunk) { input += chunk; });
      process.stdin.on("end", function () { resolve(input.replace(/[\r\n]+$/, "")); });
    });
  }

  return new Promise(function (resolve, reject) {
    var value = "";
    process.stderr.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(character) {
      if (character === "\u0003") return finish(new Error("Password change cancelled."));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    }

    process.stdin.on("data", onData);
  });
}

function hashPassword(password, salt) {
  return new Promise(function (resolve, reject) {
    passwords.hash(password, salt, function (error, hash) {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

async function main() {
  var username = String(process.argv[2] || "").trim();
  if (!username || process.argv.length > 4) {
    usage();
    process.exitCode = 1;
    return;
  }

  var newPassword = process.argv[3];
  if (newPassword === undefined) newPassword = await readHidden("New password: ");
  if (newPassword.length < passwords.minimumLength) {
    throw new Error("Password must be at least " + passwords.minimumLength + " characters.");
  }

  var store;
  try {
    store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch (error) {
    throw new Error("Could not read user store at " + storePath + ": " + error.message);
  }
  if (!store || !Array.isArray(store.users)) throw new Error("User store does not contain a users array.");

  var user = store.users.find(function (item) {
    return String(item.username || "").toLowerCase() === username.toLowerCase();
  });
  if (!user) throw new Error("No user named " + username + " was found.");

  var salt = crypto.randomBytes(16).toString("hex");
  user.salt = salt;
  user.passwordHash = await hashPassword(newPassword, salt);
  user.sessionVersion = Number(user.sessionVersion || 0) + 1;
  user.passwordUpdatedAt = new Date().toISOString();

  var tempPath = storePath + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2));
    fs.renameSync(tempPath, storePath);
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }

  console.log("Password updated for " + user.username + ". Existing sessions were invalidated; restart the app before accepting traffic.");
}

main().catch(function (error) {
  console.error("Error: " + error.message);
  process.exitCode = 1;
});
