var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// (disabled):crypto
var require_crypto = __commonJS({
  "(disabled):crypto"() {
  }
});

// server/cloudflareWorker.ts
import { connect } from "cloudflare:sockets";

// node_modules/bcryptjs/index.js
var import_crypto = __toESM(require_crypto(), 1);
var randomFallback = null;
function randomBytes(len) {
  try {
    return crypto.getRandomValues(new Uint8Array(len));
  } catch {
  }
  try {
    return import_crypto.default.randomBytes(len);
  } catch {
  }
  if (!randomFallback) {
    throw Error(
      "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
    );
  }
  return randomFallback(len);
}
function setRandomFallback(random) {
  randomFallback = random;
}
function genSaltSync(rounds, seed_length) {
  rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof rounds !== "number")
    throw Error(
      "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
    );
  if (rounds < 4) rounds = 4;
  else if (rounds > 31) rounds = 31;
  var salt = [];
  salt.push("$2b$");
  if (rounds < 10) salt.push("0");
  salt.push(rounds.toString());
  salt.push("$");
  salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
  return salt.join("");
}
function genSalt(rounds, seed_length, callback) {
  if (typeof seed_length === "function")
    callback = seed_length, seed_length = void 0;
  if (typeof rounds === "function") callback = rounds, rounds = void 0;
  if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
  else if (typeof rounds !== "number")
    throw Error("illegal arguments: " + typeof rounds);
  function _async(callback2) {
    nextTick(function() {
      try {
        callback2(null, genSaltSync(rounds));
      } catch (err) {
        callback2(err);
      }
    });
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function hashSync(password, salt) {
  if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof salt === "number") salt = genSaltSync(salt);
  if (typeof password !== "string" || typeof salt !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof salt);
  return _hash(password, salt);
}
function hash(password, salt, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password === "string" && typeof salt === "number")
      genSalt(salt, function(err, salt2) {
        _hash(password, salt2, callback2, progressCallback);
      });
    else if (typeof password === "string" && typeof salt === "string")
      _hash(password, salt, callback2, progressCallback);
    else
      nextTick(
        callback2.bind(
          this,
          Error("Illegal arguments: " + typeof password + ", " + typeof salt)
        )
      );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function safeStringCompare(known, unknown) {
  var diff = known.length ^ unknown.length;
  for (var i = 0; i < known.length; ++i) {
    diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
  }
  return diff === 0;
}
function compareSync(password, hash2) {
  if (typeof password !== "string" || typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof hash2);
  if (hash2.length !== 60) return false;
  return safeStringCompare(
    hashSync(password, hash2.substring(0, hash2.length - 31)),
    hash2
  );
}
function compare(password, hashValue, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password !== "string" || typeof hashValue !== "string") {
      nextTick(
        callback2.bind(
          this,
          Error(
            "Illegal arguments: " + typeof password + ", " + typeof hashValue
          )
        )
      );
      return;
    }
    if (hashValue.length !== 60) {
      nextTick(callback2.bind(this, null, false));
      return;
    }
    hash(
      password,
      hashValue.substring(0, 29),
      function(err, comp) {
        if (err) callback2(err);
        else callback2(null, safeStringCompare(comp, hashValue));
      },
      progressCallback
    );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function getRounds(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  return parseInt(hash2.split("$")[2], 10);
}
function getSalt(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  if (hash2.length !== 60)
    throw Error("Illegal hash length: " + hash2.length + " != 60");
  return hash2.substring(0, 29);
}
function truncates(password) {
  if (typeof password !== "string")
    throw Error("Illegal arguments: " + typeof password);
  return utf8Length(password) > 72;
}
var nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
function utf8Length(string) {
  var len = 0, c = 0;
  for (var i = 0; i < string.length; ++i) {
    c = string.charCodeAt(i);
    if (c < 128) len += 1;
    else if (c < 2048) len += 2;
    else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
      ++i;
      len += 4;
    } else len += 3;
  }
  return len;
}
function utf8Array(string) {
  var offset = 0, c1, c2;
  var buffer = new Array(utf8Length(string));
  for (var i = 0, k = string.length; i < k; ++i) {
    c1 = string.charCodeAt(i);
    if (c1 < 128) {
      buffer[offset++] = c1;
    } else if (c1 < 2048) {
      buffer[offset++] = c1 >> 6 | 192;
      buffer[offset++] = c1 & 63 | 128;
    } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
      c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
      ++i;
      buffer[offset++] = c1 >> 18 | 240;
      buffer[offset++] = c1 >> 12 & 63 | 128;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    } else {
      buffer[offset++] = c1 >> 12 | 224;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    }
  }
  return buffer;
}
var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
var BASE64_INDEX = [
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  1,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  -1,
  -1,
  -1,
  -1,
  -1
];
function base64_encode(b, len) {
  var off = 0, rs = [], c1, c2;
  if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
  while (off < len) {
    c1 = b[off++] & 255;
    rs.push(BASE64_CODE[c1 >> 2 & 63]);
    c1 = (c1 & 3) << 4;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 4 & 15;
    rs.push(BASE64_CODE[c1 & 63]);
    c1 = (c2 & 15) << 2;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 6 & 3;
    rs.push(BASE64_CODE[c1 & 63]);
    rs.push(BASE64_CODE[c2 & 63]);
  }
  return rs.join("");
}
function base64_decode(s, len) {
  var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
  if (len <= 0) throw Error("Illegal len: " + len);
  while (off < slen - 1 && olen < len) {
    code = s.charCodeAt(off++);
    c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    code = s.charCodeAt(off++);
    c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c1 == -1 || c2 == -1) break;
    o = c1 << 2 >>> 0;
    o |= (c2 & 48) >> 4;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c3 == -1) break;
    o = (c2 & 15) << 4 >>> 0;
    o |= (c3 & 60) >> 2;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    o = (c3 & 3) << 6 >>> 0;
    o |= c4;
    rs.push(String.fromCharCode(o));
    ++olen;
  }
  var res = [];
  for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
  return res;
}
var BCRYPT_SALT_LEN = 16;
var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
var BLOWFISH_NUM_ROUNDS = 16;
var MAX_EXECUTION_TIME = 100;
var P_ORIG = [
  608135816,
  2242054355,
  320440878,
  57701188,
  2752067618,
  698298832,
  137296536,
  3964562569,
  1160258022,
  953160567,
  3193202383,
  887688300,
  3232508343,
  3380367581,
  1065670069,
  3041331479,
  2450970073,
  2306472731
];
var S_ORIG = [
  3509652390,
  2564797868,
  805139163,
  3491422135,
  3101798381,
  1780907670,
  3128725573,
  4046225305,
  614570311,
  3012652279,
  134345442,
  2240740374,
  1667834072,
  1901547113,
  2757295779,
  4103290238,
  227898511,
  1921955416,
  1904987480,
  2182433518,
  2069144605,
  3260701109,
  2620446009,
  720527379,
  3318853667,
  677414384,
  3393288472,
  3101374703,
  2390351024,
  1614419982,
  1822297739,
  2954791486,
  3608508353,
  3174124327,
  2024746970,
  1432378464,
  3864339955,
  2857741204,
  1464375394,
  1676153920,
  1439316330,
  715854006,
  3033291828,
  289532110,
  2706671279,
  2087905683,
  3018724369,
  1668267050,
  732546397,
  1947742710,
  3462151702,
  2609353502,
  2950085171,
  1814351708,
  2050118529,
  680887927,
  999245976,
  1800124847,
  3300911131,
  1713906067,
  1641548236,
  4213287313,
  1216130144,
  1575780402,
  4018429277,
  3917837745,
  3693486850,
  3949271944,
  596196993,
  3549867205,
  258830323,
  2213823033,
  772490370,
  2760122372,
  1774776394,
  2652871518,
  566650946,
  4142492826,
  1728879713,
  2882767088,
  1783734482,
  3629395816,
  2517608232,
  2874225571,
  1861159788,
  326777828,
  3124490320,
  2130389656,
  2716951837,
  967770486,
  1724537150,
  2185432712,
  2364442137,
  1164943284,
  2105845187,
  998989502,
  3765401048,
  2244026483,
  1075463327,
  1455516326,
  1322494562,
  910128902,
  469688178,
  1117454909,
  936433444,
  3490320968,
  3675253459,
  1240580251,
  122909385,
  2157517691,
  634681816,
  4142456567,
  3825094682,
  3061402683,
  2540495037,
  79693498,
  3249098678,
  1084186820,
  1583128258,
  426386531,
  1761308591,
  1047286709,
  322548459,
  995290223,
  1845252383,
  2603652396,
  3431023940,
  2942221577,
  3202600964,
  3727903485,
  1712269319,
  422464435,
  3234572375,
  1170764815,
  3523960633,
  3117677531,
  1434042557,
  442511882,
  3600875718,
  1076654713,
  1738483198,
  4213154764,
  2393238008,
  3677496056,
  1014306527,
  4251020053,
  793779912,
  2902807211,
  842905082,
  4246964064,
  1395751752,
  1040244610,
  2656851899,
  3396308128,
  445077038,
  3742853595,
  3577915638,
  679411651,
  2892444358,
  2354009459,
  1767581616,
  3150600392,
  3791627101,
  3102740896,
  284835224,
  4246832056,
  1258075500,
  768725851,
  2589189241,
  3069724005,
  3532540348,
  1274779536,
  3789419226,
  2764799539,
  1660621633,
  3471099624,
  4011903706,
  913787905,
  3497959166,
  737222580,
  2514213453,
  2928710040,
  3937242737,
  1804850592,
  3499020752,
  2949064160,
  2386320175,
  2390070455,
  2415321851,
  4061277028,
  2290661394,
  2416832540,
  1336762016,
  1754252060,
  3520065937,
  3014181293,
  791618072,
  3188594551,
  3933548030,
  2332172193,
  3852520463,
  3043980520,
  413987798,
  3465142937,
  3030929376,
  4245938359,
  2093235073,
  3534596313,
  375366246,
  2157278981,
  2479649556,
  555357303,
  3870105701,
  2008414854,
  3344188149,
  4221384143,
  3956125452,
  2067696032,
  3594591187,
  2921233993,
  2428461,
  544322398,
  577241275,
  1471733935,
  610547355,
  4027169054,
  1432588573,
  1507829418,
  2025931657,
  3646575487,
  545086370,
  48609733,
  2200306550,
  1653985193,
  298326376,
  1316178497,
  3007786442,
  2064951626,
  458293330,
  2589141269,
  3591329599,
  3164325604,
  727753846,
  2179363840,
  146436021,
  1461446943,
  4069977195,
  705550613,
  3059967265,
  3887724982,
  4281599278,
  3313849956,
  1404054877,
  2845806497,
  146425753,
  1854211946,
  1266315497,
  3048417604,
  3681880366,
  3289982499,
  290971e4,
  1235738493,
  2632868024,
  2414719590,
  3970600049,
  1771706367,
  1449415276,
  3266420449,
  422970021,
  1963543593,
  2690192192,
  3826793022,
  1062508698,
  1531092325,
  1804592342,
  2583117782,
  2714934279,
  4024971509,
  1294809318,
  4028980673,
  1289560198,
  2221992742,
  1669523910,
  35572830,
  157838143,
  1052438473,
  1016535060,
  1802137761,
  1753167236,
  1386275462,
  3080475397,
  2857371447,
  1040679964,
  2145300060,
  2390574316,
  1461121720,
  2956646967,
  4031777805,
  4028374788,
  33600511,
  2920084762,
  1018524850,
  629373528,
  3691585981,
  3515945977,
  2091462646,
  2486323059,
  586499841,
  988145025,
  935516892,
  3367335476,
  2599673255,
  2839830854,
  265290510,
  3972581182,
  2759138881,
  3795373465,
  1005194799,
  847297441,
  406762289,
  1314163512,
  1332590856,
  1866599683,
  4127851711,
  750260880,
  613907577,
  1450815602,
  3165620655,
  3734664991,
  3650291728,
  3012275730,
  3704569646,
  1427272223,
  778793252,
  1343938022,
  2676280711,
  2052605720,
  1946737175,
  3164576444,
  3914038668,
  3967478842,
  3682934266,
  1661551462,
  3294938066,
  4011595847,
  840292616,
  3712170807,
  616741398,
  312560963,
  711312465,
  1351876610,
  322626781,
  1910503582,
  271666773,
  2175563734,
  1594956187,
  70604529,
  3617834859,
  1007753275,
  1495573769,
  4069517037,
  2549218298,
  2663038764,
  504708206,
  2263041392,
  3941167025,
  2249088522,
  1514023603,
  1998579484,
  1312622330,
  694541497,
  2582060303,
  2151582166,
  1382467621,
  776784248,
  2618340202,
  3323268794,
  2497899128,
  2784771155,
  503983604,
  4076293799,
  907881277,
  423175695,
  432175456,
  1378068232,
  4145222326,
  3954048622,
  3938656102,
  3820766613,
  2793130115,
  2977904593,
  26017576,
  3274890735,
  3194772133,
  1700274565,
  1756076034,
  4006520079,
  3677328699,
  720338349,
  1533947780,
  354530856,
  688349552,
  3973924725,
  1637815568,
  332179504,
  3949051286,
  53804574,
  2852348879,
  3044236432,
  1282449977,
  3583942155,
  3416972820,
  4006381244,
  1617046695,
  2628476075,
  3002303598,
  1686838959,
  431878346,
  2686675385,
  1700445008,
  1080580658,
  1009431731,
  832498133,
  3223435511,
  2605976345,
  2271191193,
  2516031870,
  1648197032,
  4164389018,
  2548247927,
  300782431,
  375919233,
  238389289,
  3353747414,
  2531188641,
  2019080857,
  1475708069,
  455242339,
  2609103871,
  448939670,
  3451063019,
  1395535956,
  2413381860,
  1841049896,
  1491858159,
  885456874,
  4264095073,
  4001119347,
  1565136089,
  3898914787,
  1108368660,
  540939232,
  1173283510,
  2745871338,
  3681308437,
  4207628240,
  3343053890,
  4016749493,
  1699691293,
  1103962373,
  3625875870,
  2256883143,
  3830138730,
  1031889488,
  3479347698,
  1535977030,
  4236805024,
  3251091107,
  2132092099,
  1774941330,
  1199868427,
  1452454533,
  157007616,
  2904115357,
  342012276,
  595725824,
  1480756522,
  206960106,
  497939518,
  591360097,
  863170706,
  2375253569,
  3596610801,
  1814182875,
  2094937945,
  3421402208,
  1082520231,
  3463918190,
  2785509508,
  435703966,
  3908032597,
  1641649973,
  2842273706,
  3305899714,
  1510255612,
  2148256476,
  2655287854,
  3276092548,
  4258621189,
  236887753,
  3681803219,
  274041037,
  1734335097,
  3815195456,
  3317970021,
  1899903192,
  1026095262,
  4050517792,
  356393447,
  2410691914,
  3873677099,
  3682840055,
  3913112168,
  2491498743,
  4132185628,
  2489919796,
  1091903735,
  1979897079,
  3170134830,
  3567386728,
  3557303409,
  857797738,
  1136121015,
  1342202287,
  507115054,
  2535736646,
  337727348,
  3213592640,
  1301675037,
  2528481711,
  1895095763,
  1721773893,
  3216771564,
  62756741,
  2142006736,
  835421444,
  2531993523,
  1442658625,
  3659876326,
  2882144922,
  676362277,
  1392781812,
  170690266,
  3921047035,
  1759253602,
  3611846912,
  1745797284,
  664899054,
  1329594018,
  3901205900,
  3045908486,
  2062866102,
  2865634940,
  3543621612,
  3464012697,
  1080764994,
  553557557,
  3656615353,
  3996768171,
  991055499,
  499776247,
  1265440854,
  648242737,
  3940784050,
  980351604,
  3713745714,
  1749149687,
  3396870395,
  4211799374,
  3640570775,
  1161844396,
  3125318951,
  1431517754,
  545492359,
  4268468663,
  3499529547,
  1437099964,
  2702547544,
  3433638243,
  2581715763,
  2787789398,
  1060185593,
  1593081372,
  2418618748,
  4260947970,
  69676912,
  2159744348,
  86519011,
  2512459080,
  3838209314,
  1220612927,
  3339683548,
  133810670,
  1090789135,
  1078426020,
  1569222167,
  845107691,
  3583754449,
  4072456591,
  1091646820,
  628848692,
  1613405280,
  3757631651,
  526609435,
  236106946,
  48312990,
  2942717905,
  3402727701,
  1797494240,
  859738849,
  992217954,
  4005476642,
  2243076622,
  3870952857,
  3732016268,
  765654824,
  3490871365,
  2511836413,
  1685915746,
  3888969200,
  1414112111,
  2273134842,
  3281911079,
  4080962846,
  172450625,
  2569994100,
  980381355,
  4109958455,
  2819808352,
  2716589560,
  2568741196,
  3681446669,
  3329971472,
  1835478071,
  660984891,
  3704678404,
  4045999559,
  3422617507,
  3040415634,
  1762651403,
  1719377915,
  3470491036,
  2693910283,
  3642056355,
  3138596744,
  1364962596,
  2073328063,
  1983633131,
  926494387,
  3423689081,
  2150032023,
  4096667949,
  1749200295,
  3328846651,
  309677260,
  2016342300,
  1779581495,
  3079819751,
  111262694,
  1274766160,
  443224088,
  298511866,
  1025883608,
  3806446537,
  1145181785,
  168956806,
  3641502830,
  3584813610,
  1689216846,
  3666258015,
  3200248200,
  1692713982,
  2646376535,
  4042768518,
  1618508792,
  1610833997,
  3523052358,
  4130873264,
  2001055236,
  3610705100,
  2202168115,
  4028541809,
  2961195399,
  1006657119,
  2006996926,
  3186142756,
  1430667929,
  3210227297,
  1314452623,
  4074634658,
  4101304120,
  2273951170,
  1399257539,
  3367210612,
  3027628629,
  1190975929,
  2062231137,
  2333990788,
  2221543033,
  2438960610,
  1181637006,
  548689776,
  2362791313,
  3372408396,
  3104550113,
  3145860560,
  296247880,
  1970579870,
  3078560182,
  3769228297,
  1714227617,
  3291629107,
  3898220290,
  166772364,
  1251581989,
  493813264,
  448347421,
  195405023,
  2709975567,
  677966185,
  3703036547,
  1463355134,
  2715995803,
  1338867538,
  1343315457,
  2802222074,
  2684532164,
  233230375,
  2599980071,
  2000651841,
  3277868038,
  1638401717,
  4028070440,
  3237316320,
  6314154,
  819756386,
  300326615,
  590932579,
  1405279636,
  3267499572,
  3150704214,
  2428286686,
  3959192993,
  3461946742,
  1862657033,
  1266418056,
  963775037,
  2089974820,
  2263052895,
  1917689273,
  448879540,
  3550394620,
  3981727096,
  150775221,
  3627908307,
  1303187396,
  508620638,
  2975983352,
  2726630617,
  1817252668,
  1876281319,
  1457606340,
  908771278,
  3720792119,
  3617206836,
  2455994898,
  1729034894,
  1080033504,
  976866871,
  3556439503,
  2881648439,
  1522871579,
  1555064734,
  1336096578,
  3548522304,
  2579274686,
  3574697629,
  3205460757,
  3593280638,
  3338716283,
  3079412587,
  564236357,
  2993598910,
  1781952180,
  1464380207,
  3163844217,
  3332601554,
  1699332808,
  1393555694,
  1183702653,
  3581086237,
  1288719814,
  691649499,
  2847557200,
  2895455976,
  3193889540,
  2717570544,
  1781354906,
  1676643554,
  2592534050,
  3230253752,
  1126444790,
  2770207658,
  2633158820,
  2210423226,
  2615765581,
  2414155088,
  3127139286,
  673620729,
  2805611233,
  1269405062,
  4015350505,
  3341807571,
  4149409754,
  1057255273,
  2012875353,
  2162469141,
  2276492801,
  2601117357,
  993977747,
  3918593370,
  2654263191,
  753973209,
  36408145,
  2530585658,
  25011837,
  3520020182,
  2088578344,
  530523599,
  2918365339,
  1524020338,
  1518925132,
  3760827505,
  3759777254,
  1202760957,
  3985898139,
  3906192525,
  674977740,
  4174734889,
  2031300136,
  2019492241,
  3983892565,
  4153806404,
  3822280332,
  352677332,
  2297720250,
  60907813,
  90501309,
  3286998549,
  1016092578,
  2535922412,
  2839152426,
  457141659,
  509813237,
  4120667899,
  652014361,
  1966332200,
  2975202805,
  55981186,
  2327461051,
  676427537,
  3255491064,
  2882294119,
  3433927263,
  1307055953,
  942726286,
  933058658,
  2468411793,
  3933900994,
  4215176142,
  1361170020,
  2001714738,
  2830558078,
  3274259782,
  1222529897,
  1679025792,
  2729314320,
  3714953764,
  1770335741,
  151462246,
  3013232138,
  1682292957,
  1483529935,
  471910574,
  1539241949,
  458788160,
  3436315007,
  1807016891,
  3718408830,
  978976581,
  1043663428,
  3165965781,
  1927990952,
  4200891579,
  2372276910,
  3208408903,
  3533431907,
  1412390302,
  2931980059,
  4132332400,
  1947078029,
  3881505623,
  4168226417,
  2941484381,
  1077988104,
  1320477388,
  886195818,
  18198404,
  3786409e3,
  2509781533,
  112762804,
  3463356488,
  1866414978,
  891333506,
  18488651,
  661792760,
  1628790961,
  3885187036,
  3141171499,
  876946877,
  2693282273,
  1372485963,
  791857591,
  2686433993,
  3759982718,
  3167212022,
  3472953795,
  2716379847,
  445679433,
  3561995674,
  3504004811,
  3574258232,
  54117162,
  3331405415,
  2381918588,
  3769707343,
  4154350007,
  1140177722,
  4074052095,
  668550556,
  3214352940,
  367459370,
  261225585,
  2610173221,
  4209349473,
  3468074219,
  3265815641,
  314222801,
  3066103646,
  3808782860,
  282218597,
  3406013506,
  3773591054,
  379116347,
  1285071038,
  846784868,
  2669647154,
  3771962079,
  3550491691,
  2305946142,
  453669953,
  1268987020,
  3317592352,
  3279303384,
  3744833421,
  2610507566,
  3859509063,
  266596637,
  3847019092,
  517658769,
  3462560207,
  3443424879,
  370717030,
  4247526661,
  2224018117,
  4143653529,
  4112773975,
  2788324899,
  2477274417,
  1456262402,
  2901442914,
  1517677493,
  1846949527,
  2295493580,
  3734397586,
  2176403920,
  1280348187,
  1908823572,
  3871786941,
  846861322,
  1172426758,
  3287448474,
  3383383037,
  1655181056,
  3139813346,
  901632758,
  1897031941,
  2986607138,
  3066810236,
  3447102507,
  1393639104,
  373351379,
  950779232,
  625454576,
  3124240540,
  4148612726,
  2007998917,
  544563296,
  2244738638,
  2330496472,
  2058025392,
  1291430526,
  424198748,
  50039436,
  29584100,
  3605783033,
  2429876329,
  2791104160,
  1057563949,
  3255363231,
  3075367218,
  3463963227,
  1469046755,
  985887462
];
var C_ORIG = [
  1332899944,
  1700884034,
  1701343084,
  1684370003,
  1668446532,
  1869963892
];
function _encipher(lr, off, P, S) {
  var n, l = lr[off], r = lr[off + 1];
  l ^= P[0];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[1];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[2];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[3];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[4];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[5];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[6];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[7];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[8];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[9];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[10];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[11];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[12];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[13];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[14];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[15];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[16];
  lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
  lr[off + 1] = l;
  return lr;
}
function _streamtoword(data, offp) {
  for (var i = 0, word = 0; i < 4; ++i)
    word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
  return { key: word, offp };
}
function _key(key, P, S) {
  var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
  for (i = 0; i < plen; i += 2)
    lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _ekskey(data, key, P, S) {
  var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
  offp = 0;
  for (i = 0; i < plen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
function _crypt(b, salt, rounds, callback, progressCallback) {
  var cdata = C_ORIG.slice(), clen = cdata.length, err;
  if (rounds < 4 || rounds > 31) {
    err = Error("Illegal number of rounds (4-31): " + rounds);
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.length !== BCRYPT_SALT_LEN) {
    err = Error(
      "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
    );
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  rounds = 1 << rounds >>> 0;
  var P, S, i = 0, j;
  if (typeof Int32Array === "function") {
    P = new Int32Array(P_ORIG);
    S = new Int32Array(S_ORIG);
  } else {
    P = P_ORIG.slice();
    S = S_ORIG.slice();
  }
  _ekskey(salt, b, P, S);
  function next() {
    if (progressCallback) progressCallback(i / rounds);
    if (i < rounds) {
      var start = Date.now();
      for (; i < rounds; ) {
        i = i + 1;
        _key(b, P, S);
        _key(salt, P, S);
        if (Date.now() - start > MAX_EXECUTION_TIME) break;
      }
    } else {
      for (i = 0; i < 64; i++)
        for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
      var ret = [];
      for (i = 0; i < clen; i++)
        ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
      if (callback) {
        callback(null, ret);
        return;
      } else return ret;
    }
    if (callback) nextTick(next);
  }
  if (typeof callback !== "undefined") {
    next();
  } else {
    var res;
    while (true) if (typeof (res = next()) !== "undefined") return res || [];
  }
}
function _hash(password, salt, callback, progressCallback) {
  var err;
  if (typeof password !== "string" || typeof salt !== "string") {
    err = Error("Invalid string / salt: Not a string");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var minor, offset;
  if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
    err = Error("Invalid salt version: " + salt.substring(0, 2));
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.charAt(2) === "$") minor = String.fromCharCode(0), offset = 3;
  else {
    minor = salt.charAt(2);
    if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
      err = Error("Invalid salt revision: " + salt.substring(2, 4));
      if (callback) {
        nextTick(callback.bind(this, err));
        return;
      } else throw err;
    }
    offset = 4;
  }
  if (salt.charAt(offset + 2) > "$") {
    err = Error("Missing salt rounds");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
  password += minor >= "a" ? "\0" : "";
  var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
  function finish(bytes) {
    var res = [];
    res.push("$2");
    if (minor >= "a") res.push(minor);
    res.push("$");
    if (rounds < 10) res.push("0");
    res.push(rounds.toString());
    res.push("$");
    res.push(base64_encode(saltb, saltb.length));
    res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
    return res.join("");
  }
  if (typeof callback == "undefined")
    return finish(_crypt(passwordb, saltb, rounds));
  else {
    _crypt(
      passwordb,
      saltb,
      rounds,
      function(err2, bytes) {
        if (err2) callback(err2, null);
        else callback(null, finish(bytes));
      },
      progressCallback
    );
  }
}
function encodeBase64(bytes, length) {
  return base64_encode(bytes, length);
}
function decodeBase64(string, length) {
  return base64_decode(string, length);
}
var bcryptjs_default = {
  setRandomFallback,
  genSaltSync,
  genSalt,
  hashSync,
  hash,
  compareSync,
  compare,
  getRounds,
  getSalt,
  truncates,
  encodeBase64,
  decodeBase64
};

// server/cloudflareWorker.ts
function md5(input) {
  function rotateLeft(lValue, iShiftBits) {
    return lValue << iShiftBits | lValue >>> 32 - iShiftBits;
  }
  function addUnsigned(lX, lY) {
    const lX8 = lX & 2147483648;
    const lY8 = lY & 2147483648;
    const lX4 = lX & 1073741824;
    const lY4 = lY & 1073741824;
    const lResult = (lX & 1073741823) + (lY & 1073741823);
    if (lX4 & lY4) return lResult ^ 2147483648 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 1073741824) return lResult ^ 3221225472 ^ lX8 ^ lY8;
      return lResult ^ 1073741824 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x2, y, z) {
    return x2 & y | ~x2 & z;
  }
  function G(x2, y, z) {
    return x2 & z | y & ~z;
  }
  function H(x2, y, z) {
    return x2 ^ y ^ z;
  }
  function I(x2, y, z) {
    return y ^ (x2 | ~z);
  }
  function FF(a2, b2, c2, d2, x2, s, ac) {
    a2 = addUnsigned(a2, addUnsigned(addUnsigned(F(b2, c2, d2), x2), ac));
    return addUnsigned(rotateLeft(a2, s), b2);
  }
  function GG(a2, b2, c2, d2, x2, s, ac) {
    a2 = addUnsigned(a2, addUnsigned(addUnsigned(G(b2, c2, d2), x2), ac));
    return addUnsigned(rotateLeft(a2, s), b2);
  }
  function HH(a2, b2, c2, d2, x2, s, ac) {
    a2 = addUnsigned(a2, addUnsigned(addUnsigned(H(b2, c2, d2), x2), ac));
    return addUnsigned(rotateLeft(a2, s), b2);
  }
  function II(a2, b2, c2, d2, x2, s, ac) {
    a2 = addUnsigned(a2, addUnsigned(addUnsigned(I(b2, c2, d2), x2), ac));
    return addUnsigned(rotateLeft(a2, s), b2);
  }
  function convertToWordArray(bytes2) {
    const lMessageLength = bytes2.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - lNumberOfWordsTemp1 % 64) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    const lWordArray = new Array(lNumberOfWords).fill(0);
    let lBytePosition = 0;
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount2 = (lByteCount - lByteCount % 4) / 4;
      lBytePosition = lByteCount % 4 * 8;
      lWordArray[lWordCount2] = lWordArray[lWordCount2] | bytes2[lByteCount] << lBytePosition;
      lByteCount++;
    }
    const lWordCount = (lByteCount - lByteCount % 4) / 4;
    lBytePosition = lByteCount % 4 * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | 128 << lBytePosition;
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    let wordToHexValue = "";
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = lValue >>> lCount * 8 & 255;
      const wordToHexValueTemp = "0" + lByte.toString(16);
      wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
    }
    return wordToHexValue;
  }
  const bytes = new TextEncoder().encode(input);
  const x = convertToWordArray(bytes);
  let a = 1732584193;
  let b = 4023233417;
  let c = 2562383102;
  let d = 271733878;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k + 0], 7, 3614090360);
    d = FF(d, a, b, c, x[k + 1], 12, 3905402710);
    c = FF(c, d, a, b, x[k + 2], 17, 606105819);
    b = FF(b, c, d, a, x[k + 3], 22, 3250441966);
    a = FF(a, b, c, d, x[k + 4], 7, 4118548399);
    d = FF(d, a, b, c, x[k + 5], 12, 1200080426);
    c = FF(c, d, a, b, x[k + 6], 17, 2821735955);
    b = FF(b, c, d, a, x[k + 7], 22, 4249261313);
    a = FF(a, b, c, d, x[k + 8], 7, 1770035416);
    d = FF(d, a, b, c, x[k + 9], 12, 2336552879);
    c = FF(c, d, a, b, x[k + 10], 17, 4294925233);
    b = FF(b, c, d, a, x[k + 11], 22, 2304563134);
    a = FF(a, b, c, d, x[k + 12], 7, 1804603682);
    d = FF(d, a, b, c, x[k + 13], 12, 4254626195);
    c = FF(c, d, a, b, x[k + 14], 17, 2792965006);
    b = FF(b, c, d, a, x[k + 15], 22, 1236535329);
    a = GG(a, b, c, d, x[k + 1], 5, 4129170786);
    d = GG(d, a, b, c, x[k + 6], 9, 3225465664);
    c = GG(c, d, a, b, x[k + 11], 14, 643717713);
    b = GG(b, c, d, a, x[k + 0], 20, 3921069994);
    a = GG(a, b, c, d, x[k + 5], 5, 3593408605);
    d = GG(d, a, b, c, x[k + 10], 9, 38016083);
    c = GG(c, d, a, b, x[k + 15], 14, 3634488961);
    b = GG(b, c, d, a, x[k + 4], 20, 3889429448);
    a = GG(a, b, c, d, x[k + 9], 5, 568446438);
    d = GG(d, a, b, c, x[k + 14], 9, 3275163606);
    c = GG(c, d, a, b, x[k + 3], 14, 4107603335);
    b = GG(b, c, d, a, x[k + 8], 20, 1163531501);
    a = GG(a, b, c, d, x[k + 13], 5, 2850285829);
    d = GG(d, a, b, c, x[k + 2], 9, 4243563512);
    c = GG(c, d, a, b, x[k + 7], 14, 1735328473);
    b = GG(b, c, d, a, x[k + 12], 20, 2368359562);
    a = HH(a, b, c, d, x[k + 5], 4, 4294588738);
    d = HH(d, a, b, c, x[k + 8], 11, 2272392833);
    c = HH(c, d, a, b, x[k + 11], 16, 1839030562);
    b = HH(b, c, d, a, x[k + 14], 23, 4259657740);
    a = HH(a, b, c, d, x[k + 1], 4, 2763975236);
    d = HH(d, a, b, c, x[k + 4], 11, 1272893353);
    c = HH(c, d, a, b, x[k + 7], 16, 4139469664);
    b = HH(b, c, d, a, x[k + 10], 23, 3200236656);
    a = HH(a, b, c, d, x[k + 13], 4, 681279174);
    d = HH(d, a, b, c, x[k + 0], 11, 3936430074);
    c = HH(c, d, a, b, x[k + 3], 16, 3572445317);
    b = HH(b, c, d, a, x[k + 6], 23, 76029189);
    a = HH(a, b, c, d, x[k + 9], 4, 3654602809);
    d = HH(d, a, b, c, x[k + 12], 11, 3873151461);
    c = HH(c, d, a, b, x[k + 15], 16, 530742520);
    b = HH(b, c, d, a, x[k + 2], 23, 3299628645);
    a = II(a, b, c, d, x[k + 0], 6, 4096336452);
    d = II(d, a, b, c, x[k + 7], 10, 1126891415);
    c = II(c, d, a, b, x[k + 14], 15, 2878612391);
    b = II(b, c, d, a, x[k + 5], 21, 4237533241);
    a = II(a, b, c, d, x[k + 12], 6, 1700485571);
    d = II(d, a, b, c, x[k + 3], 10, 2399980690);
    c = II(c, d, a, b, x[k + 10], 15, 4293915773);
    b = II(b, c, d, a, x[k + 1], 21, 2240044497);
    a = II(a, b, c, d, x[k + 8], 6, 1873313359);
    d = II(d, a, b, c, x[k + 15], 10, 4264355552);
    c = II(c, d, a, b, x[k + 6], 15, 2734768916);
    b = II(b, c, d, a, x[k + 13], 21, 1309151649);
    a = II(a, b, c, d, x[k + 4], 6, 4149444226);
    d = II(d, a, b, c, x[k + 11], 10, 3174756917);
    c = II(c, d, a, b, x[k + 2], 15, 718787259);
    b = II(b, c, d, a, x[k + 9], 21, 3951481745);
    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
