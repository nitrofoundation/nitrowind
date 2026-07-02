#include "CssColor.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <regex>
#include <string>
#include <vector>

// Every algorithm, constant and rounding rule in this file replicates culori
// 4.0.2 (node_modules/culori/src) so the output hex matches the JS compiler's
// culori formatHex/formatHex8 byte-for-byte. Source files are cited inline.

namespace nitrocss::css {
namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;

// ---------------------------------------------------------------------------
// Channel model. culori represents a parsed color as per-mode channels where
// a missing channel ("none") is `undefined`; every converter it owns defaults
// undefined inputs to 0, and serializeHex applies `value || 0`. Substituting
// 0.0 for "none" up front is therefore behavior-identical for every mode this
// parser supports.
// ---------------------------------------------------------------------------

enum class Mode { Rgb, Lrgb, P3, Hsl, Hwb, Lab, Lch, Oklab, Oklch };

struct Parsed {
  Mode mode = Mode::Rgb;
  double c1 = 0.0;
  double c2 = 0.0;
  double c3 = 0.0;
  bool hasAlpha = false;
  double alpha = 1.0;
};

struct RgbResult {
  double r = 0.0;
  double g = 0.0;
  double b = 0.0;
  bool hasAlpha = false;
  double alpha = 1.0;
};

// JS `Math.sign(c) || 1` (culori lrgb converters).
inline double signOr1(double c) {
  if (std::isnan(c) || c == 0.0) return 1.0;
  return c < 0.0 ? -1.0 : 1.0;
}

// culori src/lrgb/convertLrgbToRgb.js — linear sRGB -> gamma sRGB.
inline double lrgbToRgbChannel(double c) {
  const double abs = std::fabs(c);
  if (abs > 0.0031308) {
    return signOr1(c) * (1.055 * std::pow(abs, 1.0 / 2.4) - 0.055);
  }
  return c * 12.92;
}

// culori src/lrgb/convertRgbToLrgb.js — gamma sRGB (or P3) -> linear.
inline double rgbToLrgbChannel(double c) {
  const double abs = std::fabs(c);
  if (abs <= 0.04045) return c / 12.92;
  return signOr1(c) * std::pow((abs + 0.055) / 1.055, 2.4);
}

// culori src/util/normalizeHue.js
inline double normalizeHue(double hue) {
  hue = std::fmod(hue, 360.0);
  return hue < 0.0 ? hue + 360.0 : hue;
}

// culori src/hsl/convertHslToRgb.js
RgbResult hslToRgb(const Parsed& in) {
  const double h = normalizeHue(in.c1);
  const double s = in.c2;
  const double l = in.c3;
  const double m1 = l + s * (l < 0.5 ? l : 1.0 - l);
  const double m2 =
      m1 - (m1 - l) * 2.0 * std::fabs(std::fmod(h / 60.0, 2.0) - 1.0);
  RgbResult res;
  switch (static_cast<int>(std::floor(h / 60.0))) {
    case 0: res = {m1, m2, 2.0 * l - m1}; break;
    case 1: res = {m2, m1, 2.0 * l - m1}; break;
    case 2: res = {2.0 * l - m1, m1, m2}; break;
    case 3: res = {2.0 * l - m1, m2, m1}; break;
    case 4: res = {m2, 2.0 * l - m1, m1}; break;
    case 5: res = {m1, 2.0 * l - m1, m2}; break;
    default: res = {2.0 * l - m1, 2.0 * l - m1, 2.0 * l - m1}; break;
  }
  res.hasAlpha = in.hasAlpha;
  res.alpha = in.alpha;
  return res;
}

// culori src/hsv/convertHsvToRgb.js
RgbResult hsvToRgb(double hIn, double s, double v) {
  const double h = normalizeHue(hIn);
  const double f = std::fabs(std::fmod(h / 60.0, 2.0) - 1.0);
  switch (static_cast<int>(std::floor(h / 60.0))) {
    case 0: return {v, v * (1.0 - s * f), v * (1.0 - s)};
    case 1: return {v * (1.0 - s * f), v, v * (1.0 - s)};
    case 2: return {v * (1.0 - s), v, v * (1.0 - s * f)};
    case 3: return {v * (1.0 - s), v * (1.0 - s * f), v};
    case 4: return {v * (1.0 - s * f), v * (1.0 - s), v};
    case 5: return {v, v * (1.0 - s), v * (1.0 - s * f)};
    default: return {v * (1.0 - s), v * (1.0 - s), v * (1.0 - s)};
  }
}

// culori src/hwb/convertHwbToRgb.js
RgbResult hwbToRgb(const Parsed& in) {
  double w = in.c2;
  double b = in.c3;
  if (w + b > 1.0) {
    const double s = w + b;
    w /= s;
    b /= s;
  }
  RgbResult res =
      hsvToRgb(in.c1, b == 1.0 ? 1.0 : 1.0 - w / (1.0 - b), 1.0 - b);
  res.hasAlpha = in.hasAlpha;
  res.alpha = in.alpha;
  return res;
}

// culori src/oklab/convertOklabToLrgb.js + lrgb/convertLrgbToRgb.js
RgbResult oklabToRgb(const Parsed& in) {
  const double l = in.c1;
  const double a = in.c2;
  const double b = in.c3;
  const double L =
      std::pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3.0);
  const double M =
      std::pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3.0);
  const double S =
      std::pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3.0);
  RgbResult res;
  res.r = lrgbToRgbChannel(
      4.0767416360759574 * L - 3.3077115392580616 * M + 0.2309699031821044 * S);
  res.g = lrgbToRgbChannel(
      -1.2684379732850317 * L + 2.6097573492876887 * M - 0.3413193760026573 * S);
  res.b = lrgbToRgbChannel(
      -0.0041960761386756 * L - 0.7034186179359362 * M + 1.7076146940746117 * S);
  res.hasAlpha = in.hasAlpha;
  res.alpha = in.alpha;
  return res;
}

