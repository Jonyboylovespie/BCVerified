#!/usr/bin/env node

require("dotenv").config({ quiet: true });

var http = require("http");
var https = require("https");
var passwords = require("../lib/password");

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

function updatePassword(username, newPassword) {
  var baseUrl = process.env.ADMIN_URL || "http://127.0.0.1:" + Number(process.env.PORT || 3000);
  var endpoint = new URL("/api/admin/set-password", baseUrl);
  var body = JSON.stringify({ username: username, password: newPassword });
  var client = endpoint.protocol === "https:" ? https : http;

  return new Promise(function (resolve, reject) {
    var request = client.request(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.ADMIN_SECRET,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, function (response) {
      var responseBody = "";
      response.setEncoding("utf8");
      response.on("data", function (chunk) { responseBody += chunk; });
      response.on("end", function () {
        var result = {};
        try { result = JSON.parse(responseBody); } catch (_) {}
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(result);
        reject(new Error(result.error || "Server returned HTTP " + response.statusCode + "."));
      });
    });
    request.setTimeout(10000, function () { request.destroy(new Error("The password update timed out.")); });
    request.on("error", function (error) {
      reject(new Error("Could not reach the running app at " + endpoint.origin + ": " + error.message));
    });
    request.end(body);
  });
}

async function main() {
  var username = String(process.argv[2] || "").trim();
  if (!username || process.argv.length > 4) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!process.env.ADMIN_SECRET) throw new Error("ADMIN_SECRET must be set in .env and in the running app.");

  var newPassword = process.argv[3];
  if (newPassword === undefined) newPassword = await readHidden("New password: ");
  if (newPassword.length < passwords.minimumLength) {
    throw new Error("Password must be at least " + passwords.minimumLength + " characters.");
  }

  var result = await updatePassword(username, newPassword);
  console.log("Password updated for " + result.username + ". Existing sessions were invalidated.");
}

main().catch(function (error) {
  console.error("Error: " + error.message);
  process.exitCode = 1;
});
