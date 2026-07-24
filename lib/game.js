function normalize(value) {
  return canonicalizeNumbers(String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim());
}

var numberWords = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
};
var tensWords = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function canonicalizeNumbers(value) {
  if (!value) return value;
  var words = value.split(" ");
  var output = [];
  for (var index = 0; index < words.length; index += 1) {
    var word = words[index];
    var next = words[index + 1];
    if (numberWords[word] !== undefined && next === "hundred") {
      output.push(String(numberWords[word] * 100));
      index += 1;
    } else if (tensWords[word] !== undefined && numberWords[next] > 0 && numberWords[next] < 10) {
      output.push(String(tensWords[word] + numberWords[next]));
      index += 1;
    } else if (tensWords[word] !== undefined) {
      output.push(String(tensWords[word]));
    } else if (numberWords[word] !== undefined) {
      output.push(String(numberWords[word]));
    } else {
      output.push(word);
    }
  }
  return output.join(" ");
}

function flatten(node, output) {
  output = output || [];
  if (!node.synthetic) output.push(node);
  (node.children || []).forEach(function (child) { flatten(child, output); });
  return output;
}

function scoreFor(state) {
  if (typeof state.scoreOverride === "number") return Math.max(0, Math.min(100, Math.round(state.scoreOverride)));
  return Math.max(0, 100 - state.peeked.length * 5 - state.revealed.length * 15 - state.wrong.length * 2);
}

function rankFor(score, state) {
  if (score === 100 && state.perfectKeystrokes !== false && !state.peeked.length && !state.revealed.length && !state.wrong.length) return "Puppet Master";
  if (score >= 100) return "Kingmaker";
  if (score >= 90) return "Power Broker";
  if (score >= 80) return "Mayor";
  if (score >= 65) return "Chief of Police";
  if (score >= 45) return "Council Member";
  if (score >= 20) return "Resident";
  if (score >= 10) return "Commuter";
  return "Tourist";
}

function publicPuzzle(puzzle, state) {
  function clean(node) {
    var children = (node.children || []).map(clean);
    if (node.synthetic) return { id: node.id, synthetic: true, segments: hydrate(node.segments, children), children: children };
    var solved = state.solved.indexOf(node.id) !== -1;
    var peeked = state.peeked.indexOf(node.id) !== -1;
    return {
      id: node.id,
      clue: node.clue,
      before: node.before,
      after: node.after,
      solved: solved,
      ready: children.every(function (child) { return child.solved || child.synthetic; }),
      display: solved ? node.answer : null,
      peek: peeked ? node.answer.charAt(0).toUpperCase() : null,
      segments: hydrate(node.segments, children),
      children: children
    };
  }
  function hydrate(segments, children) {
    return (segments || []).map(function (segment) {
      if (segment.text !== undefined) return { text: segment.text };
      return { child: children.find(function (child) { return child.id === segment.childId; }) };
    });
  }
  return { date: puzzle.date, title: puzzle.title, fact: state.completedAt ? puzzle.fact : null, root: clean(puzzle.root) };
}

module.exports = { normalize: normalize, flatten: flatten, scoreFor: scoreFor, rankFor: rankFor, publicPuzzle: publicPuzzle };