// culori src/lab/convertLabToXyz50.js + xyz50/convertXyz50ToRgb.js. The
// XYZ(D50)->sRGB matrix already folds in the D50->D65 adaptation.
RgbResult labToRgb(const Parsed& in) {
  // xyz50/constants.js
  constexpr double kK = (29.0 * 29.0 * 29.0) / (3.0 * 3.0 * 3.0);
  constexpr double kE = (6.0 * 6.0 * 6.0) / (29.0 * 29.0 * 29.0);
  // constants.js D50 white point
  constexpr double kD50X = 0.3457 / 0.3585;
  constexpr double kD50Y = 1.0;
  constexpr double kD50Z = (1.0 - 0.3457 - 0.3585) / 0.3585;

  const auto fn = [](double v) {
    const double v3 = std::pow(v, 3.0);
    return v3 > kE ? v3 : (116.0 * v - 16.0) / kK;
  };
  const double fy = (in.c1 + 16.0) / 116.0;
  const double fx = in.c2 / 500.0 + fy;
  const double fz = fy - in.c3 / 200.0;
  const double x = fn(fx) * kD50X;
  const double y = fn(fy) * kD50Y;
  const double z = fn(fz) * kD50Z;

  RgbResult res;
  res.r = lrgbToRgbChannel(
      x * 3.1341359569958707 - y * 1.6173863321612538 - 0.4906619460083532 * z);
  res.g = lrgbToRgbChannel(
      x * -0.978795502912089 + y * 1.916254567259524 + 0.03344273116131949 * z);
  res.b = lrgbToRgbChannel(
      x * 0.07195537988411677 - y * 0.2289768264158322 + 1.405386058324125 * z);
  res.hasAlpha = in.hasAlpha;
  res.alpha = in.alpha;
  return res;
}

// culori src/lch/convertLchToLab.js — also the OKLCh->OKLab step
// (oklch/definition.js routes through convertLchToLab with mode 'oklab').
Parsed lchToLab(const Parsed& in, Mode labMode) {
  Parsed out;
  out.mode = labMode;
  out.c1 = in.c1;
  const double c = in.c2;
  const double h = in.c3;
  const bool cTruthy = c != 0.0 && !std::isnan(c);
  out.c2 = cTruthy ? c * std::cos((h / 180.0) * kPi) : 0.0;
  out.c3 = cTruthy ? c * std::sin((h / 180.0) * kPi) : 0.0;
  out.hasAlpha = in.hasAlpha;
  out.alpha = in.alpha;
  return out;
}

// culori src/p3/convertP3ToXyz65.js + xyz65/convertXyz65ToRgb.js
RgbResult p3ToRgb(const Parsed& in) {
  const double r = rgbToLrgbChannel(in.c1);
  const double g = rgbToLrgbChannel(in.c2);
  const double b = rgbToLrgbChannel(in.c3);
  const double x =
      0.486570948648216 * r + 0.265667693169093 * g + 0.1982172852343625 * b;
  const double y =
      0.2289745640697487 * r + 0.6917385218365062 * g + 0.079286914093745 * b;
  const double z = 0.0 * r + 0.0451133818589026 * g + 1.043944368900976 * b;
  RgbResult res;
  res.r = lrgbToRgbChannel(
      x * 3.2409699419045226 - y * 1.5373831775700939 - 0.4986107602930034 * z);
  res.g = lrgbToRgbChannel(
      x * -0.9692436362808796 + y * 1.8759675015077204 + 0.0415550574071756 * z);
  res.b = lrgbToRgbChannel(
      x * 0.0556300796969936 - y * 0.2039769588889765 + 1.0569715142428784 * z);
  res.hasAlpha = in.hasAlpha;
  res.alpha = in.alpha;
  return res;
}

RgbResult toRgb(const Parsed& in) {
  switch (in.mode) {
    case Mode::Rgb:
      return {in.c1, in.c2, in.c3, in.hasAlpha, in.alpha};
    case Mode::Lrgb:
      return {lrgbToRgbChannel(in.c1), lrgbToRgbChannel(in.c2),
              lrgbToRgbChannel(in.c3), in.hasAlpha, in.alpha};
    case Mode::P3:
      return p3ToRgb(in);
    case Mode::Hsl:
      return hslToRgb(in);
    case Mode::Hwb:
      return hwbToRgb(in);
    case Mode::Lab:
      return labToRgb(in);
    case Mode::Lch:
      return labToRgb(lchToLab(in, Mode::Lab));
    case Mode::Oklab:
      return oklabToRgb(in);
    case Mode::Oklch:
      return oklabToRgb(lchToLab(in, Mode::Oklab));
  }
  return {};
}

// culori src/formatter.js: fixup = Math.round(clamp01(value || 0) * 255).
// JS Math.round for non-negative x is floor(x + 0.5).
inline uint8_t fixup255(double v) {
  if (std::isnan(v)) v = 0.0; // JS `value || 0`
  v = std::max(0.0, std::min(1.0, v));
  return static_cast<uint8_t>(std::floor(v * 255.0 + 0.5));
}

// ---------------------------------------------------------------------------
// Modern-syntax tokenizer — port of culori src/parse.js tokenize(). A comma
// anywhere aborts tokenization (legacy syntax is handled by regex fallbacks,
// exactly like culori).
// ---------------------------------------------------------------------------

enum class TokType {
  Function,
  Ident,
  Number,
  Percentage,
  Hue,   // number with an angle unit; value already converted to degrees
  None,
  Alpha, // `/ <value>`; inner token stored in `inner*`
  ParenClose,
};

