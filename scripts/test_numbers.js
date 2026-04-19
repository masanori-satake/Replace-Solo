
const EXCLUDED_NOUN_TYPES_NEW = new Set(['代名詞', '非自立']); // '数' removed
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/;
const IDENTIFIER_REGEX = /^[a-zA-Z0-9.\-_@]{4,}$/;
const TRIM_SYMBOLS_SET = '[\\s()\\[\\]{}<>（）［］｛｝〈〉《》「」『』【】〔〕〖〗〘〙〚〛\'"`“”‘’。、！？!?:;：；・,.，．･+*\\/\\\\|~〜～=#$%\\^&@_…-]';
const TRIM_SYMBOLS_REGEX = new RegExp(`^${TRIM_SYMBOLS_SET}+|${TRIM_SYMBOLS_SET}+$`, 'g');

const dictOrigins = new Set();

function analyze(tokens) {
  const nouns = new Set();
  let i = 0;
  const tokenLen = tokens.length;
  while (i < tokenLen) {
    const token = tokens[i];
    const isNoun = token.pos === '名詞' && !EXCLUDED_NOUN_TYPES_NEW.has(token.pos_detail_1);
    const isPrefix = token.pos === '接頭詞';
    const isDictMatch = dictOrigins.has(token.surface_form);

    if (isDictMatch || isNoun || isPrefix) {
      let compound = token.surface_form;
      let hasProperNoun = (token.pos_detail_1 === '固有名詞');
      let currentDictMatch = isDictMatch;
      let count = 1;

      let j = i + 1;
      while (j < tokenLen) {
        const nextToken = tokens[j];
        const nextIsNoun = nextToken.pos === '名詞';
        const nextIsDictMatch = dictOrigins.has(nextToken.surface_form);

        if (nextIsNoun || nextIsDictMatch) {
          compound += nextToken.surface_form;
          if (nextToken.pos_detail_1 === '固有名詞') hasProperNoun = true;
          if (nextIsDictMatch) currentDictMatch = true;
          count++;
          j++;
        } else {
          break;
        }
      }

      const trimmedCompound = compound.replace(TRIM_SYMBOLS_REGEX, '');
      const hasJapanese = JAPANESE_CHAR_REGEX.test(trimmedCompound);
      const isQualifiedIdentifier = IDENTIFIER_REGEX.test(trimmedCompound);
      const isQualified = currentDictMatch || ((hasJapanese || isQualifiedIdentifier) && (hasProperNoun || count > 1));
      const isNotTooShort = currentDictMatch || trimmedCompound.length > 1;

      if (trimmedCompound && isQualified && isNotTooShort) {
        nouns.add(trimmedCompound);
      }
      i = j;
    } else {
      i++;
    }
  }
  return Array.from(nouns).sort();
}

const dateTokens = [
  { surface_form: "2024", pos: "名詞", pos_detail_1: "数" },
  { surface_form: "-", pos: "名詞", pos_detail_1: "サ変接続" },
  { surface_form: "04", pos: "名詞", pos_detail_1: "数" },
  { surface_form: "-", pos: "名詞", pos_detail_1: "サ変接続" },
  { surface_form: "08", pos: "名詞", pos_detail_1: "数" }
];

console.log("Date Extraction Result (with '数' allowed to start):");
console.log(JSON.stringify(analyze(dateTokens), null, 2));

const yearTokens = [
  { surface_form: "2024", pos: "名詞", pos_detail_1: "数" },
  { surface_form: "年", pos: "名詞", pos_detail_1: "接尾" }
];
console.log("Year Extraction Result:");
console.log(JSON.stringify(analyze(yearTokens), null, 2));