function verifyPassword(plain, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith("$2y$") || storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    const normalized = storedHash.replace(/^\$2y\$/, "$2a$");
    try {
      if (bcryptjs_default.compareSync(plain, normalized)) return true;
    } catch {
    }
  }
  if (storedHash.toLowerCase() === md5(plain).toLowerCase()) return true;
  if (storedHash === plain) return true;
  return false;
}
var DOOPLEX_CONFIG = {
  host: "mysql.us.cloudlogin.co",
  port: 3306,
  user: "plusmovie_st",
  password: "5083038xS/@",
  database: "plusmovie_st"
};
var DOCINES_CONFIG = {
  host: "mysql.us.cloudlogin.co",
  port: 3306,
  user: "plusmovie_do",
  password: "5083038xS/@",
  database: "plusmovie_do"
};
var PLUSMOVIE_CONFIG = {
  host: "mysql.us.cloudlogin.co",
  port: 3306,
  user: "plusmpzj_docines",
  password: "5083038xS/@",
  database: "plusmpzj_docines"
};
var NUMERIC_COL_TYPES = /* @__PURE__ */ new Set([1, 2, 3, 4, 5, 8, 9, 13]);
async function sha1(data) {
  const buf = await crypto.subtle.digest("SHA-1", data);
  return new Uint8Array(buf);
}
function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
async function computeMysqlNativePassword(password, scramble) {
  if (!password) return new Uint8Array(0);
  const passBytes = new TextEncoder().encode(password);
  const stage1 = await sha1(passBytes);
  const stage2 = await sha1(stage1);
  const combined = concatBytes(scramble.slice(0, 20), stage2);
  const stage3 = await sha1(combined);
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) out[i] = stage1[i] ^ stage3[i];
  return out;
}
function readLenEncInt(buf, offset) {
  const first = buf[offset];
  if (first < 251) return { value: first, nextOffset: offset + 1 };
  if (first === 251) return { value: null, nextOffset: offset + 1 };
  if (first === 252) {
    return { value: buf[offset + 1] | buf[offset + 2] << 8, nextOffset: offset + 3 };
  }
  if (first === 253) {
    return {
      value: buf[offset + 1] | buf[offset + 2] << 8 | buf[offset + 3] << 16,
      nextOffset: offset + 4
    };
  }
  const low = buf[offset + 1] | buf[offset + 2] << 8 | buf[offset + 3] << 16 | buf[offset + 4] << 24 >>> 0;
  const high = buf[offset + 5] | buf[offset + 6] << 8 | buf[offset + 7] << 16 | buf[offset + 8] << 24 >>> 0;
  return { value: high * 4294967296 + (low >>> 0), nextOffset: offset + 9 };
}
function readLenEncString(buf, offset) {
  const { value: len, nextOffset } = readLenEncInt(buf, offset);
  if (len === null) return { value: null, nextOffset };
  const str = new TextDecoder().decode(buf.slice(nextOffset, nextOffset + len));
  return { value: str, nextOffset: nextOffset + len };
}
function escapeSqlValue(val) {
  if (val === null || val === void 0) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  const str = String(val).replace(/\\/g, "\\\\").replace(/\0/g, "\\0").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\x1a/g, "\\Z");
  return `'${str}'`;
}
function formatSql(sql, params = []) {
  let idx = 0;
  return sql.replace(/\?/g, () => escapeSqlValue(params[idx++]));
}
async function withMysql(config, fn) {
  const sock = connect({ hostname: config.host, port: config.port });
  const reader = sock.readable.getReader();
  const writer = sock.writable.getWriter();
  let buffer = new Uint8Array(0);
  const ensureBytes = async (n) => {
    while (buffer.length < n) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Conexi\xF3n cerrada inesperadamente por el servidor MySQL");
      buffer = concatBytes(buffer, value);
    }
  };
  const readPacket = async () => {
    await ensureBytes(4);
    const len = buffer[0] | buffer[1] << 8 | buffer[2] << 16;
    const seq = buffer[3];
    await ensureBytes(4 + len);
    const payload = buffer.slice(4, 4 + len);
    buffer = buffer.slice(4 + len);
    return { seq, payload };
  };
  const writePacket = async (seq, body) => {
    const pkt = new Uint8Array(4 + body.length);
    pkt[0] = body.length & 255;
    pkt[1] = body.length >> 8 & 255;
    pkt[2] = body.length >> 16 & 255;
    pkt[3] = seq & 255;
    pkt.set(body, 4);
    await writer.write(pkt);
  };
  try {
    const greeting = await readPacket();
    const p = greeting.payload;
    let pos = 1;
    while (p[pos] !== 0) pos++;
    pos++;
    pos += 4;
    const auth1 = p.slice(pos, pos + 8);
    pos += 8 + 1 + 2 + 1 + 2 + 2;
    const authLen = p[pos];
    pos += 1 + 10;
    const restLen = Math.max(13, authLen - 8);
    const auth2 = p.slice(pos, pos + restLen - 1);
    const scramble = concatBytes(auth1, auth2);
    const clientFlags = 1 | 4 | 8 | 512 | 32768 | 524288 | 16777216;
    const authResp = await computeMysqlNativePassword(config.password, scramble);
    const userBytes = new TextEncoder().encode(config.user + "\0");
    const dbBytes = new TextEncoder().encode(config.database + "\0");
    const pluginBytes = new TextEncoder().encode("mysql_native_password\0");
    const header = new Uint8Array(32);
    header[0] = clientFlags & 255;
    header[1] = clientFlags >> 8 & 255;
    header[2] = clientFlags >> 16 & 255;
    header[3] = clientFlags >> 24 & 255;
    header[7] = 1;
    header[8] = 45;
    const body = concatBytes(header, userBytes, new Uint8Array([authResp.length]), authResp, dbBytes, pluginBytes);
    await writePacket(greeting.seq + 1, body);
    const authRes = await readPacket();
    if (authRes.payload[0] === 255) {
      const errMsg = new TextDecoder().decode(authRes.payload.slice(9));
      throw new Error("Error de autenticaci\xF3n MySQL: " + errMsg);
    }
    const query = async (sql, params = []) => {
      const finalSql = params.length > 0 ? formatSql(sql, params) : sql;
      const sqlBytes = new TextEncoder().encode(finalSql);
      const cmd = new Uint8Array(1 + sqlBytes.length);
      cmd[0] = 3;
      cmd.set(sqlBytes, 1);
      await writePacket(0, cmd);
      const firstPkt = await readPacket();
      const fp = firstPkt.payload;
      if (fp[0] === 0) {
        let o = 1;
        const aff = readLenEncInt(fp, o);
        o = aff.nextOffset;
        const ins = readLenEncInt(fp, o);
        return { rows: [], affectedRows: aff.value ?? 0, insertId: ins.value ?? 0 };
      }
      if (fp[0] === 255) {
        const errMsg = new TextDecoder().decode(fp.slice(9));
        throw new Error("Error en consulta MySQL: " + errMsg);
      }
      const { value: colCount } = readLenEncInt(fp, 0);
      const count = colCount ?? 0;
      const columns = [];
      for (let i = 0; i < count; i++) {
        const colPkt = await readPacket();
        const cp = colPkt.payload;
        let o = 0;
        o = readLenEncString(cp, o).nextOffset;
        o = readLenEncString(cp, o).nextOffset;
        o = readLenEncString(cp, o).nextOffset;
        o = readLenEncString(cp, o).nextOffset;
        const nameRes = readLenEncString(cp, o);
        o = nameRes.nextOffset;
        o = readLenEncString(cp, o).nextOffset;
        const colType = cp[o + 7];
        columns.push({
          name: nameRes.value ?? `col_${i}`,
          isNumeric: NUMERIC_COL_TYPES.has(colType)
        });
      }
      const rows = [];
      while (true) {
        const rowPkt = await readPacket();
        const rp = rowPkt.payload;
        if (rp[0] === 254 && rp.length < 16777215) {
          break;
        }
        if (rp[0] === 255) {
          const errMsg = new TextDecoder().decode(rp.slice(9));
          throw new Error("Error leyendo fila MySQL: " + errMsg);
        }
        let o = 0;
        const rowObj = {};
        for (let i = 0; i < count; i++) {
          const valRes = readLenEncString(rp, o);
          o = valRes.nextOffset;
          const col = columns[i];
          if (valRes.value === null) {
            rowObj[col.name] = null;
          } else if (col.isNumeric) {
            const num = Number(valRes.value);
            rowObj[col.name] = Number.isNaN(num) ? valRes.value : num;
          } else {
            rowObj[col.name] = valRes.value;
          }
        }
        rows.push(rowObj);
      }
      return { rows, affectedRows: 0, insertId: 0 };
    };
    return await fn(query);
  } finally {
    try {
      await writePacket(0, new Uint8Array([1]));
    } catch {
    }
    try {
      writer.releaseLock();
    } catch {
    }
    try {
      reader.releaseLock();
    } catch {
    }
    try {
      sock.close();
    } catch {
    }
  }
}
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Proxy-Headers, X-Proxy-Cookies"
};
function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}
async function parseRequestBody(request) {
  try {
    const raw = (await request.text()).trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
    }
    const params = new URLSearchParams(raw);
    const out = {};
    for (const [k, v] of params.entries()) {
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
function generateStreamKey(length = 12) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}
async function handleLoginDooplex(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
  }
  const input = await parseRequestBody(request);
  const email = input.email ? String(input.email).trim() : "";
  const password = input.password ? String(input.password) : "";
  if (!email || !password) {
    return jsonResponse(400, { success: false, error: "Faltan par\xE1metros (email, password)" });
  }
  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      const { rows } = await query("SELECT * FROM `users` WHERE `email` = ? LIMIT 1", [email]);
      const user = rows[0];
      if (!user) {
        return jsonResponse(401, { success: false, error: "Credenciales inv\xE1lidas" });
      }
      const storedPassword = String(user.password ?? "");
      if (!verifyPassword(password, storedPassword)) {
        return jsonResponse(401, { success: false, error: "Credenciales inv\xE1lidas" });
      }
      const role = user.role ?? (user.premuim !== void 0 ? user.premuim ? "premium" : "user" : "admin");
      const username = user.name ?? user.username ?? email;
      return jsonResponse(200, {
        success: true,
        message: "Login correcto",
        data: {
          username,
          role
        }
      });
    });
  } catch (err) {
    return jsonResponse(500, {
      success: false,
      error: "Error al procesar el login: " + (err?.message || String(err))
    });
  }
}
async function handleDashboard(request) {
  if (request.method !== "GET") {
    return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
  }
  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      const moviesRes = await query("SELECT COUNT(*) AS total FROM movies");
      const seriesRes = await query("SELECT COUNT(*) AS total FROM series");
      const animesRes = await query("SELECT COUNT(*) AS total FROM animes");
      return jsonResponse(200, {
        success: true,
        data: {
          dooplex: {
            movies: Number(moviesRes.rows[0]?.total ?? 0),
            series: Number(seriesRes.rows[0]?.total ?? 0),
            animes: Number(animesRes.rows[0]?.total ?? 0)
          }
        }
      });
    });
  } catch (err) {
    return jsonResponse(500, {
      success: false,
      error: "Error al obtener conteos del dashboard: " + (err?.message || String(err))
    });
  }
}
async function handleMovieDooplex(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbId = searchParams.get("tmdb_id");
        const movieId = searchParams.get("movie_id");
        if (tmdbId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, title, poster_path, backdrop_path FROM movies WHERE tmdb_id = ?",
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (movieId) {
          const { rows } = await query(
            "SELECT id, movie_id, server, link, lang, hd, status FROM movie_videos WHERE movie_id = ?",
            [movieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: "Par\xE1metro requerido: tmdb_id o movie_id" });
      }
      const updateMovieVideo = async (input) => {
        if (input.id === void 0) {
          return jsonResponse(400, { success: false, error: "Se requiere el par\xE1metro id para actualizar" });
        }
        const fields = [];
        const values = [];
        for (const k of ["server", "link", "lang", "hd", "status"]) {
          if (input[k] !== void 0) {
            fields.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (fields.length === 0) {
          return jsonResponse(400, {
            success: false,
            error: "No se proporcionaron campos para actualizar (server, link, lang, hd, status)"
          });
        }
        fields.push("updated_at = NOW()");
        values.push(input.id);
        await query(`UPDATE movie_videos SET ${fields.join(", ")} WHERE id = ?`, values);
        return jsonResponse(200, { success: true, message: "Video actualizado correctamente en Dooplex" });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.id !== void 0) {
          return await updateMovieVideo(input);
        }
        if (input.movie_id === void 0 || input.server === void 0 || input.link === void 0 || input.lang === void 0) {
          return jsonResponse(400, {
            success: false,
            error: "Faltan par\xE1metros requeridos (movie_id, server, link, lang)"
          });
        }
        const hd = input.hd !== void 0 ? input.hd : 1;
        const status = input.status !== void 0 ? input.status : 1;
        const res = await query(
          "INSERT INTO movie_videos (movie_id, server, link, lang, hd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
          [input.movie_id, input.server, input.link, input.lang, hd, status]
        );
        return jsonResponse(200, {
          success: true,
          message: "Video de pel\xEDcula insertado correctamente en Dooplex",
          id: String(res.insertId)
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateMovieVideo(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== void 0) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: "Se requiere el par\xE1metro id para eliminar" });
        }
        const res = await query("DELETE FROM movie_videos WHERE id = ?", [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: "Video eliminado correctamente de Dooplex" });
        }
        return jsonResponse(404, { success: false, error: "No se encontr\xF3 el video con el id proporcionado" });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en movie_dooplex: " + (err?.message || String(err)) });
  }
}
async function handleSeriesDooplex(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbId = searchParams.get("tmdb_id");
        const serieId = searchParams.get("serie_id");
        const seasonId = searchParams.get("season_id");
        const episodeId = searchParams.get("episode_id");
        if (tmdbId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM series WHERE tmdb_id = ?",
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (serieId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, serie_id, name, season_number FROM seasons WHERE serie_id = ? ORDER BY season_number ASC",
            [serieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, season_id, name, episode_number, still_path FROM episodes WHERE season_id = ? ORDER BY episode_number ASC",
            [seasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (episodeId) {
          const { rows } = await query(
            "SELECT id, episode_id, server, link, lang, hd FROM serie_videos WHERE episode_id = ?",
            [episodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, {
          success: false,
          error: "Par\xE1metro requerido: tmdb_id, serie_id, season_id o episode_id"
        });
      }
      const updateRecord = async (input) => {
        if (input.episodes_id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of ["name", "overview", "still_path"]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: "No se proporcionaron campos para actualizar en episodes (name, overview, still_path)"
            });
          }
          fields.push("updated_at = NOW()");
          values.push(input.episodes_id);
          await query(`UPDATE episodes SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Episodio actualizado correctamente en Dooplex" });
        }
        if (input.id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of ["server", "link", "lang", "hd"]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: "No se proporcionaron campos para actualizar en serie_videos (server, link, lang, hd)"
            });
          }
          fields.push("updated_at = NOW()");
          values.push(input.id);
          await query(`UPDATE serie_videos SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Video actualizado correctamente en Dooplex" });
        }
        return jsonResponse(400, {
          success: false,
          error: "Se requiere episodes_id o id para actualizar"
        });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== void 0 || input.id !== void 0) {
          return await updateRecord(input);
        }
        if (input.episode_id === void 0 || input.server === void 0 || input.link === void 0 || input.lang === void 0 || input.hd === void 0) {
          return jsonResponse(400, {
            success: false,
            error: "Faltan par\xE1metros requeridos (episode_id, server, link, lang, hd)"
          });
        }
        const res = await query(
          "INSERT INTO serie_videos (episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
          [input.episode_id, input.server, input.link, input.lang, input.hd]
        );
        return jsonResponse(200, {
          success: true,
          message: "Video insertado correctamente en Dooplex",
          id: String(res.insertId)
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== void 0) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: "Se requiere el par\xE1metro id para eliminar" });
        }
        const res = await query("DELETE FROM serie_videos WHERE id = ?", [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: "Video eliminado correctamente de Dooplex" });
        }
        return jsonResponse(404, { success: false, error: "No se encontr\xF3 el video con el id proporcionado" });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en series_dooplex: " + (err?.message || String(err)) });
  }
}
async function handleAnimeDooplex(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbId = searchParams.get("tmdb_id");
        const animeId = searchParams.get("anime_id");
        const animeSeasonId = searchParams.get("anime_season_id");
        const animeEpisodeId = searchParams.get("anime_episode_id");
        if (tmdbId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM animes WHERE tmdb_id = ?",
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, anime_id, name, season_number FROM anime_seasons WHERE anime_id = ? ORDER BY season_number ASC",
            [animeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeSeasonId) {
          const { rows } = await query(
            "SELECT id, tmdb_id, anime_season_id, name, episode_number, still_path FROM anime_episodes WHERE anime_season_id = ? ORDER BY episode_number ASC",
            [animeSeasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeEpisodeId) {
          const { rows } = await query(
            "SELECT id, anime_episode_id, server, link, lang, hd FROM anime_videos WHERE anime_episode_id = ?",
            [animeEpisodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, {
          success: false,
          error: "Par\xE1metro requerido: tmdb_id, anime_id, anime_season_id o anime_episode_id"
        });
      }
      const updateRecord = async (input) => {
        if (input.anime_episodes_id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of ["name", "overview", "still_path"]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: "No se proporcionaron campos para actualizar en anime_episodes (name, overview, still_path)"
            });
          }
          fields.push("updated_at = NOW()");
          values.push(input.anime_episodes_id);
          await query(`UPDATE anime_episodes SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, {
            success: true,
            message: "Episodio de anime actualizado correctamente en Dooplex"
          });
        }
        if (input.id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of ["server", "link", "lang", "hd"]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: "No se proporcionaron campos para actualizar en anime_videos (server, link, lang, hd)"
            });
          }
          fields.push("updated_at = NOW()");
          values.push(input.id);
          await query(`UPDATE anime_videos SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Video de anime actualizado correctamente en Dooplex" });
        }
        return jsonResponse(400, {
          success: false,
          error: "Se requiere anime_episodes_id o id para actualizar"
        });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.anime_episodes_id !== void 0 || input.id !== void 0) {
          return await updateRecord(input);
        }
        if (input.anime_episode_id === void 0 || input.server === void 0 || input.link === void 0 || input.lang === void 0 || input.hd === void 0) {
          return jsonResponse(400, {
            success: false,
            error: "Faltan par\xE1metros requeridos (anime_episode_id, server, link, lang, hd)"
          });
        }
        const res = await query(
          "INSERT INTO anime_videos (anime_episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
          [input.anime_episode_id, input.server, input.link, input.lang, input.hd]
        );
        return jsonResponse(200, {
          success: true,
          message: "Video insertado correctamente en Anime Dooplex",
          id: String(res.insertId)
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== void 0) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: "Se requiere el par\xE1metro id para eliminar" });
        }
        const res = await query("DELETE FROM anime_videos WHERE id = ?", [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: "Video eliminado correctamente de Anime Dooplex" });
        }
        return jsonResponse(404, { success: false, error: "No se encontr\xF3 el video con el id proporcionado" });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en anime_dooplex: " + (err?.message || String(err)) });
  }
}
async function handleMovieDocines(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(DOCINES_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbid = searchParams.get("tmdbid");
        const movieId = searchParams.get("movie_id");
        if (tmdbid) {
          const { rows } = await query(
            "SELECT id, TMDB_ID, name, description, genres, release_date, runtime, poster, banner, youtube_trailer, downloadable, type, status, content_type FROM movies WHERE TMDB_ID = ?",
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (movieId) {
          const { rows } = await query(
            "SELECT id, name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM movie_play_links WHERE movie_id = ? ORDER BY link_order ASC",
            [movieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: "Par\xE1metro requerido: tmdbid o movie_id" });
      }
      const updateRecord = async (input) => {
        if (input.movies_id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of [
            "name",
            "description",
            "genres",
            "release_date",
            "runtime",
            "poster",
            "banner",
            "youtube_trailer",
            "downloadable",
            "type",
            "status",
            "content_type"
          ]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, { success: false, error: "No se proporcionaron campos para actualizar" });
          }
          values.push(input.movies_id);
          await query(`UPDATE movies SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Pel\xEDcula actualizada correctamente en Docines" });
        }
        if (input.id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of [
            "name",
            "size",
            "quality",
            "link_order",
            "url",
            "type",
            "status",
            "skip_available",
            "link_type"
          ]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, { success: false, error: "No se proporcionaron campos para actualizar" });
          }
          values.push(input.id);
          await query(`UPDATE movie_play_links SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Enlace actualizado correctamente en Docines" });
        }
        return jsonResponse(400, { success: false, error: "Se requiere movies_id o id para actualizar" });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.id !== void 0 || input.movies_id !== void 0) {
          return await updateRecord(input);
        }
        const maxRes = await query(
          "SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM movie_play_links WHERE movie_id = ?",
          [input.movie_id]
        );
        const linkOrder = Number(maxRes.rows[0]?.next_order ?? 1);
        const res = await query(
          "INSERT INTO movie_play_links (name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            input.name,
            input.size ?? "1080P",
            input.quality,
            linkOrder,
            input.movie_id,
            input.url,
            input.type,
            input.status ?? 1,
            input.skip_available ?? 0,
            input.intro_start ?? "0",
            input.intro_end ?? "0",
            input.end_credits_marker ?? "0",
            input.link_type ?? 0,
            input.drm_uuid ?? "",
            input.drm_license_uri ?? ""
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: "Enlace insertado correctamente en Docines",
          id: String(res.insertId),
          link_order: linkOrder
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== void 0) id = String(input.id);
        }
        if (!id) return jsonResponse(400, { success: false, error: "Se requiere id" });
        const res = await query("DELETE FROM movie_play_links WHERE id = ?", [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? "Eliminado" : "No encontrado"
        });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en movie_docines: " + (err?.message || String(err)) });
  }
}
async function handleSeriesDocines(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(DOCINES_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbid = searchParams.get("tmdbid");
        const webSeriesId = searchParams.get("web_series_id");
        const seasonId = searchParams.get("season_id");
        const episodeId = searchParams.get("episode_id");
        if (tmdbid) {
          const { rows } = await query("SELECT id, TMDB_ID, name, poster, banner FROM web_series WHERE TMDB_ID = ?", [
            tmdbid
          ]);
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (webSeriesId) {
          const { rows } = await query(
            "SELECT id, Session_Name, session_order, web_series_id FROM web_series_seasons WHERE web_series_id = ? ORDER BY session_order ASC",
            [webSeriesId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonId) {
          const { rows } = await query(
            "SELECT id, Episoade_Name, episoade_image, episoade_description, episoade_order, season_id, downloadable, type, status, source, url, skip_available, intro_start, intro_end, end_credits_marker, drm_uuid, drm_license_uri FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC",
            [seasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (episodeId) {
          const { rows } = await query(
            "SELECT id, name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM episode_play_links WHERE episode_id = ? ORDER BY link_order ASC",
            [episodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: "Par\xE1metro requerido" });
      }
      const updateRecord = async (input) => {
        if (input.episodes_id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of [
            "Episoade_Name",
            "episoade_image",
            "episoade_description",
            "episoade_order",
            "downloadable",
            "type",
            "status",
            "source",
            "url"
          ]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.episodes_id);
          await query(`UPDATE web_series_episoade SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Episodio actualizado en Docines" });
        }
        if (input.id !== void 0) {
          const fields = [];
          const values = [];
          for (const k of [
            "name",
            "size",
            "quality",
            "link_order",
            "url",
            "type",
            "status",
            "skip_available",
            "link_type"
          ]) {
            if (input[k] !== void 0) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.id);
          await query(`UPDATE episode_play_links SET ${fields.join(", ")} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: "Enlace actualizado en Docines" });
        }
        return jsonResponse(400, { success: false, error: "Se requiere episodes_id o id" });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== void 0 || input.id !== void 0) {
          return await updateRecord(input);
        }
        const maxRes = await query(
          "SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM episode_play_links WHERE episode_id = ?",
          [input.episode_id]
        );
        const linkOrder = Number(maxRes.rows[0]?.next_order ?? 1);
        const res = await query(
          "INSERT INTO episode_play_links (name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            input.name,
            input.size ?? "1080P",
            input.quality,
            linkOrder,
            input.episode_id,
            input.url,
            input.type,
            input.status ?? "1",
            input.skip_available ?? 0,
            input.intro_start ?? "",
            input.intro_end ?? "",
            input.end_credits_marker ?? "0",
            input.link_type ?? 0,
            input.drm_uuid ?? "",
            input.drm_license_uri ?? ""
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: "Enlace insertado en Docines",
          id: String(res.insertId),
          link_order: linkOrder
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== void 0) id = String(input.id);
        }
        if (!id) return jsonResponse(400, { success: false, error: "Se requiere id" });
        const res = await query("DELETE FROM episode_play_links WHERE id = ?", [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? "Eliminado" : "No encontrado"
        });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en series_docines: " + (err?.message || String(err)) });
  }
}
async function handleMoviePlusmovie(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbid = searchParams.get("tmdbid");
        const videosId = searchParams.get("videos_id");
        if (tmdbid) {
          const { rows } = await query(
            "SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE tmdbid = ? AND is_tvseries = 0",
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosId) {
          const { rows } = await query(
            "SELECT video_file_id, stream_key, videos_id, file_source, source_type, file_url, label, `order` FROM video_file WHERE videos_id = ? ORDER BY `order` ASC",
            [videosId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: "Par\xE1metro requerido" });
      }
      const updateRecord = async (input) => {
        const fields = [];
        const values = [];
        for (const k of ["file_source", "source_type", "file_url", "label", "order"]) {
          if (input[k] !== void 0) {
            fields.push(`\`${k}\` = ?`);
            values.push(input[k]);
          }
        }
        values.push(input.video_file_id);
        await query(`UPDATE video_file SET ${fields.join(", ")} WHERE video_file_id = ?`, values);
        return jsonResponse(200, { success: true, message: "Actualizado en PlusMovie" });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.video_file_id !== void 0) {
          return await updateRecord(input);
        }
        const streamKey = generateStreamKey(12);
        const res = await query(
          "INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            streamKey,
            input.videos_id,
            input.file_source,
            input.source_type,
            input.file_url,
            input.label,
            input.order ?? 0
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: "Insertado en PlusMovie",
          id: String(res.insertId),
          stream_key: streamKey
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("video_file_id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.video_file_id !== void 0) id = String(input.video_file_id);
        }
        const res = await query("DELETE FROM video_file WHERE video_file_id = ?", [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? "Eliminado" : "No encontrado"
        });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en movie_plusmovie: " + (err?.message || String(err)) });
  }
}
async function handleSeriesPlusmovie(request, searchParams) {
  const method = request.method;
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      if (method === "GET") {
        const tmdbid = searchParams.get("tmdbid");
        const title = searchParams.get("title");
        const videosInfoId = searchParams.get("videos_info_id");
        const videosId = searchParams.get("videos_id");
        const seasonsId = searchParams.get("seasons_id");
        if (tmdbid) {
          const { rows } = await query(
            "SELECT videos_id, tmdbid, title, thumbnail_url, poster_url FROM videos WHERE tmdbid = ?",
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (title) {
          const { rows } = await query(
            "SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE title LIKE ? LIMIT 50",
            [`%${title}%`]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosInfoId) {
          const { rows } = await query(
            "SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE videos_id = ?",
            [videosInfoId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosId) {
          const { rows } = await query(
            "SELECT seasons_id, videos_id, seasons_name, `order` FROM seasons WHERE videos_id = ? ORDER BY `order` ASC",
            [videosId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonsId) {
          const { rows } = await query(
            "SELECT episodes_id, stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added, image_url FROM episodes WHERE seasons_id = ? ORDER BY `order` ASC",
            [seasonsId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: "Par\xE1metro requerido" });
      }
      const updateRecord = async (input) => {
        if (input.videos_id_update !== void 0) {
          const fields = [];
          const values = [];
          for (const k of [
            "tmdbid",
            "title",
            "description",
            "slug",
            "release",
            "runtime",
            "video_quality",
            "thumbnail_url",
            "poster_url"
          ]) {
            if (input[k] !== void 0) {
              fields.push(`\`${k}\` = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.videos_id_update);
          await query(`UPDATE videos SET ${fields.join(", ")} WHERE videos_id = ?`, values);
          return jsonResponse(200, { success: true, message: "Actualizado en PlusMovie" });
        }
        if (input.episodes_id !== void 0) {
          const fields = [];
          const values = [];
          const nowStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
          for (const k of ["episodes_name", "file_source", "source_type", "file_url", "order", "image_url"]) {
            if (input[k] !== void 0) {
              fields.push(`\`${k}\` = ?`);
              values.push(input[k]);
            }
          }
          fields.push("last_ep_added = ?");
          values.push(nowStr);
          values.push(input.episodes_id);
          await query(`UPDATE episodes SET ${fields.join(", ")} WHERE episodes_id = ?`, values);
          return jsonResponse(200, {
            success: true,
            message: "Episodio actualizado en PlusMovie",
            data: { last_ep_added: nowStr }
          });
        }
        return jsonResponse(400, { success: false, error: "Se requiere episodes_id o videos_id_update" });
      };
      if (method === "POST") {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== void 0 || input.videos_id_update !== void 0) {
          return await updateRecord(input);
        }
        const streamKey = generateStreamKey(12);
        const nowStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
        const res = await query(
          "INSERT INTO episodes (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            streamKey,
            input.videos_id,
            input.seasons_id,
            input.episodes_name,
            input.file_source,
            input.source_type,
            input.file_url,
            input.order,
            nowStr,
            nowStr,
            input.image_url
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: "Episodio insertado en PlusMovie",
          id: String(res.insertId),
          stream_key: streamKey
        });
      }
      if (method === "PUT") {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }
      if (method === "DELETE") {
        let id = searchParams.get("episodes_id");
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.episodes_id !== void 0) id = String(input.episodes_id);
        }
        const res = await query("DELETE FROM episodes WHERE episodes_id = ?", [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? "Eliminado" : "No encontrado"
        });
      }
      return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error en series_plusmovie: " + (err?.message || String(err)) });
  }
}
async function handleLoginPlusmovie(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { success: false, error: "M\xE9todo no permitido" });
  }
  const input = await parseRequestBody(request);
  const email = input.email ? String(input.email).trim() : "";
  const password = input.password ? String(input.password) : "";
  if (!email || !password) {
    return jsonResponse(400, { success: false, error: "Faltan par\xE1metros (email, password)" });
  }
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      const { rows } = await query(
        "SELECT username, role FROM `user` WHERE email = ? AND password = ? AND role = ? LIMIT 1",
        [email, md5(password), "admin"]
      );
      const user = rows[0];
      if (!user) {
        return jsonResponse(401, { success: false, error: "Credenciales inv\xE1lidas o sin permisos" });
      }
      return jsonResponse(200, {
        success: true,
        message: "Login correcto",
        data: { username: user.username, role: user.role }
      });
    });
  } catch (err) {
    return jsonResponse(500, { success: false, error: "Error al procesar login: " + (err?.message || String(err)) });
  }
}
async function handleProxy(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get("url");
  const referer = reqUrl.searchParams.get("referer");
  const resolveRedirect = reqUrl.searchParams.get("resolve_redirect") === "true";
  if (!targetUrl) {
    return jsonResponse(400, { error: "No URL provided" });
  }
  if (resolveRedirect) {
    try {
      const redirectHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*"
      };
      if (referer) {
        redirectHeaders["Referer"] = referer;
      } else if (targetUrl.includes("embed69.org")) {
        redirectHeaders["Referer"] = "https://pelisplushd.bz/";
      }
      const res = await fetch(targetUrl, {
        method: "GET",
        headers: redirectHeaders,
        redirect: "follow"
      });
      return jsonResponse(200, { finalUrl: res.url || targetUrl });
    } catch (err) {
      return jsonResponse(200, { finalUrl: targetUrl, error: err?.message || "Redirect resolution failed" });
    }
  }
  const outgoingHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  };
  if (request.method === "POST") {
    outgoingHeaders["Accept"] = "*/*";
    outgoingHeaders["X-Requested-With"] = "XMLHttpRequest";
    const ct = request.headers.get("content-type");
    if (ct) outgoingHeaders["Content-Type"] = ct;
  } else {
    outgoingHeaders["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  }
  if (referer) {
    outgoingHeaders["Referer"] = referer;
  } else if (targetUrl.includes("embed69.org")) {
    outgoingHeaders["Referer"] = "https://pelisplushd.bz/";
  }
  const customHeadersRaw = request.headers.get("x-proxy-headers");
  if (customHeadersRaw) {
    try {
      const parsed = JSON.parse(customHeadersRaw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          outgoingHeaders[k] = String(v);
        }
      }
    } catch {
    }
  }
  const customCookies = request.headers.get("x-proxy-cookies");
  if (customCookies) {
    outgoingHeaders["Cookie"] = customCookies;
  }
  let body = void 0;
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    try {
      const buf = await request.arrayBuffer();
      if (buf && buf.byteLength > 0) body = buf;
    } catch {
      body = void 0;
    }
  }
  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body,
      redirect: "follow"
    });
    const responseBody = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "text/plain";
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType
      }
    });
  } catch (err) {
    return jsonResponse(500, { error: err?.message || "Error fetching URL" });
  }
}
var cloudflareWorker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    switch (pathname) {
      case "/login_dooplex.php":
        return await handleLoginDooplex(request);
      case "/dashboard.php":
        return await handleDashboard(request);
      case "/movie_dooplex.php":
        return await handleMovieDooplex(request, url.searchParams);
      case "/series_dooplex.php":
        return await handleSeriesDooplex(request, url.searchParams);
      case "/anime_dooplex.php":
        return await handleAnimeDooplex(request, url.searchParams);
      case "/movie_docines.php":
        return await handleMovieDocines(request, url.searchParams);
      case "/series_docines.php":
        return await handleSeriesDocines(request, url.searchParams);
      case "/movie_plusmovie.php":
        return await handleMoviePlusmovie(request, url.searchParams);
      case "/series_plusmovie.php":
        return await handleSeriesPlusmovie(request, url.searchParams);
      case "/login_plusmovie.php":
        return await handleLoginPlusmovie(request);
      case "/proxy.php":
      case "/proxy":
      case "/api/proxy":
        return await handleProxy(request);
    }
    if (env && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404 && request.method === "GET" && !pathname.includes(".")) {
        const indexUrl = new URL("/index.html", request.url);
        return await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }
      return assetRes;
    }
    return new Response("Not found", { status: 404 });
  }
};
export {
  cloudflareWorker_default as default
};