struct Tok {
  TokType type = TokType::None;
  double value = 0.0;
  std::string ident;
  // For TokType::Alpha: the wrapped token (Number | Percentage | None).
  TokType innerType = TokType::None;
  double innerValue = 0.0;
};

// parse.js IdentStartCodePoint: /[^\x00-\x7F]|[a-zA-Z_]/
inline bool isIdentStartCodePoint(unsigned char ch) {
  return ch > 0x7F || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
      ch == '_';
}

// parse.js IdentCodePoint: /[^\x00-\x7F]|[-\w]/
inline bool isIdentCodePoint(unsigned char ch) {
  return ch > 0x7F || ch == '-' || ch == '_' || (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
}

inline bool isDigit(unsigned char ch) { return ch >= '0' && ch <= '9'; }

struct Tokenizer {
  std::string_view chars;
  size_t i = 0;

  explicit Tokenizer(std::string_view src) : chars(src) {}

  char at(size_t idx) const { return idx < chars.size() ? chars[idx] : '\0'; }

  // parse.js is_num()
  bool isNum() const {
    const char ch = at(i);
    const char ch1 = at(i + 1);
    if (ch == '-' || ch == '+') {
      return isDigit(ch1) || (ch1 == '.' && isDigit(at(i + 2)));
    }
    if (ch == '.') return isDigit(ch1);
    return isDigit(ch);
  }

  // parse.js is_ident()
  bool isIdent() const {
    if (i >= chars.size()) return false;
    const unsigned char ch = at(i);
    if (isIdentStartCodePoint(ch)) return true;
    if (ch == '-') {
      if (chars.size() - i < 2) return false;
      const unsigned char ch1 = at(i + 1);
      return ch1 == '-' || isIdentStartCodePoint(ch1);
    }
    return false;
  }

  std::string digits() {
    std::string v;
    while (i < chars.size() && isDigit(at(i))) v += chars[i++];
    return v;
  }

  std::string ident() {
    std::string v;
    while (i < chars.size() && isIdentCodePoint(at(i))) v += chars[i++];
    return v;
  }

  // parse.js num(). Returns nullopt for a malformed numeric token, which
  // (like culori) aborts the whole tokenization.
  std::optional<Tok> num() {
    std::string value;
    if (at(i) == '-' || at(i) == '+') value += chars[i++];
    value += digits();
    if (at(i) == '.' && isDigit(at(i + 1))) {
      value += chars[i++];
      value += digits();
    }
    if (at(i) == 'e' || at(i) == 'E') {
      if ((at(i + 1) == '-' || at(i + 1) == '+') && isDigit(at(i + 2))) {
        value += chars[i++];
        value += chars[i++];
        value += digits();
      } else if (isDigit(at(i + 1))) {
        value += chars[i++];
        value += digits();
      }
    }
    const double parsed = std::strtod(value.c_str(), nullptr);
    if (isIdent()) {
      const std::string id = ident();
      // parse.js huenits
      double mult = 0.0;
      if (id == "deg") mult = 1.0;
      else if (id == "rad") mult = 180.0 / kPi;
      else if (id == "grad") mult = 9.0 / 10.0;
      else if (id == "turn") mult = 360.0;
      else return std::nullopt;
      return Tok{.type = TokType::Hue, .value = parsed * mult};
    }
    if (at(i) == '%') {
      i++;
      return Tok{.type = TokType::Percentage, .value = parsed};
    }
    return Tok{.type = TokType::Number, .value = parsed};
  }

  // parse.js identlike()
  Tok identlike() {
    const std::string v = ident();
    if (at(i) == '(') {
      i++;
      return Tok{.type = TokType::Function, .ident = v};
    }
    if (v == "none") return Tok{.type = TokType::None};
    return Tok{.type = TokType::Ident, .ident = v};
  }
};

// parse.js tokenize(). nullopt <=> culori's `undefined` (legacy fallback).
std::optional<std::vector<Tok>> tokenize(std::string_view trimmed) {
  Tokenizer t(trimmed);
  std::vector<Tok> tokens;

  while (t.i < t.chars.size()) {
    const char ch = t.chars[t.i++];

    if (ch == '\n' || ch == '\t' || ch == ' ') {
      while (t.i < t.chars.size() &&
             (t.chars[t.i] == '\n' || t.chars[t.i] == '\t' ||
              t.chars[t.i] == ' ')) {
        t.i++;
      }
      continue;
    }
    if (ch == ',') return std::nullopt;
    if (ch == ')') {
      tokens.push_back(Tok{.type = TokType::ParenClose});
      continue;
    }
    if (ch == '+') {
      t.i--;
      if (t.isNum()) {
        auto tok = t.num();
        if (!tok) return std::nullopt;
        tokens.push_back(*tok);
        continue;
      }
      return std::nullopt;
    }
    if (ch == '-') {
      t.i--;
      if (t.isNum()) {
        auto tok = t.num();
        if (!tok) return std::nullopt;
        tokens.push_back(*tok);
        continue;
      }
      if (t.isIdent()) {
        tokens.push_back(Tok{.type = TokType::Ident, .ident = t.ident()});
        continue;
      }
      return std::nullopt;
    }
    if (ch == '.') {
      t.i--;
      if (t.isNum()) {
        auto tok = t.num();
        if (!tok) return std::nullopt;
        tokens.push_back(*tok);
        continue;
      }
      return std::nullopt;
    }
    if (ch == '/') {
      while (t.i < t.chars.size() &&
             (t.chars[t.i] == '\n' || t.chars[t.i] == '\t' ||
              t.chars[t.i] == ' ')) {
        t.i++;
      }
      if (t.isNum()) {
        auto alpha = t.num();
        if (alpha && alpha->type != TokType::Hue) {
          Tok tok{.type = TokType::Alpha};
          tok.innerType = alpha->type;
          tok.innerValue = alpha->value;
          tokens.push_back(tok);
          continue;
        }
        return std::nullopt;
      }
      if (t.isIdent()) {
        if (t.ident() == "none") {
          Tok tok{.type = TokType::Alpha};
          tok.innerType = TokType::None;
          tokens.push_back(tok);
          continue;
        }
      }
      return std::nullopt;
    }
    if (isDigit(static_cast<unsigned char>(ch))) {
      t.i--;
      auto tok = t.num();
      if (!tok) return std::nullopt;
      tokens.push_back(*tok);
      continue;
    }
    if (isIdentStartCodePoint(static_cast<unsigned char>(ch))) {
      t.i--;
      tokens.push_back(t.identlike());
      continue;
    }
    return std::nullopt;
  }
  return tokens;
}

// One coordinate: [name, c1, c2, c3, alpha] slots after consumeCoords.
struct Coord {
  TokType type = TokType::None;
  double value = 0.0;
};

// parse.js consumeCoords(): exactly 3 channel coords, optional trailing
// `/ alpha`, ')' must be the final token.
std::optional<std::array<Coord, 4>> consumeCoords(const std::vector<Tok>& tokens,
                                                  size_t start,
                                                  bool includeHue) {
  std::vector<Coord> coords;
  size_t idx = start;
  while (idx < tokens.size()) {
    const Tok& token = tokens[idx++];
    if (token.type == TokType::None || token.type == TokType::Number ||
        token.type == TokType::Alpha || token.type == TokType::Percentage ||
        (includeHue && token.type == TokType::Hue)) {
      // Alpha coords keep type Alpha here (position check below); the wrapped
      // inner token is recovered from the token list once validated.
      coords.push_back(Coord{.type = token.type,
                             .value = token.type == TokType::Alpha
                                 ? token.innerValue
                                 : token.value});
      continue;
    }
    if (token.type == TokType::ParenClose) {
      if (idx < tokens.size()) return std::nullopt;
      continue;
    }
    return std::nullopt;
  }

  if (coords.size() < 3 || coords.size() > 4) return std::nullopt;

  // Channels 1-3 must not be alpha; the 4th (if present) must be.
  for (size_t k = 0; k < 3; k++) {
    if (coords[k].type == TokType::Alpha) return std::nullopt;
  }

  std::array<Coord, 4> out;
  out[0] = coords[0];
  out[1] = coords[1];
  out[2] = coords[2];
  if (coords.size() == 4) {
    if (coords[3].type != TokType::Alpha) return std::nullopt;
    // Recover the alpha inner token from the original token list: it is the
    // last non-ParenClose token.
    for (size_t k = tokens.size(); k-- > start;) {
      if (tokens[k].type == TokType::Alpha) {
        out[3].type = tokens[k].innerType;
        out[3].value = tokens[k].innerValue;
        break;
      }
    }
  } else {
    out[3] = Coord{.type = TokType::None, .value = 0.0};
  }
  return out;
}

inline double clamp01(double v) { return std::min(1.0, std::max(0.0, v)); }

// Shared `<alpha-value>` handling (identical in every culori modern parser):
// number used raw, percentage / 100, clamped to [0,1].
inline void applyAlpha(Parsed& res, const Coord& alpha) {
  if (alpha.type == TokType::None) return;
  res.hasAlpha = true;
  res.alpha = clamp01(alpha.type == TokType::Number ? alpha.value
                                                    : alpha.value / 100.0);
}

// ---------------------------------------------------------------------------
// Modern per-function parsers — ports of culori src/*/parse*.js. Each returns
// nullopt exactly where the culori parser returns undefined.
// ---------------------------------------------------------------------------

using Coords = std::array<Coord, 4>;

std::optional<Parsed> parseRgbModern(const Coords& c) {
  const Coord &r = c[0], &g = c[1], &b = c[2];
  if (r.type == TokType::Hue || g.type == TokType::Hue ||
      b.type == TokType::Hue) {
    return std::nullopt;
  }
  Parsed res;
  res.mode = Mode::Rgb;
  if (r.type != TokType::None) {
    res.c1 = r.type == TokType::Number ? r.value / 255.0 : r.value / 100.0;
  }
  if (g.type != TokType::None) {
    res.c2 = g.type == TokType::Number ? g.value / 255.0 : g.value / 100.0;
  }
  if (b.type != TokType::None) {
    res.c3 = b.type == TokType::Number ? b.value / 255.0 : b.value / 100.0;
  }
  applyAlpha(res, c[3]);
  return res;
}

std::optional<Parsed> parseHslModern(const Coords& c) {
  const Coord &h = c[0], &s = c[1], &l = c[2];
  if (h.type == TokType::Percentage) return std::nullopt;
  if (s.type == TokType::Hue || l.type == TokType::Hue) return std::nullopt;
  Parsed res;
  res.mode = Mode::Hsl;
  if (h.type != TokType::None) res.c1 = h.value;
  if (s.type != TokType::None) res.c2 = s.value / 100.0;
  if (l.type != TokType::None) res.c3 = l.value / 100.0;
  applyAlpha(res, c[3]);
  return res;
}

std::optional<Parsed> parseHwbModern(const Coords& c) {
  const Coord &h = c[0], &w = c[1], &b = c[2];
  if (h.type == TokType::Percentage) return std::nullopt;
  if (w.type == TokType::Hue || b.type == TokType::Hue) return std::nullopt;
  Parsed res;
  res.mode = Mode::Hwb;
  if (h.type != TokType::None) res.c1 = h.value;
  if (w.type != TokType::None) res.c2 = w.value / 100.0;
  if (b.type != TokType::None) res.c3 = b.value / 100.0;
  applyAlpha(res, c[3]);
  return res;
}

std::optional<Parsed> parseLabModern(const Coords& c) {
  const Coord &l = c[0], &a = c[1], &b = c[2];
  if (l.type == TokType::Hue || a.type == TokType::Hue ||
      b.type == TokType::Hue) {
    return std::nullopt;
  }
  Parsed res;
  res.mode = Mode::Lab;
  // parseLab.js: L uses the raw value for number AND percentage, clamped.
  if (l.type != TokType::None) {
    res.c1 = std::min(std::max(0.0, l.value), 100.0);
  }
  if (a.type != TokType::None) {
    res.c2 = a.type == TokType::Number ? a.value : (a.value * 125.0) / 100.0;
  }
  if (b.type != TokType::None) {
    res.c3 = b.type == TokType::Number ? b.value : (b.value * 125.0) / 100.0;
  }
  applyAlpha(res, c[3]);
  return res;
}

std::optional<Parsed> parseLchModern(const Coords& co) {
  const Coord &l = co[0], &c = co[1], &h = co[2];
  Parsed res;
  res.mode = Mode::Lch;
  if (l.type != TokType::None) {
    if (l.type == TokType::Hue) return std::nullopt;
    res.c1 = std::min(std::max(0.0, l.value), 100.0);
  }
  if (c.type != TokType::None) {
    if (c.type == TokType::Hue) return std::nullopt;
    res.c2 = std::max(
        0.0, c.type == TokType::Number ? c.value : (c.value * 150.0) / 100.0);
  }
  if (h.type != TokType::None) {
    if (h.type == TokType::Percentage) return std::nullopt;
    res.c3 = h.value;
  }
  applyAlpha(res, co[3]);
  return res;
}

std::optional<Parsed> parseOklabModern(const Coords& c) {
  const Coord &l = c[0], &a = c[1], &b = c[2];
  if (l.type == TokType::Hue || a.type == TokType::Hue ||
      b.type == TokType::Hue) {
    return std::nullopt;
  }
  Parsed res;
  res.mode = Mode::Oklab;
  if (l.type != TokType::None) {
    res.c1 = std::min(
        std::max(0.0, l.type == TokType::Number ? l.value : l.value / 100.0),
        1.0);
  }
  if (a.type != TokType::None) {
    res.c2 = a.type == TokType::Number ? a.value : (a.value * 0.4) / 100.0;
  }
  if (b.type != TokType::None) {
    res.c3 = b.type == TokType::Number ? b.value : (b.value * 0.4) / 100.0;
  }
  applyAlpha(res, c[3]);
  return res;
}

std::optional<Parsed> parseOklchModern(const Coords& co) {
  const Coord &l = co[0], &c = co[1], &h = co[2];
  Parsed res;
  res.mode = Mode::Oklch;
  if (l.type != TokType::None) {
    if (l.type == TokType::Hue) return std::nullopt;
    res.c1 = std::min(
        std::max(0.0, l.type == TokType::Number ? l.value : l.value / 100.0),
        1.0);
  }
  if (c.type != TokType::None) {
    if (c.type == TokType::Hue) return std::nullopt;
    res.c2 = std::max(
        0.0, c.type == TokType::Number ? c.value : (c.value * 0.4) / 100.0);
  }
  if (h.type != TokType::None) {
    if (h.type == TokType::Percentage) return std::nullopt;
    res.c3 = h.value;
  }
  applyAlpha(res, co[3]);
  return res;
}

// parse.js parseColorSyntax(): `color(<profile> c1 c2 c3 [/ a])`. Profiles we
// support (culori colorProfiles keys): srgb -> rgb, srgb-linear -> lrgb,
// display-p3 -> p3. Channel numbers raw, percentages / 100 (unclamped).
std::optional<Parsed> parseColorFunction(const std::vector<Tok>& tokens) {
  if (tokens.empty() || tokens[0].type != TokType::Function ||
      tokens[0].ident != "color") {
    return std::nullopt;
  }
  if (tokens.size() < 2 || tokens[1].type != TokType::Ident) {
    return std::nullopt;
  }
  Mode mode;
  const std::string& profile = tokens[1].ident;
  if (profile == "srgb") mode = Mode::Rgb;
  else if (profile == "srgb-linear") mode = Mode::Lrgb;
  else if (profile == "display-p3") mode = Mode::P3;
  else return std::nullopt;

  auto coords = consumeCoords(tokens, 2, /*includeHue=*/false);
  if (!coords) return std::nullopt;

  Parsed res;
  res.mode = mode;
  const auto channel = [](const Coord& c) {
    return c.type == TokType::Number ? c.value : c.value / 100.0;
  };
  if ((*coords)[0].type != TokType::None) res.c1 = channel((*coords)[0]);
  if ((*coords)[1].type != TokType::None) res.c2 = channel((*coords)[1]);
  if ((*coords)[2].type != TokType::None) res.c3 = channel((*coords)[2]);
  applyAlpha(res, (*coords)[3]);
  return res;
}

std::optional<Parsed> parseModern(const std::vector<Tok>& tokens) {
  if (tokens.empty() || tokens[0].type != TokType::Function) {
    return std::nullopt;
  }
  const std::string& name = tokens[0].ident;
  if (name == "color") return parseColorFunction(tokens);

  auto coords = consumeCoords(tokens, 1, /*includeHue=*/true);
  if (!coords) return std::nullopt;

  if (name == "rgb" || name == "rgba") return parseRgbModern(*coords);
  if (name == "hsl" || name == "hsla") return parseHslModern(*coords);
  if (name == "hwb") return parseHwbModern(*coords);
  if (name == "lab") return parseLabModern(*coords);
  if (name == "lch") return parseLchModern(*coords);
  if (name == "oklab") return parseOklabModern(*coords);
  if (name == "oklch") return parseOklchModern(*coords);
  return std::nullopt;
}

// ---------------------------------------------------------------------------
// Hex + named + legacy (comma) syntaxes.
// ---------------------------------------------------------------------------

inline int hexDigit(char ch) {
  if (ch >= '0' && ch <= '9') return ch - '0';
  if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
  if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
  return -1;
}

// culori src/rgb/parseHex.js + parseNumber.js. Like culori the leading '#'
// is optional (regex `^#?(...)$`).
std::optional<Parsed> parseHex(std::string_view v) {
  std::string_view body = v;
  if (!body.empty() && body[0] == '#') body.remove_prefix(1);
  const size_t len = body.size();
  if (len != 3 && len != 4 && len != 6 && len != 8) return std::nullopt;

  uint64_t bits = 0;
  for (char ch : body) {
    const int d = hexDigit(ch);
    if (d < 0) return std::nullopt;
    bits = (bits << 4) | static_cast<uint64_t>(d);
  }

  Parsed res;
  res.mode = Mode::Rgb;
  const auto expand = [](uint64_t nibble) {
    return static_cast<double>(nibble * 17) / 255.0;
  };
  if (len == 3) {
    res.c1 = expand((bits >> 8) & 0xF);
    res.c2 = expand((bits >> 4) & 0xF);
    res.c3 = expand(bits & 0xF);
  } else if (len == 4) {
    res.c1 = expand((bits >> 12) & 0xF);
    res.c2 = expand((bits >> 8) & 0xF);
    res.c3 = expand((bits >> 4) & 0xF);
    res.hasAlpha = true;
    res.alpha = expand(bits & 0xF);
  } else if (len == 6) {
    res.c1 = static_cast<double>((bits >> 16) & 0xFF) / 255.0;
    res.c2 = static_cast<double>((bits >> 8) & 0xFF) / 255.0;
    res.c3 = static_cast<double>(bits & 0xFF) / 255.0;
  } else {
    res.c1 = static_cast<double>((bits >> 24) & 0xFF) / 255.0;
    res.c2 = static_cast<double>((bits >> 16) & 0xFF) / 255.0;
    res.c3 = static_cast<double>((bits >> 8) & 0xFF) / 255.0;
    res.hasAlpha = true;
    res.alpha = static_cast<double>(bits & 0xFF) / 255.0;
  }
  return res;
}

// CSS named colors — port of culori src/colors/named.js (CSS Color 4 table).
struct NamedColor {
  const char* name;
  uint32_t rgb;
};

constexpr NamedColor kNamedColors[] = {
    {"aliceblue", 0xf0f8ff}, {"antiquewhite", 0xfaebd7}, {"aqua", 0x00ffff},
    {"aquamarine", 0x7fffd4}, {"azure", 0xf0ffff}, {"beige", 0xf5f5dc},
    {"bisque", 0xffe4c4}, {"black", 0x000000}, {"blanchedalmond", 0xffebcd},
    {"blue", 0x0000ff}, {"blueviolet", 0x8a2be2}, {"brown", 0xa52a2a},
    {"burlywood", 0xdeb887}, {"cadetblue", 0x5f9ea0}, {"chartreuse", 0x7fff00},
    {"chocolate", 0xd2691e}, {"coral", 0xff7f50},
    {"cornflowerblue", 0x6495ed}, {"cornsilk", 0xfff8dc},
    {"crimson", 0xdc143c}, {"cyan", 0x00ffff}, {"darkblue", 0x00008b},
    {"darkcyan", 0x008b8b}, {"darkgoldenrod", 0xb8860b},
    {"darkgray", 0xa9a9a9}, {"darkgreen", 0x006400}, {"darkgrey", 0xa9a9a9},
    {"darkkhaki", 0xbdb76b}, {"darkmagenta", 0x8b008b},
    {"darkolivegreen", 0x556b2f}, {"darkorange", 0xff8c00},
    {"darkorchid", 0x9932cc}, {"darkred", 0x8b0000},
    {"darksalmon", 0xe9967a}, {"darkseagreen", 0x8fbc8f},
    {"darkslateblue", 0x483d8b}, {"darkslategray", 0x2f4f4f},
    {"darkslategrey", 0x2f4f4f}, {"darkturquoise", 0x00ced1},
    {"darkviolet", 0x9400d3}, {"deeppink", 0xff1493},
    {"deepskyblue", 0x00bfff}, {"dimgray", 0x696969}, {"dimgrey", 0x696969},
    {"dodgerblue", 0x1e90ff}, {"firebrick", 0xb22222},
    {"floralwhite", 0xfffaf0}, {"forestgreen", 0x228b22},
    {"fuchsia", 0xff00ff}, {"gainsboro", 0xdcdcdc}, {"ghostwhite", 0xf8f8ff},
    {"gold", 0xffd700}, {"goldenrod", 0xdaa520}, {"gray", 0x808080},
    {"green", 0x008000}, {"greenyellow", 0xadff2f}, {"grey", 0x808080},
    {"honeydew", 0xf0fff0}, {"hotpink", 0xff69b4}, {"indianred", 0xcd5c5c},
    {"indigo", 0x4b0082}, {"ivory", 0xfffff0}, {"khaki", 0xf0e68c},
    {"lavender", 0xe6e6fa}, {"lavenderblush", 0xfff0f5},
    {"lawngreen", 0x7cfc00}, {"lemonchiffon", 0xfffacd},
    {"lightblue", 0xadd8e6}, {"lightcoral", 0xf08080},
    {"lightcyan", 0xe0ffff}, {"lightgoldenrodyellow", 0xfafad2},
    {"lightgray", 0xd3d3d3}, {"lightgreen", 0x90ee90},
    {"lightgrey", 0xd3d3d3}, {"lightpink", 0xffb6c1},
    {"lightsalmon", 0xffa07a}, {"lightseagreen", 0x20b2aa},
    {"lightskyblue", 0x87cefa}, {"lightslategray", 0x778899},
    {"lightslategrey", 0x778899}, {"lightsteelblue", 0xb0c4de},
    {"lightyellow", 0xffffe0}, {"lime", 0x00ff00}, {"limegreen", 0x32cd32},
    {"linen", 0xfaf0e6}, {"magenta", 0xff00ff}, {"maroon", 0x800000},
    {"mediumaquamarine", 0x66cdaa}, {"mediumblue", 0x0000cd},
    {"mediumorchid", 0xba55d3}, {"mediumpurple", 0x9370db},
    {"mediumseagreen", 0x3cb371}, {"mediumslateblue", 0x7b68ee},
    {"mediumspringgreen", 0x00fa9a}, {"mediumturquoise", 0x48d1cc},
    {"mediumvioletred", 0xc71585}, {"midnightblue", 0x191970},
    {"mintcream", 0xf5fffa}, {"mistyrose", 0xffe4e1}, {"moccasin", 0xffe4b5},
    {"navajowhite", 0xffdead}, {"navy", 0x000080}, {"oldlace", 0xfdf5e6},
    {"olive", 0x808000}, {"olivedrab", 0x6b8e23}, {"orange", 0xffa500},
    {"orangered", 0xff4500}, {"orchid", 0xda70d6},
    {"palegoldenrod", 0xeee8aa}, {"palegreen", 0x98fb98},
    {"paleturquoise", 0xafeeee}, {"palevioletred", 0xdb7093},
    {"papayawhip", 0xffefd5}, {"peachpuff", 0xffdab9}, {"peru", 0xcd853f},
    {"pink", 0xffc0cb}, {"plum", 0xdda0dd}, {"powderblue", 0xb0e0e6},
    {"purple", 0x800080}, {"rebeccapurple", 0x663399}, {"red", 0xff0000},
    {"rosybrown", 0xbc8f8f}, {"royalblue", 0x4169e1},
    {"saddlebrown", 0x8b4513}, {"salmon", 0xfa8072},
    {"sandybrown", 0xf4a460}, {"seagreen", 0x2e8b57}, {"seashell", 0xfff5ee},
    {"sienna", 0xa0522d}, {"silver", 0xc0c0c0}, {"skyblue", 0x87ceeb},
    {"slateblue", 0x6a5acd}, {"slategray", 0x708090},
    {"slategrey", 0x708090}, {"snow", 0xfffafa}, {"springgreen", 0x00ff7f},
    {"steelblue", 0x4682b4}, {"tan", 0xd2b48c}, {"teal", 0x008080},
    {"thistle", 0xd8bfd8}, {"tomato", 0xff6347}, {"turquoise", 0x40e0d0},
    {"violet", 0xee82ee}, {"wheat", 0xf5deb3}, {"white", 0xffffff},
    {"whitesmoke", 0xf5f5f5}, {"yellow", 0xffff00},
    {"yellowgreen", 0x9acd32},
};

std::string toLowerAscii(std::string_view v) {
  std::string out(v);
  std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  return out;
}

// culori src/rgb/parseNamed.js (+ parseTransparent.js — note culori's
// `transparent` check is case-SENSITIVE while named colors are lowercased).
std::optional<Parsed> parseNamed(std::string_view v) {
  if (v == "transparent") {
    Parsed res;
    res.mode = Mode::Rgb;
    res.hasAlpha = true;
    res.alpha = 0.0;
    return res;
  }
  const std::string lower = toLowerAscii(v);
  for (const NamedColor& entry : kNamedColors) {
    if (lower == entry.name) {
      Parsed res;
      res.mode = Mode::Rgb;
      res.c1 = static_cast<double>((entry.rgb >> 16) & 0xFF) / 255.0;
      res.c2 = static_cast<double>((entry.rgb >> 8) & 0xFF) / 255.0;
      res.c3 = static_cast<double>(entry.rgb & 0xFF) / 255.0;
      return res;
    }
  }
  return std::nullopt;
}

// Legacy (comma) syntax — ports of culori src/rgb/parseRgbLegacy.js and
// src/hsl/parseHslLegacy.js (same regexes, built from util/regex.js pieces).
const char* kNum = R"(([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?))";

// util/regex.js pieces assembled exactly like rgb/parseRgbLegacy.js.
std::string rgbLegacyPattern(bool percentChannels) {
  const std::string c = R"(\s*,\s*)";
  const std::string num = kNum;
  const std::string numPer = "(?:" + num + "%|" + num + ")";
  const std::string chan = percentChannels ? num + "%" : num;
  return R"(^rgba?\(\s*)" + chan + c + chan + c + chan +
      R"(\s*(?:,\s*)" + numPer + R"(\s*)?\)$)";
}

std::optional<Parsed> parseRgbLegacy(const std::string& v) {
  static const std::regex numForm(rgbLegacyPattern(false));
  static const std::regex perForm(rgbLegacyPattern(true));

  std::smatch m;
  Parsed res;
  res.mode = Mode::Rgb;
  if (std::regex_match(v, m, numForm)) {
    res.c1 = std::strtod(m[1].str().c_str(), nullptr) / 255.0;
    res.c2 = std::strtod(m[2].str().c_str(), nullptr) / 255.0;
    res.c3 = std::strtod(m[3].str().c_str(), nullptr) / 255.0;
  } else if (std::regex_match(v, m, perForm)) {
    res.c1 = std::strtod(m[1].str().c_str(), nullptr) / 100.0;
    res.c2 = std::strtod(m[2].str().c_str(), nullptr) / 100.0;
    res.c3 = std::strtod(m[3].str().c_str(), nullptr) / 100.0;
  } else {
    return std::nullopt;
  }
  if (m[4].matched) {
    res.hasAlpha = true;
    res.alpha = clamp01(std::strtod(m[4].str().c_str(), nullptr) / 100.0);
  } else if (m[5].matched) {
    res.hasAlpha = true;
    res.alpha = clamp01(std::strtod(m[5].str().c_str(), nullptr));
  }
  return res;
}

std::optional<Parsed> parseHslLegacy(const std::string& v) {
  // hsl_old: ^hsla?\(\s*<hue>,\s*<per>,\s*<per>(,\s*<num_per>)?\s*\)$
  static const std::regex hslForm(
      std::string(R"(^hsla?\(\s*(?:)") + kNum + R"((deg|grad|rad|turn)|)" +
      kNum + R"()\s*,\s*)" + kNum + R"(%\s*,\s*)" + kNum +
      R"(%\s*(?:,\s*(?:)" + kNum + "%|" + kNum + R"()\s*)?\)$)");

  std::smatch m;
  if (!std::regex_match(v, m, hslForm)) return std::nullopt;

  Parsed res;
  res.mode = Mode::Hsl;
  if (m[3].matched) {
    res.c1 = std::strtod(m[3].str().c_str(), nullptr);
  } else if (m[1].matched && m[2].matched) {
    // util/hue.js hueToDeg
    const double val = std::strtod(m[1].str().c_str(), nullptr);
    const std::string unit = m[2].str();
    if (unit == "deg") res.c1 = val;
    else if (unit == "rad") res.c1 = (val / kPi) * 180.0;
    else if (unit == "grad") res.c1 = (val / 10.0) * 9.0;
    else if (unit == "turn") res.c1 = val * 360.0;
  }
  if (m[4].matched) {
    res.c2 = clamp01(std::strtod(m[4].str().c_str(), nullptr) / 100.0);
  }
  if (m[5].matched) {
    res.c3 = clamp01(std::strtod(m[5].str().c_str(), nullptr) / 100.0);
  }
  if (m[6].matched) {
    res.hasAlpha = true;
    res.alpha = clamp01(std::strtod(m[6].str().c_str(), nullptr) / 100.0);
  } else if (m[7].matched) {
    res.hasAlpha = true;
    res.alpha = clamp01(std::strtod(m[7].str().c_str(), nullptr));
  }
  return res;
}

// culori src/parse.js parse(): modern tokens first, then the per-mode parser
// chain (hex, legacy, named, transparent), then color().
std::optional<Parsed> parseImpl(std::string_view css) {
  // JS String.prototype.trim trims ASCII whitespace + line terminators; the
  // values the compiler feeds us only ever carry spaces/tabs/newlines.
  size_t begin = css.find_first_not_of(" \t\n\r\f\v");
  if (begin == std::string_view::npos) return std::nullopt;
  size_t end = css.find_last_not_of(" \t\n\r\f\v");
  std::string_view v = css.substr(begin, end - begin + 1);

  auto tokens = tokenize(v);
  if (tokens) {
    if (auto modern = parseModern(*tokens)) return modern;
  }
  if (auto hex = parseHex(v)) return hex;
  if (!tokens) {
    const std::string owned(v);
    if (auto rgb = parseRgbLegacy(owned)) return rgb;
    if (auto hsl = parseHslLegacy(owned)) return hsl;
  }
  if (auto named = parseNamed(v)) return named;
  return std::nullopt;
}

Rgba quantize(const RgbResult& rgb) {
  Rgba out;
  out.r = fixup255(rgb.r);
  out.g = fixup255(rgb.g);
  out.b = fixup255(rgb.b);
  out.a = fixup255(rgb.hasAlpha ? rgb.alpha : 1.0);
  return out;
}

char hexChar(uint8_t nibble) {
  return nibble < 10 ? static_cast<char>('0' + nibble)
                     : static_cast<char>('a' + nibble - 10);
}

void appendHexByte(std::string& out, uint8_t byte) {
  out += hexChar(byte >> 4);
  out += hexChar(byte & 0xF);
}

} // namespace

