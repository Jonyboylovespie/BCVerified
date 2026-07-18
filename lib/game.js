function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function flatten(node, output) {
  output = output || [];
  if (!node.synthetic) output.push(node);
  (node.children || []).forEach(function (child) { flatten(child, output); });
  return output;
}

function scoreFor(state) {
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
