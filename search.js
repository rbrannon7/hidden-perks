function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '');
}

function wordsMatch(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

// True if haystack contains term as a substring, or every word of term has a
// matching word somewhere in haystack that's a simple suffix variant (e.g.
// "bank" vs "banking", "restaurant" vs "restaurants") so common
// plurals/suffixes don't cause a missed match. Matching is per-word (not the
// whole multi-word term against a single haystack word) so a short word like
// "senior" can't make an unrelated haystack match a multi-word search term.
function textMatches(haystack, term) {
  const normTerm = normalize(term);
  if (!normTerm) return true;

  const normHaystack = normalize(haystack);
  if (normHaystack.includes(normTerm)) return true;

  const haystackWords = normHaystack.split(' ').filter((word) => word.length >= 3);
  return normTerm
    .split(' ')
    .filter(Boolean)
    .every((termWord) => termWord.length >= 3 && haystackWords.some((word) => wordsMatch(word, termWord)));
}

module.exports = { normalize, textMatches };