std::optional<Rgba> parseColor(std::string_view css) {
  auto parsed = parseImpl(css);
  if (!parsed) return std::nullopt;
  return quantize(toRgb(*parsed));
}

std::string toHexString(const Rgba& color) {
  std::string out = "#";
  appendHexByte(out, color.r);
  appendHexByte(out, color.g);
  appendHexByte(out, color.b);
  if (color.a != 255) appendHexByte(out, color.a);
  return out;
}

std::optional<std::string> parseColorToHex(std::string_view css) {
  auto parsed = parseImpl(css);
  if (!parsed) return std::nullopt;
  const RgbResult rgb = toRgb(*parsed);
  const Rgba q = quantize(rgb);
  std::string out = "#";
  appendHexByte(out, q.r);
  appendHexByte(out, q.g);
  appendHexByte(out, q.b);
  // toRNValue.ts parity: emit 8 digits iff alpha is present and < 1 *before*
  // quantization (so 0.999 -> "#…ff", but no alpha -> 6 digits).
  if (rgb.hasAlpha && rgb.alpha < 1.0) appendHexByte(out, q.a);
  return out;
}

bool looksLikeColorFunction(std::string_view value) {
  size_t begin = value.find_first_not_of(" \t\n\r\f\v");
  if (begin == std::string_view::npos) return false;
  std::string_view v = value.substr(begin);

  static constexpr std::string_view kPrefixes[] = {
      "rgb(",   "rgba(",  "hsl(", "hsla(", "hwb(",
      "oklch(", "oklab(", "lab(", "lch(",  "color(",
  };
  for (std::string_view prefix : kPrefixes) {
    if (v.size() < prefix.size()) continue;
    bool match = true;
    for (size_t i = 0; i < prefix.size(); i++) {
      if (std::tolower(static_cast<unsigned char>(v[i])) != prefix[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

} // namespace nitrocss::css
