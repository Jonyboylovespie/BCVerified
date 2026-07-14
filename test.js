var assert = require("assert");
var game = require("./lib/game");

var perfect = { peeked: [], revealed: [], wrong: [] };
assert.strictEqual(game.scoreFor(perfect), 100);
assert.strictEqual(game.rankFor(100, perfect), "Puppet Master");

var hinted = { peeked: ["a"], revealed: [], wrong: ["x", "y"] };
assert.strictEqual(game.scoreFor(hinted), 91);
assert.strictEqual(game.rankFor(91, hinted), "Power Broker");

var revealed = { peeked: ["a"], revealed: ["a"], wrong: [] };
assert.strictEqual(game.scoreFor(revealed), 80);
assert.strictEqual(game.rankFor(80, revealed), "Mayor");
assert.strictEqual(game.normalize(" Light-Bulb! "), "light bulb");

console.log("All game rule tests passed.");
