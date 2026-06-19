function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '');
}

function wordsMatch(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

// True if haystack contains term as a substring, or contains a word that's a
// simple suffix variant of term (e.g. "bank" vs "banking", "restaurant" vs
// "restaurants") so common plurals/suffixes don't cause a missed match.
function textMatches(haystack, term) {
  const normTerm = normalize(term);
  if (!normTerm) return true;

  const normHaystack = normalize(haystack);
  if (normHaystack.includes(normTerm)) return true;
  if (normTerm.length < 3) return false;

  return normHaystack.split(' ').some((word) => word.length >= 3 && wordsMatch(word, normTerm));
}

module.exports = { normalize, textMatches };
