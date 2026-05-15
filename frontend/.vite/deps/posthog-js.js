//#region node_modules/posthog-js/dist/module.js
var t = "undefined" != typeof window ? window : void 0, e = "undefined" != typeof globalThis ? globalThis : t;
"undefined" == typeof self && (e.self = e), "undefined" == typeof File && (e.File = function() {});
var i = null == e ? void 0 : e.navigator, r = null == e ? void 0 : e.document, s = null == e ? void 0 : e.location, n = null == e ? void 0 : e.fetch, o = null != e && e.XMLHttpRequest && "withCredentials" in new e.XMLHttpRequest() ? e.XMLHttpRequest : void 0, a = null == e ? void 0 : e.AbortController, l = null == e ? void 0 : e.CompressionStream, u = null == i ? void 0 : i.userAgent, h = null != t ? t : {}, d = "1.373.4", v = {
	DEBUG: !1,
	LIB_VERSION: d,
	LIB_NAME: "web",
	JS_SDK_VERSION: d
};
function c(t, e, i, r, s, n, o) {
	try {
		var a = t[n](o), l = a.value;
	} catch (t) {
		i(t);
		return;
	}
	a.done ? e(l) : Promise.resolve(l).then(r, s);
}
function p(t) {
	return function() {
		var e = this, i = arguments;
		return new Promise((function(r, s) {
			var n = t.apply(e, i);
			function o(t) {
				c(n, r, s, o, a, "next", t);
			}
			function a(t) {
				c(n, r, s, o, a, "throw", t);
			}
			o(void 0);
		}));
	};
}
function f() {
	return f = Object.assign ? Object.assign.bind() : function(t) {
		for (var e = 1; arguments.length > e; e++) {
			var i = arguments[e];
			for (var r in i) ({}).hasOwnProperty.call(i, r) && (t[r] = i[r]);
		}
		return t;
	}, f.apply(null, arguments);
}
function _(t, e) {
	if (null == t) return {};
	var i = {};
	for (var r in t) if ({}.hasOwnProperty.call(t, r)) {
		if (-1 !== e.indexOf(r)) continue;
		i[r] = t[r];
	}
	return i;
}
var g, m = function(t) {
	return t.GZipJS = "gzip-js", t.Base64 = "base64", t;
}({}), b = [
	"$snapshot",
	"$pageview",
	"$pageleave",
	"$set",
	"survey dismissed",
	"survey sent",
	"survey shown",
	"$identify",
	"$groupidentify",
	"$create_alias",
	"$$client_ingestion_warning",
	"$web_experiment_applied",
	"$feature_enrollment_update",
	"$feature_flag_called"
], y = "NativeGzipValidationError", w = (t) => t.length >= 2 && 31 === t[0] && 139 === t[1], x = (t) => !(!t || "object" != typeof t) && "NotReadableError" === ("name" in t ? String(t.name) : ""), E = (t) => {
	var e = /* @__PURE__ */ new Error("Native gzip produced invalid output: " + t);
	throw e.name = y, e;
}, S = function() {
	var t = p((function* (t, e) {
		18 > t.size && E("too-short");
		var i = new Uint8Array(yield t.slice(0, 10).arrayBuffer());
		w(i) && 8 === i[2] || E("invalid-header");
		var r = new DataView(yield t.slice(t.size - 8).arrayBuffer());
		r.getUint32(0, !0) !== ((t) => {
			for (var e = (() => {
				if (g) return g;
				g = [];
				for (var t = 0; 256 > t; t++) {
					for (var e = t, i = 0; 8 > i; i++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
					g[t] = e >>> 0;
				}
				return g;
			})(), i = 4294967295, r = 0; t.length > r; r++) i = e[255 & (i ^ t[r])] ^ i >>> 8;
			return (4294967295 ^ i) >>> 0;
		})(e) && E("invalid-crc");
		var s = e.length >>> 0;
		r.getUint32(4, !0) !== s && E("invalid-size");
	}));
	return function(e, i) {
		return t.apply(this, arguments);
	};
}();
function T() {
	return T = p((function* (t, e, i) {
		void 0 === e && (e = !0);
		try {
			var r = new TextEncoder().encode(t), s = new CompressionStream("gzip"), n = s.writable.getWriter(), o = n.write(r).then((() => n.close())).catch(function() {
				var t = p((function* (t) {
					try {
						yield n.abort(t);
					} catch (t) {}
					throw t;
				}));
				return function(e) {
					return t.apply(this, arguments);
				};
			}()), a = new Response(s.readable).blob(), [l] = yield Promise.all([a, o]);
			return yield S(l, r), l;
		} catch (t) {
			if (null != i && i.rethrow) throw t;
			return e && console.error("Failed to gzip compress data", t), null;
		}
	})), T.apply(this, arguments);
}
var k = [
	"amazonbot",
	"amazonproductbot",
	"app.hypefactors.com",
	"applebot",
	"archive.org_bot",
	"awariobot",
	"backlinksextendedbot",
	"baiduspider",
	"bingbot",
	"bingpreview",
	"chrome-lighthouse",
	"dataforseobot",
	"deepscan",
	"duckduckbot",
	"facebookexternal",
	"facebookcatalog",
	"http://yandex.com/bots",
	"hubspot",
	"ia_archiver",
	"leikibot",
	"linkedinbot",
	"meta-externalagent",
	"mj12bot",
	"msnbot",
	"nessus",
	"petalbot",
	"pinterest",
	"prerender",
	"rogerbot",
	"screaming frog",
	"sebot-wa",
	"sitebulb",
	"slackbot",
	"slurp",
	"trendictionbot",
	"turnitin",
	"twitterbot",
	"vercel-screenshot",
	"vercelbot",
	"yahoo! slurp",
	"yandexbot",
	"zoombot",
	"bot.htm",
	"bot.php",
	"(bot;",
	"bot/",
	"crawler",
	"ahrefsbot",
	"ahrefssiteaudit",
	"semrushbot",
	"siteauditbot",
	"splitsignalbot",
	"gptbot",
	"oai-searchbot",
	"chatgpt-user",
	"perplexitybot",
	"better uptime bot",
	"sentryuptimebot",
	"uptimerobot",
	"headlesschrome",
	"cypress",
	"google-hoteladsverifier",
	"adsbot-google",
	"apis-google",
	"duplexweb-google",
	"feedfetcher-google",
	"google favicon",
	"google web preview",
	"google-read-aloud",
	"googlebot",
	"googleother",
	"google-cloudvertexbot",
	"googleweblight",
	"mediapartners-google",
	"storebot-google",
	"google-inspectiontool",
	"bytespider"
], R = function(t, e) {
	if (void 0 === e && (e = []), !t) return !1;
	var i = t.toLowerCase();
	return k.concat(e).some(((t) => {
		var e = t.toLowerCase();
		return -1 !== i.indexOf(e);
	}));
};
function P(t, e) {
	return -1 !== t.indexOf(e);
}
var O = function(t) {
	return t.trim();
}, I = function(t) {
	return t.replace(/^\$/, "");
}, C = Object.prototype, A = C.hasOwnProperty, F = C.toString, M = Array.isArray || function(t) {
	return "[object Array]" === F.call(t);
}, D = (t) => "function" == typeof t, U = (t) => t === Object(t) && !M(t), L = (t) => {
	if (U(t)) {
		for (var e in t) if (A.call(t, e)) return !1;
		return !0;
	}
	return !1;
}, N = (t) => void 0 === t, j = (t) => "[object String]" == F.call(t), z = (t) => j(t) && 0 === t.trim().length, B = (t) => null === t, H = (t) => N(t) || B(t), q = (t) => "[object Number]" == F.call(t) && t == t, V = (t) => q(t) && t > 0, W = (t) => "[object Boolean]" === F.call(t), G = (t) => t instanceof FormData, Y = (t) => P(b, t);
function J(t) {
	return null === t || "object" != typeof t;
}
function K(t, e) {
	return {}.toString.call(t) === "[object " + e + "]";
}
function X(t) {
	return "undefined" != typeof Event && function(t, e) {
		try {
			return t instanceof e;
		} catch (t) {
			return !1;
		}
	}(t, Event);
}
var Q = [
	!0,
	"true",
	1,
	"1",
	"yes"
], Z = (t) => P(Q, t), tt = [
	!1,
	"false",
	0,
	"0",
	"no"
];
function et(t, e, i, r, s) {
	return e > i && (r.warn("min cannot be greater than max."), e = i), q(t) ? t > i ? (r.warn(" cannot be  greater than max: " + i + ". Using max value instead."), i) : e > t ? (r.warn(" cannot be less than min: " + e + ". Using min value instead."), e) : t : (r.warn(" must be a number. using max or fallback. max: " + i + ", fallback: " + s), et(s || i, e, i, r));
}
var it = class {
	constructor(t) {
		this.$t = {}, this.zt = t.zt, this.Zt = et(t.bucketSize, 0, 100, t.Gt), this.Qt = et(t.refillRate, 0, this.Zt, t.Gt), this.Jt = et(t.refillInterval, 0, 864e5, t.Gt);
	}
	Kt(t, e) {
		var i = Math.floor((e - t.lastAccess) / this.Jt);
		i > 0 && (t.tokens = Math.min(t.tokens + i * this.Qt, this.Zt), t.lastAccess = t.lastAccess + i * this.Jt);
	}
	consumeRateLimit(t) {
		var e, i = Date.now(), r = String(t), s = this.$t[r];
		return s ? this.Kt(s, i) : this.$t[r] = s = {
			tokens: this.Zt,
			lastAccess: i
		}, 0 === s.tokens || (s.tokens--, 0 === s.tokens && (null == (e = this.zt) || e.call(this, t)), 0 === s.tokens);
	}
	stop() {
		this.$t = {};
	}
};
var rt, st, nt, ot = "Mobile", at = "iOS", lt = "Android", ut = "Tablet", ht = lt + " " + ut, dt = "iPad", vt = "Apple", ct = vt + " Watch", pt = "Safari", ft = "BlackBerry", _t = "Samsung", gt = _t + "Browser", mt = _t + " Internet", bt = "Chrome", yt = bt + " OS", wt = bt + " " + at, xt = "Internet Explorer", Et = xt + " " + ot, St = "Opera", $t = St + " Mini", Tt = "Edge", kt = "Microsoft " + Tt, Rt = "Firefox", Pt = Rt + " " + at, Ot = "Nintendo", It = "PlayStation", Ct = "Xbox", At = lt + " " + ot, Ft = ot + " " + pt, Mt = "Windows", Dt = Mt + " Phone", Ut = "Nokia", Lt = "Ouya", Nt = "Generic", jt = Nt + " " + ot.toLowerCase(), zt = Nt + " " + ut.toLowerCase(), Bt = "Konqueror", Ht = "(\\d+(\\.\\d+)?)", qt = new RegExp("Version/" + Ht), Vt = new RegExp(Ct, "i"), Wt = new RegExp(It + " \\w+", "i"), Gt = new RegExp(Ot + " \\w+", "i"), Yt = new RegExp(ft + "|PlayBook|BB10", "i"), Jt = {
	"NT3.51": "NT 3.11",
	"NT4.0": "NT 4.0",
	"5.0": "2000",
	5.1: "XP",
	5.2: "XP",
	"6.0": "Vista",
	6.1: "7",
	6.2: "8",
	6.3: "8.1",
	6.4: "10",
	"10.0": "10"
}, Kt = function(t, e) {
	return e = e || "", P(t, " OPR/") && P(t, "Mini") ? $t : P(t, " OPR/") ? St : Yt.test(t) ? ft : P(t, "IE" + ot) || P(t, "WPDesktop") ? Et : P(t, gt) ? mt : P(t, Tt) || P(t, "Edg/") ? kt : P(t, "FBIOS") ? "Facebook " + ot : P(t, "UCWEB") || P(t, "UCBrowser") ? "UC Browser" : P(t, "CriOS") ? wt : P(t, "CrMo") || P(t, bt) ? bt : P(t, lt) && P(t, pt) ? At : P(t, "FxiOS") ? Pt : P(t.toLowerCase(), Bt.toLowerCase()) ? Bt : ((t, e) => e && P(e, vt) || function(t) {
		return P(t, pt) && !P(t, bt) && !P(t, lt);
	}(t))(t, e) ? P(t, ot) ? Ft : pt : P(t, Rt) ? Rt : P(t, "MSIE") || P(t, "Trident/") ? xt : P(t, "Gecko") ? Rt : "";
}, Xt = {
	[Et]: [new RegExp("rv:" + Ht)],
	[kt]: [new RegExp(Tt + "?\\/" + Ht)],
	[bt]: [new RegExp("(" + bt + "|CrMo)\\/" + Ht)],
	[wt]: [new RegExp("CriOS\\/" + Ht)],
	"UC Browser": [new RegExp("(UCBrowser|UCWEB)\\/" + Ht)],
	[pt]: [qt],
	[Ft]: [qt],
	[St]: [new RegExp("(Opera|OPR)\\/" + Ht)],
	[Rt]: [new RegExp(Rt + "\\/" + Ht)],
	[Pt]: [new RegExp("FxiOS\\/" + Ht)],
	[Bt]: [new RegExp("Konqueror[:/]?" + Ht, "i")],
	[ft]: [new RegExp(ft + " " + Ht), qt],
	[At]: [new RegExp("android\\s" + Ht, "i")],
	[mt]: [new RegExp(gt + "\\/" + Ht)],
	[xt]: [new RegExp("(rv:|MSIE )" + Ht)],
	Mozilla: [new RegExp("rv:" + Ht)]
}, Qt = function(t, e) {
	var r = Xt[Kt(t, e)];
	if (N(r)) return null;
	for (var s = 0; r.length > s; s++) {
		var n = t.match(r[s]);
		if (n) return parseFloat(n[n.length - 2]);
	}
	return null;
}, Zt = [
	[new RegExp(Ct + "; " + Ct + " (.*?)[);]", "i"), (t) => [Ct, t && t[1] || ""]],
	[new RegExp(Ot, "i"), [Ot, ""]],
	[new RegExp(It, "i"), [It, ""]],
	[Yt, [ft, ""]],
	[new RegExp(Mt, "i"), (t, e) => {
		if (/Phone/.test(e) || /WPDesktop/.test(e)) return [Dt, ""];
		if (new RegExp(ot).test(e) && !/IEMobile\b/.test(e)) return [Mt + " " + ot, ""];
		var i = /Windows NT ([0-9.]+)/i.exec(e);
		if (i && i[1]) {
			var r = Jt[i[1]] || "";
			return /arm/i.test(e) && (r = "RT"), [Mt, r];
		}
		return [Mt, ""];
	}],
	[/((iPhone|iPad|iPod).*?OS (\d+)_(\d+)_?(\d+)?|iPhone)/, (t) => t && t[3] ? [at, [
		t[3],
		t[4],
		t[5] || "0"
	].join(".")] : [at, ""]],
	[/(watch.*\/(\d+\.\d+\.\d+)|watch os,(\d+\.\d+),)/i, (t) => {
		var e = "";
		return t && t.length >= 3 && (e = N(t[2]) ? t[3] : t[2]), ["watchOS", e];
	}],
	[new RegExp("(" + lt + " (\\d+)\\.(\\d+)\\.?(\\d+)?|" + lt + ")", "i"), (t) => t && t[2] ? [lt, [
		t[2],
		t[3],
		t[4] || "0"
	].join(".")] : [lt, ""]],
	[/Mac OS X (\d+)[_.](\d+)[_.]?(\d+)?/i, (t) => {
		var e = ["Mac OS X", ""];
		return t && t[1] && (e[1] = [
			t[1],
			t[2],
			t[3] || "0"
		].join(".")), e;
	}],
	[/Mac/i, ["Mac OS X", ""]],
	[/CrOS/, [yt, ""]],
	[/Linux|debian/i, ["Linux", ""]]
], te = function(t) {
	return Gt.test(t) ? Ot : Wt.test(t) ? It : Vt.test(t) ? Ct : new RegExp(Lt, "i").test(t) ? Lt : new RegExp("(" + Dt + "|WPDesktop)", "i").test(t) ? Dt : /iPad/.test(t) ? dt : /iPod/.test(t) ? "iPod Touch" : /iPhone/.test(t) ? "iPhone" : /(watch)(?: ?os[,/]|\d,\d\/)[\d.]+/i.test(t) ? ct : Yt.test(t) ? ft : /(kobo)\s(ereader|touch)/i.test(t) ? "Kobo" : new RegExp(Ut, "i").test(t) ? Ut : /(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i.test(t) || /(kf[a-z]+)( bui|\)).+silk\//i.test(t) ? "Kindle Fire" : /(Android|ZTE)/i.test(t) ? new RegExp(ot).test(t) && !/(9138B|TB782B|Nexus [97]|pixel c|HUAWEISHT|BTV|noble nook|smart ultra 6)/i.test(t) || /pixel[\daxl ]{1,6}/i.test(t) && !/pixel c/i.test(t) || /(huaweimed-al00|tah-|APA|SM-G92|i980|zte|U304AA)/i.test(t) || /lmy47v/i.test(t) && !/QTAQZ3/i.test(t) ? lt : ht : new RegExp("(pda|" + ot + ")", "i").test(t) ? jt : new RegExp(ut, "i").test(t) && !new RegExp(ut + " pc", "i").test(t) ? zt : "";
}, ee = (t) => t instanceof Error, ie = {
	trace: {
		text: "TRACE",
		number: 1
	},
	debug: {
		text: "DEBUG",
		number: 5
	},
	info: {
		text: "INFO",
		number: 9
	},
	warn: {
		text: "WARN",
		number: 13
	},
	error: {
		text: "ERROR",
		number: 17
	},
	fatal: {
		text: "FATAL",
		number: 21
	}
}, re = ie.info;
function se(t) {
	if (W(t)) return { boolValue: t };
	if ("number" == typeof t) return Number.isFinite(t) ? Number.isInteger(t) ? { intValue: t } : { doubleValue: t } : { stringValue: String(t) };
	if ("string" == typeof t) return { stringValue: t };
	if (M(t)) return { arrayValue: { values: t.map(((t) => se(t))) } };
	try {
		return { stringValue: JSON.stringify(t) };
	} catch (e) {
		return { stringValue: String(t) };
	}
}
function ne(t) {
	var e = [];
	for (var i in t) {
		var r = t[i];
		B(r) || N(r) || e.push({
			key: i,
			value: se(r)
		});
	}
	return e;
}
function oe(t) {
	var e = globalThis._posthogChunkIds;
	if (e) {
		var i = Object.keys(e);
		return nt && i.length === st || (st = i.length, nt = i.reduce(((i, r) => {
			rt || (rt = {});
			var s = rt[r];
			if (s) i[s[0]] = s[1];
			else for (var n = t(r), o = n.length - 1; o >= 0; o--) {
				var a = n[o], l = null == a ? void 0 : a.filename, u = e[r];
				if (l && u) {
					i[l] = u, rt[r] = [l, u];
					break;
				}
			}
			return i;
		}), {})), nt;
	}
}
var ae = class {
	constructor(t, e, i) {
		void 0 === i && (i = []), this.coercers = t, this.stackParser = e, this.modifiers = i;
	}
	buildFromUnknown(t, e) {
		void 0 === e && (e = {});
		var i = e && e.mechanism || {
			handled: !0,
			type: "generic"
		}, r = this.buildCoercingContext(i, e, 0).apply(t), s = this.buildParsingContext(e), n = this.parseStacktrace(r, s);
		return {
			$exception_list: this.convertToExceptionList(n, i),
			$exception_level: "error"
		};
	}
	modifyFrames(t) {
		var e = this;
		return p((function* () {
			for (var i of t) i.stacktrace && i.stacktrace.frames && M(i.stacktrace.frames) && (i.stacktrace.frames = yield e.applyModifiers(i.stacktrace.frames));
			return t;
		}))();
	}
	coerceFallback(t) {
		var e;
		return {
			type: "Error",
			value: "Unknown error",
			stack: null == (e = t.syntheticException) ? void 0 : e.stack,
			synthetic: !0
		};
	}
	parseStacktrace(t, e) {
		var i, r;
		return null != t.cause && (i = this.parseStacktrace(t.cause, e)), "" != t.stack && null != t.stack && (r = this.applyChunkIds(this.stackParser(t.stack, t.synthetic ? e.skipFirstLines : 0), e.chunkIdMap)), f({}, t, {
			cause: i,
			stack: r
		});
	}
	applyChunkIds(t, e) {
		return t.map(((t) => (t.filename && e && (t.chunk_id = e[t.filename]), t)));
	}
	applyCoercers(t, e) {
		for (var i of this.coercers) if (i.match(t)) return i.coerce(t, e);
		return this.coerceFallback(e);
	}
	applyModifiers(t) {
		var e = this;
		return p((function* () {
			var i = t;
			for (var r of e.modifiers) i = yield r(i);
			return i;
		}))();
	}
	convertToExceptionList(t, e) {
		var i, r, s, n = {
			type: t.type,
			value: t.value,
			mechanism: {
				type: null !== (i = e.type) && void 0 !== i ? i : "generic",
				handled: null === (r = e.handled) || void 0 === r || r,
				synthetic: null !== (s = t.synthetic) && void 0 !== s && s
			}
		};
		t.stack && (n.stacktrace = {
			type: "raw",
			frames: t.stack
		});
		var o = [n];
		return null != t.cause && o.push(...this.convertToExceptionList(t.cause, f({}, e, { handled: !0 }))), o;
	}
	buildParsingContext(t) {
		var e;
		return {
			chunkIdMap: oe(this.stackParser),
			skipFirstLines: null !== (e = t.skipFirstLines) && void 0 !== e ? e : 1
		};
	}
	buildCoercingContext(t, e, i) {
		void 0 === i && (i = 0);
		var r = (i, r) => {
			if (4 >= r) {
				var s = this.buildCoercingContext(t, e, r);
				return this.applyCoercers(i, s);
			}
		};
		return f({}, e, {
			syntheticException: 0 == i ? e.syntheticException : void 0,
			mechanism: t,
			apply: (t) => r(t, i),
			next: (t) => r(t, i + 1)
		});
	}
};
var le = "?";
function ue(t, e, i, r, s) {
	var n = {
		platform: t,
		filename: e,
		function: "<anonymous>" === i ? le : i,
		in_app: !0
	};
	return N(r) || (n.lineno = r), N(s) || (n.colno = s), n;
}
var he = (t, e) => {
	var i = -1 !== t.indexOf("safari-extension"), r = -1 !== t.indexOf("safari-web-extension");
	return i || r ? [-1 !== t.indexOf("@") ? t.split("@")[0] : le, i ? "safari-extension:" + e : "safari-web-extension:" + e] : [t, e];
}, de = /^\s*at (\S+?)(?::(\d+))(?::(\d+))\s*$/i, ve = /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, ce = /\((\S*)(?::(\d+))(?::(\d+))\)/, pe = (t, e) => {
	var i = de.exec(t);
	if (i) {
		var [, r, s, n] = i;
		return ue(e, r, le, +s, +n);
	}
	var o = ve.exec(t);
	if (o) {
		if (o[2] && 0 === o[2].indexOf("eval")) {
			var a = ce.exec(o[2]);
			a && (o[2] = a[1], o[3] = a[2], o[4] = a[3]);
		}
		var [l, u] = he(o[1] || le, o[2]);
		return ue(e, u, l, o[3] ? +o[3] : void 0, o[4] ? +o[4] : void 0);
	}
}, fe = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i, _e = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, ge = (t, e) => {
	var i = fe.exec(t);
	if (i) {
		if (i[3] && i[3].indexOf(" > eval") > -1) {
			var r = _e.exec(i[3]);
			r && (i[1] = i[1] || "eval", i[3] = r[1], i[4] = r[2], i[5] = "");
		}
		var s = i[3], n = i[1] || le;
		return [n, s] = he(n, s), ue(e, s, n, i[4] ? +i[4] : void 0, i[5] ? +i[5] : void 0);
	}
}, me = /\(error: (.*)\)/;
var be = class {
	match(t) {
		return this.isDOMException(t) || this.isDOMError(t);
	}
	coerce(t, e) {
		var i = j(t.stack);
		return {
			type: this.getType(t),
			value: this.getValue(t),
			stack: i ? t.stack : void 0,
			cause: t.cause ? e.next(t.cause) : void 0,
			synthetic: !1
		};
	}
	getType(t) {
		return this.isDOMError(t) ? "DOMError" : "DOMException";
	}
	getValue(t) {
		var e = t.name || (this.isDOMError(t) ? "DOMError" : "DOMException");
		return t.message ? e + ": " + t.message : e;
	}
	isDOMException(t) {
		return K(t, "DOMException");
	}
	isDOMError(t) {
		return K(t, "DOMError");
	}
};
var ye = class {
	match(t) {
		return ((t) => t instanceof Error)(t);
	}
	coerce(t, e) {
		return {
			type: this.getType(t),
			value: this.getMessage(t, e),
			stack: this.getStack(t),
			cause: t.cause ? e.next(t.cause) : void 0,
			synthetic: !1
		};
	}
	getType(t) {
		return t.name || t.constructor.name;
	}
	getMessage(t, e) {
		var i = t.message;
		return String(i.error && "string" == typeof i.error.message ? i.error.message : i);
	}
	getStack(t) {
		return t.stacktrace || t.stack || void 0;
	}
};
var we = class {
	constructor() {}
	match(t) {
		return K(t, "ErrorEvent") && null != t.error;
	}
	coerce(t, e) {
		var i;
		return e.apply(t.error) || {
			type: "ErrorEvent",
			value: t.message,
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var xe = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;
var Ee = class {
	match(t) {
		return "string" == typeof t;
	}
	coerce(t, e) {
		var i, [r, s] = this.getInfos(t);
		return {
			type: null != r ? r : "Error",
			value: null != s ? s : t,
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
	getInfos(t) {
		var e = "Error", i = t, r = t.match(xe);
		return r && (e = r[1], i = r[2]), [e, i];
	}
};
var Se = [
	"fatal",
	"error",
	"warning",
	"log",
	"info",
	"debug"
];
function $e(t, e) {
	void 0 === e && (e = 40);
	var i = Object.keys(t);
	if (i.sort(), !i.length) return "[object has no keys]";
	for (var r = i.length; r > 0; r--) {
		var s = i.slice(0, r).join(", ");
		if (e >= s.length) return r === i.length ? s : s.length > e ? s.slice(0, e) + "..." : s;
	}
	return "";
}
var Te = class {
	match(t) {
		return "object" == typeof t && null !== t;
	}
	coerce(t, e) {
		var i, r = this.getErrorPropertyFromObject(t);
		return r ? e.apply(r) : {
			type: this.getType(t),
			value: this.getValue(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			level: this.isSeverityLevel(t.level) ? t.level : "error",
			synthetic: !0
		};
	}
	getType(t) {
		return X(t) ? t.constructor.name : "Error";
	}
	getValue(t) {
		if ("name" in t && "string" == typeof t.name) {
			var e = "'" + t.name + "' captured as exception";
			return "message" in t && "string" == typeof t.message && (e += " with message: '" + t.message + "'"), e;
		}
		if ("message" in t && "string" == typeof t.message) return t.message;
		var i = this.getObjectClassName(t);
		return (i && "Object" !== i ? "'" + i + "'" : "Object") + " captured as exception with keys: " + $e(t);
	}
	isSeverityLevel(t) {
		return j(t) && !z(t) && Se.indexOf(t) >= 0;
	}
	getErrorPropertyFromObject(t) {
		for (var e in t) if ({}.hasOwnProperty.call(t, e)) {
			var i = t[e];
			if (ee(i)) return i;
		}
	}
	getObjectClassName(t) {
		try {
			var e = Object.getPrototypeOf(t);
			return e ? e.constructor.name : void 0;
		} catch (t) {
			return;
		}
	}
};
var ke = class {
	match(t) {
		return X(t);
	}
	coerce(t, e) {
		var i, r = t.constructor.name;
		return {
			type: r,
			value: r + " captured as exception with keys: " + $e(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var Re = class {
	match(t) {
		return J(t);
	}
	coerce(t, e) {
		var i;
		return {
			type: "Error",
			value: "Primitive value captured as exception: " + String(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var Pe = class {
	match(t) {
		return K(t, "PromiseRejectionEvent") || this.isCustomEventWrappingRejection(t);
	}
	isCustomEventWrappingRejection(t) {
		if (!X(t)) return !1;
		try {
			var e = t.detail;
			return null != e && "object" == typeof e && "reason" in e;
		} catch (t) {
			return !1;
		}
	}
	coerce(t, e) {
		var i, r = this.getUnhandledRejectionReason(t);
		return J(r) ? {
			type: "UnhandledRejection",
			value: "Non-Error promise rejection captured with value: " + String(r),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		} : e.apply(r);
	}
	getUnhandledRejectionReason(t) {
		try {
			if ("reason" in t) return t.reason;
			if ("detail" in t && null != t.detail && "object" == typeof t.detail && "reason" in t.detail) return t.detail.reason;
		} catch (t) {}
		return t;
	}
};
var Oe = "$message", Ie = "$timestamp", Ce = new Set([Oe, Ie]), Ae = {
	enabled: !0,
	max_bytes: 32768
};
function Fe(t) {
	var e;
	return t ? {
		enabled: null !== (e = t.enabled) && void 0 !== e ? e : Ae.enabled,
		max_bytes: De(t.max_bytes, Ae.max_bytes)
	} : f({}, Ae);
}
var Me = class {
	constructor(t) {
		this.Yt = [], this.Xt = 0, this.qt = Fe(t);
	}
	setConfig(t) {
		this.qt = Fe(t), this.er();
	}
	add(t) {
		var e = function(t) {
			var e = function(t) {
				var e = /* @__PURE__ */ new WeakSet();
				try {
					return JSON.stringify(t, ((t, i) => {
						if ("bigint" == typeof i) return i.toString();
						if ("function" != typeof i && "symbol" != typeof i) {
							if (i instanceof Date) return i.toISOString();
							if (i instanceof Error) return {
								name: i.name,
								message: i.message,
								stack: i.stack
							};
							if (i && "object" == typeof i) {
								if (e.has(i)) return "[Circular]";
								e.add(i);
							}
							return i;
						}
					}));
				} catch (t) {
					return;
				}
			}(t);
			if (e) try {
				var i = JSON.parse(e);
				if (!U(i)) return;
				var r = i, s = r[Oe], n = r[Ie];
				if (!j(s) || 0 === s.trim().length) return;
				if (!j(n) && !q(n)) return;
				return {
					step: r,
					json: e
				};
			} catch (t) {
				return;
			}
		}(t);
		if (e) {
			var i = function(t) {
				if ("undefined" != typeof TextEncoder) return new TextEncoder().encode(t).length;
				for (var e = encodeURIComponent(t), i = 0, r = 0; e.length > r; r++) "%" === e[r] ? (i += 1, r += 2) : i += 1;
				return i;
			}(e.json);
			i > this.qt.max_bytes || (this.Yt.push({
				step: e.step,
				bytes: i
			}), this.Xt += i, this.er());
		}
	}
	getAttachable() {
		return this.Yt.map(((t) => t.step));
	}
	clear() {
		this.Yt = [], this.Xt = 0;
	}
	size() {
		return this.Yt.length;
	}
	er() {
		for (; this.Xt > this.qt.max_bytes && this.Yt.length > 0;) {
			var t = this.Yt.shift();
			t && (this.Xt -= t.bytes);
		}
	}
};
function De(t, e) {
	if (!q(t) || t === Infinity || t === -Infinity) return e;
	var i = Math.floor(t);
	return 0 > i ? e : i;
}
var Ue = function(e, i) {
	var { debugEnabled: r } = void 0 === i ? {} : i, s = {
		k(i) {
			if (t && (v.DEBUG || h.POSTHOG_DEBUG || r) && !N(t.console) && t.console) {
				for (var s = ("__rrweb_original__" in t.console[i]) ? t.console[i].__rrweb_original__ : t.console[i], n = arguments.length, o = new Array(n > 1 ? n - 1 : 0), a = 1; n > a; a++) o[a - 1] = arguments[a];
				s(e, ...o);
			}
		},
		debug() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.k("debug", ...e);
		},
		info() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.k("log", ...e);
		},
		warn() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.k("warn", ...e);
		},
		error() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.k("error", ...e);
		},
		critical() {
			for (var t = arguments.length, i = new Array(t), r = 0; t > r; r++) i[r] = arguments[r];
			console.error(e, ...i);
		},
		uninitializedWarning(t) {
			s.error("You must initialize PostHog before calling " + t);
		},
		createLogger: (t, i) => Ue(e + " " + t, i)
	};
	return s;
}, Le = Ue("[PostHog.js]"), Ne = Le.createLogger, je = Ne("[ExternalScriptsLoader]"), ze = (t, e, i) => {
	if (t.config.disable_external_dependency_loading) return je.warn(e + " was requested but loading of external scripts is disabled."), i("Loading of external scripts is disabled");
	var s = null == r ? void 0 : r.querySelectorAll("script");
	if (s) {
		for (var n, o = function() {
			if (s[a].src === e) {
				var t = s[a];
				return t.__posthog_loading_callback_fired ? { v: i() } : (t.addEventListener("load", ((e) => {
					t.__posthog_loading_callback_fired = !0, i(void 0, e);
				})), t.onerror = (t) => i(t), { v: void 0 });
			}
		}, a = 0; s.length > a; a++) if (n = o()) return n.v;
	}
	var l = () => {
		if (!r) return i("document not found");
		var s = r.createElement("script");
		if (s.type = "text/javascript", s.crossOrigin = "anonymous", s.src = e, s.onload = (t) => {
			s.__posthog_loading_callback_fired = !0, i(void 0, t);
		}, s.onerror = (t) => i(t), t.config.prepare_external_dependency_script && (s = t.config.prepare_external_dependency_script(s)), !s) return i("prepare_external_dependency_script returned null");
		if ("head" === t.config.external_scripts_inject_target) r.head.appendChild(s);
		else {
			var n, o = r.querySelectorAll("body > script");
			o.length > 0 ? null == (n = o[0].parentNode) || n.insertBefore(s, o[0]) : r.body.appendChild(s);
		}
	};
	null != r && r.body ? l() : r?.addEventListener("DOMContentLoaded", l);
};
h.__PosthogExtensions__ = h.__PosthogExtensions__ || {}, h.__PosthogExtensions__.loadExternalDependency = (t, e, i) => {
	if ("remote-config" !== e) {
		var r;
		if (t.config.__preview_external_dependency_versioned_paths) r = t.requestRouter.endpointFor("assets", "/static/" + t.version + "/" + e + ".js");
		else {
			var s = "/static/" + e + ".js?v=" + t.version;
			if ("toolbar" === e) {
				var n = 3e5;
				s = s + "&t=" + Math.floor(Date.now() / n) * n;
			}
			r = t.requestRouter.endpointFor("assets", s);
		}
		ze(t, r, i);
	} else ze(t, t.requestRouter.endpointFor("assets", "/array/" + t.config.token + "/config.js"), i);
}, h.__PosthogExtensions__.loadSiteApp = (t, e, i) => {
	ze(t, t.requestRouter.endpointFor("api", e), i);
};
var Be = "$people_distinct_id", He = "$device_id", qe = "__alias", Ve = "__timers", We = "$autocapture_disabled_server_side", Ge = "$heatmaps_enabled_server_side", Ye = "$exception_capture_enabled_server_side", Je = "$error_tracking_suppression_rules", Ke = "$error_tracking_capture_extension_exceptions", Xe = "$web_vitals_enabled_server_side", Qe = "$dead_clicks_enabled_server_side", Ze = "$product_tours_enabled_server_side", ti = "$web_vitals_allowed_metrics", ei = "$session_recording_remote_config", ii = "$replay_override_sampling", ri = "$replay_override_linked_flag", si = "$replay_override_url_trigger", ni = "$replay_override_event_trigger", oi = "$sesid", ai = "$session_is_sampled", li = "$enabled_feature_flags", ui = "$active_feature_flags", hi = "$early_access_features", di = "$feature_flag_details", vi = "$feature_flag_payloads", ci = "$feature_flag_request_id", pi = "$override_feature_flags", fi = "$override_feature_flag_payloads", _i = "$stored_person_properties", gi = "$stored_group_properties", mi = "$surveys", bi = "$surveys_activated", yi = "ph_product_tours", wi = "$flag_call_reported", xi = "$flag_call_reported_session_id", Ei = "$feature_flag_errors", Si = "$feature_flag_evaluated_at", $i = "$user_state", Ti = "$client_session_props", ki = "$capture_rate_limit", Ri = "$initial_campaign_params", Pi = "$initial_referrer_info", Oi = "$initial_person_info", Ii = "$epp", Ci = "__POSTHOG_TOOLBAR__", Ai = "$posthog_cookieless", Fi = "$sdk_debug_extensions_init_method", Mi = "$sdk_debug_extensions_init_time_ms", Di = "$sdk_debug_recording_script_not_loaded", Ui = "PostHog loadExternalDependency extension not found.", Li = "on_reject", Ni = "always", ji = "anonymous", zi = "identified", Bi = "identified_only", Hi = "visibilitychange", qi = "beforeunload", Vi = "$pageview", Wi = "$pageleave", Gi = "$identify", Yi = "$groupidentify";
function Ji(t, e) {
	M(t) && t.forEach(e);
}
function Ki(t, e) {
	if (!H(t)) if (M(t)) t.forEach(e);
	else if (G(t)) t.forEach(((t, i) => e(t, i)));
	else for (var i in t) A.call(t, i) && e(t[i], i);
}
var Xi = function(t) {
	for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
	for (var s of i) for (var n in s) void 0 !== s[n] && (t[n] = s[n]);
	return t;
};
function Qi(t) {
	for (var e = Object.keys(t), i = e.length, r = new Array(i); i--;) r[i] = [e[i], t[e[i]]];
	return r;
}
var Zi = function(t) {
	try {
		return t();
	} catch (t) {
		return;
	}
}, tr = function(t) {
	return function() {
		try {
			for (var e = arguments.length, i = new Array(e), r = 0; e > r; r++) i[r] = arguments[r];
			return t.apply(this, i);
		} catch (t) {
			Le.critical("Implementation error. Please turn on debug mode and open a ticket on https://app.posthog.com/home#panel=support%3Asupport%3A."), Le.critical(t);
		}
	};
}, er = function(t) {
	var e = {};
	return Ki(t, (function(t, i) {
		(j(t) && t.length > 0 || q(t)) && (e[i] = t);
	})), e;
};
var ir = [
	"herokuapp.com",
	"vercel.app",
	"netlify.app"
];
function rr(t) {
	var e = null == t ? void 0 : t.hostname;
	if (!j(e)) return !1;
	var i = e.split(".").slice(-2).join(".");
	for (var r of ir) if (i === r) return !1;
	return !0;
}
function sr(t, e, i, r) {
	var { capture: s = !1, passive: n = !0 } = null != r ? r : {};
	t?.addEventListener(e, i, {
		capture: s,
		passive: n
	});
}
function nr(t) {
	return "ph_toolbar_internal" === t.name;
}
Math.trunc || (Math.trunc = function(t) {
	return 0 > t ? Math.ceil(t) : Math.floor(t);
}), Number.isInteger || (Number.isInteger = function(t) {
	return q(t) && isFinite(t) && Math.floor(t) === t;
});
var or = class or {
	constructor(t) {
		if (this.bytes = t, 16 !== t.length) throw new TypeError("not 128-bit length");
	}
	static fromFieldsV7(t, e, i, r) {
		if (!Number.isInteger(t) || !Number.isInteger(e) || !Number.isInteger(i) || !Number.isInteger(r) || 0 > t || 0 > e || 0 > i || 0 > r || t > 0xffffffffffff || e > 4095 || i > 1073741823 || r > 4294967295) throw new RangeError("invalid field value");
		var s = new Uint8Array(16);
		return s[0] = t / Math.pow(2, 40), s[1] = t / Math.pow(2, 32), s[2] = t / Math.pow(2, 24), s[3] = t / Math.pow(2, 16), s[4] = t / Math.pow(2, 8), s[5] = t, s[6] = 112 | e >>> 8, s[7] = e, s[8] = 128 | i >>> 24, s[9] = i >>> 16, s[10] = i >>> 8, s[11] = i, s[12] = r >>> 24, s[13] = r >>> 16, s[14] = r >>> 8, s[15] = r, new or(s);
	}
	toString() {
		for (var t = "", e = 0; this.bytes.length > e; e++) t = t + (this.bytes[e] >>> 4).toString(16) + (15 & this.bytes[e]).toString(16), 3 !== e && 5 !== e && 7 !== e && 9 !== e || (t += "-");
		if (36 !== t.length) throw new Error("Invalid UUIDv7 was generated");
		return t;
	}
	clone() {
		return new or(this.bytes.slice(0));
	}
	equals(t) {
		return 0 === this.compareTo(t);
	}
	compareTo(t) {
		for (var e = 0; 16 > e; e++) {
			var i = this.bytes[e] - t.bytes[e];
			if (0 !== i) return Math.sign(i);
		}
		return 0;
	}
};
var ar = class {
	constructor() {
		this.S = 0, this.C = 0, this.I = new hr();
	}
	generate() {
		var t = this.generateOrAbort();
		if (N(t)) {
			this.S = 0;
			var e = this.generateOrAbort();
			if (N(e)) throw new Error("Could not generate UUID after timestamp reset");
			return e;
		}
		return t;
	}
	generateOrAbort() {
		var t = Date.now();
		if (t > this.S) this.S = t, this.T();
		else {
			if (this.S >= t + 1e4) return;
			this.C++, this.C > 4398046511103 && (this.S++, this.T());
		}
		return or.fromFieldsV7(this.S, Math.trunc(this.C / Math.pow(2, 30)), this.C & Math.pow(2, 30) - 1, this.I.nextUint32());
	}
	T() {
		this.C = 1024 * this.I.nextUint32() + (1023 & this.I.nextUint32());
	}
};
var lr, ur = (t) => {
	if ("undefined" != typeof UUIDV7_DENY_WEAK_RNG && UUIDV7_DENY_WEAK_RNG) throw new Error("no cryptographically strong RNG available");
	for (var e = 0; t.length > e; e++) t[e] = 65536 * Math.trunc(65536 * Math.random()) + Math.trunc(65536 * Math.random());
	return t;
};
t && !N(t.crypto) && crypto.getRandomValues && (ur = (t) => crypto.getRandomValues(t));
var hr = class {
	constructor() {
		this.M = new Uint32Array(8), this.O = Infinity;
	}
	nextUint32() {
		return this.M.length > this.O || (ur(this.M), this.O = 0), this.M[this.O++];
	}
};
var dr = () => vr().toString(), vr = () => (lr || (lr = new ar())).generate(), cr = "", pr = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i;
var fr = {
	R: () => !!r,
	D(t) {
		Le.error("cookieStore error: " + t);
	},
	A(t) {
		if (r) {
			try {
				for (var e = t + "=", i = r.cookie.split(";").filter(((t) => t.length)), s = 0; i.length > s; s++) {
					for (var n = i[s]; " " == n.charAt(0);) n = n.substring(1, n.length);
					if (0 === n.indexOf(e)) return decodeURIComponent(n.substring(e.length, n.length));
				}
			} catch (t) {}
			return null;
		}
	},
	F(t) {
		var e;
		try {
			e = JSON.parse(fr.A(t)) || {};
		} catch (t) {}
		return e;
	},
	N(t, e, i, s, n) {
		if (r) try {
			var o = "", a = "", l = function(t, e) {
				if (e) {
					var i = function(t, e) {
						if (void 0 === e && (e = r), cr) return cr;
						if (!e) return "";
						if (["localhost", "127.0.0.1"].includes(t)) return "";
						for (var i = t.split("."), s = Math.min(i.length, 8), n = "dmn_chk_" + dr(); !cr && s--;) {
							var o = i.slice(s).join("."), a = n + "=1;domain=." + o + ";path=/";
							e.cookie = a + ";max-age=3", e.cookie.includes(n) && (e.cookie = a + ";max-age=0", cr = o);
						}
						return cr;
					}(t);
					if (!i) {
						var s = ((t) => {
							var e = t.match(pr);
							return e ? e[0] : "";
						})(t);
						s !== i && Le.info("Warning: cookie subdomain discovery mismatch", s, i), i = s;
					}
					return i ? "; domain=." + i : "";
				}
				return "";
			}(r.location.hostname, s);
			if (i) {
				var u = /* @__PURE__ */ new Date();
				u.setTime(u.getTime() + 864e5 * i), o = "; expires=" + u.toUTCString();
			}
			n && (a = "; secure");
			var h = t + "=" + encodeURIComponent(JSON.stringify(e)) + o + "; SameSite=Lax; path=/" + l + a;
			return h.length > 3686.4 && Le.warn("cookieStore warning: large cookie, len=" + h.length), r.cookie = h, h;
		} catch (t) {
			return;
		}
	},
	q(t, e) {
		if (null != r && r.cookie) try {
			fr.N(t, "", -1, e);
		} catch (t) {
			return;
		}
	}
}, _r = null, gr = {
	R() {
		if (!B(_r)) return _r;
		var e = !0;
		if (N(t)) e = !1;
		else try {
			var i = "__mplssupport__";
			gr.N(i, "xyz"), "\"xyz\"" !== gr.A(i) && (e = !1), gr.q(i);
		} catch (t) {
			e = !1;
		}
		return e || Le.error("localStorage unsupported; falling back to cookie store"), _r = e, e;
	},
	D(t) {
		Le.error("localStorage error: " + t);
	},
	A(e) {
		try {
			return null == t ? void 0 : t.localStorage.getItem(e);
		} catch (t) {
			gr.D(t);
		}
		return null;
	},
	F(t) {
		try {
			return JSON.parse(gr.A(t)) || {};
		} catch (t) {}
		return null;
	},
	N(e, i) {
		try {
			t?.localStorage.setItem(e, JSON.stringify(i));
		} catch (t) {
			gr.D(t);
		}
	},
	q(e) {
		try {
			t?.localStorage.removeItem(e);
		} catch (t) {
			gr.D(t);
		}
	}
}, mr = [
	He,
	"distinct_id",
	oi,
	ai,
	Ii,
	Oi,
	$i
], br = {}, yr = {
	R: () => !0,
	D(t) {
		Le.error("memoryStorage error: " + t);
	},
	A: (t) => br[t] || null,
	F: (t) => br[t] || null,
	N(t, e) {
		br[t] = e;
	},
	q(t) {
		delete br[t];
	}
}, wr = null, xr = {
	R() {
		if (!B(wr)) return wr;
		if (wr = !0, N(t)) wr = !1;
		else try {
			var e = "__support__";
			xr.N(e, "xyz"), "\"xyz\"" !== xr.A(e) && (wr = !1), xr.q(e);
		} catch (t) {
			wr = !1;
		}
		return wr;
	},
	D(t) {
		Le.error("sessionStorage error: ", t);
	},
	A(e) {
		try {
			return null == t ? void 0 : t.sessionStorage.getItem(e);
		} catch (t) {
			xr.D(t);
		}
		return null;
	},
	F(t) {
		try {
			return JSON.parse(xr.A(t)) || null;
		} catch (t) {}
		return null;
	},
	N(e, i) {
		try {
			t?.sessionStorage.setItem(e, JSON.stringify(i));
		} catch (t) {
			xr.D(t);
		}
	},
	q(e) {
		try {
			t?.sessionStorage.removeItem(e);
		} catch (t) {
			xr.D(t);
		}
	}
};
var Er = class {
	constructor(t) {
		this._instance = t;
	}
	get qt() {
		return this._instance.config;
	}
	get consent() {
		return this.rr() ? 0 : this.ir;
	}
	isOptedOut() {
		return this.qt.cookieless_mode === Ni || this.isRejected() || -1 === this.consent && this.qt.cookieless_mode === Li;
	}
	isOptedIn() {
		return !this.isOptedOut();
	}
	isExplicitlyOptedOut() {
		return 0 === this.consent;
	}
	isRejected() {
		return 0 === this.consent || -1 === this.consent && this.qt.opt_out_capturing_by_default;
	}
	optInOut(t) {
		this.nr.N(this.sr, t ? 1 : 0, this.qt.cookie_expiration, this.qt.cross_subdomain_cookie, this.qt.secure_cookie);
	}
	reset() {
		this.nr.q(this.sr, this.qt.cross_subdomain_cookie);
	}
	get sr() {
		var { token: t, opt_out_capturing_cookie_prefix: e, consent_persistence_name: i } = this._instance.config;
		return i || (e ? e + t : "__ph_opt_in_out_" + t);
	}
	get ir() {
		var t = this.nr.A(this.sr);
		return Z(t) ? 1 : P(tt, t) ? 0 : -1;
	}
	get nr() {
		var t = this.qt.opt_out_capturing_persistence_type, e = "localStorage" === t ? gr : fr;
		if (!this.ar || this.ar !== e) {
			this.ar = e;
			var i = "localStorage" === t ? fr : gr;
			i.A(this.sr) && (this.ar.A(this.sr) || this.optInOut(Z(i.A(this.sr))), i.q(this.sr, this.qt.cross_subdomain_cookie));
		}
		return this.ar;
	}
	rr() {
		return !!this.qt.respect_dnt && [
			null == i ? void 0 : i.doNotTrack,
			null == i ? void 0 : i.msDoNotTrack,
			h.doNotTrack
		].some(((t) => Z(t)));
	}
};
var Sr = Ne("[Dead Clicks]"), $r = () => !0, Tr = (t) => {
	var e, i = !(null == (e = t.instance.persistence) || !e.get_property(Qe)), r = t.instance.config.capture_dead_clicks;
	return W(r) ? r : !!U(r) || i;
};
var kr = class {
	get lazyLoadedDeadClicksAutocapture() {
		return this.ur;
	}
	constructor(t, e, i) {
		this.instance = t, this.isEnabled = e, this.onCapture = i, this.startIfEnabledOrStop();
	}
	onRemoteConfig(t) {
		"captureDeadClicks" in t && (this.instance.persistence && this.instance.persistence.register({ [Qe]: t.captureDeadClicks }), this.startIfEnabledOrStop());
	}
	startIfEnabledOrStop() {
		this.isEnabled(this) ? this.lr((() => {
			this.hr();
		})) : this.stop();
	}
	lr(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.initDeadClicksAutocapture && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this.instance, "dead-clicks-autocapture", ((e) => {
			e ? Sr.error("failed to load script", e) : t();
		}));
	}
	hr() {
		var t;
		if (r) {
			if (!this.ur && null != (t = h.__PosthogExtensions__) && t.initDeadClicksAutocapture) {
				var e = U(this.instance.config.capture_dead_clicks) ? this.instance.config.capture_dead_clicks : {};
				e.__onCapture = this.onCapture, this.ur = h.__PosthogExtensions__.initDeadClicksAutocapture(this.instance, e), this.ur.start(r), Sr.info("starting...");
			}
		} else Sr.error("`document` not found. Cannot start.");
	}
	stop() {
		this.ur && (this.ur.stop(), this.ur = void 0, Sr.info("stopping..."));
	}
};
var Rr = Ne("[SegmentIntegration]");
var Pr = "posthog-js";
function Or(t, e) {
	var { organization: i, projectId: r, prefix: s, severityAllowList: n = ["error"], sendExceptionsToPostHog: o = !0 } = void 0 === e ? {} : e;
	return (e) => {
		var a, l, u, h, d;
		if ("*" !== n && !n.includes(e.level) || !t.__loaded) return e;
		e.tags || (e.tags = {});
		var v = t.requestRouter.endpointFor("ui", "/project/" + t.config.token + "/person/" + t.get_distinct_id());
		e.tags["PostHog Person URL"] = v, t.sessionRecordingStarted() && (e.tags["PostHog Recording URL"] = t.get_session_replay_url({ withTimestamp: !0 }));
		var c, p = (null == (a = e.exception) ? void 0 : a.values) || [], _ = p.map(((t) => f({}, t, { stacktrace: t.stacktrace ? f({}, t.stacktrace, {
			type: "raw",
			frames: (t.stacktrace.frames || []).map(((t) => f({}, t, { platform: "web:javascript" })))
		}) : void 0 }))), g = {
			$exception_message: (null == (l = p[0]) ? void 0 : l.value) || e.message,
			$exception_type: null == (u = p[0]) ? void 0 : u.type,
			$exception_level: e.level,
			$exception_list: _,
			$sentry_event_id: e.event_id,
			$sentry_exception: e.exception,
			$sentry_exception_message: (null == (h = p[0]) ? void 0 : h.value) || e.message,
			$sentry_exception_type: null == (d = p[0]) ? void 0 : d.type,
			$sentry_tags: e.tags
		};
		return i && r && (g.$sentry_url = (s || "https://sentry.io/organizations/") + i + "/issues/?project=" + r + "&query=" + e.event_id), o && (null == (c = t.exceptions) || c.sendExceptionEvent(g)), e;
	};
}
var Ir = class {
	constructor(t, e, i, r, s, n) {
		this.name = Pr, this.setupOnce = function(o) {
			o(Or(t, {
				organization: e,
				projectId: i,
				prefix: r,
				severityAllowList: s,
				sendExceptionsToPostHog: null == n || n
			}));
		};
	}
};
var Cr = class {
	constructor(t) {
		this.cr = (t, e, i) => {
			i && (i.noSessionId || i.activityTimeout || i.sessionPastMaximumLength) && (Le.info("[PageViewManager] Session rotated, clearing pageview state", {
				sessionId: t,
				changeReason: i
			}), this.dr = void 0, this._instance.scrollManager.resetContext());
		}, this._instance = t, this.vr();
	}
	vr() {
		var t;
		this.pr = null == (t = this._instance.sessionManager) ? void 0 : t.onSessionId(this.cr);
	}
	destroy() {
		var t;
		null == (t = this.pr) || t.call(this), this.pr = void 0;
	}
	doPageView(e, i) {
		var r, s = this.gr(e, i);
		return this.dr = {
			pathname: null !== (r = null == t ? void 0 : t.location.pathname) && void 0 !== r ? r : "",
			pageViewId: i,
			timestamp: e
		}, this._instance.scrollManager.resetContext(), s;
	}
	doPageLeave(t) {
		var e;
		return this.gr(t, null == (e = this.dr) ? void 0 : e.pageViewId);
	}
	doEvent() {
		var t;
		return { $pageview_id: null == (t = this.dr) ? void 0 : t.pageViewId };
	}
	gr(t, e) {
		var i = this.dr;
		if (!i) return { $pageview_id: e };
		var r = {
			$pageview_id: e,
			$prev_pageview_id: i.pageViewId
		}, s = this._instance.scrollManager.getContext();
		if (s && !this._instance.config.disable_scroll_properties) {
			var { maxScrollHeight: n, lastScrollY: o, maxScrollY: a, maxContentHeight: l, lastContentY: u, maxContentY: h } = s;
			if (!(N(n) || N(o) || N(a) || N(l) || N(u) || N(h))) {
				n = Math.ceil(n), o = Math.ceil(o), a = Math.ceil(a), l = Math.ceil(l), u = Math.ceil(u), h = Math.ceil(h);
				var d = n > 1 ? et(o / n, 0, 1, Le) : 1, v = n > 1 ? et(a / n, 0, 1, Le) : 1, c = l > 1 ? et(u / l, 0, 1, Le) : 1, p = l > 1 ? et(h / l, 0, 1, Le) : 1;
				r = Xi(r, {
					$prev_pageview_last_scroll: o,
					$prev_pageview_last_scroll_percentage: d,
					$prev_pageview_max_scroll: a,
					$prev_pageview_max_scroll_percentage: v,
					$prev_pageview_last_content: u,
					$prev_pageview_last_content_percentage: c,
					$prev_pageview_max_content: h,
					$prev_pageview_max_content_percentage: p
				});
			}
		}
		return i.pathname && (r.$prev_pageview_pathname = i.pathname), i.timestamp && (r.$prev_pageview_duration = (t.getTime() - i.timestamp.getTime()) / 1e3), r;
	}
};
var Ar = {
	[Be]: { exposure: "hidden" },
	[qe]: { exposure: "hidden" },
	__cmpns: { exposure: "hidden" },
	[Ve]: { exposure: "hidden" },
	[We]: { exposure: "event" },
	[Ge]: { exposure: "hidden" },
	[Ye]: { exposure: "event" },
	[Je]: { exposure: "hidden" },
	[Ke]: { exposure: "event" },
	[Xe]: { exposure: "event" },
	[Qe]: { exposure: "event" },
	[Ze]: { exposure: "hidden" },
	[ti]: { exposure: "event" },
	[ei]: { exposure: "hidden" },
	$session_recording_enabled_server_side: { exposure: "hidden" },
	[oi]: { exposure: "hidden" },
	[ai]: { exposure: "event" },
	$session_past_minimum_duration: { exposure: "event" },
	$session_recording_url_trigger_activated_session: { exposure: "event" },
	$session_recording_event_trigger_activated_session: { exposure: "event" },
	$debug_first_full_snapshot_timestamp: { exposure: "event" },
	[li]: {
		exposure: "derived",
		shouldSkipFromEventProperties: (t, e) => e(),
		transformToEventProperties(t) {
			if (!U(t)) return {};
			for (var e = {}, i = Object.keys(t), r = 0; i.length > r; r++) e["$feature/" + i[r]] = t[i[r]];
			return e;
		}
	},
	[ui]: { exposure: "event" },
	[hi]: { exposure: "hidden" },
	[di]: { exposure: "hidden" },
	[vi]: { exposure: "event" },
	[ci]: { exposure: "event" },
	[pi]: { exposure: "event" },
	[fi]: { exposure: "hidden" },
	[_i]: { exposure: "hidden" },
	[gi]: { exposure: "hidden" },
	[mi]: { exposure: "hidden" },
	[bi]: { exposure: "event" },
	[yi]: { exposure: "hidden" },
	$product_tours_activated: { exposure: "hidden" },
	$conversations_widget_session_id: { exposure: "event" },
	$conversations_ticket_id: { exposure: "event" },
	$conversations_widget_state: { exposure: "event" },
	$conversations_user_traits: { exposure: "event" },
	[wi]: { exposure: "hidden" },
	[xi]: { exposure: "hidden" },
	[Ei]: { exposure: "hidden" },
	[Si]: { exposure: "hidden" },
	[$i]: { exposure: "hidden" },
	[Ti]: { exposure: "hidden" },
	[ki]: { exposure: "hidden" },
	[Ri]: { exposure: "hidden" },
	[Pi]: { exposure: "hidden" },
	[Oi]: { exposure: "hidden" },
	[Ii]: { exposure: "hidden" },
	[ii]: { exposure: "event" },
	[ri]: { exposure: "event" },
	[si]: { exposure: "event" },
	[ni]: { exposure: "event" },
	[Fi]: { exposure: "event" },
	[Mi]: { exposure: "event" },
	[Di]: { exposure: "event" },
	$sdk_debug_replay_event_trigger_status: { exposure: "event" },
	$sdk_debug_replay_linked_flag_trigger_status: { exposure: "event" },
	$sdk_debug_replay_matched_recording_trigger_groups: { exposure: "event" },
	$sdk_debug_replay_remote_trigger_matching_config: { exposure: "event" },
	$sdk_debug_replay_trigger_groups_count: { exposure: "event" },
	$sdk_debug_replay_url_trigger_status: { exposure: "event" },
	$session_recording_start_reason: { exposure: "event" }
}, Fr = [
	["$posthog_sr_group_event_trigger_", { exposure: "hidden" }],
	["$posthog_sr_group_url_trigger_", { exposure: "hidden" }],
	["$posthog_sr_group_sampling_", { exposure: "hidden" }]
], Mr = (t) => {
	var e = null == r ? void 0 : r.createElement("a");
	return N(e) ? null : (e.href = t, e);
}, Dr = function(t, e) {
	for (var i, r = ((t.split("#")[0] || "").split(/\?(.*)/)[1] || "").replace(/^\?+/g, "").split("&"), s = 0; r.length > s; s++) {
		var n = r[s].split("=");
		if (n[0] === e) {
			i = n;
			break;
		}
	}
	if (!M(i) || 2 > i.length) return "";
	var o = i[1];
	try {
		o = decodeURIComponent(o);
	} catch (t) {
		Le.error("Skipping decoding for malformed query param: " + o);
	}
	return o.replace(/\+/g, " ");
}, Ur = function(t, e, i) {
	if (!t || !e || !e.length) return t;
	for (var r = t.split("#"), s = r[1], n = (r[0] || "").split("?"), o = n[1], a = n[0], l = (o || "").split("&"), u = [], h = 0; l.length > h; h++) {
		var d = l[h].split("=");
		M(d) && (e.includes(d[0]) ? u.push(d[0] + "=" + i) : u.push(l[h]));
	}
	var v = a;
	return null != o && (v += "?" + u.join("&")), null != s && (v += "#" + s), v;
}, Lr = function(t, e) {
	var i = t.match(new RegExp(e + "=([^&]*)"));
	return i ? i[1] : null;
}, Nr = "https?://(.*)", jr = [
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"twclid",
	"li_fat_id",
	"igshid",
	"ttclid",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"irclid",
	"_kx"
], zr = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"gad_source",
	"mc_cid",
	...jr
], Br = "<masked>", Hr = ["li_fat_id"];
function qr(t, e, i) {
	if (!r) return {};
	var s, n = e ? [...jr, ...i || []] : [], o = Vr(Ur(r.URL, n, Br), t);
	return Xi((s = {}, Ki(Hr, (function(t) {
		var e = fr.A(t);
		s[t] = e || null;
	})), s), o);
}
function Vr(t, e) {
	var i = zr.concat(e || []), r = {};
	return Ki(i, (function(e) {
		r[e] = Dr(t, e) || null;
	})), r;
}
function Wr(t) {
	var e = function(t) {
		return t ? 0 === t.search(Nr + "google.([^/?]*)") ? "google" : 0 === t.search(Nr + "bing.com") ? "bing" : 0 === t.search(Nr + "yahoo.com") ? "yahoo" : 0 === t.search(Nr + "duckduckgo.com") ? "duckduckgo" : null : null;
	}(t), i = "yahoo" != e ? "q" : "p", s = {};
	if (!B(e)) {
		s.$search_engine = e;
		var n = r ? Dr(r.referrer, i) : "";
		n.length && (s.ph_keyword = n);
	}
	return s;
}
function Gr() {
	return navigator.language || navigator.userLanguage;
}
var Yr = "$direct";
function Jr() {
	return (null == r ? void 0 : r.referrer) || Yr;
}
function Kr(t, e) {
	var i = t ? [...jr, ...e || []] : [], r = null == s ? void 0 : s.href.substring(0, 1e3);
	return {
		r: Jr().substring(0, 1e3),
		u: r ? Ur(r, i, Br) : void 0
	};
}
function Xr(t) {
	var e, { r: i, u: r } = t, s = {
		$referrer: i,
		$referring_domain: null == i ? void 0 : i == Yr ? Yr : null == (e = Mr(i)) ? void 0 : e.host
	};
	if (r) {
		s.$current_url = r;
		var n = Mr(r);
		s.$host = null == n ? void 0 : n.host, s.$pathname = null == n ? void 0 : n.pathname;
		Xi(s, Vr(r));
	}
	if (i) Xi(s, Wr(i));
	return s;
}
function Qr() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch (t) {
		return;
	}
}
function Zr() {
	try {
		return (/* @__PURE__ */ new Date()).getTimezoneOffset();
	} catch (t) {
		return;
	}
}
var ts = [
	"cookie",
	"localstorage",
	"localstorage+cookie",
	"sessionstorage",
	"memory"
];
var es = class {
	constructor(t, e) {
		this.qt = t, this.props = {}, this.mr = !1, this.yr = ((t) => {
			var e = "";
			return t.token && (e = t.token.replace(/\+/g, "PL").replace(/\//g, "SL").replace(/=/g, "EQ")), t.persistence_name ? "ph_" + t.persistence_name : "ph_" + e + "_posthog";
		})(t), this.nr = this.br(t), this.load(), t.debug && Le.info("Persistence loaded", t.persistence, f({}, this.props)), this.update_config(t, t, e), this.save();
	}
	isDisabled() {
		return !!this._r;
	}
	br(e) {
		-1 === ts.indexOf(e.persistence.toLowerCase()) && (Le.critical("Unknown persistence type " + e.persistence + "; falling back to localStorage+cookie"), e.persistence = "localStorage+cookie");
		var i = function(e) {
			void 0 === e && (e = []);
			var i = [...mr, ...e];
			return f({}, gr, {
				F(t) {
					try {
						var e = {};
						try {
							e = fr.F(t) || {};
						} catch (t) {}
						var i = Xi(e, JSON.parse(gr.A(t) || "{}"));
						return gr.N(t, i), i;
					} catch (t) {}
					return null;
				},
				N(t, e, r, s, n, o) {
					try {
						gr.N(t, e, void 0, void 0, o);
						var a = {};
						i.forEach(((t) => {
							e[t] && (a[t] = e[t]);
						})), Object.keys(a).length && fr.N(t, a, r, s, n, o);
					} catch (t) {
						gr.D(t);
					}
				},
				q(e, i) {
					try {
						t?.localStorage.removeItem(e), fr.q(e, i);
					} catch (t) {
						gr.D(t);
					}
				}
			});
		}(e.cookie_persisted_properties || []), r = e.persistence.toLowerCase();
		return "localstorage" === r && gr.R() ? gr : "localstorage+cookie" === r && i.R() ? i : "sessionstorage" === r && xr.R() ? xr : "memory" === r ? yr : "cookie" === r ? fr : i.R() ? i : fr;
	}
	wr(t) {
		var e = null != t ? t : this.qt.feature_flag_cache_ttl_ms;
		if (!e || 0 >= e) return !1;
		var i = this.props[Si];
		return !i || "number" != typeof i || Date.now() - i > e;
	}
	properties() {
		var t = {};
		return Ki(this.props, ((e, i) => {
			var r = ((t) => {
				var e = Ar[t];
				if (e) return e;
				for (var [i, r] of Fr) if (0 === t.indexOf(i)) return r;
			})(i);
			if ("derived" === (null == r ? void 0 : r.exposure)) {
				if (null != r.shouldSkipFromEventProperties && r.shouldSkipFromEventProperties(e, i === li ? () => this.wr() : () => !1)) return;
				r.transformToEventProperties && Xi(t, r.transformToEventProperties(e));
			} else r && "event" !== r.exposure || (t[i] = e);
		})), t;
	}
	load() {
		if (!this._r) {
			var t = this.nr.F(this.yr);
			t && (this.props = Xi({}, t));
		}
	}
	save() {
		this._r || this.nr.N(this.yr, this.props, this.Sr, this.kr, this.Cr, this.qt.debug);
	}
	remove() {
		this.nr.q(this.yr, !1), this.nr.q(this.yr, !0);
	}
	clear() {
		this.remove(), this.props = {};
	}
	register_once(t, e, i) {
		if (U(t)) {
			N(e) && (e = "None"), this.Sr = N(i) ? this.Ir : i;
			var r = !1;
			if (Ki(t, ((t, i) => {
				this.props.hasOwnProperty(i) && this.props[i] !== e || (this.Tr(i, t), r = !0);
			})), r) return this.save(), !0;
		}
		return !1;
	}
	register(t, e) {
		if (U(t)) {
			this.Sr = N(e) ? this.Ir : e;
			var i = !1;
			if (Ki(t, ((e, r) => {
				t.hasOwnProperty(r) && this.props[r] !== e && (this.Tr(r, e), i = !0);
			})), i) return this.save(), !0;
		}
		return !1;
	}
	unregister(t) {
		t in this.props && (this.Er(t), this.save());
	}
	update_campaign_params() {
		if (!this.mr) {
			var t = qr(this.qt.custom_campaign_params, this.qt.mask_personal_data_properties, this.qt.custom_personal_data_properties);
			L(er(t)) || this.register(t), this.mr = !0;
		}
	}
	update_search_keyword() {
		var t;
		this.register((t = null == r ? void 0 : r.referrer) ? Wr(t) : {});
	}
	update_referrer_info() {
		var t;
		this.register_once({
			$referrer: Jr(),
			$referring_domain: null != r && r.referrer && (null == (t = Mr(r.referrer)) ? void 0 : t.host) || Yr
		}, void 0);
	}
	set_initial_person_info() {
		this.props[Ri] || this.props[Pi] || this.register_once({ [Oi]: Kr(this.qt.mask_personal_data_properties, this.qt.custom_personal_data_properties) }, void 0);
	}
	get_initial_props() {
		var t = {};
		Ki([Pi, Ri], ((e) => {
			var i = this.props[e];
			i && Ki(i, (function(e, i) {
				t["$initial_" + I(i)] = e;
			}));
		}));
		var e, i, r = this.props[Oi];
		if (r) Xi(t, (e = Xr(r), i = {}, Ki(e, (function(t, e) {
			i["$initial_" + I(e)] = t;
		})), i));
		return t;
	}
	safe_merge(t) {
		return Ki(this.props, (function(e, i) {
			i in t || (t[i] = e);
		})), t;
	}
	update_config(t, e, i) {
		if (this.Ir = this.Sr = t.cookie_expiration, this.set_disabled(t.disable_persistence || !!i), this.set_cross_subdomain(t.cross_subdomain_cookie), this.set_secure(t.secure_cookie), t.persistence !== e.persistence || !((t, e) => {
			if (t.length !== e.length) return !1;
			var i = [...t].sort(), r = [...e].sort();
			return i.every(((t, e) => t === r[e]));
		})(t.cookie_persisted_properties || [], e.cookie_persisted_properties || [])) {
			var r = this.br(t), s = this.props;
			this.clear(), this.nr = r, this.props = s, this.save();
		}
	}
	set_disabled(t) {
		this._r = t, this._r ? this.remove() : this.save();
	}
	set_cross_subdomain(t) {
		t !== this.kr && (this.kr = t, this.remove(), this.save());
	}
	set_secure(t) {
		t !== this.Cr && (this.Cr = t, this.remove(), this.save());
	}
	set_event_timer(t, e) {
		var i = this.props[Ve] || {};
		i[t] = e, this.Tr(Ve, i), this.save();
	}
	remove_event_timer(t) {
		var e = this.props[Ve] || {}, i = e[t];
		return N(i) || (delete e[t], this.Tr(Ve, e), this.save()), i;
	}
	get_property(t) {
		return this.props[t];
	}
	set_property(t, e) {
		this.Tr(t, e), this.save();
	}
	Tr(t, e) {
		this.props[t] = e;
	}
	Er(t) {
		delete this.props[t];
	}
};
var is = {
	Activation: "events",
	Cancellation: "cancelEvents"
}, rs = {
	Button: "button",
	Tab: "tab",
	Selector: "selector"
}, ss = {
	TopLeft: "top_left",
	TopRight: "top_right",
	TopCenter: "top_center",
	MiddleLeft: "middle_left",
	MiddleRight: "middle_right",
	MiddleCenter: "middle_center",
	Left: "left",
	Center: "center",
	Right: "right",
	NextToTrigger: "next_to_trigger"
}, ns = {
	Top: "top",
	Left: "left",
	Right: "right",
	Bottom: "bottom"
}, os = {
	Popover: "popover",
	API: "api",
	Widget: "widget",
	ExternalSurvey: "external_survey"
}, as = {
	Open: "open",
	MultipleChoice: "multiple_choice",
	SingleChoice: "single_choice",
	Rating: "rating",
	Link: "link"
}, ls = {
	NextQuestion: "next_question",
	End: "end",
	ResponseBased: "response_based",
	SpecificQuestion: "specific_question"
}, us = {
	Once: "once",
	Recurring: "recurring",
	Always: "always"
}, hs = {
	SHOWN: "survey shown",
	DISMISSED: "survey dismissed",
	SENT: "survey sent",
	ABANDONED: "survey abandoned"
}, ds = {
	SURVEY_ID: "$survey_id",
	SURVEY_NAME: "$survey_name",
	SURVEY_RESPONSE: "$survey_response",
	SURVEY_ITERATION: "$survey_iteration",
	SURVEY_ITERATION_START_DATE: "$survey_iteration_start_date",
	SURVEY_PARTIALLY_COMPLETED: "$survey_partially_completed",
	SURVEY_SUBMISSION_ID: "$survey_submission_id",
	SURVEY_QUESTIONS: "$survey_questions",
	SURVEY_COMPLETED: "$survey_completed",
	PRODUCT_TOUR_ID: "$product_tour_id",
	SURVEY_LAST_SEEN_DATE: "$survey_last_seen_date",
	SURVEY_LANGUAGE: "$survey_language"
}, vs = {
	Popover: "popover",
	Inline: "inline"
}, cs = {
	backgroundColor: "#ffffff",
	textColor: "#1d1f27",
	buttonColor: "#1d1f27",
	borderRadius: 8,
	buttonBorderRadius: 6,
	borderColor: "#e5e7eb",
	fontFamily: "system-ui",
	boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
	showOverlay: !0,
	whiteLabel: !1,
	dismissOnClickOutside: !0,
	zIndex: 2147483646
}, ps = {
	SHOWN: "product tour shown",
	DISMISSED: "product tour dismissed",
	COMPLETED: "product tour completed",
	STEP_SHOWN: "product tour step shown",
	STEP_COMPLETED: "product tour step completed",
	BUTTON_CLICKED: "product tour button clicked",
	STEP_SELECTOR_FAILED: "product tour step selector failed",
	BANNER_CONTAINER_SELECTOR_FAILED: "product tour banner container selector failed",
	BANNER_ACTION_CLICKED: "product tour banner action clicked"
}, fs = {
	TOUR_ID: "$product_tour_id",
	TOUR_NAME: "$product_tour_name",
	TOUR_ITERATION: "$product_tour_iteration",
	TOUR_RENDER_REASON: "$product_tour_render_reason",
	TOUR_STEP_ID: "$product_tour_step_id",
	TOUR_STEP_ORDER: "$product_tour_step_order",
	TOUR_STEP_TYPE: "$product_tour_step_type",
	TOUR_DISMISS_REASON: "$product_tour_dismiss_reason",
	TOUR_BUTTON_TEXT: "$product_tour_button_text",
	TOUR_BUTTON_ACTION: "$product_tour_button_action",
	TOUR_BUTTON_LINK: "$product_tour_button_link",
	TOUR_BUTTON_TOUR_ID: "$product_tour_button_tour_id",
	TOUR_STEPS_COUNT: "$product_tour_steps_count",
	TOUR_STEP_SELECTOR: "$product_tour_step_selector",
	TOUR_STEP_SELECTOR_FOUND: "$product_tour_step_selector_found",
	TOUR_STEP_ELEMENT_TAG: "$product_tour_step_element_tag",
	TOUR_STEP_ELEMENT_ID: "$product_tour_step_element_id",
	TOUR_STEP_ELEMENT_CLASSES: "$product_tour_step_element_classes",
	TOUR_STEP_ELEMENT_TEXT: "$product_tour_step_element_text",
	TOUR_ERROR: "$product_tour_error",
	TOUR_MATCHES_COUNT: "$product_tour_matches_count",
	TOUR_FAILURE_PHASE: "$product_tour_failure_phase",
	TOUR_WAITED_FOR_ELEMENT: "$product_tour_waited_for_element",
	TOUR_WAIT_DURATION_MS: "$product_tour_wait_duration_ms",
	TOUR_BANNER_SELECTOR: "$product_tour_banner_selector",
	TOUR_LINKED_SURVEY_ID: "$product_tour_linked_survey_id",
	USE_MANUAL_SELECTOR: "$use_manual_selector",
	INFERENCE_DATA_PRESENT: "$inference_data_present",
	TOUR_LAST_SEEN_DATE: "$product_tour_last_seen_date",
	TOUR_TYPE: "$product_tour_type"
}, _s = Ne("[RateLimiter]");
var gs = class {
	constructor(t) {
		this.serverLimits = {}, this.lastEventRateLimited = !1, this.checkForLimiting = (t) => {
			var e = t.text;
			if (e && e.length) try {
				(JSON.parse(e).quota_limited || []).forEach(((t) => {
					_s.info((t || "events") + " is quota limited."), this.serverLimits[t] = (/* @__PURE__ */ new Date()).getTime() + 6e4;
				}));
			} catch (t) {
				_s.warn("could not rate limit - continuing. Error: \"" + (null == t ? void 0 : t.message) + "\"", { text: e });
				return;
			}
		}, this.instance = t, this.lastEventRateLimited = this.clientRateLimitContext(!0).isRateLimited;
	}
	get captureEventsPerSecond() {
		var t;
		return (null == (t = this.instance.config.rate_limiting) ? void 0 : t.events_per_second) || 10;
	}
	get captureEventsBurstLimit() {
		var t;
		return Math.max((null == (t = this.instance.config.rate_limiting) ? void 0 : t.events_burst_limit) || 10 * this.captureEventsPerSecond, this.captureEventsPerSecond);
	}
	clientRateLimitContext(t) {
		var e, i, r;
		void 0 === t && (t = !1);
		var { captureEventsBurstLimit: s, captureEventsPerSecond: n } = this, o = (/* @__PURE__ */ new Date()).getTime(), a = null !== (e = null == (i = this.instance.persistence) ? void 0 : i.get_property(ki)) && void 0 !== e ? e : {
			tokens: s,
			last: o
		};
		a.tokens += (o - a.last) / 1e3 * n, a.last = o, a.tokens > s && (a.tokens = s);
		var l = 1 > a.tokens;
		return l || t || (a.tokens = Math.max(0, a.tokens - 1)), !l || this.lastEventRateLimited || t || this.instance.capture("$$client_ingestion_warning", { $$client_ingestion_warning_message: "posthog-js client rate limited. Config is set to " + n + " events per second and " + s + " events burst limit." }, { skip_client_rate_limiting: !0 }), this.lastEventRateLimited = l, null == (r = this.instance.persistence) || r.set_property(ki, a), {
			isRateLimited: l,
			remainingTokens: a.tokens
		};
	}
	isServerRateLimited(t) {
		var e = this.serverLimits[t || "events"] || !1;
		return !1 !== e && (/* @__PURE__ */ new Date()).getTime() < e;
	}
};
var ms = Ne("[RemoteConfig]");
var bs = class {
	constructor(t) {
		this._instance = t;
	}
	get remoteConfig() {
		var t;
		return null == (t = h._POSTHOG_REMOTE_CONFIG) || null == (t = t[this._instance.config.token]) ? void 0 : t.config;
	}
	Mr(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.loadExternalDependency ? null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "remote-config", (() => t(this.remoteConfig))) : t();
	}
	Pr(t) {
		this._instance._send_request({
			method: "GET",
			url: this._instance.requestRouter.endpointFor("assets", "/array/" + this._instance.config.token + "/config"),
			callback(e) {
				t(e.json);
			}
		});
	}
	load() {
		try {
			if (this.remoteConfig) return ms.info("Using preloaded remote config", this.remoteConfig), this.Rr(this.remoteConfig), void this.Or();
			if (this._instance.Lr()) return void ms.warn("Remote config is disabled. Falling back to local config.");
			this.Mr(((t) => {
				if (!t) return ms.info("No config found after loading remote JS config. Falling back to JSON."), void this.Pr(((t) => {
					this.Rr(t), this.Or();
				}));
				this.Rr(t), this.Or();
			}));
		} catch (t) {
			ms.error("Error loading remote config", t);
		}
	}
	stop() {
		this.Fr && (clearInterval(this.Fr), this.Fr = void 0);
	}
	refresh() {
		!this._instance.Lr() && r && "hidden" !== r.visibilityState && this._instance.reloadFeatureFlags();
	}
	Or() {
		var t;
		if (!this.Fr) {
			var e = null !== (t = this._instance.config.remote_config_refresh_interval_ms) && void 0 !== t ? t : 3e5;
			0 !== e && (this.Fr = setInterval((() => {
				this.refresh();
			}), e));
		}
	}
	Rr(t) {
		var e;
		t || ms.error("Failed to fetch remote config from PostHog."), this._instance.Rr(null != t ? t : {}), !1 !== (null == t ? void 0 : t.hasFeatureFlags) && (this._instance.config.advanced_disable_feature_flags_on_first_load || null == (e = this._instance.featureFlags) || e.ensureFlagsLoaded());
	}
};
var ys = [
	"fatal",
	"error",
	"warning",
	"log",
	"info",
	"debug"
], ws = {
	GZipJS: "gzip-js",
	Base64: "base64"
}, xs = Uint8Array, Es = Uint16Array, Ss = Uint32Array, $s = new xs([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]), Ts = new xs([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]), ks = new xs([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]), Rs = function(t, e) {
	for (var i = new Es(31), r = 0; 31 > r; ++r) i[r] = e += 1 << t[r - 1];
	var s = new Ss(i[30]);
	for (r = 1; 30 > r; ++r) for (var n = i[r]; i[r + 1] > n; ++n) s[n] = n - i[r] << 5 | r;
	return [i, s];
}, Ps = Rs($s, 2), Os = Ps[1];
Ps[0][28] = 258, Os[258] = 28;
for (var Is = Rs(Ts, 0)[1], Cs = new Es(32768), As = 0; 32768 > As; ++As) {
	var Fs = (43690 & As) >>> 1 | (21845 & As) << 1;
	Cs[As] = ((65280 & (Fs = (61680 & (Fs = (52428 & Fs) >>> 2 | (13107 & Fs) << 2)) >>> 4 | (3855 & Fs) << 4)) >>> 8 | (255 & Fs) << 8) >>> 1;
}
var Ms = function(t, e, i) {
	for (var r = t.length, s = 0, n = new Es(e); r > s; ++s) ++n[t[s] - 1];
	var o, a = new Es(e);
	for (s = 0; e > s; ++s) a[s] = a[s - 1] + n[s - 1] << 1;
	if (i) {
		o = new Es(1 << e);
		var l = 15 - e;
		for (s = 0; r > s; ++s) if (t[s]) for (var u = s << 4 | t[s], h = e - t[s], d = a[t[s] - 1]++ << h, v = d | (1 << h) - 1; v >= d; ++d) o[Cs[d] >>> l] = u;
	} else for (o = new Es(r), s = 0; r > s; ++s) o[s] = Cs[a[t[s] - 1]++] >>> 15 - t[s];
	return o;
}, Ds = new xs(288);
for (As = 0; 144 > As; ++As) Ds[As] = 8;
for (As = 144; 256 > As; ++As) Ds[As] = 9;
for (As = 256; 280 > As; ++As) Ds[As] = 7;
for (As = 280; 288 > As; ++As) Ds[As] = 8;
var Us = new xs(32);
for (As = 0; 32 > As; ++As) Us[As] = 5;
var Ls = Ms(Ds, 9, 0), Ns = Ms(Us, 5, 0), js = function(t) {
	return (t / 8 >> 0) + (7 & t && 1);
}, zs = function(t, e, i) {
	(null == i || i > t.length) && (i = t.length);
	var r = new (t instanceof Es ? Es : t instanceof Ss ? Ss : xs)(i - e);
	return r.set(t.subarray(e, i)), r;
}, Bs = function(t, e, i) {
	var r = e / 8 >> 0;
	t[r] |= i <<= 7 & e, t[r + 1] |= i >>> 8;
}, Hs = function(t, e, i) {
	var r = e / 8 >> 0;
	t[r] |= i <<= 7 & e, t[r + 1] |= i >>> 8, t[r + 2] |= i >>> 16;
}, qs = function(t, e) {
	for (var i = [], r = 0; t.length > r; ++r) t[r] && i.push({
		s: r,
		f: t[r]
	});
	var s = i.length, n = i.slice();
	if (!s) return [new xs(0), 0];
	if (1 == s) {
		var o = new xs(i[0].s + 1);
		return o[i[0].s] = 1, [o, 1];
	}
	i.sort((function(t, e) {
		return t.f - e.f;
	})), i.push({
		s: -1,
		f: 25001
	});
	var a = i[0], l = i[1], u = 0, h = 1, d = 2;
	for (i[0] = {
		s: -1,
		f: a.f + l.f,
		l: a,
		r: l
	}; h != s - 1;) a = i[i[d].f > i[u].f ? u++ : d++], l = i[u != h && i[d].f > i[u].f ? u++ : d++], i[h++] = {
		s: -1,
		f: a.f + l.f,
		l: a,
		r: l
	};
	var v = n[0].s;
	for (r = 1; s > r; ++r) n[r].s > v && (v = n[r].s);
	var c = new Es(v + 1), p = Vs(i[h - 1], c, 0);
	if (p > e) {
		r = 0;
		var f = 0, _ = p - e, g = 1 << _;
		for (n.sort((function(t, e) {
			return c[e.s] - c[t.s] || t.f - e.f;
		})); s > r; ++r) {
			var m = n[r].s;
			if (e >= c[m]) break;
			f += g - (1 << p - c[m]), c[m] = e;
		}
		for (f >>>= _; f > 0;) {
			var b = n[r].s;
			e > c[b] ? f -= 1 << e - c[b]++ - 1 : ++r;
		}
		for (; r >= 0 && f; --r) {
			var y = n[r].s;
			c[y] == e && (--c[y], ++f);
		}
		p = e;
	}
	return [new xs(c), p];
}, Vs = function(t, e, i) {
	return -1 == t.s ? Math.max(Vs(t.l, e, i + 1), Vs(t.r, e, i + 1)) : e[t.s] = i;
}, Ws = function(t) {
	for (var e = t.length; e && !t[--e];);
	for (var i = new Es(++e), r = 0, s = t[0], n = 1, o = function(t) {
		i[r++] = t;
	}, a = 1; e >= a; ++a) if (t[a] == s && a != e) ++n;
	else {
		if (!s && n > 2) {
			for (; n > 138; n -= 138) o(32754);
			n > 2 && (o(n > 10 ? n - 11 << 5 | 28690 : n - 3 << 5 | 12305), n = 0);
		} else if (n > 3) {
			for (o(s), --n; n > 6; n -= 6) o(8304);
			n > 2 && (o(n - 3 << 5 | 8208), n = 0);
		}
		for (; n--;) o(s);
		n = 1, s = t[a];
	}
	return [i.subarray(0, r), e];
}, Gs = function(t, e) {
	for (var i = 0, r = 0; e.length > r; ++r) i += t[r] * e[r];
	return i;
}, Ys = function(t, e, i) {
	var r = i.length, s = js(e + 2);
	t[s] = 255 & r, t[s + 1] = r >>> 8, t[s + 2] = 255 ^ t[s], t[s + 3] = 255 ^ t[s + 1];
	for (var n = 0; r > n; ++n) t[s + n + 4] = i[n];
	return 8 * (s + 4 + r);
}, Js = function(t, e, i, r, s, n, o, a, l, u, h) {
	Bs(e, h++, i), ++s[256];
	for (var d = qs(s, 15), v = d[0], c = d[1], p = qs(n, 15), f = p[0], _ = p[1], g = Ws(v), m = g[0], b = g[1], y = Ws(f), w = y[0], x = y[1], E = new Es(19), S = 0; m.length > S; ++S) E[31 & m[S]]++;
	for (S = 0; w.length > S; ++S) E[31 & w[S]]++;
	for (var T = qs(E, 7), k = T[0], R = T[1], P = 19; P > 4 && !k[ks[P - 1]]; --P);
	var O, I, C, A, F = u + 5 << 3, M = Gs(s, Ds) + Gs(n, Us) + o, D = Gs(s, v) + Gs(n, f) + o + 14 + 3 * P + Gs(E, k) + (2 * E[16] + 3 * E[17] + 7 * E[18]);
	if (M >= F && D >= F) return Ys(e, h, t.subarray(l, l + u));
	if (Bs(e, h, 1 + (M > D)), h += 2, M > D) {
		O = Ms(v, c, 0), I = v, C = Ms(f, _, 0), A = f;
		var U = Ms(k, R, 0);
		for (Bs(e, h, b - 257), Bs(e, h + 5, x - 1), Bs(e, h + 10, P - 4), h += 14, S = 0; P > S; ++S) Bs(e, h + 3 * S, k[ks[S]]);
		h += 3 * P;
		for (var L = [m, w], N = 0; 2 > N; ++N) {
			var j = L[N];
			for (S = 0; j.length > S; ++S) Bs(e, h, U[z = 31 & j[S]]), h += k[z], z > 15 && (Bs(e, h, j[S] >>> 5 & 127), h += j[S] >>> 12);
		}
	} else O = Ls, I = Ds, C = Ns, A = Us;
	for (S = 0; a > S; ++S) if (r[S] > 255) {
		var z;
		Hs(e, h, O[257 + (z = r[S] >>> 18 & 31)]), h += I[z + 257], z > 7 && (Bs(e, h, r[S] >>> 23 & 31), h += $s[z]);
		var B = 31 & r[S];
		Hs(e, h, C[B]), h += A[B], B > 3 && (Hs(e, h, r[S] >>> 5 & 8191), h += Ts[B]);
	} else Hs(e, h, O[r[S]]), h += I[r[S]];
	return Hs(e, h, O[256]), h + I[256];
}, Ks = new Ss([
	65540,
	131080,
	131088,
	131104,
	262176,
	1048704,
	1048832,
	2114560,
	2117632
]), Xs = function() {
	for (var t = new Ss(256), e = 0; 256 > e; ++e) {
		for (var i = e, r = 9; --r;) i = (1 & i && 3988292384) ^ i >>> 1;
		t[e] = i;
	}
	return t;
}(), Qs = function(t, e, i) {
	for (; i; ++e) t[e] = i, i >>>= 8;
};
function Zs(t, e) {
	void 0 === e && (e = {});
	var i = function() {
		var t = 4294967295;
		return {
			p(e) {
				for (var i = t, r = 0; e.length > r; ++r) i = Xs[255 & i ^ e[r]] ^ i >>> 8;
				t = i;
			},
			d() {
				return 4294967295 ^ t;
			}
		};
	}(), r = t.length;
	i.p(t);
	var s, n, o, a, l, u = (a = 10 + ((s = e).filename && s.filename.length + 1 || 0), l = 8, function(t, e, i, r, s, n) {
		var o = t.length, a = new xs(r + o + 5 * (1 + Math.floor(o / 7e3)) + s), l = a.subarray(r, a.length - s), u = 0;
		if (!e || 8 > o) for (var h = 0; o >= h; h += 65535) {
			var d = h + 65535;
			o > d ? u = Ys(l, u, t.subarray(h, d)) : (l[h] = !0, u = Ys(l, u, t.subarray(h, o)));
		}
		else {
			for (var v = Ks[e - 1], c = v >>> 13, p = 8191 & v, f = (1 << i) - 1, _ = new Es(32768), g = new Es(f + 1), m = Math.ceil(i / 3), b = 2 * m, y = function(e) {
				return (t[e] ^ t[e + 1] << m ^ t[e + 2] << b) & f;
			}, w = new Ss(25e3), x = new Es(288), E = new Es(32), S = 0, T = 0, k = (h = 0, 0), R = 0, P = 0; o > h; ++h) {
				var O = y(h), I = 32767 & h, C = g[O];
				if (_[I] = C, g[O] = I, h >= R) {
					var A = o - h;
					if ((S > 7e3 || k > 24576) && A > 423) {
						u = Js(t, l, 0, w, x, E, T, k, P, h - P, u), k = S = T = 0, P = h;
						for (var F = 0; 286 > F; ++F) x[F] = 0;
						for (F = 0; 30 > F; ++F) E[F] = 0;
					}
					var M = 2, D = 0, U = p, L = I - C & 32767;
					if (A > 2 && O == y(h - L)) for (var N = Math.min(c, A) - 1, j = Math.min(32767, h), z = Math.min(258, A); j >= L && --U && I != C;) {
						if (t[h + M] == t[h + M - L]) {
							for (var B = 0; z > B && t[h + B] == t[h + B - L]; ++B);
							if (B > M) {
								if (M = B, D = L, B > N) break;
								var H = Math.min(L, B - 2), q = 0;
								for (F = 0; H > F; ++F) {
									var V = h - L + F + 32768 & 32767, W = V - _[V] + 32768 & 32767;
									W > q && (q = W, C = V);
								}
							}
						}
						L += (I = C) - (C = _[I]) + 32768 & 32767;
					}
					if (D) {
						w[k++] = 268435456 | Os[M] << 18 | Is[D];
						var G = 31 & Os[M], Y = 31 & Is[D];
						T += $s[G] + Ts[Y], ++x[257 + G], ++E[Y], R = h + M, ++S;
					} else w[k++] = t[h], ++x[t[h]];
				}
			}
			u = Js(t, l, !0, w, x, E, T, k, P, h - P, u);
		}
		return zs(a, 0, r + js(u) + s);
	}(n = t, null == (o = e).level ? 6 : o.level, null == o.mem ? Math.ceil(1.5 * Math.max(8, Math.min(13, Math.log(n.length)))) : 12 + o.mem, a, l)), h = u.length;
	return function(t, e) {
		var i = e.filename;
		if (t[0] = 31, t[1] = 139, t[2] = 8, t[8] = 2 > e.level ? 4 : 9 == e.level ? 2 : 0, t[9] = 3, 0 != e.mtime && Qs(t, 4, Math.floor(new Date(e.mtime || Date.now()) / 1e3)), i) {
			t[3] = 8;
			for (var r = 0; i.length >= r; ++r) t[r + 10] = i.charCodeAt(r);
		}
	}(u, e), Qs(u, h - 8, i.d()), Qs(u, h - 4, r), u;
}
var tn = !!o || !!n, en = "text/plain", rn = !1, sn = (t, e) => {
	var [i, r] = t.split("#"), [s, n] = i.split("?");
	if (!n) return t;
	var o = n.split("&").filter(((t) => t.split("=")[0] !== e)).join("&");
	return s + (o ? "?" + o : "") + (r ? "#" + r : "");
}, nn = function(t, e, i) {
	var r;
	void 0 === i && (i = !0);
	var [s, n] = t.split("?"), o = f({}, e), a = null !== (r = null == n ? void 0 : n.split("&").map(((t) => {
		var e, [r, s] = t.split("="), n = i && null !== (e = o[r]) && void 0 !== e ? e : s;
		return delete o[r], r + "=" + n;
	}))) && void 0 !== r ? r : [], l = function(t, e) {
		var i, r;
		void 0 === e && (e = "&");
		var s = [];
		return Ki(t, (function(t, e) {
			N(t) || N(e) || "undefined" === e || (i = encodeURIComponent(((t) => t instanceof File)(t) ? t.name : t.toString()), r = encodeURIComponent(e), s[s.length] = r + "=" + i);
		})), s.join(e);
	}(o);
	return l && a.push(l), s + "?" + a.join("&");
}, on = (t, e) => JSON.stringify(t, ((t, e) => "bigint" == typeof e ? e.toString() : e), e), an = (t) => {
	if (t.tr) return t.tr;
	var { data: e, compression: i } = t;
	if (e) {
		if (i === ws.GZipJS) {
			var r = Zs(function(t, e) {
				var i = t.length;
				if ("undefined" != typeof TextEncoder) return new TextEncoder().encode(t);
				for (var r = new xs(t.length + (t.length >>> 1)), s = 0, n = function(t) {
					r[s++] = t;
				}, o = 0; i > o; ++o) {
					if (s + 5 > r.length) {
						var a = new xs(s + 8 + (i - o << 1));
						a.set(r), r = a;
					}
					var l = t.charCodeAt(o);
					128 > l ? n(l) : 2048 > l ? (n(192 | l >>> 6), n(128 | 63 & l)) : l > 55295 && 57344 > l ? (n(240 | (l = 65536 + (1047552 & l) | 1023 & t.charCodeAt(++o)) >>> 18), n(128 | l >>> 12 & 63), n(128 | l >>> 6 & 63), n(128 | 63 & l)) : (n(224 | l >>> 12), n(128 | l >>> 6 & 63), n(128 | 63 & l));
				}
				return zs(r, 0, s);
			}(on(e)), { mtime: 0 });
			return {
				contentType: en,
				body: r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength),
				estimatedSize: r.byteLength
			};
		}
		if (i === ws.Base64) {
			var n = ((t) => "data=" + encodeURIComponent("string" == typeof t ? t : on(t)))(function(t) {
				return t ? btoa(encodeURIComponent(t).replace(/%([0-9A-F]{2})/g, ((t, e) => String.fromCharCode(parseInt(e, 16))))) : t;
			}(on(e)));
			return {
				contentType: "application/x-www-form-urlencoded",
				body: n,
				estimatedSize: new Blob([n]).size
			};
		}
		var o = on(e);
		return {
			contentType: "application/json",
			body: o,
			estimatedSize: new Blob([o]).size
		};
	}
}, ln = (t) => {
	var e, i, r, s = an(t);
	return !s || (i = t.compression, r = Dr(t.url, "compression"), i !== m.GZipJS && r !== m.GZipJS && "gzip" !== r) || ((e = s.body) instanceof ArrayBuffer ? w(new Uint8Array(e)) : ArrayBuffer.isView(e) && w(new Uint8Array(e.buffer, e.byteOffset, e.byteLength))) ? {
		url: t.url,
		encodedBody: s
	} : (rn = !0, {
		url: sn(t.url, "compression"),
		encodedBody: an(f({}, t, {
			compression: void 0,
			tr: void 0
		}))
	});
}, un = function() {
	var t = p((function* (t) {
		var i = yield function(t, e, i) {
			return T.apply(this, arguments);
		}(on(t.data), v.DEBUG, { rethrow: !0 });
		if (!i) return t;
		var r = yield i.arrayBuffer();
		return f({}, t, { tr: {
			contentType: en,
			body: r,
			estimatedSize: r.byteLength
		} });
	}));
	return function(e) {
		return t.apply(this, arguments);
	};
}(), hn = (t, e) => nn(t, {
	_: (/* @__PURE__ */ new Date()).getTime().toString(),
	ver: v.JS_SDK_VERSION,
	compression: e
}), dn = [];
n && dn.push({
	transport: "fetch",
	method(t) {
		var e, { url: i, encodedBody: r } = ln(t), { contentType: s, body: o, estimatedSize: l } = null != r ? r : {}, u = new Headers();
		Ki(t.headers, (function(t, e) {
			u.append(e, t);
		})), s && u.append("Content-Type", s);
		var h = null;
		if (a) {
			var d = new a();
			h = {
				signal: d.signal,
				timeout: setTimeout((() => d.abort()), t.timeout)
			};
		}
		n(i, f({
			method: (null == t ? void 0 : t.method) || "GET",
			headers: u,
			keepalive: "POST" === t.method && 52428.8 > (l || 0),
			body: o,
			signal: null == (e = h) ? void 0 : e.signal
		}, t.fetchOptions)).then(((e) => e.text().then(((i) => {
			var r = {
				statusCode: e.status,
				text: i
			};
			if (200 === e.status) try {
				r.json = JSON.parse(i);
			} catch (t) {
				Le.error(t);
			}
			null == t.callback || t.callback(r);
		})))).catch(((e) => {
			Le.error(e), null == t.callback || t.callback({
				statusCode: 0,
				error: e
			});
		})).finally((() => h ? clearTimeout(h.timeout) : null));
	}
}), o && dn.push({
	transport: "XHR",
	method(t) {
		var e = new o(), { url: i, encodedBody: r } = ln(t);
		e.open(t.method || "GET", i, !0);
		var { contentType: s, body: n } = null != r ? r : {};
		Ki(t.headers, (function(t, i) {
			e.setRequestHeader(i, t);
		})), s && e.setRequestHeader("Content-Type", s), t.timeout && (e.timeout = t.timeout), t.disableXHRCredentials || (e.withCredentials = !0), e.onreadystatechange = () => {
			if (4 === e.readyState) {
				var i = {
					statusCode: e.status,
					text: e.responseText
				};
				if (200 === e.status) try {
					i.json = JSON.parse(e.responseText);
				} catch (t) {}
				null == t.callback || t.callback(i);
			}
		}, e.send(n);
	}
}), null != i && i.sendBeacon && dn.push({
	transport: "sendBeacon",
	method(t) {
		try {
			var { url: e, encodedBody: r } = ln(t), s = nn(e, { beacon: "1" }), { contentType: n, body: o } = null != r ? r : {};
			if (!o) return;
			var a = o instanceof Blob ? o : new Blob([o], { type: n });
			i.sendBeacon(s, a);
		} catch (t) {}
	}
});
var vn = 3e3;
var cn = class {
	constructor(t, e) {
		this.Ar = !0, this.Nr = [], this.$r = et((null == e ? void 0 : e.flush_interval_ms) || vn, 250, 5e3, Le.createLogger("flush interval"), vn), this.Dr = t;
	}
	enqueue(t) {
		this.Nr.push(t), this.qr || this.jr();
	}
	unload() {
		this.Hr();
		var t = this.Nr.length > 0 ? this.Ur() : {}, e = Object.values(t);
		[...e.filter(((t) => 0 === t.url.indexOf("/e"))), ...e.filter(((t) => 0 !== t.url.indexOf("/e")))].map(((t) => {
			this.Dr(f({}, t, { transport: "sendBeacon" }));
		}));
	}
	enable() {
		this.Ar = !1, this.jr();
	}
	jr() {
		var t = this;
		this.Ar || (this.qr = setTimeout((() => {
			if (this.Hr(), this.Nr.length > 0) {
				var e = this.Ur(), i = function() {
					var i = e[r], s = (/* @__PURE__ */ new Date()).getTime();
					i.data && M(i.data) && Ki(i.data, ((t) => {
						t.offset = Math.abs(t.timestamp - s), delete t.timestamp;
					})), t.Dr(i);
				};
				for (var r in e) i();
			}
		}), this.$r));
	}
	Hr() {
		clearTimeout(this.qr), this.qr = void 0;
	}
	Ur() {
		var t = {};
		return Ki(this.Nr, ((e) => {
			var i, r = e, s = (r ? r.batchKey : null) || r.url;
			N(t[s]) && (t[s] = f({}, r, { data: [] })), null == (i = t[s].data) || i.push(r.data);
		})), this.Nr = [], t;
	}
};
var pn = ["retriesPerformedSoFar"];
var fn = class {
	constructor(e) {
		this.Br = !1, this.zr = 3e3, this.Nr = [], this._instance = e, this.Nr = [], this.Vr = !0, !N(t) && "onLine" in t.navigator && (this.Vr = t.navigator.onLine, this.Wr = () => {
			this.Vr = !0, this.Zr();
		}, this.Gr = () => {
			this.Vr = !1;
		}, sr(t, "online", this.Wr), sr(t, "offline", this.Gr));
	}
	get length() {
		return this.Nr.length;
	}
	retriableRequest(t) {
		var { retriesPerformedSoFar: e } = t, i = _(t, pn);
		V(e) && (i.url = nn(i.url, { retry_count: e })), this._instance._send_request(f({}, i, { callback: (t) => {
			200 === t.statusCode || t.statusCode >= 400 && 500 > t.statusCode || (null != e ? e : 0) >= 10 ? null == i.callback || i.callback(t) : this.Qr(f({ retriesPerformedSoFar: e }, i));
		} }));
	}
	Qr(t) {
		var e = t.retriesPerformedSoFar || 0;
		t.retriesPerformedSoFar = e + 1;
		var i = function(t) {
			var e = 3e3 * Math.pow(2, t), i = e / 2, r = Math.min(18e5, e), s = Math.random() - .5;
			return Math.ceil(r + s * (r - i));
		}(e), r = Date.now() + i;
		this.Nr.push({
			retryAt: r,
			requestOptions: t
		});
		var s = "Enqueued failed request for retry in " + i;
		navigator.onLine || (s += " (Browser is offline)"), Le.warn(s), this.Br || (this.Br = !0, this.Jr());
	}
	Jr() {
		if (this.Kr && clearTimeout(this.Kr), 0 === this.Nr.length) return this.Br = !1, void (this.Kr = void 0);
		this.Kr = setTimeout((() => {
			this.Vr && this.Nr.length > 0 && this.Zr(), this.Jr();
		}), this.zr);
	}
	Zr() {
		var t = Date.now(), e = [], i = this.Nr.filter(((i) => t > i.retryAt || (e.push(i), !1)));
		if (this.Nr = e, i.length > 0) for (var { requestOptions: r } of i) this.retriableRequest(r);
	}
	unload() {
		for (var { requestOptions: e } of (this.Kr && (clearTimeout(this.Kr), this.Kr = void 0), this.Br = !1, N(t) || (this.Wr && (t.removeEventListener("online", this.Wr), this.Wr = void 0), this.Gr && (t.removeEventListener("offline", this.Gr), this.Gr = void 0)), this.Nr)) try {
			this._instance._send_request(f({}, e, { transport: "sendBeacon" }));
		} catch (t) {
			Le.error(t);
		}
		this.Nr = [];
	}
};
var _n = class {
	constructor(t) {
		this.Yr = () => {
			var t, e, i, r;
			this.Xr || (this.Xr = {});
			var s = this.scrollElement(), n = this.scrollY(), o = s ? Math.max(0, s.scrollHeight - s.clientHeight) : 0, a = n + ((null == s ? void 0 : s.clientHeight) || 0), l = (null == s ? void 0 : s.scrollHeight) || 0;
			this.Xr.lastScrollY = Math.ceil(n), this.Xr.maxScrollY = Math.max(n, null !== (t = this.Xr.maxScrollY) && void 0 !== t ? t : 0), this.Xr.maxScrollHeight = Math.max(o, null !== (e = this.Xr.maxScrollHeight) && void 0 !== e ? e : 0), this.Xr.lastContentY = a, this.Xr.maxContentY = Math.max(a, null !== (i = this.Xr.maxContentY) && void 0 !== i ? i : 0), this.Xr.maxContentHeight = Math.max(l, null !== (r = this.Xr.maxContentHeight) && void 0 !== r ? r : 0);
		}, this._instance = t;
	}
	get ei() {
		return this._instance.config.scroll_root_selector;
	}
	getContext() {
		return this.Xr;
	}
	resetContext() {
		var t = this.Xr;
		return setTimeout(this.Yr, 0), t;
	}
	startMeasuringScrollPosition() {
		sr(t, "scroll", this.Yr, { capture: !0 }), sr(t, "scrollend", this.Yr, { capture: !0 }), sr(t, "resize", this.Yr);
	}
	scrollElement() {
		if (!this.ei) return null == t ? void 0 : t.document.documentElement;
		for (var i of M(this.ei) ? this.ei : [this.ei]) {
			var r = null == t ? void 0 : t.document.querySelector(i);
			if (r) return r;
		}
	}
	scrollY() {
		if (this.ei) {
			var e = this.scrollElement();
			return e && e.scrollTop || 0;
		}
		return t && (t.scrollY || t.pageYOffset || t.document.documentElement.scrollTop) || 0;
	}
	scrollX() {
		if (this.ei) {
			var e = this.scrollElement();
			return e && e.scrollLeft || 0;
		}
		return t && (t.scrollX || t.pageXOffset || t.document.documentElement.scrollLeft) || 0;
	}
};
var gn = (t) => Kr(null == t ? void 0 : t.config.mask_personal_data_properties, null == t ? void 0 : t.config.custom_personal_data_properties);
var mn = class {
	constructor(t, e, i, r) {
		this.ti = (t) => {
			var e = this.ri();
			if (!e || e.sessionId !== t) {
				var i = {
					sessionId: t,
					props: this.ii(this._instance)
				};
				this.ni.register({ [Ti]: i });
			}
		}, this._instance = t, this.si = e, this.ni = i, this.ii = r || gn, this.si.onSessionId(this.ti);
	}
	ri() {
		return this.ni.props[Ti];
	}
	getSetOnceProps() {
		var t, e = null == (t = this.ri()) ? void 0 : t.props;
		return e ? "r" in e ? Xr(e) : {
			$referring_domain: e.referringDomain,
			$pathname: e.initialPathName,
			utm_source: e.utm_source,
			utm_campaign: e.utm_campaign,
			utm_medium: e.utm_medium,
			utm_content: e.utm_content,
			utm_term: e.utm_term
		} : {};
	}
	getSessionProps() {
		var t = {};
		return Ki(er(this.getSetOnceProps()), ((e, i) => {
			"$current_url" === i && (i = "url"), t["$session_entry_" + I(i)] = e;
		})), t;
	}
};
var bn = class {
	constructor() {
		this.oi = {};
	}
	on(t, e) {
		return this.oi[t] || (this.oi[t] = []), this.oi[t].push(e), () => {
			this.oi[t] = this.oi[t].filter(((t) => t !== e));
		};
	}
	emit(t, e) {
		for (var i of this.oi[t] || []) i(e);
		for (var r of this.oi["*"] || []) r(t, e);
	}
};
var yn = Ne("[SessionId]");
var wn = class {
	on(t, e) {
		return this.ai.on(t, e);
	}
	constructor(t, e, i) {
		var r;
		if (this.ui = [], this.li = void 0, this.ai = new bn(), this.hi = (t, e) => !(!V(t) || !V(e)) && Math.abs(t - e) > this.sessionTimeoutMs, !t.persistence) throw new Error("SessionIdManager requires a PostHogPersistence instance");
		if (t.config.cookieless_mode === Ni) throw new Error("SessionIdManager cannot be used with cookieless_mode=\"always\"");
		this.qt = t.config, this.ni = t.persistence, this.ci = void 0, this.di = void 0, this._sessionStartTimestamp = null, this._sessionActivityTimestamp = null, this.vi = e || dr, this.fi = i || dr;
		var s = this.qt.persistence_name || this.qt.token;
		if (this._sessionTimeoutMs = 1e3 * et(this.qt.session_idle_timeout_seconds || 1800, 60, 36e3, yn.createLogger("session_idle_timeout_seconds"), 1800), t.register({ $configured_session_timeout_ms: this._sessionTimeoutMs }), this.pi(), this.gi = "ph_" + s + "_window_id", this.mi = "ph_" + s + "_primary_window_exists", this.yi()) {
			var n = xr.F(this.gi), o = xr.F(this.mi);
			n && !o ? this.ci = n : xr.q(this.gi), xr.N(this.mi, !0);
		}
		if (null != (r = this.qt.bootstrap) && r.sessionID) try {
			var a = ((t) => {
				var e = this.qt.bootstrap.sessionID.replace(/-/g, "");
				if (32 !== e.length) throw new Error("Not a valid UUID");
				if ("7" !== e[12]) throw new Error("Not a UUIDv7");
				return parseInt(e.substring(0, 12), 16);
			})();
			this.bi(this.qt.bootstrap.sessionID, (/* @__PURE__ */ new Date()).getTime(), a);
		} catch (t) {
			yn.error("Invalid sessionID in bootstrap", t);
		}
		this.wi();
	}
	get sessionTimeoutMs() {
		return this._sessionTimeoutMs;
	}
	onSessionId(t) {
		return N(this.ui) && (this.ui = []), this.ui.push(t), this.di && t(this.di, this.ci), () => {
			this.ui = this.ui.filter(((e) => e !== t));
		};
	}
	yi() {
		return "memory" !== this.qt.persistence && !this.ni._r && xr.R();
	}
	xi(t) {
		t !== this.ci && (this.ci = t, this.yi() && xr.N(this.gi, t));
	}
	Si() {
		return this.ci ? this.ci : this.yi() ? xr.F(this.gi) : null;
	}
	bi(t, e, i) {
		t === this.di && e === this._sessionActivityTimestamp && i === this._sessionStartTimestamp || (this._sessionStartTimestamp = i, this._sessionActivityTimestamp = e, this.di = t, this.ni.register({ [oi]: [
			e,
			t,
			i
		] }));
	}
	ki() {
		var t = this.ni.props[oi];
		return M(t) && 2 === t.length && t.push(t[0]), t || [
			0,
			null,
			0
		];
	}
	resetSessionId() {
		this.bi(null, null, null);
	}
	destroy() {
		clearTimeout(this.Ci), this.Ci = void 0, this.li && t && (t.removeEventListener(qi, this.li, { capture: !1 }), this.li = void 0), this.ui = [];
	}
	wi() {
		this.li = () => {
			this.yi() && xr.q(this.mi);
		}, sr(t, qi, this.li, { capture: !1 });
	}
	checkAndGetSessionAndWindowId(t, e) {
		if (void 0 === t && (t = !1), void 0 === e && (e = null), this.qt.cookieless_mode === Ni) throw new Error("checkAndGetSessionAndWindowId should not be called with cookieless_mode=\"always\"");
		var i = e || (/* @__PURE__ */ new Date()).getTime(), [r, s, n] = this.ki(), o = this.Si(), a = V(n) && Math.abs(i - n) > 864e5, l = !1, u = !s, h = !u && !t && this.hi(i, r);
		u || h || a ? (s = this.vi(), o = this.fi(), yn.info("new session ID generated", {
			sessionId: s,
			windowId: o,
			changeReason: {
				noSessionId: u,
				activityTimeout: h,
				sessionPastMaximumLength: a
			}
		}), n = i, l = !0) : o || (o = this.fi(), l = !0);
		var d = V(r) && t && !a ? r : i, v = V(n) ? n : (/* @__PURE__ */ new Date()).getTime();
		return this.xi(o), this.bi(s, d, v), t || this.pi(), l && this.ui.forEach(((t) => t(s, o, l ? {
			noSessionId: u,
			activityTimeout: h,
			sessionPastMaximumLength: a
		} : void 0))), {
			sessionId: s,
			windowId: o,
			sessionStartTimestamp: v,
			changeReason: l ? {
				noSessionId: u,
				activityTimeout: h,
				sessionPastMaximumLength: a
			} : void 0,
			lastActivityTimestamp: r
		};
	}
	pi() {
		clearTimeout(this.Ci), this.Ci = setTimeout((() => {
			var [t] = this.ki();
			if (this.hi((/* @__PURE__ */ new Date()).getTime(), t)) {
				var e = this.di;
				this.resetSessionId(), this.ai.emit("forcedIdleReset", { idleSessionId: e });
			}
		}), 1.1 * this.sessionTimeoutMs);
	}
};
var xn = function(t, e) {
	if (!t) return !1;
	var i = t.userAgent;
	if (i && R(i, e)) return !0;
	try {
		var r = null == t ? void 0 : t.userAgentData;
		if (null != r && r.brands && r.brands.some(((t) => R(null == t ? void 0 : t.brand, e)))) return !0;
	} catch (t) {}
	return !!t.webdriver;
}, En = function(t, e) {
	if (!function(t) {
		try {
			new RegExp(t);
		} catch (t) {
			return !1;
		}
		return !0;
	}(e)) return !1;
	try {
		return new RegExp(e).test(t);
	} catch (t) {
		return !1;
	}
};
function Sn(t, e, i) {
	return on({
		distinct_id: t,
		userPropertiesToSet: e,
		userPropertiesToSetOnce: i
	});
}
var $n = {
	exact: (t, e) => e.some(((e) => t.some(((t) => e === t)))),
	is_not: (t, e) => e.every(((e) => t.every(((t) => e !== t)))),
	regex: (t, e) => e.some(((e) => t.some(((t) => En(e, t))))),
	not_regex: (t, e) => e.every(((e) => t.every(((t) => !En(e, t))))),
	icontains: (t, e) => e.map(Tn).some(((e) => t.map(Tn).some(((t) => e.includes(t))))),
	not_icontains: (t, e) => e.map(Tn).every(((e) => t.map(Tn).every(((t) => !e.includes(t))))),
	gt: (t, e) => e.some(((e) => {
		var i = parseFloat(e);
		return !isNaN(i) && t.some(((t) => i > parseFloat(t)));
	})),
	lt: (t, e) => e.some(((e) => {
		var i = parseFloat(e);
		return !isNaN(i) && t.some(((t) => i < parseFloat(t)));
	}))
}, Tn = (t) => t.toLowerCase();
function kn(t, e) {
	return !t || Object.entries(t).every(((t) => {
		var [i, r] = t, s = null == e ? void 0 : e[i];
		if (N(s) || B(s)) return !1;
		var n = [String(s)], o = $n[r.operator];
		return !!o && o(r.values, n);
	}));
}
var Rn = "custom", Pn = "i.posthog.com", On = /^\/static\//;
var In = class {
	constructor(t) {
		this.Ii = {}, this.instance = t;
	}
	get apiHost() {
		var t = this.instance.config.api_host.trim().replace(/\/$/, "");
		return "https://app.posthog.com" === t ? "https://us.i.posthog.com" : t;
	}
	get flagsApiHost() {
		var t = this.instance.config.flags_api_host;
		return t ? t.trim().replace(/\/$/, "") : this.apiHost;
	}
	get uiHost() {
		var t, e = null == (t = this.instance.config.ui_host) ? void 0 : t.replace(/\/$/, "");
		return e || (e = this.apiHost.replace("." + Pn, ".posthog.com")), "https://app.posthog.com" === e ? "https://us.posthog.com" : e;
	}
	get region() {
		return this.Ii[this.apiHost] || (this.Ii[this.apiHost] = /https:\/\/(app|us|us-assets)(\.i)?\.posthog\.com/i.test(this.apiHost) ? "us" : /https:\/\/(eu|eu-assets)(\.i)?\.posthog\.com/i.test(this.apiHost) ? "eu" : Rn), this.Ii[this.apiHost];
	}
	Ti(t) {
		var e = this.instance.config.__preview_external_dependency_versioned_paths;
		if ("string" == typeof e && On.test(t)) return e.trim().replace(/\/$/, "") || void 0;
	}
	endpointFor(t, e) {
		if (void 0 === e && (e = ""), e && (e = "/" === e[0] ? e : "/" + e), "ui" === t) return this.uiHost + e;
		if ("flags" === t) return this.flagsApiHost + e;
		if ("assets" === t) {
			var i = this.Ti(e);
			if (i) return "" + i + e;
		}
		if (this.region === Rn) return this.apiHost + e;
		var r = Pn + e;
		switch (t) {
			case "assets": return "https://" + this.region + "-assets." + r;
			case "api": return "https://" + this.region + "." + r;
		}
	}
};
var Cn = Ne("[Surveys]"), An = "seenSurvey_", Fn = [
	os.Popover,
	os.Widget,
	os.API
], Mn = {
	ignoreConditions: !1,
	ignoreDelay: !1,
	displayType: vs.Popover
}, Dn = Ne("[PostHog ExternalIntegrations]"), Un = {
	intercom: "intercom-integration",
	crispChat: "crisp-chat-integration"
};
var Ln = class {
	constructor(t) {
		this._instance = t;
	}
	lr(t, e) {
		var i;
		null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, t, ((t) => {
			if (t) return Dn.error("failed to load script", t);
			e();
		}));
	}
	startIfEnabledOrStop() {
		var t = this, e = function(e) {
			var i, s, n;
			!r || null != (i = h.__PosthogExtensions__) && null != (i = i.integrations) && i[e] || t.lr(Un[e], (() => {
				var i;
				null == (i = h.__PosthogExtensions__) || null == (i = i.integrations) || null == (i = i[e]) || i.start(t._instance);
			})), !r && null != (s = h.__PosthogExtensions__) && null != (s = s.integrations) && s[e] && (null == (n = h.__PosthogExtensions__) || null == (n = n.integrations) || null == (n = n[e]) || n.stop());
		};
		for (var [i, r] of Object.entries(null !== (s = this._instance.config.integrations) && void 0 !== s ? s : {})) {
			var s;
			e(i);
		}
	}
};
var Nn, jn = {}, zn = 0, Bn = () => {}, Hn = "Consent opt in/out is not valid with cookieless_mode=\"always\" and will be ignored", qn = "Surveys module not available", Vn = "sanitize_properties is deprecated. Use before_send instead", Wn = "Invalid value for property_denylist config: ", Gn = "posthog", Yn = !tn && -1 === (null == u ? void 0 : u.indexOf("MSIE")) && -1 === (null == u ? void 0 : u.indexOf("Mozilla")), Jn = (e) => {
	var i;
	return f({
		api_host: "https://us.i.posthog.com",
		flags_api_host: null,
		ui_host: null,
		token: "",
		autocapture: !0,
		cross_subdomain_cookie: rr(null == r ? void 0 : r.location),
		persistence: "localStorage+cookie",
		persistence_name: "",
		cookie_persisted_properties: [],
		loaded: Bn,
		save_campaign_params: !0,
		custom_campaign_params: [],
		custom_blocked_useragents: [],
		save_referrer: !0,
		capture_pageleave: "if_capture_pageview",
		defaults: null != e ? e : "unset",
		__preview_deferred_init_extensions: !1,
		__preview_external_dependency_versioned_paths: !1,
		debug: s && j(null == s ? void 0 : s.search) && -1 !== s.search.indexOf("__posthog_debug=true") || !1,
		cookie_expiration: 365,
		upgrade: !1,
		disable_session_recording: !1,
		disable_persistence: !1,
		disable_web_experiments: !0,
		disable_surveys: !1,
		disable_surveys_automatic_display: !1,
		disable_conversations: !1,
		disable_product_tours: !1,
		disable_external_dependency_loading: !1,
		enable_recording_console_log: void 0,
		secure_cookie: "https:" === (null == t || null == (i = t.location) ? void 0 : i.protocol),
		ip: !1,
		opt_out_capturing_by_default: !1,
		opt_out_persistence_by_default: !1,
		opt_out_useragent_filter: !1,
		opt_out_capturing_persistence_type: "localStorage",
		consent_persistence_name: null,
		opt_out_capturing_cookie_prefix: null,
		opt_in_site_apps: !1,
		property_denylist: [],
		respect_dnt: !1,
		sanitize_properties: null,
		request_headers: {},
		request_batching: !0,
		properties_string_max_length: 65535,
		mask_all_element_attributes: !1,
		mask_all_text: !1,
		mask_personal_data_properties: !1,
		custom_personal_data_properties: [],
		advanced_disable_flags: !1,
		advanced_disable_decide: !1,
		advanced_disable_feature_flags: !1,
		advanced_disable_feature_flags_on_first_load: !1,
		advanced_only_evaluate_survey_feature_flags: !1,
		advanced_feature_flags_dedup_per_session: !1,
		advanced_enable_surveys: !1,
		advanced_disable_toolbar_metrics: !1,
		feature_flag_request_timeout_ms: 3e3,
		surveys_request_timeout_ms: 1e4,
		on_request_error(t) {
			Le.error("Bad HTTP status: " + t.statusCode + " " + t.text);
		},
		get_device_id: (t) => t,
		capture_performance: void 0,
		name: "posthog",
		bootstrap: {},
		disable_compression: !1,
		session_idle_timeout_seconds: 1800,
		person_profiles: Bi,
		before_send: void 0,
		request_queue_config: { flush_interval_ms: vn },
		error_tracking: {},
		_onCapture: Bn,
		__preview_eager_load_replay: !1
	}, ((t) => ({
		rageclick: !t || "2025-11-30" > t || { content_ignorelist: !0 },
		capture_pageview: !t || "2025-05-24" > t || "history_change",
		session_recording: t && t >= "2025-11-30" ? { strictMinimumDuration: !0 } : {},
		external_scripts_inject_target: t && t >= "2026-01-30" ? "head" : "body",
		internal_or_test_user_hostname: t && t >= "2026-01-30" ? /^(localhost|127\.0\.0\.1)$/ : void 0
	}))(e));
}, Kn = [
	["process_person", "person_profiles"],
	["xhr_headers", "request_headers"],
	["cookie_name", "persistence_name"],
	["disable_cookie", "disable_persistence"],
	["store_google", "save_campaign_params"],
	["verbose", "debug"]
], Xn = (t) => {
	var e = {};
	for (var [i, r] of Kn) N(t[i]) || (e[r] = t[i]);
	var s = Xi({}, e, t);
	return M(t.property_blacklist) && (N(t.property_denylist) ? s.property_denylist = t.property_blacklist : M(t.property_denylist) ? s.property_denylist = [...t.property_blacklist, ...t.property_denylist] : Le.error(Wn + t.property_denylist)), s;
};
var Qn = class {
	constructor() {
		this.__forceAllowLocalhost = !1;
	}
	get Ei() {
		return this.__forceAllowLocalhost;
	}
	set Ei(t) {
		Le.error("WebPerformanceObserver is deprecated and has no impact on network capture. Use `_forceAllowLocalhostNetworkCapture` on `posthog.sessionRecording`"), this.__forceAllowLocalhost = t;
	}
};
var Zn = class Zn {
	Mi(t, e) {
		if (t) {
			var i = this.Pi.indexOf(t);
			-1 !== i && this.Pi.splice(i, 1);
		}
		return this.Pi.push(e), null == e.initialize || e.initialize(), e;
	}
	Ri() {
		return this.config.cookieless_mode === Ni || this.config.cookieless_mode === Li && this.consent.isRejected();
	}
	get decideEndpointWasHit() {
		var t, e;
		return null !== (t = null == (e = this.featureFlags) ? void 0 : e.hasLoadedFlags) && void 0 !== t && t;
	}
	get flagsEndpointWasHit() {
		var t, e;
		return null !== (t = null == (e = this.featureFlags) ? void 0 : e.hasLoadedFlags) && void 0 !== t && t;
	}
	constructor() {
		var t;
		this.webPerformance = new Qn(), this.Oi = !1, this.version = v.LIB_VERSION, this.Li = new bn(), this.Pi = [], this._calculate_event_properties = this.calculateEventProperties.bind(this), this.config = Jn(), this.SentryIntegration = Ir, this.sentryIntegration = (t) => function(t, e) {
			var i = Or(t, e);
			return {
				name: Pr,
				processEvent: (t) => i(t)
			};
		}(this, t), this.__request_queue = [], this.__loaded = !1, this.analyticsDefaultEndpoint = "/e/", this.Fi = !1, this.Ai = null, this.Ni = null, this.$i = null, this.scrollManager = new _n(this), this.pageViewManager = new Cr(this), this.rateLimiter = new gs(this), this.requestRouter = new In(this), this.consent = new Er(this), this.externalIntegrations = new Ln(this);
		var e = null !== (t = Zn.__defaultExtensionClasses) && void 0 !== t ? t : {};
		this.featureFlags = e.featureFlags && new e.featureFlags(this), this.toolbar = e.toolbar && new e.toolbar(this), this.surveys = e.surveys && new e.surveys(this), this.conversations = e.conversations && new e.conversations(this), this.logs = e.logs && new e.logs(this), this.experiments = e.experiments && new e.experiments(this), this.exceptions = e.exceptions && new e.exceptions(this), this.people = {
			set: (t, e, i) => {
				var r = j(t) ? { [t]: e } : t;
				this.setPersonProperties(r), i?.({});
			},
			set_once: (t, e, i) => {
				var r = j(t) ? { [t]: e } : t;
				this.setPersonProperties(void 0, r), i?.({});
			}
		}, this.on("eventCaptured", ((t) => Le.info("send \"" + (null == t ? void 0 : t.event) + "\"", t)));
	}
	init(t, e, i) {
		if (i && i !== Gn) {
			var r, s = null !== (r = jn[i]) && void 0 !== r ? r : new Zn();
			return s._init(t, e, i), jn[i] = s, jn[Gn][i] = s, s;
		}
		return this._init(t, e, i);
	}
	_init(e, i, r) {
		var s, n;
		if (void 0 === i && (i = {}), N(e) || z(e)) return Le.critical("PostHog was initialized without a token. This likely indicates a misconfiguration. Please check the first argument passed to posthog.init()"), this;
		if (this.__loaded) return console.warn("[PostHog.js]", "You have already initialized PostHog! Re-initializing is a no-op"), this;
		this.__loaded = !0, this.config = {}, i.debug = this.Di(i.debug), this.qi = i, this.ji = [], i.person_profiles ? this.Ni = i.person_profiles : i.process_person && (this.Ni = i.process_person), this.set_config(Xi({}, Jn(i.defaults), Xn(i), {
			name: r,
			token: e
		})), this.config.on_xhr_error && Le.error("on_xhr_error is deprecated. Use on_request_error instead"), this.compression = i.disable_compression ? void 0 : ws.GZipJS;
		var o = this.Hi();
		this.persistence = new es(this.config, o), this.sessionPersistence = "sessionStorage" === this.config.persistence || "memory" === this.config.persistence ? this.persistence : new es(f({}, this.config, { persistence: "sessionStorage" }), o);
		var a = f({}, this.persistence.props), l = f({}, this.sessionPersistence.props);
		this.register({ $initialization_time: (/* @__PURE__ */ new Date()).toISOString() }), this.Ui = new cn(((t) => this.Bi(t)), this.config.request_queue_config), this.zi = new fn(this), this.__request_queue = [];
		var u = this.Ri();
		if (u || (this.sessionManager = new wn(this), this.sessionPropsManager = new mn(this, this.sessionManager, this.persistence)), this.config.__preview_deferred_init_extensions ? (Le.info("Deferring extension initialization to improve startup performance"), setTimeout((() => {
			this.Vi(u);
		}), 0)) : (Le.info("Initializing extensions synchronously"), this.Vi(u)), v.DEBUG = v.DEBUG || this.config.debug, v.DEBUG && Le.info("Starting in debug mode", {
			this: this,
			config: i,
			thisC: f({}, this.config),
			p: a,
			s: l
		}), !this.config.identity_distinct_id || null != (s = i.bootstrap) && s.distinctID || (i.bootstrap = f({}, i.bootstrap, {
			distinctID: this.config.identity_distinct_id,
			isIdentifiedID: !0
		})), void 0 !== (null == (n = i.bootstrap) ? void 0 : n.distinctID)) {
			var h = i.bootstrap.distinctID, d = this.get_distinct_id(), c = this.persistence.get_property($i);
			if (i.bootstrap.isIdentifiedID && null != d && d !== h && c === ji) this.identify(h);
			else if (i.bootstrap.isIdentifiedID && null != d && d !== h && c === zi) Le.warn("Bootstrap distinctID differs from an already-identified user. The existing identity is preserved. Call reset() before reinitializing if you intend to switch users.");
			else {
				var p = this.config.get_device_id(dr()), _ = i.bootstrap.isIdentifiedID ? p : h;
				this.persistence.set_property($i, i.bootstrap.isIdentifiedID ? zi : ji), this.register({
					distinct_id: h,
					$device_id: _
				});
			}
		}
		if (u) this.register_once({
			distinct_id: Ai,
			$device_id: null
		}, "");
		else if (!this.get_distinct_id()) {
			var g = this.config.get_device_id(dr());
			this.register_once({
				distinct_id: g,
				$device_id: g
			}, ""), this.persistence.set_property($i, ji);
		}
		return sr(t, "onpagehide" in self ? "pagehide" : "unload", this._handle_unload.bind(this), { passive: !1 }), i.segment ? function(t, e) {
			var i = t.config.segment;
			if (!i) return e();
			(function(t, e) {
				var i = t.config.segment;
				if (!i) return e();
				var r = (i) => {
					var r = () => i.anonymousId() || dr();
					t.config.get_device_id = r, i.id() && (t.register({
						distinct_id: i.id(),
						$device_id: r()
					}), t.persistence.set_property($i, zi)), e();
				}, s = i.user();
				"then" in s && D(s.then) ? s.then(r) : r(s);
			})(t, (() => {
				i.register(((t) => {
					Promise && Promise.resolve || Rr.warn("This browser does not have Promise support, and can not use the segment integration");
					var e = (e, i) => {
						if (!i) return e;
						e.event.userId || e.event.anonymousId === t.get_distinct_id() || (Rr.info("No userId set, resetting PostHog"), t.reset()), e.event.userId && e.event.userId !== t.get_distinct_id() && (Rr.info("UserId set, identifying with PostHog"), t.identify(e.event.userId));
						var r = t.calculateEventProperties(i, e.event.properties);
						return e.event.properties = Object.assign({}, r, e.event.properties), e;
					};
					return {
						name: "PostHog JS",
						type: "enrichment",
						version: "1.0.0",
						isLoaded: () => !0,
						load: () => Promise.resolve(),
						track: (t) => e(t, t.event.event),
						page: (t) => e(t, Vi),
						identify: (t) => e(t, Gi),
						screen: (t) => e(t, "$screen")
					};
				})(t)).then((() => {
					e();
				}));
			}));
		}(this, (() => this.Wi())) : this.Wi(), D(this.config._onCapture) && this.config._onCapture !== Bn && (Le.warn("onCapture is deprecated. Please use `before_send` instead"), this.on("eventCaptured", ((t) => this.config._onCapture(t.event, t)))), this.config.ip && Le.warn("The `ip` config option has NO EFFECT AT ALL and has been deprecated. Use a custom transformation or \"Discard IP data\" project setting instead. See https://posthog.com/tutorials/web-redact-properties#hiding-customer-ip-address for more information."), this;
	}
	Vi(t) {
		var e, i, r, s, n, o, a, l = performance.now(), u = f({}, Zn.__defaultExtensionClasses, this.config.__extensionClasses), h = [];
		u.featureFlags && this.Pi.push(this.featureFlags = null !== (e = this.featureFlags) && void 0 !== e ? e : new u.featureFlags(this)), u.exceptions && this.Pi.push(this.exceptions = null !== (i = this.exceptions) && void 0 !== i ? i : new u.exceptions(this)), u.historyAutocapture && this.Pi.push(this.historyAutocapture = new u.historyAutocapture(this)), u.tracingHeaders && this.Pi.push(new u.tracingHeaders(this)), u.siteApps && this.Pi.push(this.siteApps = new u.siteApps(this)), u.sessionRecording && !t && this.Pi.push(this.sessionRecording = new u.sessionRecording(this)), this.config.disable_scroll_properties || h.push((() => {
			this.scrollManager.startMeasuringScrollPosition();
		})), u.autocapture && this.Pi.push(this.autocapture = new u.autocapture(this)), u.surveys && this.Pi.push(this.surveys = null !== (r = this.surveys) && void 0 !== r ? r : new u.surveys(this)), u.logs && this.Pi.push(this.logs = null !== (s = this.logs) && void 0 !== s ? s : new u.logs(this)), u.conversations && this.Pi.push(this.conversations = null !== (n = this.conversations) && void 0 !== n ? n : new u.conversations(this)), u.productTours && this.Pi.push(this.productTours = new u.productTours(this)), u.heatmaps && this.Pi.push(this.heatmaps = new u.heatmaps(this)), u.webVitalsAutocapture && this.Pi.push(this.webVitalsAutocapture = new u.webVitalsAutocapture(this)), u.exceptionObserver && this.Pi.push(this.exceptionObserver = new u.exceptionObserver(this)), u.deadClicksAutocapture && this.Pi.push(this.deadClicksAutocapture = new u.deadClicksAutocapture(this, Tr)), u.toolbar && this.Pi.push(this.toolbar = null !== (o = this.toolbar) && void 0 !== o ? o : new u.toolbar(this)), u.experiments && this.Pi.push(this.experiments = null !== (a = this.experiments) && void 0 !== a ? a : new u.experiments(this)), this.Pi.forEach(((t) => {
			t.initialize && h.push((() => {
				null == t.initialize || t.initialize();
			}));
		})), h.push((() => {
			if (this.Zi) {
				var t = this.Zi;
				this.Zi = void 0, this.Rr(t);
			}
		})), this.Gi(h, l);
	}
	Gi(t, e) {
		for (; t.length > 0;) {
			if (this.config.__preview_deferred_init_extensions && performance.now() - e >= 30 && t.length > 0) return void setTimeout((() => {
				this.Gi(t, e);
			}), 0);
			var i = t.shift();
			if (i) try {
				i();
			} catch (t) {
				Le.error("Error initializing extension:", t);
			}
		}
		var r = Math.round(performance.now() - e);
		this.register_for_session({
			[Fi]: this.config.__preview_deferred_init_extensions ? "deferred" : "synchronous",
			[Mi]: r
		}), this.config.__preview_deferred_init_extensions && Le.info("PostHog extensions initialized (" + r + "ms)");
	}
	Rr(t) {
		var e;
		if (!r || !r.body) return Le.info("document not ready yet, trying again in 500 milliseconds..."), void setTimeout((() => {
			this.Rr(t);
		}), 500);
		this.config.__preview_deferred_init_extensions && (this.Zi = t), this.Qi = t, this.compression = void 0, t.supportedCompression && !this.config.disable_compression && (this.compression = P(t.supportedCompression, ws.GZipJS) ? ws.GZipJS : P(t.supportedCompression, ws.Base64) ? ws.Base64 : void 0), null != (e = t.analytics) && e.endpoint && (this.analyticsDefaultEndpoint = t.analytics.endpoint), this.set_config({ person_profiles: this.Ni ? this.Ni : Bi }), this.Pi.forEach(((e) => null == e.onRemoteConfig ? void 0 : e.onRemoteConfig(t)));
	}
	Wi() {
		try {
			this.config.loaded(this);
		} catch (t) {
			Le.critical("`loaded` function failed", t);
		}
		if (this.Ji(), this.config.internal_or_test_user_hostname && null != s && s.hostname) {
			var t = s.hostname, e = this.config.internal_or_test_user_hostname;
			("string" == typeof e ? t === e : e.test(t)) && this.setInternalOrTestUser();
		}
		this.config.capture_pageview && setTimeout((() => {
			(this.consent.isOptedIn() || this.Ri()) && this.Ki();
		}), 1), this.Yi = new bs(this), this.Yi.load();
	}
	Ji() {
		var t;
		this.is_capturing() && this.config.request_batching && (null == (t = this.Ui) || t.enable());
	}
	_dom_loaded() {
		this.is_capturing() && Ji(this.__request_queue, ((t) => this.Bi(t))), this.__request_queue = [], this.Ji();
	}
	_handle_unload() {
		var t, e, i, r;
		null == (t = this.surveys) || t.handlePageUnload(), this.config.request_batching ? (this.Xi() && this.capture(Wi), null == (e = this.logs) || e.flushLogs("sendBeacon"), null == (i = this.Ui) || i.unload(), null == (r = this.zi) || r.unload()) : this.Xi() && this.capture(Wi, null, { transport: "sendBeacon" });
	}
	_send_request(t) {
		this.__loaded && (Yn ? this.__request_queue.push(t) : this.rateLimiter.isServerRateLimited(t.batchKey) || (t.transport = t.transport || this.config.api_transport, t.url = nn(t.url, { ip: this.config.ip ? 1 : 0 }), t.headers = f({}, this.config.request_headers, t.headers), t.compression = "best-available" === t.compression ? this.compression : t.compression, t.disableXHRCredentials = this.config.__preview_disable_xhr_credentials, this.config.__preview_disable_beacon && (t.disableTransport = ["sendBeacon"]), t.fetchOptions = t.fetchOptions || this.config.fetch_options, ((t) => {
			var e, i, r, s = f({}, t);
			s.timeout = s.timeout || 6e4, s.url = hn(s.url, s.compression);
			var n = null !== (e = s.transport) && void 0 !== e ? e : "fetch", o = dn.filter(((t) => !s.disableTransport || !t.transport || !s.disableTransport.includes(t.transport))), a = null !== (i = null == (r = function(t, e) {
				for (var i = 0; t.length > i; i++) if (t[i].transport === n) return t[i];
			}(o)) ? void 0 : r.method) && void 0 !== i ? i : o[0].method;
			if (!a) throw new Error("No available transport method");
			"sendBeacon" !== n && s.data && s.compression === ws.GZipJS && l && !rn ? un(s).then(((t) => {
				a(t);
			})).catch(((e) => {
				if (x(e)) return rn = !0, void a(f({}, s, {
					compression: void 0,
					url: hn(t.url, void 0)
				}));
				((t) => {
					if (!t || "object" != typeof t) return !1;
					var e = "name" in t ? String(t.name) : "";
					return x(t) || e === y;
				})(e) && (rn = !0), a(s);
			})) : a(s);
		})(f({}, t, { callback: (e) => {
			var i, r;
			this.rateLimiter.checkForLimiting(e), 400 > e.statusCode || null == (i = (r = this.config).on_request_error) || i.call(r, e), null == t.callback || t.callback(e);
		} }))));
	}
	Bi(t) {
		this.zi ? this.zi.retriableRequest(t) : this._send_request(t);
	}
	_execute_array(t) {
		zn++;
		try {
			var e, i = [], r = [], s = [];
			Ji(t, ((t) => {
				if (t) if (M(e = t[0])) s.push(t);
				else if (D(t)) try {
					t.call(this);
				} catch (e) {
					Le.error("Error executing queued PostHog call", t, e);
				}
				else M(t) && "alias" === e ? i.push(t) : M(t) && -1 !== e.indexOf("capture") && D(this[e]) ? s.push(t) : r.push(t);
			}));
			var n = function(t, e) {
				Ji(t, (function(t) {
					try {
						if (M(t[0])) {
							var i = e;
							Ki(t, (function(t) {
								i = i[t[0]].apply(i, t.slice(1));
							}));
						} else e[t[0]].apply(e, t.slice(1));
					} catch (e) {
						Le.error("Error executing queued PostHog call", t, e);
					}
				}));
			};
			n(i, this), n(r, this), n(s, this);
		} finally {
			zn--;
		}
	}
	push(t) {
		if (zn > 0 && M(t) && j(t[0])) {
			var e = Zn.prototype[t[0]];
			D(e) && e.apply(this, t.slice(1));
		} else this._execute_array([t]);
	}
	capture(t, e, i) {
		var r, s, n, o, a;
		if (this.__loaded && this.persistence && this.sessionPersistence && this.Ui) {
			if (this.is_capturing()) if (!N(t) && j(t)) {
				var l = !this.config.opt_out_useragent_filter && this._is_bot();
				if (!l || this.config.__preview_capture_bot_pageviews) {
					var u = null != i && i.skip_client_rate_limiting ? void 0 : this.rateLimiter.clientRateLimitContext();
					if (null == u || !u.isRateLimited) {
						null != e && e.$current_url && !j(null == e ? void 0 : e.$current_url) && (Le.error("Invalid `$current_url` property provided to `posthog.capture`. Input must be a string. Ignoring provided value."), null == e || delete e.$current_url), "$exception" !== t || null != i && i.en || Le.warn("Using `posthog.capture('$exception')` is unreliable because it does not attach required metadata. Use `posthog.captureException(error)` instead, which attaches required metadata automatically."), this.sessionPersistence.update_search_keyword(), this.config.save_campaign_params && this.sessionPersistence.update_campaign_params(), this.config.save_referrer && this.sessionPersistence.update_referrer_info(), (this.config.save_campaign_params || this.config.save_referrer) && this.persistence.set_initial_person_info();
						var h = /* @__PURE__ */ new Date(), d = (null == i ? void 0 : i.timestamp) || h, v = (null == i ? void 0 : i.uuid) || dr(), c = {
							uuid: v,
							event: t,
							properties: this.calculateEventProperties(t, e || {}, d, v)
						};
						t === Vi && this.config.__preview_capture_bot_pageviews && l && (c.event = "$bot_pageview", c.properties.$browser_type = "bot"), u && (c.properties.$lib_rate_limit_remaining_tokens = u.remainingTokens), null != i && i.$set && (c.$set = null == i ? void 0 : i.$set);
						var p, _, g, m = this.tn(null == i ? void 0 : i.$set_once, t !== Yi, t === Gi);
						if (m && (c.$set_once = m), null != i && i._noTruncate || (s = this.config.properties_string_max_length, n = c, o = (t) => j(t) ? t.slice(0, s) : t, a = /* @__PURE__ */ new Set(), c = function t(e, i) {
							return e !== Object(e) ? o ? o(e) : e : a.has(e) ? void 0 : (a.add(e), M(e) ? (r = [], Ji(e, ((e) => {
								r.push(t(e));
							}))) : (r = {}, Ki(e, ((e, i) => {
								a.has(e) || (r[i] = t(e, i));
							}))), r);
							var r;
						}(n)), c.timestamp = d, N(null == i ? void 0 : i.timestamp) || (c.properties.$event_time_override_provided = !0, c.properties.$event_time_override_system_time = h), t === hs.DISMISSED || t === hs.SENT) {
							var b = null == e ? void 0 : e[ds.SURVEY_ID], y = null == e ? void 0 : e[ds.SURVEY_ITERATION];
							((t) => {
								try {
									var e = ((t) => ((t, e) => {
										var i = "" + An + e.id;
										return e.current_iteration && e.current_iteration > 0 && (i = "" + An + e.id + "_" + e.current_iteration), i;
									})(0, t))(t);
									if (localStorage.getItem(e)) return;
									localStorage.setItem(e, "true");
								} catch (t) {
									Cn.error("Failed to persist survey seen state", t);
								}
							})({
								id: b,
								current_iteration: y
							}), c.$set = f({}, c.$set, { [(p = {
								id: b,
								current_iteration: y
							}, _ = t === hs.SENT ? "responded" : "dismissed", g = "$survey_" + _ + "/" + p.id, p.current_iteration && p.current_iteration > 0 && (g = "$survey_" + _ + "/" + p.id + "/" + p.current_iteration), g)]: !0 });
						} else t === hs.SHOWN && (c.$set = f({}, c.$set, { [ds.SURVEY_LAST_SEEN_DATE]: (/* @__PURE__ */ new Date()).toISOString() }));
						if (t === ps.SHOWN) {
							var w = null == e ? void 0 : e[fs.TOUR_TYPE];
							w && (c.$set = f({}, c.$set, { [fs.TOUR_LAST_SEEN_DATE + "/" + w]: (/* @__PURE__ */ new Date()).toISOString() }));
						}
						var x = f({}, c.properties.$set, c.$set);
						if (L(x) || this.setPersonPropertiesForFlags(x), !H(this.config.before_send)) {
							var E = this.rn(c);
							if (!E) return;
							c = E;
						}
						this.Li.emit("eventCaptured", c);
						var S = {
							method: "POST",
							url: null !== (r = null == i ? void 0 : i._url) && void 0 !== r ? r : this.requestRouter.endpointFor("api", this.analyticsDefaultEndpoint),
							data: c,
							compression: "best-available",
							batchKey: null == i ? void 0 : i._batchKey
						};
						return !this.config.request_batching || i && (null == i || !i._batchKey) || null != i && i.send_instantly ? this.Bi(S) : this.Ui.enqueue(S), c;
					}
					Le.critical("This capture call is ignored due to client rate limiting.");
				}
			} else Le.error("No event name provided to posthog.capture");
		} else Le.uninitializedWarning("posthog.capture");
	}
	_addCaptureHook(t) {
		return this.on("eventCaptured", ((e) => t(e.event, e)));
	}
	calculateEventProperties(e, i, n, o, a) {
		if (n = n || /* @__PURE__ */ new Date(), !this.persistence || !this.sessionPersistence) return i;
		var l = a ? void 0 : this.persistence.remove_event_timer(e), h = f({}, i);
		if (h.token = this.config.token, h.$config_defaults = this.config.defaults, this.Ri() && (h.$cookieless_mode = !0), "$snapshot" === e) {
			var d = f({}, this.persistence.properties(), this.sessionPersistence.properties());
			return h.distinct_id = d.distinct_id, (!j(h.distinct_id) && !q(h.distinct_id) || z(h.distinct_id)) && Le.error("Invalid distinct_id for replay event. This indicates a bug in your implementation"), h;
		}
		var c, p = function(e, i) {
			var r, n, o, a;
			if (!u) return {};
			var l, h, d, c, p, f, _, g, m = e ? [...jr, ...i || []] : [], [b, y] = function(t) {
				for (var e = 0; Zt.length > e; e++) {
					var [i, r] = Zt[e], s = i.exec(t), n = s && (D(r) ? r(s, t) : r);
					if (n) return n;
				}
				return ["", ""];
			}(u);
			return Xi(er({
				$os: b,
				$os_version: y,
				$browser: Kt(u, navigator.vendor),
				$device: te(u),
				$device_type: (h = u, d = {
					userAgentDataPlatform: null == (r = navigator) || null == (r = r.userAgentData) ? void 0 : r.platform,
					maxTouchPoints: null == (n = navigator) ? void 0 : n.maxTouchPoints,
					screenWidth: null == t || null == (o = t.screen) ? void 0 : o.width,
					screenHeight: null == t || null == (a = t.screen) ? void 0 : a.height,
					devicePixelRatio: null == t ? void 0 : t.devicePixelRatio
				}, g = te(h), g === dt || g === ht || "Kobo" === g || "Kindle Fire" === g || g === zt ? ut : g === Ot || g === Ct || g === It || g === Lt ? "Console" : g === ct ? "Wearable" : g ? ot : "Android" === (null == d ? void 0 : d.userAgentDataPlatform) && (null !== (c = null == d ? void 0 : d.maxTouchPoints) && void 0 !== c ? c : 0) > 0 ? 600 > Math.min(null !== (p = null == d ? void 0 : d.screenWidth) && void 0 !== p ? p : 0, null !== (f = null == d ? void 0 : d.screenHeight) && void 0 !== f ? f : 0) / (null !== (_ = null == d ? void 0 : d.devicePixelRatio) && void 0 !== _ ? _ : 1) ? ot : ut : "Desktop"),
				$timezone: Qr(),
				$timezone_offset: Zr()
			}), {
				$current_url: Ur(null == s ? void 0 : s.href, m, Br),
				$host: null == s ? void 0 : s.host,
				$pathname: null == s ? void 0 : s.pathname,
				$raw_user_agent: u.length > 1e3 ? u.substring(0, 997) + "..." : u,
				$browser_version: Qt(u, navigator.vendor),
				$browser_language: Gr(),
				$browser_language_prefix: (l = Gr(), "string" == typeof l ? l.split("-")[0] : void 0),
				$screen_height: null == t ? void 0 : t.screen.height,
				$screen_width: null == t ? void 0 : t.screen.width,
				$viewport_height: null == t ? void 0 : t.innerHeight,
				$viewport_width: null == t ? void 0 : t.innerWidth,
				$lib: v.LIB_NAME,
				$lib_version: v.LIB_VERSION,
				$insert_id: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10),
				$time: Date.now() / 1e3
			});
		}(this.config.mask_personal_data_properties, this.config.custom_personal_data_properties);
		if (this.sessionManager) {
			var { sessionId: _, windowId: g } = this.sessionManager.checkAndGetSessionAndWindowId(a, n.getTime());
			h.$session_id = _, h.$window_id = g;
		}
		this.sessionPropsManager && Xi(h, this.sessionPropsManager.getSessionProps());
		try {
			var m;
			this.sessionRecording && Xi(h, this.sessionRecording.sdkDebugProperties), h.$sdk_debug_retry_queue_size = null == (m = this.zi) ? void 0 : m.length;
		} catch (t) {
			h.$sdk_debug_error_capturing_properties = String(t);
		}
		if (this.requestRouter.region === Rn && (h.$lib_custom_api_host = this.config.api_host), c = e !== Vi || a ? e !== Wi || a ? this.pageViewManager.doEvent() : this.pageViewManager.doPageLeave(n) : this.pageViewManager.doPageView(n, o), h = Xi(h, c), e === Vi && r && (h.title = r.title), !N(l)) {
			var b = n.getTime() - l;
			h.$duration = parseFloat((b / 1e3).toFixed(3));
		}
		u && this.config.opt_out_useragent_filter && (h.$browser_type = this._is_bot() ? "bot" : "browser"), (h = Xi({}, p, this.persistence.properties(), this.sessionPersistence.properties(), h)).$is_identified = this._isIdentified(), M(this.config.property_denylist) ? Ki(this.config.property_denylist, (function(t) {
			delete h[t];
		})) : Le.error(Wn + this.config.property_denylist + " or property_blacklist config: " + this.config.property_blacklist);
		var y = this.config.sanitize_properties;
		y && (Le.error(Vn), h = y(h, e));
		var w = this.nn();
		return h.$process_person_profile = w, w && !a && this.sn("_calculate_event_properties"), h;
	}
	tn(t, e, i) {
		var r;
		if (void 0 === e && (e = !0), void 0 === i && (i = !1), !this.persistence || !this.nn()) return t;
		if (this.Oi && !i) return t;
		var o = Xi({}, this.persistence.get_initial_props(), (null == (r = this.sessionPropsManager) ? void 0 : r.getSetOnceProps()) || {}, t || {}), a = this.config.sanitize_properties;
		return a && (Le.error(Vn), o = a(o, "$set_once")), e && (this.Oi = !0), L(o) ? void 0 : o;
	}
	register(t, e) {
		var i;
		null == (i = this.persistence) || i.register(t, e);
	}
	register_once(t, e, i) {
		var r;
		null == (r = this.persistence) || r.register_once(t, e, i);
	}
	register_for_session(t) {
		var e;
		null == (e = this.sessionPersistence) || e.register(t);
	}
	unregister(t) {
		var e;
		null == (e = this.persistence) || e.unregister(t);
	}
	unregister_for_session(t) {
		var e;
		null == (e = this.sessionPersistence) || e.unregister(t);
	}
	an(t, e) {
		this.register({ [t]: e });
	}
	getFeatureFlag(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.getFeatureFlag(t, e);
	}
	getFeatureFlagPayload(t) {
		var e;
		return null == (e = this.featureFlags) ? void 0 : e.getFeatureFlagPayload(t);
	}
	getFeatureFlagResult(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.getFeatureFlagResult(t, e);
	}
	isFeatureEnabled(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.isFeatureEnabled(t, e);
	}
	reloadFeatureFlags() {
		var t;
		null == (t = this.featureFlags) || t.reloadFeatureFlags();
	}
	updateFlags(t, e, i) {
		var r;
		null == (r = this.featureFlags) || r.updateFlags(t, e, i);
	}
	updateEarlyAccessFeatureEnrollment(t, e, i) {
		var r;
		null == (r = this.featureFlags) || r.updateEarlyAccessFeatureEnrollment(t, e, i);
	}
	getEarlyAccessFeatures(t, e, i) {
		var r;
		return void 0 === e && (e = !1), null == (r = this.featureFlags) ? void 0 : r.getEarlyAccessFeatures(t, e, i);
	}
	on(t, e) {
		return this.Li.on(t, e);
	}
	onFeatureFlags(t) {
		return this.featureFlags ? this.featureFlags.onFeatureFlags(t) : (t([], {}, { errorsLoading: !0 }), () => {});
	}
	onSurveysLoaded(t) {
		return this.surveys ? this.surveys.onSurveysLoaded(t) : (t([], {
			isLoaded: !1,
			error: qn
		}), () => {});
	}
	onSessionId(t) {
		var e, i;
		return null !== (e = null == (i = this.sessionManager) ? void 0 : i.onSessionId(t)) && void 0 !== e ? e : () => {};
	}
	getSurveys(t, e) {
		void 0 === e && (e = !1), this.surveys ? this.surveys.getSurveys(t, e) : t([], {
			isLoaded: !1,
			error: qn
		});
	}
	getActiveMatchingSurveys(t, e) {
		void 0 === e && (e = !1), this.surveys ? this.surveys.getActiveMatchingSurveys(t, e) : t([], {
			isLoaded: !1,
			error: qn
		});
	}
	renderSurvey(t, e) {
		var i;
		null == (i = this.surveys) || i.renderSurvey(t, e);
	}
	displaySurvey(t, e) {
		var i;
		void 0 === e && (e = Mn), null == (i = this.surveys) || i.displaySurvey(t, e);
	}
	cancelPendingSurvey(t) {
		var e;
		null == (e = this.surveys) || e.cancelPendingSurvey(t);
	}
	canRenderSurvey(t) {
		var e, i;
		return null !== (e = null == (i = this.surveys) ? void 0 : i.canRenderSurvey(t)) && void 0 !== e ? e : {
			visible: !1,
			disabledReason: qn
		};
	}
	canRenderSurveyAsync(t, e) {
		var i, r;
		return void 0 === e && (e = !1), null !== (i = null == (r = this.surveys) ? void 0 : r.canRenderSurveyAsync(t, e)) && void 0 !== i ? i : Promise.resolve({
			visible: !1,
			disabledReason: qn
		});
	}
	un(t) {
		return !t || z(t) ? (Le.critical("Unique user id has not been set in posthog.identify"), !1) : t === Ai ? (Le.critical("The string \"" + t + "\" was set in posthog.identify which indicates an error. This ID is only used as a sentinel value."), !1) : !["distinct_id", "distinctid"].includes(t.toLowerCase()) && !["undefined", "null"].includes(t.toLowerCase()) || (Le.critical("The string \"" + t + "\" was set in posthog.identify which indicates an error. This ID should be unique to the user and not a hardcoded string."), !1);
	}
	identify(t, e, i) {
		if (!this.__loaded || !this.persistence) return Le.uninitializedWarning("posthog.identify");
		if (q(t) && (t = t.toString(), Le.warn("The first argument to posthog.identify was a number, but it should be a string. It has been converted to a string.")), this.un(t) && this.sn("posthog.identify")) {
			var r = this.get_distinct_id();
			this.register({ $user_id: t }), this.get_property(He) || this.register_once({
				$had_persisted_distinct_id: !0,
				$device_id: r
			}, ""), t !== r && t !== this.get_property(qe) && (this.unregister(qe), this.register({ distinct_id: t }));
			var s, n = (this.persistence.get_property($i) || ji) === ji;
			t !== r && n ? (this.persistence.set_property($i, zi), this.setPersonPropertiesForFlags({
				$set: e || {},
				$set_once: i || {}
			}, !1), this.capture(Gi, {
				distinct_id: t,
				$anon_distinct_id: r
			}, {
				$set: e || {},
				$set_once: i || {}
			}), this.$i = Sn(t, e, i), null == (s = this.featureFlags) || s.setAnonymousDistinctId(r)) : (e || i) && this.setPersonProperties(e, i), t !== r && (this.reloadFeatureFlags(), this.unregister(wi));
		}
	}
	setPersonProperties(t, e) {
		if ((t || e) && this.sn("posthog.setPersonProperties")) {
			var i = Sn(this.get_distinct_id(), t, e);
			this.$i !== i ? (this.setPersonPropertiesForFlags({
				$set: t || {},
				$set_once: e || {}
			}, !0), this.capture("$set", {
				$set: t || {},
				$set_once: e || {}
			}), this.$i = i) : Le.info("A duplicate setPersonProperties call was made with the same properties. It has been ignored.");
		}
	}
	group(t, e, i) {
		if (t && e) {
			var r = this.getGroups(), s = r[t] !== e;
			if (s && this.resetGroupPropertiesForFlags(t), this.register({ $groups: f({}, r, { [t]: e }) }), s || i) {
				var n = {
					$group_type: t,
					$group_key: e
				};
				i && (n.$group_set = i), this.capture(Yi, n);
			}
			i && this.setGroupPropertiesForFlags({ [t]: i }), s && !i && this.reloadFeatureFlags();
		} else Le.error("posthog.group requires a group type and group key");
	}
	resetGroups() {
		this.register({ $groups: {} }), this.resetGroupPropertiesForFlags(), this.reloadFeatureFlags();
	}
	setPersonPropertiesForFlags(t, e) {
		var i;
		void 0 === e && (e = !0), null == (i = this.featureFlags) || i.setPersonPropertiesForFlags(t, e);
	}
	resetPersonPropertiesForFlags() {
		var t;
		null == (t = this.featureFlags) || t.resetPersonPropertiesForFlags();
	}
	setGroupPropertiesForFlags(t, e) {
		var i;
		void 0 === e && (e = !0), this.sn("posthog.setGroupPropertiesForFlags") && (null == (i = this.featureFlags) || i.setGroupPropertiesForFlags(t, e));
	}
	resetGroupPropertiesForFlags(t) {
		var e;
		null == (e = this.featureFlags) || e.resetGroupPropertiesForFlags(t);
	}
	reset(t) {
		var e, i, r, s, n, o, a, l;
		if (Le.info("reset"), !this.__loaded) return Le.uninitializedWarning("posthog.reset");
		var u = this.get_property(He);
		if (this.consent.reset(), null == (e = this.persistence) || e.clear(), null == (i = this.sessionPersistence) || i.clear(), null == (r = this.surveys) || r.reset(), null == (s = this.Yi) || s.stop(), null == (n = this.featureFlags) || n.reset(), null == (o = this.conversations) || o.reset(), null == (a = this.persistence) || a.set_property($i, ji), null == (l = this.sessionManager) || l.resetSessionId(), this.$i = null, this.config.cookieless_mode === Ni) this.register_once({
			distinct_id: Ai,
			$device_id: null
		}, "");
		else {
			var h = this.config.get_device_id(dr());
			this.register_once({
				distinct_id: h,
				$device_id: t ? h : u
			}, "");
		}
		this.register({ $last_posthog_reset: (/* @__PURE__ */ new Date()).toISOString() }, 1), delete this.config.identity_distinct_id, delete this.config.identity_hash, this.reloadFeatureFlags();
	}
	setIdentity(t, e) {
		var i;
		this.config.identity_distinct_id = t, this.config.identity_hash = e, this.alias(t), null == (i = this.conversations) || i.ln();
	}
	clearIdentity() {
		var t;
		delete this.config.identity_distinct_id, delete this.config.identity_hash, null == (t = this.conversations) || t.hn();
	}
	get_distinct_id() {
		return this.get_property("distinct_id");
	}
	getGroups() {
		return this.get_property("$groups") || {};
	}
	get_session_id() {
		var t, e;
		return null !== (t = null == (e = this.sessionManager) ? void 0 : e.checkAndGetSessionAndWindowId(!0).sessionId) && void 0 !== t ? t : "";
	}
	get_session_replay_url(t) {
		if (!this.sessionManager) return "";
		var { sessionId: e, sessionStartTimestamp: i } = this.sessionManager.checkAndGetSessionAndWindowId(!0), r = this.requestRouter.endpointFor("ui", "/project/" + this.config.token + "/replay/" + e);
		if (null != t && t.withTimestamp && i) {
			var s, n = null !== (s = t.timestampLookBack) && void 0 !== s ? s : 10;
			if (!i) return r;
			r += "?t=" + Math.max(Math.floor(((/* @__PURE__ */ new Date()).getTime() - i) / 1e3) - n, 0);
		}
		return r;
	}
	alias(t, e) {
		return t === this.get_property(Be) ? (Le.critical("Attempting to create alias for existing People user - aborting."), -2) : this.sn("posthog.alias") ? (N(e) && (e = this.get_distinct_id()), t !== e ? (this.an(qe, t), this.capture("$create_alias", {
			alias: t,
			distinct_id: e
		})) : (Le.warn("alias matches current distinct_id - skipping api call."), this.identify(t), -1)) : void 0;
	}
	set_config(t) {
		var e = f({}, this.config);
		if (U(t)) {
			var i, r, s, n, o, a, l, u, h, d;
			Xi(this.config, Xn(t));
			var c = this.Hi();
			null == (i = this.persistence) || i.update_config(this.config, e, c), this.sessionPersistence = "sessionStorage" === this.config.persistence || "memory" === this.config.persistence ? this.persistence : new es(f({}, this.config, { persistence: "sessionStorage" }), c);
			var p = this.Di(this.config.debug);
			W(p) && (this.config.debug = p), W(this.config.debug) && (this.config.debug ? (v.DEBUG = !0, gr.R() && gr.N("ph_debug", !0), Le.info("set_config", {
				config: t,
				oldConfig: e,
				newConfig: f({}, this.config)
			})) : (v.DEBUG = !1, gr.R() && gr.q("ph_debug"))), null == (r = this.exceptionObserver) || r.onConfigChange(), null == (s = this.exceptions) || s.onConfigChange(), null == (n = this.sessionRecording) || n.startIfEnabledOrStop(), null == (o = this.autocapture) || o.startIfEnabled(), null == (a = this.heatmaps) || a.startIfEnabled(), null == (l = this.exceptionObserver) || l.startIfEnabledOrStop(), null == (u = this.deadClicksAutocapture) || u.startIfEnabledOrStop(), null == (h = this.surveys) || h.loadIfEnabled(), this.cn(), null == (d = this.externalIntegrations) || d.startIfEnabledOrStop();
		}
	}
	_overrideSDKInfo(t, e) {
		v.LIB_NAME = t, v.LIB_VERSION = e;
	}
	startSessionRecording(t) {
		var e, i, r, s, n, o = !0 === t, a = {
			sampling: o || !(null == t || !t.sampling),
			linked_flag: o || !(null == t || !t.linked_flag),
			url_trigger: o || !(null == t || !t.url_trigger),
			event_trigger: o || !(null == t || !t.event_trigger)
		};
		Object.values(a).some(Boolean) && (null == (e = this.sessionManager) || e.checkAndGetSessionAndWindowId(), a.sampling && (null == (i = this.sessionRecording) || i.overrideSampling()), a.linked_flag && (null == (r = this.sessionRecording) || r.overrideLinkedFlag()), a.url_trigger && (null == (s = this.sessionRecording) || s.overrideTrigger("url")), a.event_trigger && (null == (n = this.sessionRecording) || n.overrideTrigger("event")));
		this.set_config({ disable_session_recording: !1 });
	}
	stopSessionRecording() {
		this.set_config({ disable_session_recording: !0 });
	}
	sessionRecordingStarted() {
		var t;
		return !(null == (t = this.sessionRecording) || !t.started);
	}
	captureException(t, e) {
		if (this.exceptions) {
			var i = /* @__PURE__ */ new Error("PostHog syntheticException"), r = this.exceptions.buildProperties(t, {
				handled: !0,
				syntheticException: i
			});
			return this.exceptions.sendExceptionEvent(f({}, r, e));
		}
	}
	addExceptionStep(t, e) {
		var i;
		null == (i = this.exceptions) || i.addExceptionStep(t, e);
	}
	captureLog(t) {
		var e;
		null == (e = this.logs) || e.captureLog(t);
	}
	get logger() {
		var t, e;
		return null !== (t = null == (e = this.logs) ? void 0 : e.logger) && void 0 !== t ? t : Zn.dn;
	}
	startExceptionAutocapture(t) {
		this.set_config({ capture_exceptions: null == t || t });
	}
	stopExceptionAutocapture() {
		this.set_config({ capture_exceptions: !1 });
	}
	loadToolbar(t) {
		var e, i;
		return null !== (e = null == (i = this.toolbar) ? void 0 : i.loadToolbar(t)) && void 0 !== e && e;
	}
	get_property(t) {
		var e;
		return null == (e = this.persistence) ? void 0 : e.props[t];
	}
	getSessionProperty(t) {
		var e;
		return null == (e = this.sessionPersistence) ? void 0 : e.props[t];
	}
	toString() {
		var t, e = null !== (t = this.config.name) && void 0 !== t ? t : Gn;
		return e !== Gn && (e = Gn + "." + e), e;
	}
	_isIdentified() {
		var t, e;
		return (null == (t = this.persistence) ? void 0 : t.get_property($i)) === zi || (null == (e = this.sessionPersistence) ? void 0 : e.get_property($i)) === zi;
	}
	nn() {
		var t, e;
		return !("never" === this.config.person_profiles || this.config.person_profiles === Bi && !this._isIdentified() && L(this.getGroups()) && (null == (t = this.persistence) || null == (t = t.props) || !t[qe]) && (null == (e = this.persistence) || null == (e = e.props) || !e[Ii]));
	}
	Xi() {
		return !0 === this.config.capture_pageleave || "if_capture_pageview" === this.config.capture_pageleave && (!0 === this.config.capture_pageview || "history_change" === this.config.capture_pageview);
	}
	createPersonProfile() {
		this.nn() || this.sn("posthog.createPersonProfile") && this.setPersonProperties({}, {});
	}
	setInternalOrTestUser() {
		this.sn("posthog.setInternalOrTestUser") && this.setPersonProperties({ $internal_or_test_user: !0 });
	}
	sn(t) {
		return "never" === this.config.person_profiles ? (Le.error(t + " was called, but process_person is set to \"never\". This call will be ignored."), !1) : (this.an(Ii, !0), !0);
	}
	Hi() {
		if ("always" === this.config.cookieless_mode) return !0;
		var t = this.consent.isOptedOut();
		return this.config.disable_persistence || t && !(!this.config.opt_out_persistence_by_default && this.config.cookieless_mode !== Li);
	}
	cn() {
		var t, e, i, r, s = this.Hi();
		return (null == (t = this.persistence) ? void 0 : t._r) !== s && (null == (i = this.persistence) || i.set_disabled(s)), (null == (e = this.sessionPersistence) ? void 0 : e._r) !== s && (null == (r = this.sessionPersistence) || r.set_disabled(s)), s;
	}
	opt_in_capturing(t) {
		var e;
		if (this.config.cookieless_mode !== Ni) {
			if (this.Ri()) {
				var i, r, s, n, o;
				this.reset(!0), null == (i = this.sessionManager) || i.destroy(), null == (r = this.pageViewManager) || r.destroy(), this.sessionManager = new wn(this), this.pageViewManager = new Cr(this), this.persistence && (this.sessionPropsManager = new mn(this, this.sessionManager, this.persistence));
				var a, l = null !== (s = null == (n = this.config.__extensionClasses) ? void 0 : n.sessionRecording) && void 0 !== s ? s : null == (o = Zn.__defaultExtensionClasses) ? void 0 : o.sessionRecording;
				l && (this.sessionRecording = this.Mi(this.sessionRecording, new l(this)), this.Qi && (null == (a = this.sessionRecording) || null == a.onRemoteConfig || a.onRemoteConfig(this.Qi)));
			}
			var u, h;
			this.consent.optInOut(!0), this.cn(), this.Ji(), null == (e = this.sessionRecording) || e.startIfEnabledOrStop(), this.config.cookieless_mode == Li && (null == (u = this.surveys) || u.loadIfEnabled()), (N(null == t ? void 0 : t.captureEventName) || null != t && t.captureEventName) && this.capture(null !== (h = null == t ? void 0 : t.captureEventName) && void 0 !== h ? h : "$opt_in", null == t ? void 0 : t.captureProperties, { send_instantly: !0 }), this.config.capture_pageview && this.Ki();
		} else Le.warn(Hn);
	}
	opt_out_capturing() {
		var t, e, i;
		this.config.cookieless_mode !== Ni ? (this.config.cookieless_mode === Li && this.consent.isOptedIn() && this.reset(!0), this.consent.optInOut(!1), this.cn(), this.config.cookieless_mode === Li && (this.register({
			distinct_id: Ai,
			$device_id: null
		}), null == (t = this.sessionRecording) || t.stopRecording(), this.sessionRecording = void 0, null == (e = this.sessionManager) || e.destroy(), null == (i = this.pageViewManager) || i.destroy(), this.sessionManager = void 0, this.sessionPropsManager = void 0, this.Ki())) : Le.warn(Hn);
	}
	has_opted_in_capturing() {
		return this.consent.isOptedIn();
	}
	has_opted_out_capturing() {
		return this.consent.isOptedOut();
	}
	get_explicit_consent_status() {
		var t = this.consent.consent;
		return 1 === t ? "granted" : 0 === t ? "denied" : "pending";
	}
	is_capturing() {
		return this.config.cookieless_mode === Ni || (this.config.cookieless_mode === Li ? this.consent.isRejected() || this.consent.isOptedIn() : !this.has_opted_out_capturing());
	}
	clear_opt_in_out_capturing() {
		this.consent.reset(), this.cn();
	}
	_is_bot() {
		return i ? xn(i, this.config.custom_blocked_useragents) : void 0;
	}
	Ki() {
		r && ("visible" === r.visibilityState ? this.Fi || (this.Fi = !0, this.capture(Vi, { title: r.title }, { send_instantly: !0 }), this.Ai && (r.removeEventListener(Hi, this.Ai), this.Ai = null)) : this.Ai || (this.Ai = this.Ki.bind(this), sr(r, Hi, this.Ai)));
	}
	debug(e) {
		!1 === e ? (t?.console.log("You've disabled debug mode."), this.set_config({ debug: !1 })) : (t?.console.log("You're now in debug mode. All calls to PostHog will be logged in your console.\nYou can disable this with `posthog.debug(false)`."), this.set_config({ debug: !0 }));
	}
	Lr() {
		var t, e, i, r, s, n, o = this.qi || {};
		return "advanced_disable_flags" in o ? !!o.advanced_disable_flags : !1 !== this.config.advanced_disable_flags ? !!this.config.advanced_disable_flags : !0 === this.config.advanced_disable_decide ? (Le.warn("Config field 'advanced_disable_decide' is deprecated. Please use 'advanced_disable_flags' instead. The old field will be removed in a future major version."), !0) : (i = "advanced_disable_decide", r = Le, s = (e = "advanced_disable_flags") in (t = o) && !H(t[e]), n = i in t && !H(t[i]), s ? t[e] : !!n && (r && r.warn("Config field '" + i + "' is deprecated. Please use '" + e + "' instead. The old field will be removed in a future major version."), t[i]));
	}
	rn(t) {
		if (H(this.config.before_send)) return t;
		var e = M(this.config.before_send) ? this.config.before_send : [this.config.before_send], i = t;
		for (var r of e) {
			if (i = r(i), H(i)) {
				var s = "Event '" + t.event + "' was rejected in beforeSend function";
				return Y(t.event) ? Le.warn(s + ". This can cause unexpected behavior.") : Le.info(s), null;
			}
			i.properties && !L(i.properties) || Le.warn("Event '" + t.event + "' has no properties after beforeSend function, this is likely an error.");
		}
		return i;
	}
	getPageViewId() {
		var t;
		return null == (t = this.pageViewManager.dr) ? void 0 : t.pageViewId;
	}
	captureTraceFeedback(t, e) {
		this.capture("$ai_feedback", {
			$ai_trace_id: String(t),
			$ai_feedback_text: e
		});
	}
	captureTraceMetric(t, e, i) {
		this.capture("$ai_metric", {
			$ai_trace_id: String(t),
			$ai_metric_name: e,
			$ai_metric_value: String(i)
		});
	}
	Di(t) {
		var e = W(t) && !t, i = gr.R() && "true" === gr.A("ph_debug");
		return !e && (!!i || t);
	}
};
Zn.__defaultExtensionClasses = {}, Zn.dn = {
	trace: Nn = () => {},
	debug: Nn,
	info: Nn,
	warn: Nn,
	error: Nn,
	fatal: Nn
}, function(t, e) {
	for (var i = 0; e.length > i; i++) t.prototype[e[i]] = tr(t.prototype[e[i]]);
}(Zn, ["identify"]);
var to = 1, eo = 3, io = 11;
function ro(t) {
	return t instanceof Element && (t.id === Ci || !(null == t.closest || !t.closest(".toolbar-global-fade-container")));
}
function so(t) {
	return !!t && t.nodeType === to;
}
function no(t, e) {
	return !!t && !!t.tagName && t.tagName.toLowerCase() === e.toLowerCase();
}
function oo(t) {
	return !!t && t.nodeType === eo;
}
function ao(t) {
	return !!t && t.nodeType === io && so(t.host);
}
function lo(t) {
	return t ? O(t).split(/\s+/) : [];
}
function uo(e) {
	var i = null == t ? void 0 : t.location.href;
	return !!(i && e && e.some(((t) => i.match(t))));
}
function ho(t) {
	var e = "";
	switch (typeof t.className) {
		case "string":
			e = t.className;
			break;
		case "object":
			e = (t.className && "baseVal" in t.className ? t.className.baseVal : null) || t.getAttribute("class") || "";
			break;
		default: e = "";
	}
	return lo(e);
}
function vo(t) {
	return H(t) ? null : O(t).split(/(\s+)/).filter(((t) => Oo(t))).join("").replace(/[\r\n]/g, " ").replace(/[ ]+/g, " ").substring(0, 255);
}
function co(t) {
	var e = "";
	return xo(t) && !Eo(t) && t.childNodes && t.childNodes.length && Ki(t.childNodes, (function(t) {
		var i;
		oo(t) && t.textContent && (e += null !== (i = vo(t.textContent)) && void 0 !== i ? i : "");
	})), O(e);
}
function po(t) {
	return N(t.target) ? t.srcElement || null : null != (e = t.target) && e.shadowRoot ? t.composedPath()[0] || null : t.target || null;
	var e;
}
var fo = [
	"a",
	"button",
	"form",
	"input",
	"select",
	"textarea",
	"label"
];
function _o(t, e) {
	if (N(e)) return !0;
	var i, r = function(t) {
		if (e.some(((e) => t.matches(e)))) return { v: !0 };
	};
	for (var s of t) if (i = r(s)) return i.v;
	return !1;
}
function go(t) {
	var e = t.parentNode;
	return !(!e || !so(e)) && e;
}
var mo = [
	"next",
	"previous",
	"prev",
	">",
	"<"
], bo = [".ph-no-rageclick", ".ph-no-capture"];
var yo = (t) => !t || no(t, "html") || !so(t), wo = (e, i) => {
	if (!t || yo(e)) return {
		parentIsUsefulElement: !1,
		targetElementList: []
	};
	for (var r = !1, s = [e], n = e; n.parentNode && !no(n, "body");) if (ao(n.parentNode)) s.push(n.parentNode.host), n = n.parentNode.host;
	else {
		var o = go(n);
		if (!o) break;
		if (i || fo.indexOf(o.tagName.toLowerCase()) > -1) r = !0;
		else {
			var a = t.getComputedStyle(o);
			a && "pointer" === a.getPropertyValue("cursor") && (r = !0);
		}
		s.push(o), n = o;
	}
	return {
		parentIsUsefulElement: r,
		targetElementList: s
	};
};
function xo(t) {
	for (var e = t; e.parentNode && !no(e, "body"); e = e.parentNode) {
		var i = ho(e);
		if (P(i, "ph-sensitive") || P(i, "ph-no-capture")) return !1;
	}
	if (P(ho(t), "ph-include")) return !0;
	var r = t.type || "";
	if (j(r)) switch (r.toLowerCase()) {
		case "hidden":
		case "password": return !1;
	}
	var s = t.name || t.id || "";
	return !j(s) || !/^cc|cardnum|ccnum|creditcard|csc|cvc|cvv|exp|pass|pwd|routing|seccode|securitycode|securitynum|socialsec|socsec|ssn/i.test(s.replace(/[^a-zA-Z0-9]/g, ""));
}
function Eo(t) {
	return !!(no(t, "input") && ![
		"button",
		"checkbox",
		"submit",
		"reset"
	].includes(t.type) || no(t, "select") || no(t, "textarea") || "true" === t.getAttribute("contenteditable"));
}
var So = "(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11})", $o = new RegExp("^(?:" + So + ")$"), To = new RegExp(So), ko = "\\d{3}-?\\d{2}-?\\d{4}", Ro = new RegExp("^(" + ko + ")$"), Po = new RegExp("(" + ko + ")");
function Oo(t, e) {
	if (void 0 === e && (e = !0), H(t)) return !1;
	if (j(t)) {
		if (t = O(t), (e ? $o : To).test((t || "").replace(/[- ]/g, ""))) return !1;
		if ((e ? Ro : Po).test(t)) return !1;
	}
	return !0;
}
function Io(t) {
	var e = co(t);
	return Oo(e = (e + " " + Co(t)).trim()) ? e : "";
}
function Co(t) {
	var e = "";
	return t && t.childNodes && t.childNodes.length && Ki(t.childNodes, (function(t) {
		var i;
		if (t && "span" === (null == (i = t.tagName) ? void 0 : i.toLowerCase())) try {
			var r = co(t);
			e = (e + " " + r).trim(), t.childNodes && t.childNodes.length && (e = (e + " " + Co(t)).trim());
		} catch (t) {
			Le.error("[AutoCapture]", t);
		}
	})), e;
}
function Ao(t) {
	return t.replace(/"|\\"/g, "\\\"");
}
function Fo(t) {
	var e = t.attr__class;
	return e ? M(e) ? e : lo(e) : void 0;
}
var Mo = class {
	constructor(t) {
		this.disabled = !1 === t;
		var e = U(t) ? t : {};
		this.thresholdPx = e.threshold_px || 30, this.timeoutMs = e.timeout_ms || 1e3, this.clickCount = e.click_count || 3, this.clicks = [];
	}
	isRageClick(t, e, i) {
		if (this.disabled) return !1;
		var r = this.clicks[this.clicks.length - 1];
		if (r && Math.abs(t - r.x) + Math.abs(e - r.y) < this.thresholdPx && this.timeoutMs > i - r.timestamp) {
			if (this.clicks.push({
				x: t,
				y: e,
				timestamp: i
			}), this.clicks.length === this.clickCount) return !0;
		} else this.clicks = [{
			x: t,
			y: e,
			timestamp: i
		}];
		return !1;
	}
};
var Do = "$copy_autocapture", Uo = Ne("[AutoCapture]");
function Lo(t, e) {
	return e.length > t ? e.slice(0, t) + "..." : e;
}
function No(t) {
	if (t.previousElementSibling) return t.previousElementSibling;
	var e = t;
	do
		e = e.previousSibling;
	while (e && !so(e));
	return e;
}
function jo(e, i) {
	var r, s, { e: n, maskAllElementAttributes: o, maskAllText: a, elementAttributeIgnoreList: l, elementsChainAsString: u } = i;
	if (!so(e)) return { props: {} };
	for (var h = [e], d = e; d.parentNode && !no(d, "body");) if (ao(d.parentNode)) h.push(d.parentNode.host), d = d.parentNode.host;
	else {
		if (!so(d.parentNode)) break;
		h.push(d.parentNode), d = d.parentNode;
	}
	var v, c, p = [], _ = {}, g = !1, m = !1;
	if (Ki(h, ((t) => {
		var e = xo(t);
		if (no(t, "a")) {
			var i = t.getAttribute("href");
			g = e && !!i && Oo(i) && i;
		}
		P(ho(t), "ph-no-capture") && (m = !0), p.push(function(t, e, i, r) {
			var s = t.tagName.toLowerCase(), n = { tag_name: s };
			fo.indexOf(s) > -1 && !i && (n.$el_text = "a" === s.toLowerCase() || "button" === s.toLowerCase() ? Lo(1024, Io(t)) : Lo(1024, co(t)));
			var o = ho(t);
			o.length > 0 && (n.classes = o.filter((function(t) {
				return "" !== t;
			}))), Ki(t.attributes, (function(i) {
				var s;
				if ((!Eo(t) || -1 !== [
					"name",
					"id",
					"class",
					"aria-label"
				].indexOf(i.name)) && (null == r || !r.includes(i.name)) && !e && Oo(i.value) && (!j(s = i.name) || "_ngcontent" !== s.substring(0, 10) && "_nghost" !== s.substring(0, 7))) {
					var o = i.value;
					"class" === i.name && (o = lo(o).join(" ")), n["attr__" + i.name] = Lo(1024, o);
				}
			}));
			for (var a = 1, l = 1, u = t; u = No(u);) a++, u.tagName === t.tagName && l++;
			return n.nth_child = a, n.nth_of_type = l, n;
		}(t, o, a, l));
		Xi(_, function(t) {
			if (!xo(t)) return {};
			var e = {};
			return Ki(t.attributes, (function(t) {
				if (t.name && 0 === t.name.indexOf("data-ph-capture-attribute")) {
					var i = t.name.replace("data-ph-capture-attribute-", ""), r = t.value;
					i && r && Oo(r) && (e[i] = r);
				}
			})), e;
		}(t));
	})), m) return {
		props: {},
		explicitNoCapture: m
	};
	if (a || (p[0].$el_text = no(e, "a") || no(e, "button") ? Io(e) : co(e)), g) {
		var b, y;
		p[0].attr__href = g;
		var w = null == (b = Mr(g)) ? void 0 : b.host, x = null == t || null == (y = t.location) ? void 0 : y.host;
		w && x && w !== x && (v = g);
	}
	return { props: Xi({
		$event_type: n.type,
		$ce_version: 1
	}, u ? {} : { $elements: p }, { $elements_chain: (c = p, function(t) {
		return t.map(((t) => {
			var e, i, r = "";
			if (t.tag_name && (r += t.tag_name), t.attr_class) for (var s of (t.attr_class.sort(), t.attr_class)) r += "." + s.replace(/"/g, "");
			var n = f({}, t.text ? { text: t.text } : {}, {
				"nth-child": null !== (e = t.nth_child) && void 0 !== e ? e : 0,
				"nth-of-type": null !== (i = t.nth_of_type) && void 0 !== i ? i : 0
			}, t.href ? { href: t.href } : {}, t.attr_id ? { attr_id: t.attr_id } : {}, t.attributes), o = {};
			return Qi(n).sort(((t, e) => {
				var [i] = t, [r] = e;
				return i.localeCompare(r);
			})).forEach(((t) => {
				var [e, i] = t;
				return o[Ao(e.toString())] = Ao(i.toString());
			})), (r += ":") + Qi(o).map(((t) => {
				var [e, i] = t;
				return e + "=\"" + i + "\"";
			})).join("");
		})).join(";");
	}(function(t) {
		return t.map(((t) => {
			var e, i, r = {
				text: null == (e = t.$el_text) ? void 0 : e.slice(0, 400),
				tag_name: t.tag_name,
				href: null == (i = t.attr__href) ? void 0 : i.slice(0, 2048),
				attr_class: Fo(t),
				attr_id: t.attr__id,
				nth_child: t.nth_child,
				nth_of_type: t.nth_of_type,
				attributes: {}
			};
			return Qi(t).filter(((t) => {
				var [e] = t;
				return 0 === e.indexOf("attr__");
			})).forEach(((t) => {
				var [e, i] = t;
				return r.attributes[e] = i;
			})), r;
		}));
	}(c))) }, null != (r = p[0]) && r.$el_text ? { $el_text: null == (s = p[0]) ? void 0 : s.$el_text } : {}, v && "click" === n.type ? { $external_click_url: v } : {}, _) };
}
var zo = Ne("[ExceptionAutocapture]");
function Bo(t, e, i) {
	try {
		if (!(e in t)) return () => {};
		var r = t[e], s = i(r);
		return D(s) && (s.prototype = s.prototype || {}, Object.defineProperties(s, { __posthog_wrapped__: {
			enumerable: !1,
			value: !0
		} })), t[e] = s, () => {
			t[e] = r;
		};
	} catch (t) {
		return () => {};
	}
}
var Ho = Ne("[TracingHeaders]"), qo = Ne("[Web Vitals]"), Vo = 9e5, Wo = "disabled", Go = "lazy_loading", Yo = "awaiting_config", Jo = "missing_config";
Ne("[SessionRecording]"), Ne("[SessionRecording]");
var Ko = "[SessionRecording]", Xo = Ne(Ko), Qo = Ne("[Heatmaps]");
function Zo(t) {
	return U(t) && "clientX" in t && "clientY" in t && q(t.clientX) && q(t.clientY);
}
var ta = Ne("[Product Tours]"), ea = ["$set_once", "$set"], ia = Ne("[SiteApps]"), ra = "Error while initializing PostHog app with config id ";
function sa(t, e, i) {
	if (H(t)) return !1;
	switch (i) {
		case "exact": return t === e;
		case "contains":
			var r = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".").replace(/%/g, ".*");
			return new RegExp(r, "i").test(t);
		case "regex": try {
			return new RegExp(e).test(t);
		} catch (t) {
			return !1;
		}
		default: return !1;
	}
}
var na = class {
	constructor(t) {
		this.vn = new bn(), this.fn = (t, e) => this.pn(t, e) && this.gn(t, e) && this.mn(t, e) && this.yn(t, e), this.pn = (t, e) => null == e || !e.event || (null == t ? void 0 : t.event) === (null == e ? void 0 : e.event), this._instance = t, this.bn = /* @__PURE__ */ new Set(), this._n = /* @__PURE__ */ new Set();
	}
	init() {
		var t, e;
		N(null == (t = this._instance) ? void 0 : t._addCaptureHook) || null == (e = this._instance) || e._addCaptureHook(((t, e) => {
			this.on(t, e);
		}));
	}
	register(t) {
		var e, i;
		if (!N(null == (e = this._instance) ? void 0 : e._addCaptureHook) && (t.forEach(((t) => {
			var e, i;
			null == (e = this._n) || e.add(t), null == (i = t.steps) || i.forEach(((t) => {
				var e;
				null == (e = this.bn) || e.add((null == t ? void 0 : t.event) || "");
			}));
		})), null != (i = this._instance) && i.autocapture)) {
			var r, s = /* @__PURE__ */ new Set();
			t.forEach(((t) => {
				var e;
				null == (e = t.steps) || e.forEach(((t) => {
					null != t && t.selector && s.add(null == t ? void 0 : t.selector);
				}));
			})), null == (r = this._instance) || r.autocapture.setElementSelectors(s);
		}
	}
	on(t, e) {
		var i;
		null != e && 0 != t.length && (this.bn.has(t) || this.bn.has(null == e ? void 0 : e.event)) && this._n && (null == (i = this._n) ? void 0 : i.size) > 0 && this._n.forEach(((t) => {
			this.wn(e, t) && this.vn.emit("actionCaptured", t.name);
		}));
	}
	xn(t) {
		this.onAction("actionCaptured", ((e) => t(e)));
	}
	wn(t, e) {
		if (null == (null == e ? void 0 : e.steps)) return !1;
		for (var i of e.steps) if (this.fn(t, i)) return !0;
		return !1;
	}
	onAction(t, e) {
		return this.vn.on(t, e);
	}
	gn(t, e) {
		if (null != e && e.url) {
			var i, r = null == t || null == (i = t.properties) ? void 0 : i.$current_url;
			if (!r || "string" != typeof r) return !1;
			if (!sa(r, e.url, e.url_matching || "contains")) return !1;
		}
		return !0;
	}
	mn(t, e) {
		return !!this.Sn(t, e) && !!this.kn(t, e) && !!this.Cn(t, e);
	}
	Sn(t, e) {
		var i;
		if (null == e || !e.href) return !0;
		var r = this.In(t);
		if (r.length > 0) return r.some(((t) => sa(t.href, e.href, e.href_matching || "exact")));
		var s, n = (null == t || null == (i = t.properties) ? void 0 : i.$elements_chain) || "";
		return !!n && sa((s = n.match(/(?::|")href="(.*?)"/)) ? s[1] : "", e.href, e.href_matching || "exact");
	}
	kn(t, e) {
		var i;
		if (null == e || !e.text) return !0;
		var r = this.In(t);
		if (r.length > 0) return r.some(((t) => sa(t.text, e.text, e.text_matching || "exact") || sa(t.$el_text, e.text, e.text_matching || "exact")));
		var s, n, o, a = (null == t || null == (i = t.properties) ? void 0 : i.$elements_chain) || "";
		return !!a && (s = function(t) {
			for (var e, i = [], r = /(?::|")text="(.*?)"/g; !H(e = r.exec(t));) i.includes(e[1]) || i.push(e[1]);
			return i;
		}(a), n = e.text, o = e.text_matching || "exact", s.some(((t) => sa(t, n, o))));
	}
	Cn(t, e) {
		var i, r;
		if (null == e || !e.selector) return !0;
		var s = null == t || null == (i = t.properties) ? void 0 : i.$element_selectors;
		if (null != s && s.includes(e.selector)) return !0;
		var n = (null == t || null == (r = t.properties) ? void 0 : r.$elements_chain) || "";
		if (e.selector_regex && n) try {
			return new RegExp(e.selector_regex).test(n);
		} catch (t) {
			return !1;
		}
		return !1;
	}
	In(t) {
		var e;
		return null == (null == t || null == (e = t.properties) ? void 0 : e.$elements) ? [] : null == t ? void 0 : t.properties.$elements;
	}
	yn(t, e) {
		return null == e || !e.properties || 0 === e.properties.length || kn(e.properties.reduce(((t, e) => {
			var i = M(e.value) ? e.value.map(String) : null != e.value ? [String(e.value)] : [];
			return t[e.key] = {
				values: i,
				operator: e.operator || "exact"
			}, t;
		}), {}), null == t ? void 0 : t.properties);
	}
};
var oa = class {
	constructor(t) {
		this._instance = t, this.Tn = /* @__PURE__ */ new Map(), this.En = /* @__PURE__ */ new Map(), this.Mn = /* @__PURE__ */ new Map();
	}
	Pn(t, e) {
		return !!t && kn(t.propertyFilters, null == e ? void 0 : e.properties);
	}
	Rn(t, e) {
		var i = /* @__PURE__ */ new Map();
		return t.forEach(((t) => {
			var r;
			null == (r = t.conditions) || null == (r = r[e]) || null == (r = r.values) || r.forEach(((e) => {
				if (null != e && e.name) {
					var r = i.get(e.name) || [];
					r.push(t.id), i.set(e.name, r);
				}
			}));
		})), i;
	}
	On(t, e, i) {
		var r = (i === is.Activation ? this.Tn : this.En).get(t), s = [];
		return this.Ln(((t) => {
			s = t.filter(((t) => null == r ? void 0 : r.includes(t.id)));
		})), s.filter(((r) => {
			var s, n = null == (s = r.conditions) || null == (s = s[i]) || null == (s = s.values) ? void 0 : s.find(((e) => e.name === t));
			return this.Pn(n, e);
		}));
	}
	register(t) {
		var e;
		N(null == (e = this._instance) ? void 0 : e._addCaptureHook) || (this.Fn(t), this.An(t));
	}
	An(t) {
		var e = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.actions) && (null == (i = t.conditions) || null == (i = i.actions) || null == (i = i.values) ? void 0 : i.length) > 0;
		}));
		0 !== e.length && (this.Nn ?? (this.Nn = new na(this._instance), this.Nn.init(), this.Nn.xn(((t) => {
			this.onAction(t);
		}))), e.forEach(((t) => {
			var e, i, r, s, n;
			t.conditions && null != (e = t.conditions) && e.actions && null != (i = t.conditions) && null != (i = i.actions) && i.values && (null == (r = t.conditions) || null == (r = r.actions) || null == (r = r.values) ? void 0 : r.length) > 0 && (null == (s = this.Nn) || s.register(t.conditions.actions.values), null == (n = t.conditions) || null == (n = n.actions) || null == (n = n.values) || n.forEach(((e) => {
				if (e && e.name) {
					var i = this.Mn.get(e.name);
					i && i.push(t.id), this.Mn.set(e.name, i || [t.id]);
				}
			})));
		})));
	}
	Fn(t) {
		var e, i = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.events) && (null == (i = t.conditions) || null == (i = i.events) || null == (i = i.values) ? void 0 : i.length) > 0;
		})), r = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.cancelEvents) && (null == (i = t.conditions) || null == (i = i.cancelEvents) || null == (i = i.values) ? void 0 : i.length) > 0;
		}));
		0 === i.length && 0 === r.length || (null == (e = this._instance) || e._addCaptureHook(((t, e) => {
			this.onEvent(t, e);
		})), this.Tn = this.Rn(t, is.Activation), this.En = this.Rn(t, is.Cancellation));
	}
	onEvent(t, e) {
		var i, r = this.le(), s = this.$n(), n = this.Dn(), o = (null == (i = this._instance) || null == (i = i.persistence) ? void 0 : i.props[s]) || [];
		if (n === t && e && o.length > 0) {
			var a, l;
			r.info("event matched, removing item from activated items", {
				event: t,
				eventPayload: e,
				existingActivatedItems: o
			});
			var u = (null == e || null == (a = e.properties) ? void 0 : a.$survey_id) || (null == e || null == (l = e.properties) ? void 0 : l.$product_tour_id);
			if (u) {
				var h = o.indexOf(u);
				0 > h || (o.splice(h, 1), this.qn(o));
			}
		} else {
			if (this.En.has(t)) {
				var d = this.On(t, e, is.Cancellation);
				d.length > 0 && (r.info("cancel event matched, cancelling items", {
					event: t,
					itemsToCancel: d.map(((t) => t.id))
				}), d.forEach(((t) => {
					var e = o.indexOf(t.id);
					0 > e || o.splice(e, 1), this.jn(t.id);
				})), this.qn(o));
			}
			if (this.Tn.has(t)) {
				r.info("event name matched", {
					event: t,
					eventPayload: e,
					items: this.Tn.get(t)
				});
				var v = this.On(t, e, is.Activation);
				this.qn(o.concat(v.map(((t) => t.id)) || []));
			}
		}
	}
	onAction(t) {
		var e, i = this.$n(), r = (null == (e = this._instance) || null == (e = e.persistence) ? void 0 : e.props[i]) || [];
		this.Mn.has(t) && this.qn(r.concat(this.Mn.get(t) || []));
	}
	qn(t) {
		var e = this.le(), i = [...new Set(t)].filter(((t) => !this.Hn(t)));
		e.info("updating activated items", { activatedItems: i }), this.Un(i);
	}
	getActivatedIds() {
		var t, e = this.$n();
		return (null == (t = this._instance) || null == (t = t.persistence) ? void 0 : t.props[e]) || [];
	}
	getEventToItemsMap() {
		return this.Tn;
	}
	Bn() {
		return this.Nn;
	}
};
var aa = class extends oa {
	constructor(t) {
		super(t);
	}
	$n() {
		return bi;
	}
	Dn() {
		return hs.SHOWN;
	}
	Ln(t) {
		var e;
		null == (e = this._instance) || e.getSurveys(t);
	}
	jn(t) {
		var e;
		null == (e = this._instance) || e.cancelPendingSurvey(t);
	}
	le() {
		return Cn;
	}
	Un(t) {
		var e;
		null == (e = this._instance) || null == (e = e.persistence) || e.register({ [bi]: t });
	}
	Hn() {
		return !1;
	}
	getSurveys() {
		return this.getActivatedIds();
	}
	getEventToSurveys() {
		return this.getEventToItemsMap();
	}
};
var la = "SDK is not enabled or survey functionality is not yet loaded", ua = "Disabled. Not loading surveys.", ha = null != t && t.location ? Lr(t.location.hash, "__posthog") || Lr(location.hash, "state") : null, da = "_postHogToolbarParams", va = Ne("[Toolbar]"), ca = Ne("[FeatureFlags]"), pa = Ne("[FeatureFlags]", { debugEnabled: !0 }), fa = "\" failed. Feature flags didn't load in time.", _a = (t) => {
	for (var e = {}, i = 0; t.length > i; i++) e[t[i]] = !0;
	return e;
}, ga = (t) => {
	var e = {};
	for (var [i, r] of Qi(t || {})) r && (e[i] = r);
	return e;
}, ma = Ne("[Error tracking]"), ba = "Refusing to render web experiment since the viewer is a likely bot", ya = {
	icontains: (e, i) => !!t && i.href.toLowerCase().indexOf(e.toLowerCase()) > -1,
	not_icontains: (e, i) => !!t && -1 === i.href.toLowerCase().indexOf(e.toLowerCase()),
	regex: (e, i) => !!t && En(i.href, e),
	not_regex: (e, i) => !!t && !En(i.href, e),
	exact: (t, e) => e.href === t,
	is_not: (t, e) => e.href !== t
};
var wa = class wa {
	get qt() {
		return this._instance.config;
	}
	constructor(t) {
		var e = this;
		this.getWebExperimentsAndEvaluateDisplayLogic = function(t) {
			void 0 === t && (t = !1), e.getWebExperiments(((t) => {
				wa.zn("retrieved web experiments from the server"), e.Vn = /* @__PURE__ */ new Map(), t.forEach(((t) => {
					if (t.feature_flag_key) {
						var i;
						e.Vn && (wa.zn("setting flag key ", t.feature_flag_key, " to web experiment ", t), null == (i = e.Vn) || i.set(t.feature_flag_key, t));
						var r = e._instance.getFeatureFlag(t.feature_flag_key);
						j(r) && t.variants[r] && e.Wn(t.name, r, t.variants[r].transforms);
					} else if (t.variants) for (var s in t.variants) {
						var n = t.variants[s];
						wa.Zn(n) && e.Wn(t.name, s, n.transforms);
					}
				}));
			}), t);
		}, this._instance = t, this._instance.onFeatureFlags(((t) => {
			this.onFeatureFlags(t);
		}));
	}
	initialize() {}
	onFeatureFlags(t) {
		if (this._is_bot()) wa.zn(ba);
		else if (!this.qt.disable_web_experiments) {
			if (H(this.Vn)) return this.Vn = /* @__PURE__ */ new Map(), this.loadIfEnabled(), void this.previewWebExperiment();
			wa.zn("applying feature flags", t), t.forEach(((t) => {
				var e;
				if (this.Vn && null != (e = this.Vn) && e.has(t)) {
					var i, r = this._instance.getFeatureFlag(t), s = null == (i = this.Vn) ? void 0 : i.get(t);
					r && null != s && s.variants[r] && this.Wn(s.name, r, s.variants[r].transforms);
				}
			}));
		}
	}
	previewWebExperiment() {
		var t = wa.getWindowLocation();
		if (null != t && t.search) {
			var e = Dr(null == t ? void 0 : t.search, "__experiment_id"), i = Dr(null == t ? void 0 : t.search, "__experiment_variant");
			e && i && (wa.zn("previewing web experiments " + e + " && " + i), this.getWebExperiments(((t) => {
				this.Gn(parseInt(e), i, t);
			}), !1, !0));
		}
	}
	loadIfEnabled() {
		this.qt.disable_web_experiments || this.getWebExperimentsAndEvaluateDisplayLogic();
	}
	getWebExperiments(t, e, i) {
		if (this.qt.disable_web_experiments && !i) return t([]);
		var r = this._instance.get_property("$web_experiments");
		if (r && !e) return t(r);
		this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/web_experiments/?token=" + this.qt.token),
			method: "GET",
			callback: (e) => t(200 === e.statusCode && e.json && e.json.experiments || [])
		});
	}
	Gn(t, e, i) {
		var r = i.filter(((e) => e.id === t));
		r && r.length > 0 && (wa.zn("Previewing web experiment [" + r[0].name + "] with variant [" + e + "]"), this.Wn(r[0].name, e, r[0].variants[e].transforms));
	}
	static Zn(t) {
		return !H(t.conditions) && wa.Qn(t) && wa.Jn(t);
	}
	static Qn(t) {
		var e;
		if (H(t.conditions) || H(null == (e = t.conditions) ? void 0 : e.url)) return !0;
		var i, r, s, n = wa.getWindowLocation();
		return !!n && (null == (i = t.conditions) || !i.url || ya[null !== (r = null == (s = t.conditions) ? void 0 : s.urlMatchType) && void 0 !== r ? r : "icontains"](t.conditions.url, n));
	}
	static getWindowLocation() {
		return null == t ? void 0 : t.location;
	}
	static Jn(t) {
		var e;
		if (H(t.conditions) || H(null == (e = t.conditions) ? void 0 : e.utm)) return !0;
		var i = qr();
		if (i.utm_source) {
			var r, s, n, o, a, l, u, h, d = null == (r = t.conditions) || null == (r = r.utm) || !r.utm_campaign || (null == (s = t.conditions) || null == (s = s.utm) ? void 0 : s.utm_campaign) == i.utm_campaign, v = null == (n = t.conditions) || null == (n = n.utm) || !n.utm_source || (null == (o = t.conditions) || null == (o = o.utm) ? void 0 : o.utm_source) == i.utm_source, c = null == (a = t.conditions) || null == (a = a.utm) || !a.utm_medium || (null == (l = t.conditions) || null == (l = l.utm) ? void 0 : l.utm_medium) == i.utm_medium, p = null == (u = t.conditions) || null == (u = u.utm) || !u.utm_term || (null == (h = t.conditions) || null == (h = h.utm) ? void 0 : h.utm_term) == i.utm_term;
			return d && c && p && v;
		}
		return !1;
	}
	static zn(t) {
		for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
		Le.info("[WebExperiments] " + t, i);
	}
	Wn(t, e, i) {
		this._is_bot() ? wa.zn(ba) : "control" !== e ? i.forEach(((i) => {
			if (i.selector) {
				var r;
				wa.zn("applying transform of variant " + e + " for experiment " + t + " ", i);
				(null == (r = document) ? void 0 : r.querySelectorAll(i.selector))?.forEach(((t) => {
					var e = t;
					i.html && (e.innerHTML = i.html), i.css && e.setAttribute("style", i.css);
				}));
			}
		})) : wa.zn("Control variants leave the page unmodified.");
	}
	_is_bot() {
		return i && this._instance ? xn(i, this.qt.custom_blocked_useragents) : void 0;
	}
};
var xa = Ne("[Conversations]"), Ea = "Conversations not available yet.", Sa = { featureFlags: class {
	constructor(t) {
		this.Kn = !1, this.Yn = !1, this.Xn = !1, this.es = !1, this.ts = !1, this.rs = !1, this.ns = !1, this.ss = !1, this._instance = t, this.featureFlagEventHandlers = [];
	}
	get qt() {
		return this._instance.config;
	}
	get ni() {
		return this._instance.persistence;
	}
	os(t) {
		return this._instance.get_property(t);
	}
	us() {
		var t, e;
		return null !== (t = null == (e = this.ni) ? void 0 : e.wr(this.qt.feature_flag_cache_ttl_ms)) && void 0 !== t && t;
	}
	ls() {
		return !!this.us() && (this.ss || this.Xn || (this.ss = !0, ca.warn("Feature flag cache is stale, triggering refresh..."), this.reloadFeatureFlags()), !0);
	}
	hs() {
		var t, e = null !== (t = this.qt.evaluation_contexts) && void 0 !== t ? t : this.qt.evaluation_environments;
		return !this.qt.evaluation_environments || this.qt.evaluation_contexts || this.ns || (ca.warn("evaluation_environments is deprecated. Use evaluation_contexts instead. evaluation_environments will be removed in a future version."), this.ns = !0), null != e && e.length ? e.filter(((t) => {
			var e = t && "string" == typeof t && t.trim().length > 0;
			return e || ca.error("Invalid evaluation context found:", t, "Expected non-empty string"), e;
		})) : [];
	}
	cs() {
		return this.hs().length > 0;
	}
	initialize() {
		var t, e, { config: i } = this._instance, r = null !== (t = null == (e = i.bootstrap) ? void 0 : e.featureFlags) && void 0 !== t ? t : {};
		if (Object.keys(r).length) {
			var s, n, o = null !== (s = null == (n = i.bootstrap) ? void 0 : n.featureFlagPayloads) && void 0 !== s ? s : {}, a = Object.keys(r).filter(((t) => !!r[t])).reduce(((t, e) => (t[e] = r[e] || !1, t)), {}), l = Object.keys(o).filter(((t) => a[t])).reduce(((t, e) => (o[e] && (t[e] = o[e]), t)), {});
			this.receivedFeatureFlags({
				featureFlags: a,
				featureFlagPayloads: l
			});
		}
	}
	updateFlags(t, e, i) {
		var r = null != i && i.merge ? this.getFlagVariants() : {}, s = null != i && i.merge ? this.getFlagPayloads() : {}, n = f({}, r, t), o = f({}, s, e), a = {};
		for (var [l, u] of Object.entries(n)) {
			var h = "string" == typeof u;
			a[l] = {
				key: l,
				enabled: !!h || Boolean(u),
				variant: h ? u : void 0,
				reason: void 0,
				metadata: N(null == o ? void 0 : o[l]) ? void 0 : {
					id: 0,
					version: void 0,
					description: void 0,
					payload: o[l]
				}
			};
		}
		this.receivedFeatureFlags({ flags: a });
	}
	get hasLoadedFlags() {
		return this.Yn;
	}
	getFlags() {
		return Object.keys(this.getFlagVariants());
	}
	getFlagsWithDetails() {
		var t = this.os(di), e = this.os(pi), i = this.os(fi);
		if (!i && !e) return t || {};
		var r = Xi({}, t || {});
		for (var n of [...new Set([...Object.keys(i || {}), ...Object.keys(e || {})])]) {
			var o, a, l = r[n], u = null == e ? void 0 : e[n], h = N(u) ? null !== (o = null == l ? void 0 : l.enabled) && void 0 !== o && o : !!u, d = N(u) ? l.variant : "string" == typeof u ? u : void 0, v = null == i ? void 0 : i[n], c = f({}, l, {
				enabled: h,
				variant: h ? null != d ? d : null == l ? void 0 : l.variant : void 0
			});
			h !== (null == l ? void 0 : l.enabled) && (c.original_enabled = null == l ? void 0 : l.enabled), d !== (null == l ? void 0 : l.variant) && (c.original_variant = null == l ? void 0 : l.variant), v && (c.metadata = f({}, null == l ? void 0 : l.metadata, {
				payload: v,
				original_payload: null == l || null == (a = l.metadata) ? void 0 : a.payload
			})), r[n] = c;
		}
		return this.Kn || (ca.warn(" Overriding feature flag details!", {
			flagDetails: t,
			overriddenPayloads: i,
			finalDetails: r
		}), this.Kn = !0), r;
	}
	getFlagVariants() {
		var t = this.os(li), e = this.os(pi);
		if (!e) return t || {};
		for (var i = Xi({}, t), r = Object.keys(e), s = 0; r.length > s; s++) i[r[s]] = e[r[s]];
		return this.Kn || (ca.warn(" Overriding feature flags!", {
			enabledFlags: t,
			overriddenFlags: e,
			finalFlags: i
		}), this.Kn = !0), i;
	}
	getFlagPayloads() {
		var t = this.os(vi), e = this.os(fi);
		if (!e) return t || {};
		for (var i = Xi({}, t || {}), r = Object.keys(e), s = 0; r.length > s; s++) i[r[s]] = e[r[s]];
		return this.Kn || (ca.warn(" Overriding feature flag payloads!", {
			flagPayloads: t,
			overriddenPayloads: e,
			finalPayloads: i
		}), this.Kn = !0), i;
	}
	reloadFeatureFlags() {
		this.es || this.qt.advanced_disable_feature_flags || this.ds || (this._instance.Li.emit("featureFlagsReloading", !0), this.ds = setTimeout((() => {
			this.vs();
		}), 5));
	}
	fs() {
		clearTimeout(this.ds), this.ds = void 0;
	}
	ensureFlagsLoaded() {
		this.Yn || this.Xn || this.ds || this.reloadFeatureFlags();
	}
	setAnonymousDistinctId(t) {
		this.$anon_distinct_id = t;
	}
	setReloadingPaused(t) {
		this.es = t;
	}
	vs(t) {
		var e;
		if (this.fs(), !this._instance.Lr()) if (this.Xn) this.ts = !0;
		else {
			var i = this.qt.token, r = this.os(He), s = {
				token: i,
				distinct_id: this._instance.get_distinct_id(),
				groups: this._instance.getGroups(),
				$anon_distinct_id: this.$anon_distinct_id,
				person_properties: f({}, (null == (e = this.ni) ? void 0 : e.get_initial_props()) || {}, this.os(_i) || {}),
				group_properties: this.os(gi),
				timezone: Qr()
			};
			B(r) || N(r) || (s.$device_id = r), (null != t && t.disableFlags || this.qt.advanced_disable_feature_flags) && (s.disable_flags = !0), this.cs() && (s.evaluation_contexts = this.hs());
			var n = this._instance.requestRouter.endpointFor("flags", "/flags/?v=2" + (this.qt.advanced_only_evaluate_survey_feature_flags ? "&only_evaluate_survey_feature_flags=true" : ""));
			this.Xn = !0, this._instance._send_request({
				method: "POST",
				url: n,
				data: s,
				compression: this.qt.disable_compression ? void 0 : ws.Base64,
				timeout: this.qt.feature_flag_request_timeout_ms,
				callback: (t) => {
					var e, i, r, n = !0;
					if (200 === t.statusCode && (this.ts || (this.$anon_distinct_id = void 0), n = !1), this.Xn = !1, !s.disable_flags || this.ts) {
						this.rs = !n;
						var o = [];
						t.error ? t.error instanceof Error ? o.push("AbortError" === t.error.name ? "timeout" : "connection_error") : o.push("unknown_error") : 200 !== t.statusCode && o.push("api_error_" + t.statusCode), null != (e = t.json) && e.errorsWhileComputingFlags && o.push("errors_while_computing_flags");
						var a, l = !(null == (i = t.json) || null == (i = i.quotaLimited) || !i.includes("feature_flags"));
						if (l && o.push("quota_limited"), null == (r = this.ni) || r.register({ [Ei]: o }), l) ca.warn("You have hit your feature flags quota limit, and will not be able to load feature flags until the quota is reset.  Please visit https://posthog.com/docs/billing/limits-alerts to learn more.");
						else s.disable_flags || this.receivedFeatureFlags(null !== (a = t.json) && void 0 !== a ? a : {}, n, { partialResponse: !!this.qt.advanced_only_evaluate_survey_feature_flags }), this.ts && (this.ts = !1, this.vs());
					}
				}
			});
		}
	}
	getFeatureFlag(t, e) {
		var i;
		if (void 0 === e && (e = {}), !e.fresh || this.rs) if (this.Yn || this.getFlags() && this.getFlags().length > 0) {
			if (!this.ls()) {
				var r = this.getFeatureFlagResult(t, e);
				return null !== (i = null == r ? void 0 : r.variant) && void 0 !== i ? i : null == r ? void 0 : r.enabled;
			}
		} else ca.warn("getFeatureFlag for key \"" + t + fa);
	}
	getFeatureFlagDetails(t) {
		return this.getFlagsWithDetails()[t];
	}
	getFeatureFlagPayload(t) {
		var e = this.getFeatureFlagResult(t, { send_event: !1 });
		return null == e ? void 0 : e.payload;
	}
	getFeatureFlagResult(t, e) {
		if (void 0 === e && (e = {}), !e.fresh || this.rs) if (this.Yn || this.getFlags() && this.getFlags().length > 0) {
			if (!this.ls()) {
				var i = this.getFlagVariants(), r = t in i, s = i[t], n = this.getFlagPayloads()[t], o = String(s), a = this.os(ci) || void 0, l = this.os(Si) || void 0, u = this.os(wi) || {};
				if (this.qt.advanced_feature_flags_dedup_per_session) {
					var h, d = this._instance.get_session_id(), v = this.os(xi);
					d && d !== v && (u = {}, null == (h = this.ni) || h.register({
						[wi]: u,
						[xi]: d
					}));
				}
				if ((e.send_event || !("send_event" in e)) && (!(t in u) || !u[t].includes(o))) {
					var c, p, f, _, g, m, b, y, w, x;
					M(u[t]) ? u[t].push(o) : u[t] = [o], null == (c = this.ni) || c.register({ [wi]: u });
					var E = this.getFeatureFlagDetails(t), S = [...null !== (p = this.os(Ei)) && void 0 !== p ? p : []];
					N(s) && S.push("flag_missing");
					var T = {
						$feature_flag: t,
						$feature_flag_response: s,
						$feature_flag_payload: n || null,
						$feature_flag_request_id: a,
						$feature_flag_evaluated_at: l,
						$feature_flag_bootstrapped_response: (null == (f = this.qt.bootstrap) || null == (f = f.featureFlags) ? void 0 : f[t]) || null,
						$feature_flag_bootstrapped_payload: (null == (_ = this.qt.bootstrap) || null == (_ = _.featureFlagPayloads) ? void 0 : _[t]) || null,
						$used_bootstrap_value: !this.rs
					};
					N(null == E || null == (g = E.metadata) ? void 0 : g.version) || (T.$feature_flag_version = E.metadata.version);
					var k, R = null !== (m = null == E || null == (b = E.reason) ? void 0 : b.description) && void 0 !== m ? m : null == E || null == (y = E.reason) ? void 0 : y.code;
					R && (T.$feature_flag_reason = R), null != E && null != (w = E.metadata) && w.id && (T.$feature_flag_id = E.metadata.id), N(null == E ? void 0 : E.original_variant) && N(null == E ? void 0 : E.original_enabled) || (T.$feature_flag_original_response = N(E.original_variant) ? E.original_enabled : E.original_variant), null != E && null != (x = E.metadata) && x.original_payload && (T.$feature_flag_original_payload = null == E || null == (k = E.metadata) ? void 0 : k.original_payload), S.length && (T.$feature_flag_error = S.join(",")), this._instance.capture("$feature_flag_called", T);
				}
				if (r) {
					var P = n;
					if (!N(n)) try {
						P = JSON.parse(n);
					} catch (t) {}
					return {
						key: t,
						enabled: !!s,
						variant: "string" == typeof s ? s : void 0,
						payload: P
					};
				}
			}
		} else ca.warn("getFeatureFlagResult for key \"" + t + fa);
	}
	getRemoteConfigPayload(t, e) {
		var i = this.qt.token, r = {
			distinct_id: this._instance.get_distinct_id(),
			token: i
		};
		this.cs() && (r.evaluation_contexts = this.hs()), this._instance._send_request({
			method: "POST",
			url: this._instance.requestRouter.endpointFor("flags", "/flags/?v=2"),
			data: r,
			compression: this.qt.disable_compression ? void 0 : ws.Base64,
			timeout: this.qt.feature_flag_request_timeout_ms,
			callback(i) {
				var r, s = null == (r = i.json) ? void 0 : r.featureFlagPayloads;
				e((null == s ? void 0 : s[t]) || void 0);
			}
		});
	}
	isFeatureEnabled(t, e) {
		if (void 0 === e && (e = {}), !e.fresh || this.rs) {
			if (this.Yn || this.getFlags() && this.getFlags().length > 0) {
				var i = this.getFeatureFlag(t, e);
				return N(i) ? void 0 : !!i;
			}
			ca.warn("isFeatureEnabled for key \"" + t + fa);
		}
	}
	addFeatureFlagsHandler(t) {
		this.featureFlagEventHandlers.push(t);
	}
	removeFeatureFlagsHandler(t) {
		this.featureFlagEventHandlers = this.featureFlagEventHandlers.filter(((e) => e !== t));
	}
	receivedFeatureFlags(t, e, i) {
		if (this.ni) {
			this.Yn = !0;
			var r = this.getFlagVariants(), s = this.getFlagPayloads(), n = this.getFlagsWithDetails();
			(function(t, e, i, r, s, n) {
				void 0 === i && (i = {}), void 0 === r && (r = {}), void 0 === s && (s = {});
				var o = ((t) => {
					var e = t.flags;
					return e ? (t.featureFlags = Object.fromEntries(Object.keys(e).map(((t) => {
						var i;
						return [t, null !== (i = e[t].variant) && void 0 !== i ? i : e[t].enabled];
					}))), t.featureFlagPayloads = Object.fromEntries(Object.keys(e).filter(((t) => e[t].enabled)).filter(((t) => {
						var i;
						return null == (i = e[t].metadata) ? void 0 : i.payload;
					})).map(((t) => {
						var i;
						return [t, null == (i = e[t].metadata) ? void 0 : i.payload];
					})))) : ca.warn("Using an older version of the feature flags endpoint. Please upgrade your PostHog server to the latest version"), t;
				})(t), a = o.flags, l = o.featureFlags, u = o.featureFlagPayloads;
				if (l) {
					var h = t.requestId, d = t.evaluatedAt;
					if (M(l)) {
						ca.warn("v1 of the feature flags endpoint is deprecated. Please use the latest version.");
						var v = {};
						if (l) for (var c = 0; l.length > c; c++) v[l[c]] = !0;
						e && e.register({
							[ui]: l,
							[li]: v
						});
					} else {
						var p = l, _ = u, g = a;
						if (null != n && n.partialResponse) p = f({}, i, p), _ = f({}, r, _), g = f({}, s, g);
						else if (t.errorsWhileComputingFlags) if (a) {
							var m = new Set(Object.keys(a).filter(((t) => {
								var e;
								return !(null != (e = a[t]) && e.failed);
							})));
							p = f({}, i, Object.fromEntries(Object.entries(p).filter(((t) => {
								var [e] = t;
								return m.has(e);
							})))), _ = f({}, r, Object.fromEntries(Object.entries(_ || {}).filter(((t) => {
								var [e] = t;
								return m.has(e);
							})))), g = f({}, s, Object.fromEntries(Object.entries(g || {}).filter(((t) => {
								var [e] = t;
								return m.has(e);
							}))));
						} else p = f({}, i, p), _ = f({}, r, _), g = f({}, s, g);
						e && e.register(f({
							[ui]: Object.keys(ga(p)),
							[li]: p || {},
							[vi]: _ || {},
							[di]: g || {}
						}, h ? { [ci]: h } : {}, d ? { [Si]: d } : {}));
					}
				}
			})(t, this.ni, r, s, n, i), e || (this.ss = !1), this.ps(e);
		}
	}
	override(t, e) {
		void 0 === e && (e = !1), ca.warn("override is deprecated. Please use overrideFeatureFlags instead."), this.overrideFeatureFlags({
			flags: t,
			suppressWarning: e
		});
	}
	overrideFeatureFlags(t) {
		if (!this._instance.__loaded || !this.ni) return ca.uninitializedWarning("posthog.featureFlags.overrideFeatureFlags");
		if (!1 === t) return this.ni.unregister(pi), this.ni.unregister(fi), this.ps(), pa.info("All overrides cleared");
		if (M(t)) {
			var e = _a(t);
			return this.ni.register({ [pi]: e }), this.ps(), pa.info("Flag overrides set", { flags: t });
		}
		if (t && "object" == typeof t && ("flags" in t || "payloads" in t)) {
			var i, r = t;
			if (this.Kn = Boolean(null !== (i = r.suppressWarning) && void 0 !== i && i), "flags" in r) {
				if (!1 === r.flags) this.ni.unregister(pi), pa.info("Flag overrides cleared");
				else if (r.flags) {
					if (M(r.flags)) {
						var s = _a(r.flags);
						this.ni.register({ [pi]: s });
					} else this.ni.register({ [pi]: r.flags });
					pa.info("Flag overrides set", { flags: r.flags });
				}
			}
			"payloads" in r && (!1 === r.payloads ? (this.ni.unregister(fi), pa.info("Payload overrides cleared")) : r.payloads && (this.ni.register({ [fi]: r.payloads }), pa.info("Payload overrides set", { payloads: r.payloads }))), this.ps();
			return;
		}
		if (t && "object" == typeof t) return this.ni.register({ [pi]: t }), this.ps(), pa.info("Flag overrides set", { flags: t });
		ca.warn("Invalid overrideOptions provided to overrideFeatureFlags", { overrideOptions: t });
	}
	onFeatureFlags(t) {
		if (this.addFeatureFlagsHandler(t), this.Yn) {
			var { flags: e, flagVariants: i } = this.gs();
			t(e, i);
		}
		return () => this.removeFeatureFlagsHandler(t);
	}
	updateEarlyAccessFeatureEnrollment(t, e, i) {
		var r, s = (this.os(hi) || []).find(((e) => e.flagKey === t)), n = { ["$feature_enrollment/" + t]: e }, o = {
			$feature_flag: t,
			$feature_enrollment: e,
			$set: n
		};
		s && (o.$early_access_feature_name = s.name), i && (o.$feature_enrollment_stage = i), this._instance.capture("$feature_enrollment_update", o), this.setPersonPropertiesForFlags(n, !1);
		var a = f({}, this.getFlagVariants(), { [t]: e });
		null == (r = this.ni) || r.register({
			[ui]: Object.keys(ga(a)),
			[li]: a
		}), this.ps();
	}
	getEarlyAccessFeatures(t, e, i) {
		void 0 === e && (e = !1);
		var r = this.os(hi), s = i ? "&" + i.map(((t) => "stage=" + t)).join("&") : "";
		if (r && !e) return t(r);
		this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/early_access_features/?token=" + this.qt.token + s),
			method: "GET",
			callback: (e) => {
				var i, r;
				if (e.json) {
					var s = e.json.earlyAccessFeatures;
					return null == (i = this.ni) || i.unregister(hi), null == (r = this.ni) || r.register({ [hi]: s }), t(s);
				}
			}
		});
	}
	gs() {
		var t = this.getFlags(), e = this.getFlagVariants();
		return {
			flags: t.filter(((t) => e[t])),
			flagVariants: Object.keys(e).filter(((t) => e[t])).reduce(((t, i) => (t[i] = e[i], t)), {})
		};
	}
	ps(t) {
		var { flags: e, flagVariants: i } = this.gs();
		this.featureFlagEventHandlers.forEach(((r) => r(e, i, { errorsLoading: t })));
	}
	setPersonPropertiesForFlags(t, e) {
		void 0 === e && (e = !0);
		var i = this.os(_i) || {}, r = (null == t ? void 0 : t.$set) || (null != t && t.$set_once ? {} : t), s = null == t ? void 0 : t.$set_once, n = {};
		if (s) for (var o in s) ({}).hasOwnProperty.call(s, o) && (o in i || (n[o] = s[o]));
		this._instance.register({ [_i]: f({}, i, n, r) }), e && this._instance.reloadFeatureFlags();
	}
	resetPersonPropertiesForFlags() {
		this._instance.unregister(_i);
	}
	setGroupPropertiesForFlags(t, e) {
		void 0 === e && (e = !0);
		var i = this.os(gi) || {};
		0 !== Object.keys(i).length && Object.keys(i).forEach(((e) => {
			i[e] = f({}, i[e], t[e]), delete t[e];
		})), this._instance.register({ [gi]: f({}, i, t) }), e && this._instance.reloadFeatureFlags();
	}
	resetGroupPropertiesForFlags(t) {
		if (t) {
			var e = this.os(gi) || {};
			this._instance.register({ [gi]: f({}, e, { [t]: {} }) });
		} else this._instance.unregister(gi);
	}
	reset() {
		this.Yn = !1, this.Xn = !1, this.es = !1, this.ts = !1, this.rs = !1, this.$anon_distinct_id = void 0, this.fs(), this.Kn = !1;
	}
} }, $a = { sessionRecording: class {
	get qt() {
		return this._instance.config;
	}
	get ni() {
		return this._instance.persistence;
	}
	get started() {
		var t;
		return !(null == (t = this.ys) || !t.isStarted);
	}
	get status() {
		var t, e;
		return this.bs === Yo || this.bs === Jo ? this.bs : null !== (t = null == (e = this.ys) ? void 0 : e.status) && void 0 !== t ? t : this.bs;
	}
	constructor(t) {
		if (this._forceAllowLocalhostNetworkCapture = !1, this.bs = Wo, this._s = void 0, this._instance = t, !this._instance.sessionManager) throw Xo.error("started without valid sessionManager"), /* @__PURE__ */ new Error(Ko + " started without valid sessionManager. This is a bug.");
		if (this.qt.cookieless_mode === Ni) throw new Error(Ko + " cannot be used with cookieless_mode=\"always\"");
	}
	initialize() {
		this.startIfEnabledOrStop();
	}
	get ws() {
		var e, i = !(null == (e = this._instance.get_property(ei)) || !e.enabled), r = !this.qt.disable_session_recording, s = this.qt.disable_session_recording || this._instance.consent.isOptedOut();
		return t && i && r && !s;
	}
	startIfEnabledOrStop(t) {
		var e;
		if (!this.ws || null == (e = this.ys) || !e.isStarted) {
			var i = !N(Object.assign) && !N(Array.from);
			this.ws && i ? (this.xs(t), Xo.info("starting")) : (this.bs = Wo, this.stopRecording());
		}
	}
	xs(t) {
		var e, i, r;
		this.ws && (this.bs !== Yo && this.bs !== Jo && (this.bs = Go), null != h && null != (e = h.__PosthogExtensions__) && null != (e = e.rrweb) && e.record && null != (i = h.__PosthogExtensions__) && i.initSessionRecording ? this.Ss(t) : null == (r = h.__PosthogExtensions__) || null == r.loadExternalDependency || r.loadExternalDependency(this._instance, this.ks, ((e) => {
			if (e) return Xo.error("could not load recorder", e);
			this.Ss(t);
		})));
	}
	stopRecording() {
		var t, e;
		null == (t = this._s) || t.call(this), this._s = void 0, null == (e = this.ys) || e.stop();
	}
	Cs() {
		var t, e;
		null == (t = this._s) || t.call(this), this._s = void 0, null == (e = this.ys) || e.discard();
	}
	Is() {
		var t;
		null == (t = this.ni) || t.unregister(ai);
	}
	Ts(t, e) {
		if (H(t)) return null;
		var i, r = q(t) ? t : parseFloat(t);
		return "number" != typeof (i = r) || !Number.isFinite(i) || 0 > i || i > 1 ? (Xo.warn(e + " must be between 0 and 1. Ignoring invalid value:", t), null) : r;
	}
	Es(t) {
		if (this.ni) {
			var e, i, r = this.ni, s = () => {
				var e, i = !1 === t.sessionRecording ? void 0 : t.sessionRecording, s = this.Ts(null == (e = this.qt.session_recording) ? void 0 : e.sampleRate, "session_recording.sampleRate"), n = this.Ts(null == i ? void 0 : i.sampleRate, "remote config sampleRate"), o = null != s ? s : n;
				H(o) && this.Is();
				var a = null == i ? void 0 : i.minimumDurationMilliseconds;
				r.register({ [ei]: f({
					cache_timestamp: Date.now(),
					enabled: !!i
				}, i, {
					networkPayloadCapture: f({ capturePerformance: t.capturePerformance }, null == i ? void 0 : i.networkPayloadCapture),
					canvasRecording: {
						enabled: null == i ? void 0 : i.recordCanvas,
						fps: null == i ? void 0 : i.canvasFps,
						quality: null == i ? void 0 : i.canvasQuality
					},
					sampleRate: o,
					minimumDurationMilliseconds: N(a) ? null : a,
					endpoint: null == i ? void 0 : i.endpoint,
					triggerMatchType: null == i ? void 0 : i.triggerMatchType,
					masking: null == i ? void 0 : i.masking,
					urlTriggers: null == i ? void 0 : i.urlTriggers,
					version: null == i ? void 0 : i.version,
					triggerGroups: null == i ? void 0 : i.triggerGroups
				}) });
			};
			s(), null == (e = this._s) || e.call(this), this._s = null == (i = this._instance.sessionManager) ? void 0 : i.onSessionId(s);
		}
	}
	onRemoteConfig(t) {
		"sessionRecording" in t ? !1 === t.sessionRecording ? (this.Es(t), this.Cs()) : (this.Es(t), this.startIfEnabledOrStop()) : (this.bs === Yo && (this.bs = Jo, Xo.warn("config refresh failed, recording will not start until page reload")), this.startIfEnabledOrStop());
	}
	log(t, e) {
		var i;
		void 0 === e && (e = "log"), null != (i = this.ys) && i.log ? this.ys.log(t, e) : Xo.warn("log called before recorder was ready");
	}
	get ks() {
		var t, e, i = null == (t = this._instance) || null == (t = t.persistence) ? void 0 : t.get_property(ei);
		return (null == i || null == (e = i.scriptConfig) ? void 0 : e.script) || "lazy-recorder";
	}
	Ms() {
		var t, e, i = this._instance.get_property(ei);
		if (!i) return !1;
		try {
			e = "object" == typeof i ? i : JSON.parse(i);
		} catch (t) {
			return Xo.warn("persisted remote config for session recording is invalid and will be ignored", t), !1;
		}
		var r = null !== (t = e.cache_timestamp) && void 0 !== t ? t : Date.now();
		return 36e5 >= Date.now() - r;
	}
	Ss(t) {
		var e, i;
		if (null == (e = h.__PosthogExtensions__) || !e.initSessionRecording) return Xo.warn("Called on script loaded before session recording is available. This can be caused by adblockers."), void this._instance.register_for_session({ [Di]: !0 });
		if (this.ys || (this.ys = null == (i = h.__PosthogExtensions__) ? void 0 : i.initSessionRecording(this._instance), this.ys._forceAllowLocalhostNetworkCapture = this._forceAllowLocalhostNetworkCapture), !this.Ms()) {
			if (this.bs === Jo || this.bs === Yo) return;
			this.bs = Yo, Xo.info("persisted remote config is stale, requesting fresh config before starting"), new bs(this._instance).load();
			return;
		}
		this.bs = Go, this.ys.start(t);
	}
	onRRwebEmit(t) {
		var e;
		null == (e = this.ys) || null == e.onRRwebEmit || e.onRRwebEmit(t);
	}
	overrideLinkedFlag() {
		var t, e;
		this.ys || null == (e = this.ni) || e.register({ [ri]: !0 }), null == (t = this.ys) || t.overrideLinkedFlag();
	}
	overrideSampling() {
		var t, e;
		this.ys || null == (e = this.ni) || e.register({ [ii]: !0 }), null == (t = this.ys) || t.overrideSampling();
	}
	overrideTrigger(t) {
		var e, i;
		this.ys || null == (i = this.ni) || i.register({ ["url" === t ? si : ni]: !0 }), null == (e = this.ys) || e.overrideTrigger(t);
	}
	get sdkDebugProperties() {
		var t;
		return (null == (t = this.ys) ? void 0 : t.sdkDebugProperties) || { $recording_status: this.status };
	}
	tryAddCustomEvent(t, e) {
		var i;
		return !(null == (i = this.ys) || !i.tryAddCustomEvent(t, e));
	}
} }, Ta = {
	autocapture: class {
		constructor(t) {
			this.Ps = !1, this.Rs = null, this.Os = !1, this.instance = t, this.rageclicks = new Mo(t.config.rageclick), this.Ls = null;
		}
		initialize() {
			this.startIfEnabled();
		}
		get qt() {
			var t, e, i = U(this.instance.config.autocapture) ? this.instance.config.autocapture : {};
			return i.url_allowlist = null == (t = i.url_allowlist) ? void 0 : t.map(((t) => new RegExp(t))), i.url_ignorelist = null == (e = i.url_ignorelist) ? void 0 : e.map(((t) => new RegExp(t))), i;
		}
		Fs() {
			if (this.isBrowserSupported()) {
				if (t && r) {
					var e = (e) => {
						e = e || (null == t ? void 0 : t.event);
						try {
							this.As(e);
						} catch (t) {
							Uo.error("Failed to capture event", t);
						}
					};
					if (sr(r, "submit", e, { capture: !0 }), sr(r, "change", e, { capture: !0 }), sr(r, "click", e, { capture: !0 }), this.qt.capture_copied_text) {
						var i = (e) => {
							e = e || (null == t ? void 0 : t.event);
							try {
								this.As(e, Do);
							} catch (t) {
								Uo.error("Failed to capture copy/cut event", t);
							}
						};
						sr(r, "copy", i, { capture: !0 }), sr(r, "cut", i, { capture: !0 });
					}
				}
			} else Uo.info("Disabling Automatic Event Collection because this browser is not supported");
		}
		startIfEnabled() {
			this.isEnabled && !this.Ps && (this.Fs(), this.Ps = !0);
		}
		onRemoteConfig(t) {
			t.elementsChainAsString && (this.Os = t.elementsChainAsString), this.instance.persistence && this.instance.persistence.register({ [We]: !!t.autocapture_opt_out }), this.Rs = !!t.autocapture_opt_out, this.startIfEnabled();
		}
		setElementSelectors(t) {
			this.Ls = t;
		}
		getElementSelectors(t) {
			var e, i = [];
			return null == (e = this.Ls) || e.forEach(((e) => {
				(null == r ? void 0 : r.querySelectorAll(e))?.forEach(((r) => {
					t === r && i.push(e);
				}));
			})), i;
		}
		get isEnabled() {
			var t, e, i = null == (t = this.instance.persistence) ? void 0 : t.props[We];
			if (B(this.Rs) && !W(i) && !this.instance.Lr()) return !1;
			var r = null !== (e = this.Rs) && void 0 !== e ? e : !!i;
			return !!this.instance.config.autocapture && !r;
		}
		As(e, i) {
			if (void 0 === i && (i = "$autocapture"), this.isEnabled) {
				var r, s = po(e);
				oo(s) && (s = s.parentNode || null), "$autocapture" === i && "click" === e.type && e instanceof MouseEvent && this.instance.config.rageclick && null != (r = this.rageclicks) && r.isRageClick(e.clientX, e.clientY, e.timeStamp || (/* @__PURE__ */ new Date()).getTime()) && function(e, i) {
					if (!t || yo(e)) return !1;
					var r, s, n;
					if (W(i) ? (r = !!i && bo, s = void 0) : (r = null !== (n = null == i ? void 0 : i.css_selector_ignorelist) && void 0 !== n ? n : bo, s = null == i ? void 0 : i.content_ignorelist), !1 === r) return !1;
					var { targetElementList: o } = wo(e, !1);
					return !function(t, e) {
						if (!1 === t || N(t)) return !1;
						var i;
						if (!0 === t) i = mo;
						else {
							if (!M(t)) return !1;
							if (t.length > 10) return Le.error("[PostHog] content_ignorelist array cannot exceed 10 items. Use css_selector_ignorelist for more complex matching."), !1;
							i = t.map(((t) => t.toLowerCase()));
						}
						return e.some(((t) => {
							var { safeText: e, ariaLabel: r } = t;
							return i.some(((t) => e.includes(t) || r.includes(t)));
						}));
					}(s, o.map(((t) => {
						var e;
						return {
							safeText: co(t).toLowerCase(),
							ariaLabel: (null == (e = t.getAttribute("aria-label")) ? void 0 : e.toLowerCase().trim()) || ""
						};
					}))) && !_o(o, r);
				}(s, this.instance.config.rageclick) && this.As(e, "$rageclick");
				var n = i === Do;
				if (s && function(e, i, r, s, n) {
					var o, a, l, u;
					if (void 0 === r && (r = void 0), !t || yo(e)) return !1;
					if (null != (o = r) && o.url_allowlist && !uo(r.url_allowlist)) return !1;
					if (null != (a = r) && a.url_ignorelist && uo(r.url_ignorelist)) return !1;
					if (null != (l = r) && l.dom_event_allowlist) {
						var h = r.dom_event_allowlist;
						if (h && !h.some(((t) => i.type === t))) return !1;
					}
					var { parentIsUsefulElement: d, targetElementList: v } = wo(e, s);
					if (!function(t, e) {
						var i = null == e ? void 0 : e.element_allowlist;
						if (N(i)) return !0;
						var r, s = function(t) {
							if (i.some(((e) => t.tagName.toLowerCase() === e))) return { v: !0 };
						};
						for (var n of t) if (r = s(n)) return r.v;
						return !1;
					}(v, r)) return !1;
					if (!_o(v, null == (u = r) ? void 0 : u.css_selector_allowlist)) return !1;
					var c = t.getComputedStyle(e);
					if (c && "pointer" === c.getPropertyValue("cursor") && "click" === i.type) return !0;
					var p = e.tagName.toLowerCase();
					switch (p) {
						case "html": return !1;
						case "form": return (n || ["submit"]).indexOf(i.type) >= 0;
						case "input":
						case "select":
						case "textarea": return (n || ["change", "click"]).indexOf(i.type) >= 0;
						default: return d ? (n || ["click"]).indexOf(i.type) >= 0 : (n || ["click"]).indexOf(i.type) >= 0 && (fo.indexOf(p) > -1 || "true" === e.getAttribute("contenteditable"));
					}
				}(s, e, this.qt, n, n ? ["copy", "cut"] : void 0)) {
					var { props: o, explicitNoCapture: a } = jo(s, {
						e,
						maskAllElementAttributes: this.instance.config.mask_all_element_attributes,
						maskAllText: this.instance.config.mask_all_text,
						elementAttributeIgnoreList: this.qt.element_attribute_ignorelist,
						elementsChainAsString: this.Os
					});
					if (a) return !1;
					var l = this.getElementSelectors(s);
					if (l && l.length > 0 && (o.$element_selectors = l), i === Do) {
						var u, h = vo(null == t || null == (u = t.getSelection()) ? void 0 : u.toString()), d = e.type || "clipboard";
						if (!h) return !1;
						o.$selected_content = h, o.$copy_type = d;
					}
					return this.instance.capture(i, o), !0;
				}
			}
		}
		isBrowserSupported() {
			return D(null == r ? void 0 : r.querySelectorAll);
		}
	},
	historyAutocapture: class {
		constructor(e) {
			var i;
			this._instance = e, this.Ns = (null == t || null == (i = t.location) ? void 0 : i.pathname) || "";
		}
		initialize() {
			this.startIfEnabled();
		}
		get isEnabled() {
			return "history_change" === this._instance.config.capture_pageview;
		}
		startIfEnabled() {
			this.isEnabled && (Le.info("History API monitoring enabled, starting..."), this.monitorHistoryChanges());
		}
		stop() {
			this.$s && this.$s(), this.$s = void 0, Le.info("History API monitoring stopped");
		}
		monitorHistoryChanges() {
			var e, i;
			if (t && t.history) {
				var r = this;
				null != (e = t.history.pushState) && e.__posthog_wrapped__ || Bo(t.history, "pushState", ((t) => function(e, i, s) {
					t.call(this, e, i, s), r.Ds("pushState");
				})), null != (i = t.history.replaceState) && i.__posthog_wrapped__ || Bo(t.history, "replaceState", ((t) => function(e, i, s) {
					t.call(this, e, i, s), r.Ds("replaceState");
				})), this.qs();
			}
		}
		Ds(e) {
			try {
				var i, r = null == t || null == (i = t.location) ? void 0 : i.pathname;
				if (!r) return;
				r !== this.Ns && this.isEnabled && this._instance.capture(Vi, { navigation_type: e }), this.Ns = r;
			} catch (t) {
				Le.error("Error capturing " + e + " pageview", t);
			}
		}
		qs() {
			if (!this.$s) {
				var e = () => {
					this.Ds("popstate");
				};
				sr(t, "popstate", e), this.$s = () => {
					t && t.removeEventListener("popstate", e);
				};
			}
		}
	},
	heatmaps: class {
		get qt() {
			return this.instance.config;
		}
		constructor(t) {
			var e;
			this.js = !1, this.Ps = !1, this.Hs = null, this.instance = t, this.js = !(null == (e = this.instance.persistence) || !e.props[Ge]), this.rageclicks = new Mo(t.config.rageclick);
		}
		initialize() {
			this.startIfEnabled();
		}
		get flushIntervalMilliseconds() {
			var t = 5e3;
			return U(this.qt.capture_heatmaps) && this.qt.capture_heatmaps.flush_interval_milliseconds && (t = this.qt.capture_heatmaps.flush_interval_milliseconds), t;
		}
		get isEnabled() {
			return H(this.qt.capture_heatmaps) ? H(this.qt.enable_heatmaps) ? this.js : this.qt.enable_heatmaps : !1 !== this.qt.capture_heatmaps;
		}
		startIfEnabled() {
			if (this.isEnabled) {
				if (this.Ps) return;
				Qo.info("starting..."), this.Us(), this.At();
			} else {
				var t;
				clearInterval(null !== (t = this.Hs) && void 0 !== t ? t : void 0), this.Bs(), this.getAndClearBuffer();
			}
		}
		onRemoteConfig(t) {
			if ("heatmaps" in t) {
				var e = !!t.heatmaps;
				this.instance.persistence && this.instance.persistence.register({ [Ge]: e }), this.js = e, this.startIfEnabled();
			}
		}
		getAndClearBuffer() {
			var t = this.M;
			return this.M = void 0, t;
		}
		zs(t) {
			this.Mt(t.originalEvent, "deadclick");
		}
		At() {
			this.Hs && clearInterval(this.Hs), this.Hs = "visible" === (null == r ? void 0 : r.visibilityState) ? setInterval(this.Zr.bind(this), this.flushIntervalMilliseconds) : null;
		}
		Us() {
			t && r && (this.Vs = this.Zr.bind(this), sr(t, qi, this.Vs), this.Ws = (e) => this.Mt(e || (null == t ? void 0 : t.event)), sr(r, "click", this.Ws, { capture: !0 }), this.Zs = (e) => this.Gs(e || (null == t ? void 0 : t.event)), sr(r, "mousemove", this.Zs, { capture: !0 }), this.Qs = new kr(this.instance, $r, this.zs.bind(this)), this.Qs.startIfEnabledOrStop(), this.Js = this.At.bind(this), sr(r, Hi, this.Js), this.Ps = !0);
		}
		Bs() {
			var e;
			t && r && (this.Vs && t.removeEventListener(qi, this.Vs), this.Ws && r.removeEventListener("click", this.Ws, { capture: !0 }), this.Zs && r.removeEventListener("mousemove", this.Zs, { capture: !0 }), this.Js && r.removeEventListener(Hi, this.Js), clearTimeout(this.Ks), null == (e = this.Qs) || e.stop(), this.Ps = !1);
		}
		Ys(e, i) {
			var r = this.instance.scrollManager.scrollY(), s = this.instance.scrollManager.scrollX(), n = this.instance.scrollManager.scrollElement(), o = function(e, i, r) {
				for (var s = e; s && so(s) && !no(s, "body");) {
					if (s === r) return !1;
					if (P(i, null == t ? void 0 : t.getComputedStyle(s).position)) return !0;
					s = go(s);
				}
				return !1;
			}(po(e), ["fixed", "sticky"], n);
			return {
				x: e.clientX + (o ? 0 : s),
				y: e.clientY + (o ? 0 : r),
				target_fixed: o,
				type: i
			};
		}
		Mt(t, e) {
			var i;
			if (void 0 === e && (e = "click"), !ro(t.target) && Zo(t)) {
				var r = this.Ys(t, e);
				null != (i = this.rageclicks) && i.isRageClick(t.clientX, t.clientY, (/* @__PURE__ */ new Date()).getTime()) && this.Xs(f({}, r, { type: "rageclick" })), this.Xs(r);
			}
		}
		Gs(t) {
			!ro(t.target) && Zo(t) && (clearTimeout(this.Ks), this.Ks = setTimeout((() => {
				this.Xs(this.Ys(t, "mousemove"));
			}), 500));
		}
		Xs(e) {
			if (t) {
				var i = t.location.href, r = this.qt.custom_personal_data_properties, n = Ur(i, this.qt.mask_personal_data_properties ? [...jr, ...r || []] : [], Br);
				this.M = this.M || {}, this.M[n] || (this.M[n] = []), this.M[n].push(e);
			}
		}
		Zr() {
			this.M && !L(this.M) && this.instance.capture("$$heatmap", { $heatmap_data: this.getAndClearBuffer() });
		}
	},
	deadClicksAutocapture: kr,
	webVitalsAutocapture: class {
		constructor(t) {
			var e;
			this.js = !1, this.Ps = !1, this.M = {
				url: void 0,
				metrics: [],
				firstMetricTimestamp: void 0
			}, this.eo = () => {
				clearTimeout(this.ro), 0 !== this.M.metrics.length && (this._instance.capture("$web_vitals", this.M.metrics.reduce(((t, e) => f({}, t, {
					["$web_vitals_" + e.name + "_event"]: f({}, e),
					["$web_vitals_" + e.name + "_value"]: e.value
				})), {})), this.M = {
					url: void 0,
					metrics: [],
					firstMetricTimestamp: void 0
				});
			}, this.ht = (t) => {
				var e, i = null == (e = this._instance.sessionManager) ? void 0 : e.checkAndGetSessionAndWindowId(!0);
				if (N(i)) qo.error("Could not read session ID. Dropping metrics!");
				else {
					this.M = this.M || {
						url: void 0,
						metrics: [],
						firstMetricTimestamp: void 0
					};
					var r = this.io();
					N(r) || (H(null == t ? void 0 : t.name) || H(null == t ? void 0 : t.value) ? qo.error("Invalid metric received", t) : !this.no || this.no > t.value ? (this.M.url !== r && (this.eo(), this.ro = setTimeout(this.eo, this.flushToCaptureTimeoutMs)), N(this.M.url) && (this.M.url = r), this.M.firstMetricTimestamp = N(this.M.firstMetricTimestamp) ? Date.now() : this.M.firstMetricTimestamp, t.attribution && t.attribution.interactionTargetElement && (t.attribution.interactionTargetElement = void 0), this.M.metrics.push(f({}, t, {
						$current_url: r,
						$session_id: i.sessionId,
						$window_id: i.windowId,
						timestamp: Date.now()
					})), this.M.metrics.length === this.allowedMetrics.length && this.eo()) : qo.error("Ignoring metric with value >= " + this.no, t));
				}
			}, this.so = () => {
				if (!this.Ps) {
					var t, e, i, r, s = h.__PosthogExtensions__;
					N(s) || N(s.postHogWebVitalsCallbacks) || ({onLCP: t, onCLS: e, onFCP: i, onINP: r} = s.postHogWebVitalsCallbacks), t && e && i && r ? (this.allowedMetrics.indexOf("LCP") > -1 && t(this.ht.bind(this)), this.allowedMetrics.indexOf("CLS") > -1 && e(this.ht.bind(this)), this.allowedMetrics.indexOf("FCP") > -1 && i(this.ht.bind(this)), this.allowedMetrics.indexOf("INP") > -1 && r(this.ht.bind(this)), this.Ps = !0) : qo.error("web vitals callbacks not loaded - not starting");
				}
			}, this._instance = t, this.js = !(null == (e = this._instance.persistence) || !e.props[Xe]), this.startIfEnabled();
		}
		get oo() {
			return this._instance.config.capture_performance;
		}
		get allowedMetrics() {
			var t, e, i = U(this.oo) ? null == (t = this.oo) ? void 0 : t.web_vitals_allowed_metrics : void 0;
			return H(i) ? (null == (e = this._instance.persistence) ? void 0 : e.props[ti]) || [
				"CLS",
				"FCP",
				"INP",
				"LCP"
			] : i;
		}
		get flushToCaptureTimeoutMs() {
			return (U(this.oo) ? this.oo.web_vitals_delayed_flush_ms : void 0) || 5e3;
		}
		get useAttribution() {
			var t = U(this.oo) ? this.oo.web_vitals_attribution : void 0;
			return null != t && t;
		}
		get no() {
			var t = U(this.oo) && q(this.oo.__web_vitals_max_value) ? this.oo.__web_vitals_max_value : Vo;
			return t > 0 && 6e4 >= t ? Vo : t;
		}
		get isEnabled() {
			var t = null == s ? void 0 : s.protocol;
			if ("http:" !== t && "https:" !== t) return qo.info("Web Vitals are disabled on non-http/https protocols"), !1;
			var e = U(this.oo) ? this.oo.web_vitals : W(this.oo) ? this.oo : void 0;
			return W(e) ? e : this.js;
		}
		startIfEnabled() {
			this.isEnabled && !this.Ps && (qo.info("enabled, starting..."), this.lr(this.so));
		}
		onRemoteConfig(t) {
			if ("capturePerformance" in t) {
				var e = U(t.capturePerformance) && !!t.capturePerformance.web_vitals, i = U(t.capturePerformance) ? t.capturePerformance.web_vitals_allowed_metrics : void 0;
				this._instance.persistence && (this._instance.persistence.register({ [Xe]: e }), this._instance.persistence.register({ [ti]: i })), this.js = e, this.startIfEnabled();
			}
		}
		lr(t) {
			var e, i;
			null != (e = h.__PosthogExtensions__) && e.postHogWebVitalsCallbacks ? t() : null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, this.useAttribution ? "web-vitals-with-attribution" : "web-vitals", ((e) => {
				e ? qo.error("failed to load script", e) : t();
			}));
		}
		io() {
			var e = t ? t.location.href : void 0;
			if (e) {
				var i = this._instance.config.custom_personal_data_properties;
				return Ur(e, this._instance.config.mask_personal_data_properties ? [...jr, ...i || []] : [], Br);
			}
			qo.error("Could not determine current URL");
		}
	}
}, ka = {
	exceptionObserver: class {
		constructor(e) {
			var i, r, s;
			this.so = () => {
				var e;
				if (t && this.isEnabled && null != (e = h.__PosthogExtensions__) && e.errorWrappingFunctions) {
					var i = h.__PosthogExtensions__.errorWrappingFunctions.wrapOnError, r = h.__PosthogExtensions__.errorWrappingFunctions.wrapUnhandledRejection, s = h.__PosthogExtensions__.errorWrappingFunctions.wrapConsoleError;
					try {
						!this.ao && this.qt.capture_unhandled_errors && (this.ao = i(this.captureException.bind(this))), !this.uo && this.qt.capture_unhandled_rejections && (this.uo = r(this.captureException.bind(this))), !this.lo && this.qt.capture_console_errors && (this.lo = s(this.captureException.bind(this)));
					} catch (t) {
						zo.error("failed to start", t), this.ho();
					}
				}
			}, this._instance = e, this.co = !(null == (i = this._instance.persistence) || !i.props[Ye]), this.do = new it({
				refillRate: null !== (r = this._instance.config.error_tracking.__exceptionRateLimiterRefillRate) && void 0 !== r ? r : 1,
				bucketSize: null !== (s = this._instance.config.error_tracking.__exceptionRateLimiterBucketSize) && void 0 !== s ? s : 10,
				refillInterval: 1e4,
				Gt: zo
			}), this.qt = this.vo(), this.startIfEnabledOrStop();
		}
		vo() {
			var t = this._instance.config.capture_exceptions, e = {
				capture_unhandled_errors: !1,
				capture_unhandled_rejections: !1,
				capture_console_errors: !1
			};
			return U(t) ? e = f({}, e, t) : (N(t) ? this.co : t) && (e = f({}, e, {
				capture_unhandled_errors: !0,
				capture_unhandled_rejections: !0
			})), e;
		}
		get isEnabled() {
			return this.qt.capture_console_errors || this.qt.capture_unhandled_errors || this.qt.capture_unhandled_rejections;
		}
		startIfEnabledOrStop() {
			this.isEnabled ? (zo.info("enabled"), this.ho(), this.lr(this.so)) : this.ho();
		}
		lr(t) {
			var e, i;
			null != (e = h.__PosthogExtensions__) && e.errorWrappingFunctions && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "exception-autocapture", ((e) => {
				if (e) return zo.error("failed to load script", e);
				t();
			}));
		}
		ho() {
			var t, e, i;
			null == (t = this.ao) || t.call(this), this.ao = void 0, null == (e = this.uo) || e.call(this), this.uo = void 0, null == (i = this.lo) || i.call(this), this.lo = void 0;
		}
		onRemoteConfig(t) {
			"autocaptureExceptions" in t && (this.co = !!t.autocaptureExceptions || !1, this._instance.persistence && this._instance.persistence.register({ [Ye]: this.co }), this.qt = this.vo(), this.startIfEnabledOrStop());
		}
		onConfigChange() {
			this.qt = this.vo();
		}
		captureException(t) {
			var e, i, r, s = null !== (e = null == t || null == (i = t.$exception_list) || null == (i = i[0]) ? void 0 : i.type) && void 0 !== e ? e : "Exception";
			this.do.consumeRateLimit(s) ? zo.info("Skipping exception capture because of client rate limiting.", { exception: s }) : null == (r = this._instance.exceptions) || r.sendExceptionEvent(t);
		}
	},
	exceptions: class {
		constructor(t) {
			var e, i;
			this.fo = [], this.po = new ae([
				new be(),
				new Pe(),
				new we(),
				new ye(),
				new ke(),
				new Te(),
				new Ee(),
				new Re()
			], function(t) {
				for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
				return function(e, r) {
					void 0 === r && (r = 0);
					for (var s = [], n = e.split("\n"), o = r; n.length > o; o++) {
						var a = n[o];
						if (1024 >= a.length) {
							var l = me.test(a) ? a.replace(me, "$1") : a;
							if (!l.match(/\S*Error: /)) {
								for (var u of i) {
									var h = u(l, t);
									if (h) {
										s.push(h);
										break;
									}
								}
								if (s.length >= 50) break;
							}
						}
					}
					return function(t) {
						if (!t.length) return [];
						var e = Array.from(t);
						return e.reverse(), e.slice(0, 50).map(((t) => {
							return f({}, t, {
								filename: t.filename || (i = e, i[i.length - 1] || {}).filename,
								function: t.function || le
							});
							var i;
						}));
					}(s);
				};
			}("web:javascript", pe, ge)), this._instance = t, this.fo = null !== (e = null == (i = this._instance.persistence) ? void 0 : i.get_property(Je)) && void 0 !== e ? e : [], this.mo = Fe(this.yo()), this.bo = new Me(this.mo);
		}
		onConfigChange() {
			this.mo = Fe(this.yo()), this.bo.setConfig(this.mo);
		}
		onRemoteConfig(t) {
			var e, i, r;
			if ("errorTracking" in t) {
				var s = null !== (e = null == (i = t.errorTracking) ? void 0 : i.suppressionRules) && void 0 !== e ? e : [], n = null == (r = t.errorTracking) ? void 0 : r.captureExtensionExceptions;
				this.fo = s, this._instance.persistence && this._instance.persistence.register({
					[Je]: this.fo,
					[Ke]: n
				});
			}
		}
		get _o() {
			var t, e = !!this._instance.get_property(Ke), i = this._instance.config.error_tracking.captureExtensionExceptions;
			return null !== (t = null != i ? i : e) && void 0 !== t && t;
		}
		buildProperties(t, e) {
			return this.po.buildFromUnknown(t, {
				syntheticException: null == e ? void 0 : e.syntheticException,
				mechanism: { handled: null == e ? void 0 : e.handled }
			});
		}
		addExceptionStep(t, e) {
			if (this.mo.enabled) try {
				if (!j(t) || 0 === t.trim().length) return void ma.warn("Ignoring exception step because message must be a non-empty string");
				var { sanitizedProperties: r, droppedKeys: s } = function(t) {
					if (!t) return {
						sanitizedProperties: {},
						droppedKeys: []
					};
					var e = [];
					return {
						sanitizedProperties: Object.keys(t).reduce(((i, r) => Ce.has(r) ? (e.push(r), i) : (i[r] = t[r], i)), {}),
						droppedKeys: e
					};
				}(this.wo(e));
				s.length > 0 && ma.warn("Ignoring reserved exception step fields", { droppedKeys: s }), this.bo.add(f({
					[Oe]: t,
					[Ie]: (/* @__PURE__ */ new Date()).toISOString()
				}, r));
			} catch (t) {
				ma.error("Failed to add exception step. Ignoring breadcrumb.", t);
			}
		}
		sendExceptionEvent(t) {
			try {
				var e = t.$exception_list;
				if (this.xo(e)) {
					if (this.So(e)) return this.ko("Exception dropped: matched a suppression rule"), void ma.info("Skipping exception capture because a suppression rule matched");
					if (!this._o && this.Co(e)) return this.ko("Exception dropped: thrown by a browser extension"), void ma.info("Skipping exception capture because it was thrown by an extension");
					if (!this._instance.config.error_tracking.__capturePostHogExceptions && this.Io(e)) return this.ko("Exception dropped: thrown by the PostHog SDK"), void ma.info("Skipping exception capture because it was thrown by the PostHog SDK");
				}
				var i = this.mo.enabled && H(t.$exception_steps) ? this.To(t) : t;
				try {
					var r = this._instance.capture("$exception", i, {
						_noTruncate: !0,
						_batchKey: "exceptionEvent",
						en: !0
					});
					return r && this.bo.clear(), r;
				} catch (t) {
					ma.error("Failed to capture exception event. Dropping this exception.", t), this.bo.clear();
					return;
				}
			} catch (t) {
				ma.error("Failed to process exception event. Ignoring this exception.", t);
				return;
			}
		}
		To(t) {
			try {
				var e = this.bo.getAttachable();
				return 0 === e.length ? t : f({}, t, { $exception_steps: e });
			} catch (e) {
				return ma.error("Failed to read buffered exception steps. Capturing exception without steps.", e), t;
			}
		}
		ko(t) {
			this.mo.enabled && this.bo.add({
				[Oe]: t,
				[Ie]: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		wo(t) {
			return U(t) ? f({}, t) : {};
		}
		yo() {
			var t, e;
			return null !== (t = null == (e = this._instance.config.error_tracking) ? void 0 : e.exception_steps) && void 0 !== t ? t : {};
		}
		So(t) {
			if (0 === t.length) return !1;
			var e = t.reduce(((t, e) => {
				var { type: i, value: r } = e;
				return j(i) && i.length > 0 && t.$exception_types.push(i), j(r) && r.length > 0 && t.$exception_values.push(r), t;
			}), {
				$exception_types: [],
				$exception_values: []
			});
			return this.fo.some(((t) => {
				var i = t.values.map(((t) => {
					var i, r = $n[t.operator], s = M(t.value) ? t.value : [t.value], n = null !== (i = e[t.key]) && void 0 !== i ? i : [];
					return s.length > 0 && r(s, n);
				}));
				return "OR" === t.type ? i.some(Boolean) : i.every(Boolean);
			}));
		}
		Co(t) {
			return t.flatMap(((t) => {
				var e, i;
				return null !== (e = null == (i = t.stacktrace) ? void 0 : i.frames) && void 0 !== e ? e : [];
			})).some(((t) => t.filename && t.filename.startsWith("chrome-extension://")));
		}
		Io(t) {
			if (t.length > 0) {
				var e, i, r, s, n = null !== (e = null == (i = t[0].stacktrace) ? void 0 : i.frames) && void 0 !== e ? e : [], o = n[n.length - 1];
				return null !== (r = null == o || null == (s = o.filename) ? void 0 : s.includes("posthog.com/static")) && void 0 !== r && r;
			}
			return !1;
		}
		xo(t) {
			return !H(t) && M(t);
		}
	}
}, Ra = f({ productTours: class {
	get ni() {
		return this._instance.persistence;
	}
	constructor(t) {
		this.Eo = null, this.Mo = null, this._instance = t;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		"productTours" in t && (this.ni && this.ni.register({ [Ze]: !!t.productTours }), this.loadIfEnabled());
	}
	loadIfEnabled() {
		var t, e;
		this.Eo || (t = this._instance).config.disable_product_tours || null == (e = t.persistence) || !e.get_property(Ze) || this.lr((() => this.Po()));
	}
	lr(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.generateProductTours ? t() : null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "product-tours", ((e) => {
			e ? ta.error("Could not load product tours script", e) : t();
		}));
	}
	Po() {
		var t;
		!this.Eo && null != (t = h.__PosthogExtensions__) && t.generateProductTours && (this.Eo = h.__PosthogExtensions__.generateProductTours(this._instance, !0));
	}
	getProductTours(t, e) {
		if (void 0 === e && (e = !1), !M(this.Mo) || e) {
			var i = this.ni;
			if (i) {
				var r = i.props[yi];
				if (M(r) && !e) return this.Mo = r, void t(r, { isLoaded: !0 });
			}
			this._instance._send_request({
				url: this._instance.requestRouter.endpointFor("api", "/api/product_tours/?token=" + this._instance.config.token),
				method: "GET",
				callback: (e) => {
					var r = e.statusCode;
					if (200 !== r || !e.json) {
						var s = "Product Tours API could not be loaded, status: " + r;
						ta.error(s), t([], {
							isLoaded: !1,
							error: s
						});
						return;
					}
					var n = M(e.json.product_tours) ? e.json.product_tours : [];
					this.Mo = n, i && i.register({ [yi]: n }), t(n, { isLoaded: !0 });
				}
			});
		} else t(this.Mo, { isLoaded: !0 });
	}
	getActiveProductTours(t) {
		H(this.Eo) ? t([], {
			isLoaded: !1,
			error: "Product tours not loaded"
		}) : this.Eo.getActiveProductTours(t);
	}
	showProductTour(t) {
		var e;
		null == (e = this.Eo) || e.showTourById(t);
	}
	previewTour(t) {
		this.Eo ? this.Eo.previewTour(t) : this.lr((() => {
			var e;
			this.Po(), null == (e = this.Eo) || e.previewTour(t);
		}));
	}
	dismissProductTour() {
		var t;
		null == (t = this.Eo) || t.dismissTour("user_clicked_skip");
	}
	nextStep() {
		var t;
		null == (t = this.Eo) || t.nextStep();
	}
	previousStep() {
		var t;
		null == (t = this.Eo) || t.previousStep();
	}
	clearCache() {
		var t;
		this.Mo = null, null == (t = this.ni) || t.unregister(yi);
	}
	resetTour(t) {
		var e;
		null == (e = this.Eo) || e.resetTour(t);
	}
	resetAllTours() {
		var t;
		null == (t = this.Eo) || t.resetAllTours();
	}
	cancelPendingTour(t) {
		var e;
		null == (e = this.Eo) || e.cancelPendingTour(t);
	}
} }, Sa), Pa = { siteApps: class {
	constructor(t) {
		this._instance = t, this.Ro = [], this.apps = {};
	}
	get isEnabled() {
		return !!this._instance.config.opt_in_site_apps;
	}
	Oo(t, e) {
		if (e) {
			var i = this.globalsForEvent(e);
			this.Ro.push(i), this.Ro.length > 1e3 && (this.Ro = this.Ro.slice(10));
		}
	}
	get siteAppLoaders() {
		var t;
		return null == (t = h._POSTHOG_REMOTE_CONFIG) || null == (t = t[this._instance.config.token]) ? void 0 : t.siteApps;
	}
	initialize() {
		if (this.isEnabled) {
			var t = this._instance._addCaptureHook(this.Oo.bind(this));
			this.Lo = () => {
				t(), this.Ro = [], this.Lo = void 0;
			};
		}
	}
	globalsForEvent(t) {
		var e, i, r, s, n, o, a;
		if (!t) throw new Error("Event payload is required");
		var l = {}, u = this._instance.get_property("$groups") || [], h = this._instance.get_property("$stored_group_properties") || {};
		for (var [d, v] of Object.entries(h)) l[d] = {
			id: u[d],
			type: d,
			properties: v
		};
		var { $set_once: c, $set: p } = t;
		return {
			event: f({}, _(t, ea), {
				properties: f({}, t.properties, p ? { $set: f({}, null !== (e = null == (i = t.properties) ? void 0 : i.$set) && void 0 !== e ? e : {}, p) } : {}, c ? { $set_once: f({}, null !== (r = null == (s = t.properties) ? void 0 : s.$set_once) && void 0 !== r ? r : {}, c) } : {}),
				elements_chain: null !== (n = null == (o = t.properties) ? void 0 : o.$elements_chain) && void 0 !== n ? n : "",
				distinct_id: null == (a = t.properties) ? void 0 : a.distinct_id
			}),
			person: { properties: this._instance.get_property("$stored_person_properties") },
			groups: l
		};
	}
	setupSiteApp(t) {
		var e = this.apps[t.id], i = () => {
			var i;
			!e.errored && this.Ro.length && (ia.info("Processing " + this.Ro.length + " events for site app with id " + t.id), this.Ro.forEach(((t) => null == e.processEvent ? void 0 : e.processEvent(t))), e.processedBuffer = !0), Object.values(this.apps).every(((t) => t.processedBuffer || t.errored)) && (null == (i = this.Lo) || i.call(this));
		}, r = !1, s = (s) => {
			e.errored = !s, e.loaded = !0, ia.info("Site app with id " + t.id + " " + (s ? "loaded" : "errored")), r && i();
		};
		try {
			var { processEvent: n } = t.init({
				posthog: this._instance,
				callback(t) {
					s(t);
				}
			});
			n && (e.processEvent = n), r = !0;
		} catch (e) {
			ia.error(ra + t.id, e), s(!1);
		}
		if (r && e.loaded) try {
			i();
		} catch (i) {
			ia.error("Error while processing buffered events PostHog app with config id " + t.id, i), e.errored = !0;
		}
	}
	Fo() {
		var t = this.siteAppLoaders || [];
		for (var e of t) this.apps[e.id] = {
			id: e.id,
			loaded: !1,
			errored: !1,
			processedBuffer: !1
		};
		for (var i of t) this.setupSiteApp(i);
	}
	Ao(t) {
		if (0 !== Object.keys(this.apps).length) {
			var e = this.globalsForEvent(t);
			for (var i of Object.values(this.apps)) try {
				null == i.processEvent || i.processEvent(e);
			} catch (e) {
				ia.error("Error while processing event " + t.event + " for site app " + i.id, e);
			}
		}
	}
	onRemoteConfig(t) {
		var e, i, r, s = this;
		if (null != (e = this.siteAppLoaders) && e.length) return this.isEnabled ? (this.Fo(), void this._instance.on("eventCaptured", ((t) => this.Ao(t)))) : void ia.error("PostHog site apps are disabled. Enable the \"opt_in_site_apps\" config to proceed.");
		if (null == (i = this.Lo) || i.call(this), null != (r = t.siteApps) && r.length) if (this.isEnabled) {
			var n = function(t) {
				var e;
				h["__$$ph_site_app_" + t] = s._instance, null == (e = h.__PosthogExtensions__) || null == e.loadSiteApp || e.loadSiteApp(s._instance, a, ((e) => {
					if (e) return ia.error(ra + t, e);
				}));
			};
			for (var { id: o, url: a } of t.siteApps) n(o);
		} else ia.error("PostHog site apps are disabled. Enable the \"opt_in_site_apps\" config to proceed.");
	}
} }, Oa = { tracingHeaders: class {
	constructor(t) {
		this.No = void 0, this.$o = void 0, this.so = () => {
			var t, e, i = this.Do() || [];
			N(this.No) && (null == (t = h.__PosthogExtensions__) || null == (t = t.tracingHeadersPatchFns) || t._patchXHR(i, this._instance.get_distinct_id(), this._instance.sessionManager)), N(this.$o) && (null == (e = h.__PosthogExtensions__) || null == (e = e.tracingHeadersPatchFns) || e._patchFetch(i, this._instance.get_distinct_id(), this._instance.sessionManager));
		}, this._instance = t;
	}
	initialize() {
		this.startIfEnabledOrStop();
	}
	lr(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.tracingHeadersPatchFns && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "tracing-headers", ((e) => {
			if (e) return Ho.error("failed to load script", e);
			t();
		}));
	}
	Do() {
		var t;
		return null !== (t = this._instance.config.addTracingHeaders) && void 0 !== t ? t : this._instance.config.__add_tracing_headers;
	}
	startIfEnabledOrStop() {
		var t, e;
		this.Do() ? this.lr(this.so) : (null == (t = this.No) || t.call(this), null == (e = this.$o) || e.call(this), this.No = void 0, this.$o = void 0);
	}
} }, Ia = f({ surveys: class {
	get qt() {
		return this._instance.config;
	}
	constructor(t) {
		this.qo = void 0, this._surveyManager = null, this.jo = !1, this.Ho = [], this.Uo = null, this._instance = t, this._surveyEventReceiver = null;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		if (!this.qt.disable_surveys) {
			var e = t.surveys;
			if (H(e)) return Cn.warn("Flags not loaded yet. Not loading surveys.");
			var i = M(e);
			this.qo = i ? e.length > 0 : e, Cn.info("flags response received, isSurveysEnabled: " + this.qo), this.loadIfEnabled();
		}
	}
	reset() {
		localStorage.removeItem("lastSeenSurveyDate");
		for (var t = [], e = 0; e < localStorage.length; e++) {
			var i = localStorage.key(e);
			(null != i && i.startsWith(An) || null != i && i.startsWith("inProgressSurvey_")) && t.push(i);
		}
		t.forEach(((t) => localStorage.removeItem(t)));
	}
	loadIfEnabled() {
		if (!this._surveyManager) if (this.jo) Cn.info("Already initializing surveys, skipping...");
		else if (this.qt.disable_surveys) Cn.info(ua);
		else if (this.qt.cookieless_mode && this._instance.consent.isOptedOut()) Cn.info("Not loading surveys in cookieless mode without consent.");
		else {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t) {
				if (!N(this.qo) || this.qt.advanced_enable_surveys) {
					var e = this.qo || this.qt.advanced_enable_surveys;
					this.jo = !0;
					try {
						var i = t.generateSurveys;
						if (i) return void this.Bo(i, e);
						var r = t.loadExternalDependency;
						if (!r) return void this.zo(Ui);
						r(this._instance, "surveys", ((i) => {
							i || !t.generateSurveys ? this.zo("Could not load surveys script", i) : this.Bo(t.generateSurveys, e);
						}));
					} catch (t) {
						throw this.zo("Error initializing surveys", t), t;
					} finally {
						this.jo = !1;
					}
				}
			} else Cn.error("PostHog Extensions not found.");
		}
	}
	Bo(t, e) {
		this._surveyManager = t(this._instance, e), this._surveyEventReceiver = new aa(this._instance), Cn.info("Surveys loaded successfully"), this.Vo({ isLoaded: !0 });
	}
	zo(t, e) {
		Cn.error(t, e), this.Vo({
			isLoaded: !1,
			error: t
		});
	}
	onSurveysLoaded(t) {
		return this.Ho.push(t), this._surveyManager && this.Vo({ isLoaded: !0 }), () => {
			this.Ho = this.Ho.filter(((e) => e !== t));
		};
	}
	getSurveys(t, e) {
		if (void 0 === e && (e = !1), this.qt.disable_surveys) return Cn.info(ua), t([]);
		var i, r = this._instance.get_property(mi);
		if (r && !e) return t(r, { isLoaded: !0 });
		"undefined" != typeof Promise && this.Uo ? this.Uo.then(((e) => {
			var { surveys: i, context: r } = e;
			return t(i, r);
		})) : ("undefined" != typeof Promise && (this.Uo = new Promise(((t) => {
			i = t;
		}))), this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/surveys/?token=" + this.qt.token),
			method: "GET",
			timeout: this.qt.surveys_request_timeout_ms,
			callback: (e) => {
				var r;
				this.Uo = null;
				var s = e.statusCode;
				if (200 !== s || !e.json) {
					var n = "Surveys API could not be loaded, status: " + s;
					Cn.error(n);
					var o = {
						isLoaded: !1,
						error: n
					};
					t([], o), i?.({
						surveys: [],
						context: o
					});
					return;
				}
				var a, l = e.json.surveys || [], u = l.filter(((t) => function(t) {
					return !(!t.start_date || t.end_date);
				}(t) && (function(t) {
					var e;
					return !(null == (e = t.conditions) || null == (e = e.events) || null == (e = e.values) || !e.length);
				}(t) || function(t) {
					var e;
					return !(null == (e = t.conditions) || null == (e = e.actions) || null == (e = e.values) || !e.length);
				}(t))));
				u.length > 0 && (null == (a = this._surveyEventReceiver) || a.register(u)), null == (r = this._instance.persistence) || r.register({ [mi]: l });
				var h = { isLoaded: !0 };
				t(l, h), i?.({
					surveys: l,
					context: h
				});
			}
		}));
	}
	Vo(t) {
		for (var e of this.Ho) try {
			if (!t.isLoaded) return e([], t);
			this.getSurveys(e);
		} catch (t) {
			Cn.error("Error in survey callback", t);
		}
	}
	getActiveMatchingSurveys(t, e) {
		if (void 0 === e && (e = !1), !H(this._surveyManager)) return this._surveyManager.getActiveMatchingSurveys(t, e);
		Cn.warn("init was not called");
	}
	Wo(t) {
		var e = null;
		return this.getSurveys(((i) => {
			var r;
			e = null !== (r = i.find(((e) => e.id === t))) && void 0 !== r ? r : null;
		})), e;
	}
	Zo(t) {
		if (H(this._surveyManager)) return {
			eligible: !1,
			reason: la
		};
		var e = "string" == typeof t ? this.Wo(t) : t;
		return e ? this._surveyManager.checkSurveyEligibility(e) : {
			eligible: !1,
			reason: "Survey not found"
		};
	}
	canRenderSurvey(t) {
		if (H(this._surveyManager)) return Cn.warn("init was not called"), {
			visible: !1,
			disabledReason: la
		};
		var e = this.Zo(t);
		return {
			visible: e.eligible,
			disabledReason: e.reason
		};
	}
	canRenderSurveyAsync(t, e) {
		return H(this._surveyManager) ? (Cn.warn("init was not called"), Promise.resolve({
			visible: !1,
			disabledReason: la
		})) : new Promise(((i) => {
			this.getSurveys(((e) => {
				var r, s = null !== (r = e.find(((e) => e.id === t))) && void 0 !== r ? r : null;
				if (s) {
					var n = this.Zo(s);
					i({
						visible: n.eligible,
						disabledReason: n.reason
					});
				} else i({
					visible: !1,
					disabledReason: "Survey not found"
				});
			}), e);
		}));
	}
	renderSurvey(t, e, i) {
		var s;
		if (H(this._surveyManager)) Cn.warn("init was not called");
		else {
			var n = "string" == typeof t ? this.Wo(t) : t;
			if (null != n && n.id) if (Fn.includes(n.type)) {
				var o = null == r ? void 0 : r.querySelector(e);
				if (o) return null != (s = n.appearance) && s.surveyPopupDelaySeconds ? (Cn.info("Rendering survey " + n.id + " with delay of " + n.appearance.surveyPopupDelaySeconds + " seconds"), void setTimeout((() => {
					var t, e;
					Cn.info("Rendering survey " + n.id + " with delay of " + (null == (t = n.appearance) ? void 0 : t.surveyPopupDelaySeconds) + " seconds"), null == (e = this._surveyManager) || e.renderSurvey(n, o, i), Cn.info("Survey " + n.id + " rendered");
				}), 1e3 * n.appearance.surveyPopupDelaySeconds)) : void this._surveyManager.renderSurvey(n, o, i);
				Cn.warn("Survey element not found");
			} else Cn.warn("Surveys of type " + n.type + " cannot be rendered in the app");
			else Cn.warn("Survey not found");
		}
	}
	displaySurvey(t, e) {
		var i;
		if (H(this._surveyManager)) Cn.warn("init was not called");
		else {
			var r = this.Wo(t);
			if (r) {
				var s = r;
				if (null != (i = r.appearance) && i.surveyPopupDelaySeconds && e.ignoreDelay && (s = f({}, r, { appearance: f({}, r.appearance, { surveyPopupDelaySeconds: 0 }) })), e.displayType !== vs.Popover && e.initialResponses && Cn.warn("initialResponses is only supported for popover surveys. prefill will not be applied."), !1 === e.ignoreConditions) {
					var n = this.canRenderSurvey(r);
					if (!n.visible) return void Cn.warn("Survey is not eligible to be displayed: ", n.disabledReason);
				}
				e.displayType !== vs.Inline ? this._surveyManager.handlePopoverSurvey(s, e) : this.renderSurvey(s, e.selector, e.properties);
			} else Cn.warn("Survey not found");
		}
	}
	cancelPendingSurvey(t) {
		H(this._surveyManager) ? Cn.warn("init was not called") : this._surveyManager.cancelSurvey(t);
	}
	handlePageUnload() {
		var t;
		null == (t = this._surveyManager) || t.handlePageUnload();
	}
} }, Sa), Ca = { toolbar: class {
	constructor(t) {
		this.instance = t;
	}
	Go(t) {
		h.ph_toolbar_state = t;
	}
	Qo() {
		var t;
		return null !== (t = h.ph_toolbar_state) && void 0 !== t ? t : 0;
	}
	initialize() {
		return this.maybeLoadToolbar();
	}
	maybeLoadToolbar(e, i, s) {
		if (void 0 === e && (e = void 0), void 0 === i && (i = void 0), void 0 === s && (s = void 0), nr(this.instance.config)) return !1;
		if (!t || !r) return !1;
		e = null != e ? e : t.location, s = null != s ? s : t.history;
		try {
			if (!i) {
				try {
					t.localStorage.setItem("test", "test"), t.localStorage.removeItem("test");
				} catch (t) {
					return !1;
				}
				i = null == t ? void 0 : t.localStorage;
			}
			var n, o = ha || Lr(e.hash, "__posthog") || Lr(e.hash, "state"), a = o ? Zi((() => JSON.parse(atob(decodeURIComponent(o))))) || Zi((() => JSON.parse(decodeURIComponent(o)))) : null;
			return a && "ph_authorize" === a.action ? ((n = a).source = "url", n && Object.keys(n).length > 0 && (a.desiredHash ? e.hash = a.desiredHash : s ? s.replaceState(s.state, "", e.pathname + e.search) : e.hash = "")) : ((n = JSON.parse(i.getItem(da) || "{}")).source = "localstorage", delete n.userIntent), !(!n.token || this.instance.config.token !== n.token || (this.loadToolbar(n), 0));
		} catch (t) {
			return !1;
		}
	}
	Jo(t) {
		var e = h.ph_load_toolbar || h.ph_load_editor;
		!H(e) && D(e) ? e(t, this.instance) : va.warn("No toolbar load function found");
	}
	loadToolbar(e) {
		var i = !(null == r || !r.getElementById(Ci));
		if (!t || i) return !1;
		var s = "custom" === this.instance.requestRouter.region && this.instance.config.advanced_disable_toolbar_metrics, n = f({ token: this.instance.config.token }, e, { apiURL: this.instance.requestRouter.endpointFor("ui") }, s ? { instrument: !1 } : {});
		if (t.localStorage.setItem(da, JSON.stringify(f({}, n, { source: void 0 }))), 2 === this.Qo()) this.Jo(n);
		else if (0 === this.Qo()) {
			var o;
			this.Go(1), null == (o = h.__PosthogExtensions__) || null == o.loadExternalDependency || o.loadExternalDependency(this.instance, "toolbar", ((t) => {
				if (t) return va.error("[Toolbar] Failed to load", t), void this.Go(0);
				this.Go(2), this.Jo(n);
			})), sr(t, "turbolinks:load", (() => {
				this.Go(0), this.loadToolbar(n);
			}));
		}
		return !0;
	}
	Ko(t) {
		return this.loadToolbar(t);
	}
	maybeLoadEditor(t, e, i) {
		return void 0 === t && (t = void 0), void 0 === e && (e = void 0), void 0 === i && (i = void 0), this.maybeLoadToolbar(t, e, i);
	}
} }, Aa = f({ experiments: wa }, Sa), Da = f({}, Sa, $a, Ta, ka, Ra, Pa, Ia, Oa, Ca, Aa, { conversations: class {
	constructor(t) {
		this.Yo = void 0, this._conversationsManager = null, this.Xo = !1, this.ea = null, this._instance = t;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		if (!this._instance.config.disable_conversations) {
			var e = t.conversations;
			H(e) || (W(e) ? this.Yo = e : (this.Yo = e.enabled, this.ea = e), this.loadIfEnabled());
		}
	}
	reset() {
		var t;
		null == (t = this._conversationsManager) || t.reset(), this._conversationsManager = null, this.Yo = void 0, this.ea = null;
	}
	loadIfEnabled() {
		if (!(this._conversationsManager || this.Xo || this._instance.config.disable_conversations || nr(this._instance.config) || this._instance.config.cookieless_mode && this._instance.consent.isOptedOut())) {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t && !N(this.Yo) && this.Yo) if (this.ea && this.ea.token) {
				this.Xo = !0;
				try {
					var e = t.initConversations;
					if (e) return this.ta(e), void (this.Xo = !1);
					var i = t.loadExternalDependency;
					if (!i) return void this.ra(Ui);
					i(this._instance, "conversations", ((e) => {
						e || !t.initConversations ? this.ra("Could not load conversations script", e) : this.ta(t.initConversations), this.Xo = !1;
					}));
				} catch (t) {
					this.ra("Error initializing conversations", t), this.Xo = !1;
				}
			} else xa.error("Conversations enabled but missing token in remote config.");
		}
	}
	ta(t) {
		if (this.ea) try {
			this._conversationsManager = t(this.ea, this._instance), xa.info("Conversations loaded successfully");
		} catch (t) {
			this.ra("Error completing conversations initialization", t);
		}
		else xa.error("Cannot complete initialization: remote config is null");
	}
	ra(t, e) {
		xa.error(t, e), this._conversationsManager = null, this.Xo = !1;
	}
	show() {
		this._conversationsManager ? this._conversationsManager.show() : xa.warn("Conversations not loaded yet.");
	}
	hide() {
		this._conversationsManager && this._conversationsManager.hide();
	}
	isAvailable() {
		return !0 === this.Yo && !B(this._conversationsManager);
	}
	isVisible() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.isVisible()) && void 0 !== t && t;
	}
	sendMessage(t, e, i) {
		var r = this;
		return p((function* () {
			return r._conversationsManager ? r._conversationsManager.sendMessage(t, e, i) : (xa.warn(Ea), null);
		}))();
	}
	getMessages(t, e) {
		var i = this;
		return p((function* () {
			return i._conversationsManager ? i._conversationsManager.getMessages(t, e) : (xa.warn(Ea), null);
		}))();
	}
	markAsRead(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.markAsRead(t) : (xa.warn(Ea), null);
		}))();
	}
	getTickets(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.getTickets(t) : (xa.warn(Ea), null);
		}))();
	}
	requestRestoreLink(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.requestRestoreLink(t) : (xa.warn(Ea), null);
		}))();
	}
	restoreFromToken(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.restoreFromToken(t) : (xa.warn(Ea), null);
		}))();
	}
	restoreFromUrlToken() {
		var t = this;
		return p((function* () {
			return t._conversationsManager ? t._conversationsManager.restoreFromUrlToken() : (xa.warn(Ea), null);
		}))();
	}
	getCurrentTicketId() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.getCurrentTicketId()) && void 0 !== t ? t : null;
	}
	getWidgetSessionId() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.getWidgetSessionId()) && void 0 !== t ? t : null;
	}
	ln() {
		var t;
		null == (t = this._conversationsManager) || t.setIdentity();
	}
	hn() {
		var t;
		null == (t = this._conversationsManager) || t.clearIdentity();
	}
} }, { logs: class {
	constructor(t) {
		var e;
		this.ia = !1, this.na = !1, this.Gt = Ne("[logs]"), this.sa = [], this.oa = 0, this.aa = 0, this.ua = !1, this._instance = t, this._instance && null != (e = this._instance.config.logs) && e.captureConsoleLogs && (this.ia = !0);
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		var e, i = null == (e = t.logs) ? void 0 : e.captureConsoleLogs;
		!H(i) && i && (this.ia = !0, this.loadIfEnabled());
	}
	reset() {
		this.sa = [], this.qr && (clearTimeout(this.qr), this.qr = void 0), this.oa = 0, this.aa = 0, this.ua = !1;
	}
	loadIfEnabled() {
		if (this.ia && !this.na) {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t) {
				var e = t.loadExternalDependency;
				e ? e(this._instance, "logs", ((e) => {
					var i;
					e || null == (i = t.logs) || !i.initializeLogs ? this.Gt.error("Could not load logs script", e) : (t.logs.initializeLogs(this._instance), this.na = !0);
				})) : this.Gt.error(Ui);
			} else this.Gt.error("PostHog Extensions not found.");
		}
	}
	captureLog(t) {
		var e, i, r, s, n, o;
		if (this._instance.is_capturing()) if (t && t.body) {
			var a = null !== (e = null == (i = this._instance.config.logs) ? void 0 : i.flushIntervalMs) && void 0 !== e ? e : 3e3, l = null !== (r = null == (s = this._instance.config.logs) ? void 0 : s.maxLogsPerInterval) && void 0 !== r ? r : 1e3, u = Date.now();
			if (a > u - this.aa || (this.aa = u, this.oa = 0, this.ua = !1), l > this.oa) {
				this.oa++;
				var h = function(t, e) {
					var { text: r, number: s } = ie[t.level || "info"] || re, n = String(Date.now()) + "000000", o = {};
					e.distinctId && (o.posthogDistinctId = e.distinctId), e.sessionId && (o.sessionId = e.sessionId), e.currentUrl && (o["url.full"] = e.currentUrl), e.screenName && (o["screen.name"] = e.screenName), e.appState && (o["app.state"] = e.appState), e.activeFeatureFlags && e.activeFeatureFlags.length > 0 && (o.feature_flags = e.activeFeatureFlags);
					var a = f({}, o, t.attributes || {}), l = {
						timeUnixNano: n,
						observedTimeUnixNano: n,
						severityNumber: s,
						severityText: r,
						body: { stringValue: t.body },
						attributes: ne(a)
					};
					return t.trace_id && (l.traceId = t.trace_id), t.span_id && (l.spanId = t.span_id), N(t.trace_flags) || (l.flags = t.trace_flags), l;
				}(t, this.la());
				this.sa.push({ record: h }), (null !== (n = null == (o = this._instance.config.logs) ? void 0 : o.maxBufferSize) && void 0 !== n ? n : 100) > this.sa.length ? this.ha() : this.flushLogs();
			} else this.ua || (this.Gt.warn("captureLog dropping logs: exceeded " + l + " logs per " + a + "ms"), this.ua = !0);
		} else this.Gt.warn("captureLog requires a body");
	}
	get logger() {
		return this.ca || (this.ca = {
			trace: (t, e) => this.captureLog({
				body: t,
				level: "trace",
				attributes: e
			}),
			debug: (t, e) => this.captureLog({
				body: t,
				level: "debug",
				attributes: e
			}),
			info: (t, e) => this.captureLog({
				body: t,
				level: "info",
				attributes: e
			}),
			warn: (t, e) => this.captureLog({
				body: t,
				level: "warn",
				attributes: e
			}),
			error: (t, e) => this.captureLog({
				body: t,
				level: "error",
				attributes: e
			}),
			fatal: (t, e) => this.captureLog({
				body: t,
				level: "fatal",
				attributes: e
			})
		}), this.ca;
	}
	flushLogs(t) {
		if (this.qr && (clearTimeout(this.qr), this.qr = void 0), 0 !== this.sa.length) {
			var e = this.sa;
			this.sa = [];
			var i = this._instance.config.logs, r = f({ "service.name": (null == i ? void 0 : i.serviceName) || "unknown_service" }, (null == i ? void 0 : i.environment) && { "deployment.environment": i.environment }, (null == i ? void 0 : i.serviceVersion) && { "service.version": i.serviceVersion }, null == i ? void 0 : i.resourceAttributes), s = function(t, e, i, r) {
				return { resourceLogs: [{
					resource: { attributes: ne(e) },
					scopeLogs: [{
						scope: {
							name: i,
							version: r
						},
						logRecords: t
					}]
				}] };
			}(e.map(((t) => t.record)), r, v.LIB_NAME, v.LIB_VERSION), n = this._instance.requestRouter.endpointFor("api", "/i/v1/logs") + "?token=" + encodeURIComponent(this._instance.config.token);
			this._instance.Bi({
				method: "POST",
				url: n,
				data: s,
				compression: "best-available",
				batchKey: "logs",
				transport: t
			});
		}
	}
	ha() {
		var t, e;
		this.qr || (this.qr = setTimeout((() => {
			this.qr = void 0, this.flushLogs();
		}), null !== (t = null == (e = this._instance.config.logs) ? void 0 : e.flushIntervalMs) && void 0 !== t ? t : 3e3));
	}
	la() {
		var t, e = {};
		if (e.distinctId = this._instance.get_distinct_id(), this._instance.sessionManager) {
			var { sessionId: i } = this._instance.sessionManager.checkAndGetSessionAndWindowId(!0);
			e.sessionId = i;
		}
		if (null != h && null != (t = h.location) && t.href && (e.currentUrl = h.location.href), this._instance.featureFlags) {
			var r = this._instance.featureFlags.getFlags();
			r && r.length > 0 && (e.activeFeatureFlags = r);
		}
		return e;
	}
} });
Zn.__defaultExtensionClasses = f({}, Da);
var Ua, La = (Ua = jn[Gn] = new Zn(), function() {
	function e() {
		e.done || (e.done = !0, Yn = !1, Ki(jn, (function(t) {
			t._dom_loaded();
		})));
	}
	null != r && r.addEventListener ? "complete" === r.readyState ? e() : sr(r, "DOMContentLoaded", e, { capture: !1 }) : t && Le.error("Browser doesn't support `document.addEventListener` so PostHog couldn't be initialized");
}(), Ua);
//#endregion
export { ws as Compression, cs as DEFAULT_PRODUCT_TOUR_APPEARANCE, vs as DisplaySurveyType, Zn as PostHog, ps as ProductTourEventName, fs as ProductTourEventProperties, hs as SurveyEventName, ds as SurveyEventProperties, is as SurveyEventType, ss as SurveyPosition, ls as SurveyQuestionBranchingType, as as SurveyQuestionType, us as SurveySchedule, ns as SurveyTabPosition, os as SurveyType, rs as SurveyWidgetType, La as default, La as posthog, ys as severityLevels };

//# sourceMappingURL=posthog-js.js.map