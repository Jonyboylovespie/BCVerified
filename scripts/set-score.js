#!/usr/bin/env node

require("dotenv").config({ quiet: true });

var http = require("http");
var https = require("https");

function usage() {
  console.error("Usage: npm run set-score -- <username> <YYYY-MM-DD> <score>");
}

function updateScore(username, date, score) {
  var baseUrl = process.env.ADMIN_URL || "http://127.0.0.1:" + Number(process.env.PORT || 3000);
  var endpoint = new URL("/api/admin/set-score", baseUrl);
  var body = JSON.stringify({ username: username, date: date, score: score });
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
    request.setTimeout(10000, function () { request.destroy(new Error("The score update timed out.")); });
    request.on("error", function (error) {
      reject(new Error("Could not reach the running app at " + endpoint.origin + ": " + error.message));
    });
    request.end(body);
  });
}

async function main() {
  var username = String(process.argv[2] || "").trim();
  var date = String(process.argv[3] || "").trim();
  var score = Number(process.argv[4]);
  if (!username || !date || process.argv.length !== 5) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!process.env.ADMIN_SECRET) throw new Error("ADMIN_SECRET must be set in .env and in the running app.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must use YYYY-MM-DD format.");
  if (!Number.isFinite(score) || score < 0 || score > 100 || Math.round(score) !== score) throw new Error("Score must be a whole number from 0 to 100.");

  var result = await updateScore(username, date, score);
  console.log("Score updated for " + result.username + " on " + result.date + ": " + result.score + "/100 (" + result.rank + ").");
}

main().catch(function (error) {
  console.error("Error: " + error.message);
  process.exitCode = 1;
});
