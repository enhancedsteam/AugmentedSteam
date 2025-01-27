/**
 * Common functions that may be used on any pages
 */
class ITAD {
    static async create() {
        HTML.afterBegin("#global_action_menu",
            `<div id="es_itad">
                <img id="es_itad_logo" src="${ExtensionResources.getURL("img/itad.png")}" height="20px">
                <span id="es_itad_status"></span>
            </div>`);

        let connected = await Background.action("itad.isconnected");
        let itadDiv = document.querySelector("#es_itad");
        let itadStatus = itadDiv.querySelector("#es_itad_status");
        
        if (connected) {
            itadStatus.textContent = '\u2713';
            itadDiv.classList.add("authorized");
            itadDiv.addEventListener("mouseenter", ITAD.onHover);
            if (SyncedStorage.get("itad_import_library") || SyncedStorage.get("itad_import_wishlist")) {
                Background.action("itad.import");
            }
        } else {
            itadStatus.textContent = Localization.str.sign_in;
            itadDiv.classList.add("not_authorized");
            itadDiv.addEventListener("click", ITAD.authorize);
        }
    }

    static async authorize() {
        let sessionId = User.getSessionId();
        // Avoid predictable hash when string is empty
        if (sessionId) {
            try {
                await Background.action("itad.authorize", StringUtils.hashCode(sessionId));
            } catch(err) {
                console.group("ITAD authorization");
                console.error(err);
                console.error("Failed to authorize to ITAD");
                console.groupEnd();
                return;
            }

            let itadStatus = document.getElementById("es_itad_status");
            let itadDiv = itadStatus.parentElement;

            itadStatus.textContent = '\u2713';
            itadDiv.classList.add("authorized");
            itadDiv.classList.remove("not_authorized");
            itadDiv.addEventListener("mouseenter", ITAD.onHover);
            itadDiv.removeEventListener("click", ITAD.authorize);
            
            if (SyncedStorage.get("itad_import_library") || SyncedStorage.get("itad_import_wishlist")) {
                Background.action("itad.import");
            }
        } else {
            console.error("Can't retrieve Session ID, unable to authorize app");
        }
    }

    static async onHover() {
        if (!document.querySelector(".es-itad-hover")) {
            HTML.afterEnd("#es_itad_status",
                `<div class="es-itad-hover">
                    <div class="es-itad-hover__content">
                        <p class="es-itad-hover__last-import"></p>
                        <div class="es-itad-hover__import-now">
                            <span class="es-itad-hover__import-now-text">${Localization.str.itad.import_now}</span>
                            <div class="loader"></div>
                            <span class="es-itad-hover__import-failed">&#10060;</span>
                            <span class="es-itad-hover__import-success">&#10003;</span>
                        </div>
                    </div>
                    <div class="es-itad-hover__arrow"></div>
                </div>`);

            let hover = document.querySelector(".es-itad-hover");

            let importDiv = document.querySelector(".es-itad-hover__import-now");
            document.querySelector(".es-itad-hover__import-now-text").addEventListener("click", async () => {
                importDiv.classList.remove("es-itad-hover__import-now--failed", "es-itad-hover__import-now--success");
                importDiv.classList.add("es-itad-hover__import-now--loading");
                hover.style.display = "block";

                let timeout;

                try {
                    await Background.action("itad.import", true);
                    importDiv.classList.add("es-itad-hover__import-now--success");
                    await updateLastImport();
                    
                    timeout = 1000;
                } catch(err) {
                    importDiv.classList.add("es-itad-hover__import-now--failed");

                    console.group("ITAD import");
                    console.error(err);
                    console.error("Failed to import to ITAD");
                    console.groupEnd();

                    timeout = 3000;
                } finally {
                    setTimeout(() => hover.style.display = '', timeout);
                    importDiv.classList.remove("es-itad-hover__import-now--loading");
                }
            });
        }

        await updateLastImport();

        async function updateLastImport() {
            let timestamp = await Background.action("itad.lastimport");
            HTML.inner(".es-itad-hover__last-import", `<i>${Localization.str.itad.last_import}</i>: ${timestamp ? new Date(timestamp * 1000).toLocaleString() : Localization.str.never}`);
        }
    }

    static async getAppStatus(storeIds) {
        let highlightCollection = SyncedStorage.get("highlight_collection");
        let highlightWaitlist = SyncedStorage.get("highlight_waitlist");
        let multiple = Array.isArray(storeIds);
        let promises = [];
        let resolved = Promise.resolve(multiple ? {} : false);

        if (!await Background.action("itad.isconnected")) {
            promises.push(resolved, resolved);
        } else {
            if (highlightCollection) {
                promises.push(Background.action("itad.incollection", storeIds));
            } else {
                promises.push(resolved);
            }
            if (highlightWaitlist) {
                promises.push(resolved);
                // todo Waitlist endpoint
            } else {
                promises.push(resolved);
            }
        }        

        let [ inCollection, inWaitlist ] = await Promise.all(promises);

        if (multiple) {
            let result = {};
            for (let id of storeIds) {
                result[id] = {
                    "collected": inCollection[id],
                    "waitlisted": inWaitlist[id],
                }
            }
            return result;
        } else {
            return {
                "collected": inCollection,
                "waitlisted": inWaitlist,
            }
        }
    }
}

class ProgressBar {
    static create() {
        if (!SyncedStorage.get("show_progressbar")) { return; }

        let container = document.getElementById("global_actions");
        if (!container) return;
        HTML.afterEnd(container,
            `<div class="es_progress__wrap">
                <div class="es_progress es_progress--complete" title="${Localization.str.ready.ready}">
                    <div class="es_progress__bar">
                        <div class="es_progress__value"></div>
                    </div>
                </div>
            </div>`);
        ProgressBar._progress = document.querySelector(".es_progress");
    }

    static loading() {
        if (!ProgressBar._progress) return;
            
        ProgressBar._progress.setAttribute("title", Localization.str.ready.loading);

        ProgressBar.requests = { "initiated": 0, "completed": 0 };
        ProgressBar._progress.classList.remove("es_progress--complete");
        ProgressBar._progress.querySelector(".es_progress__value").style.width = "18px";
    }

    static startRequest() {
        if (!ProgressBar.requests) { return; }
        ProgressBar.requests.initiated++;
        ProgressBar.progress();
    }

    static finishRequest() {
        if (!ProgressBar.requests) { return; }
        ProgressBar.requests.completed++;        
        ProgressBar.progress();
    }

    static progress(value) {
        if (!ProgressBar._progress) return;

        if (!value) {
            if (!ProgressBar.requests) { return; }
            if (ProgressBar.requests.initiated > 0) {
                value = 100 * ProgressBar.requests.completed / ProgressBar.requests.initiated;
            }
        }
        if (value > 100) {
            value = 100;
        }

        ProgressBar._progress.querySelector(".es_progress__value").style.width = `${value}px`;

        if (value >= 100) {
            ProgressBar._progress.classList.add("es_progress--complete");
            ProgressBar._progress.setAttribute("title", Localization.str.ready.ready);
            ProgressBar.requests = null;
        }
    }

    static serverOutage() {
        if (!ProgressBar._progress) return;

        ProgressBar._progress.classList.add("es_progress--warning");
        ProgressBar.requests = null;

        if (!ProgressBar._progress.parentElement.querySelector(".es_progress__warning, .es_progress__error")) {
            HTML.afterEnd(ProgressBar._progress, `<div class="es_progress__warning">${Localization.str.ready.server_outage}</div>`);
        }
    }

    static failed() {
        if (!ProgressBar._progress) return;

        let warningNode = ProgressBar._progress.parentElement.querySelector(".es_progress__warning");
        if (warningNode) {
            ProgressBar._progress.classList.remove("es_progress--warning"); // Errors have higher precedence
            warningNode.remove();
        }
        ProgressBar._progress.classList.add("es_progress--error");
        ProgressBar.requests = null;
        
        let nodeError = ProgressBar._progress.parentElement.querySelector(".es_progress__error");
        if (nodeError) {
            nodeError.textContent = Localization.str.ready.failed.replace("__amount__", ++ProgressBar._failedRequests);
        } else {
            HTML.afterEnd(ProgressBar._progress, `<div class="es_progress__error">${Localization.str.ready.failed.replace("__amount__", ++ProgressBar._failedRequests)}</div>`);
        }
    }
}
ProgressBar._progress = null;
ProgressBar._failedRequests = 0;

class Background {
    static message(message) {
        ProgressBar.startRequest();

        return browser.runtime.sendMessage(message).then(result => {
            ProgressBar.finishRequest();
            return result;
        }, err => {
            switch (err.message) {
                case "ServerOutageError":
                    ProgressBar.serverOutage();
                    break;
                case "CommunityLoginError": {
                    EnhancedSteam.addLoginWarning();
                    ProgressBar.finishRequest();
                    break;
                } 
                default:
                    ProgressBar.failed();
            }
            throw err;
        });
    }
    
    static action(requested, ...params) {
        if (!params.length)
            return Background.message({ "action": requested, });
        return Background.message({ "action": requested, "params": params, });
    }
}

/**
 * Event handler for uncaught Background errors
 */
function unhandledrejection(ev) {
    let err = ev.reason;
    if (!err || !err.error) return; // Not a background error
    ev.preventDefault();
    ev.stopPropagation();
    console.group("An error occurred in the background context.");
    console.error(err.localStack);
    console.error(err.stack);
    console.groupEnd();
}

window.addEventListener('unhandledrejection', unhandledrejection);

let TimeHelper = (function(){

    let self = {};

    self.isExpired = function(updateTime, expiration) {
        if (!updateTime) { return true; }

        let expireTime = Math.trunc(Date.now() / 1000) - expiration;
        return updateTime < expireTime;
    };

    self.timestamp = function() {
        return Math.trunc(Date.now() / 1000);
    };

    return self;
})();


let DateParser = (function(){

    let _locale;
    let _monthShortNames;
    let _dateRegex;
    let _timeRegex;

    function DateParser(locale) {
        _locale = locale;

        switch(locale) {
            case "en":
                _monthShortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                _dateRegex = new RegExp("(\\d+)\\s+("+_monthShortNames.join("|")+")(?:,\\s+(\\d+))?");
                _timeRegex = /(\d+):(\d+)([ap]m)/;
                break;
            // FIXME(tomas.fedor) other languages
        }
    }

    DateParser.prototype.parseUnlockTime = function(datetime) {

        switch(_locale) {
            case "en":
                let date = datetime.match(_dateRegex);
                let time = datetime.match(_timeRegex);
                if (!date || !time) { return 0; }

                let year = date[3] ? parseInt(date[3]) : (new Date()).getFullYear();
                let month = _monthShortNames.indexOf(date[2]);
                let day = parseInt(date[1]);

                let hour = time[3] === "am" ? parseInt(time[1]) : parseInt(time[1])+12;
                let minutes = time[2];

                return (new Date(year, month, day, hour, minutes)).getTime();
        }
        return 0;
    };

    return DateParser;
})();


let ExtensionLayer = (function() {

    let self = {};

    // NOTE: use cautiously!
    // Run script in the context of the current tab
    self.runInPageContext = function(fun) {
        let script  = document.createElement("script");
        script.textContent = '(' + fun + ")();";
        document.documentElement.appendChild(script);
        script.parentNode.removeChild(script);
    };

    return self;
})();

let DOMHelper = (function(){

    let self = {};

    self.wrap = function(container, node) {
        let parent = node.parentNode;
        parent.insertBefore(container, node);
        parent.removeChild(node);
        container.append(node);
    };

    self.remove = function(selector) {
        let node = document.querySelector(selector);
        if (!node) { return; }
        node.remove();
    };

    // TODO extend Node itself?
    self.selectLastNode = function(parent, selector) {
        let nodes = parent.querySelectorAll(selector);
        return nodes.length !== 0 ? nodes[nodes.length-1] : null;
    };

    self.insertStylesheet = function(href) {
        let stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.type = 'text/css';
        stylesheet.href = href;
        document.head.appendChild(stylesheet);
    }

    self.insertHomeCSS = function() {
        self.insertStylesheet("//steamstore-a.akamaihd.net/public/css/v6/home.css");
        let headerCtn = document.querySelector("div#global_header .content");
        if (headerCtn) {
            // Fixes displaced header, see #190
            headerCtn.style.right = 0;
        }
    }

    self.insertScript = function({ src, content }, id, onload, isAsync = true) {
        let script = document.createElement("script");

        if (onload)     script.onload = onload;
        if (id)         script.id = id;
        if (src)        script.src = src;
        if (content)    script.textContent = content;
        script.async = isAsync;

        document.head.appendChild(script);
    }

    return self;
})();

/**
 * NOTE FOR ADDON REVIEWER:
 * This class is meant to simplify communication between extension context and page context.
 * Basically, we have wrapped postMessage API in this class.
 */
class Messenger {
    static postMessage(msgID, info) {
        window.postMessage({
            type: `es_${msgID}`,
            information: info
        }, window.location.origin);
    }

    // Used for one-time events
    static onMessage(msgID) {
        return new Promise(resolve => {
            let callback = function(e) {
                if (e.source !== window) { return; }
                if (!e.data || !e.data.type) { return; }
                if (e.data.type === `es_${msgID}`) {
                    resolve(e.data.information);
                    window.removeEventListener("message", callback);
                }
            };
            window.addEventListener("message", callback);
        });
    }

    // Used for setting up a listener that should be able to receive more than one callback
    static addMessageListener(msgID, callback) {
        window.addEventListener("message", e => {
            if (e.source !== window) { return; }
            if (!e.data || !e.data.type) { return; }
            if (e.data.type === `es_${msgID}`) {
                callback(e.data.information);
            }
        });
    }
}

// Inject the Messenger class into the DOM, providing the same interface for the page context side
(function() {
    DOMHelper.insertScript({ content: Messenger.toString() });
})();

class CookieStorage {
    static get(name, defaultValue) {
        if (CookieStorage.cache.size === 0) {
            CookieStorage.init();
        }
        name = name.trim();
        if (!CookieStorage.cache.has(name)) {
            return defaultValue;
        }
        return CookieStorage.cache.get(name);
    }

    static set(name, val, ttl=60*60*24*365) {
        if (CookieStorage.cache.size === 0) {
            CookieStorage.init();
        }
        name = name.trim();
        val = val.trim();
        CookieStorage.cache.set(name, val);
        name = encodeURIComponent(name);
        val = encodeURIComponent(val);
        document.cookie = `${name}=${val}; max-age=${ttl}`;
    }

    static remove(name) {
        name = name.trim();
        CookieStorage.cache.delete(name);
        name = encodeURIComponent(name);
        document.cookie = `${name}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }

    static init() {
        CookieStorage.cache.clear();
        for (let [key, val] of document.cookie.split(';').map(kv => kv.split('='))) {
            key = key.trim();
            CookieStorage.cache.set(key, decodeURIComponent(val));
        }
    }
}
CookieStorage.cache = new Map();


let RequestData = (function(){
    let self = {};
    let fetchFn = (typeof content !== 'undefined' && content && content.fetch) || fetch;

    self.getHttp = function(url, settings, responseType="text") {
        settings = settings || {};
        settings.method = settings.method || "GET";
        settings.credentials = settings.credentials || "include";
        settings.headers = settings.headers || { origin: window.location.origin };
        settings.referrer = settings.referrer || window.location.origin + window.location.pathname;

        ProgressBar.startRequest();

        if (url.startsWith("//")) { // TODO remove when not needed
            url = window.location.protocol + url;
            console.warn("Requesting URL without protocol, please update");
        }

        return fetchFn(url, settings).then(response => {

            ProgressBar.finishRequest();

            if (!response.ok) { throw new Error(`HTTP ${response.status} ${response.statusText} for ${response.url}`) }

            return response[responseType]();
            
        }).catch(err => {
            ProgressBar.failed();
            throw err;
        });
    };

    self.post = function(url, formData, settings, returnJSON) {
        return self.getHttp(url, Object.assign(settings || {}, {
            method: "POST",
            body: formData
        }), returnJSON);
    };

    self.getJson = function(url, settings) {
        return self.getHttp(url, settings, "json");
    };

    self.getBlob = function(url, settings) {
        return self.getHttp(url, settings, "blob");
    };

    return self;
})();


let User = (function(){

    let self = {};

    self.isSignedIn = false;
    self.profileUrl = false;
    self.profilePath = false;
    self.steamId = null;

    let accountId = false;
    let sessionId = false;

    let _promise = null;

    self.promise = function() {
        if (_promise) { return _promise; }

        let avatarNode = document.querySelector("#global_actions .playerAvatar");
        self.profileUrl = avatarNode ? avatarNode.getAttribute("href") : false;
        self.profilePath = self.profileUrl && (self.profileUrl.match(/\/(?:id|profiles)\/(.+?)\/$/) || [])[0];

        // If profilePath is not available, we're not logged in
        if (!self.profilePath) {
            Background.action("logout");
            _promise = Promise.resolve();
            return _promise;
        }

        _promise = Background.action("login", self.profilePath)
            .then(function (login) {
                if (!login) return;
                self.isSignedIn = true;
                self.steamId = login.steamId;
                // If we're *newly* logged in, then login.userCountry will be set
                if (login.userCountry) {
                    LocalStorage.set("userCountry", login.userCountry);
                }
            })
            .catch(err => console.error(err))
            ;

        return _promise;
    };

    self.then = function(onDone, onCatch) {
        return self.promise().then(onDone, onCatch);
    };

    self.getAccountId = function(){
        if (accountId === false) {
            accountId = HTMLParser.getVariableFromDom("g_AccountID", "int");
        }
        return accountId;
    };

    self.getSessionId = function() {
        if (sessionId === false) {
            sessionId = HTMLParser.getVariableFromDom("g_sessionID", "string");
        }
        return sessionId;
    };

    self.getStoreSessionId = function() {
        return Background.action('sessionid');
    };

    self.getCountry = function() {
        let url = new URL(window.location.href);

        let country;
        if (url.searchParams && url.searchParams.has("cc")) {
            country = url.searchParams.get("cc");
        } else {
            country = LocalStorage.get("userCountry");
            if (!country) {
                country = CookieStorage.get("steamCountry");
            }
        }

        if (!country) { return null; }
        return country.substr(0, 2);
    };

    self.getPurchaseDate = function(lang, appName) {
        appName = HTMLParser.clearSpecialSymbols(appName);
        return Background.action("purchases", appName, lang);
    };

    return self;
})();

let CurrencyRegistry = (function() {
    //   { "id": 1, "abbr": "USD", "symbol": "$", "hint": "United States Dollars", "multiplier": 100, "unit": 1, "format": { "places": 2, "hidePlacesWhenZero": false, "symbolFormat": "$", "thousand": ",", "decimal": ".", "right": false } },
    class SteamCurrency {
        constructor({
            'id': id,
            'abbr': abbr="USD",
            'symbol': symbol="$",
            'hint': hint="Default Currency",
            'multiplier': multiplier=100,
            'unit': unit=1,
            'format': {
                'places': formatPlaces=2,
                'hidePlacesWhenZero': formatHidePlaces=false,
                'symbolFormat': formatSymbol="$",
                'thousand': formatGroupSeparator=",",
                'group': formatGroupSize=3,
                'decimal': formatDecimalSeparator=".",
                'right': formatPostfixSymbol=false,
            },
        }) {
            // console.assert(id && Number.isInteger(id))
            Object.assign(this, {
                'id': id, // Steam Currency ID, integer, 1-41 (at time of writing)
                'abbr': abbr, // TLA for the currency
                'symbol': symbol, // Symbol used to represent/recognize the currency, this is NULL for CNY to avoid collision with JPY
                'hint': hint, // English label for the currency to reduce mistakes editing the JSON
                'multiplier': multiplier, // multiplier used by Steam when writing values
                'unit': unit, // Minimum transactional unit required by Steam.
                'format': {
                    'decimalPlaces': formatPlaces, // How many decimal places does this currency have?
                    'hidePlacesWhenZero': formatHidePlaces, // Does this currency show decimal places for a .0 value?
                    'symbol': formatSymbol, // Symbol used when generating a string value of this currency
                    'groupSeparator': formatGroupSeparator, // Thousands separator
                    'groupSize': formatGroupSize, // Digits to a "thousand" for the thousands separator
                    'decimalSeparator': formatDecimalSeparator,
                    'postfix': formatPostfixSymbol, // Should format.symbol be post-fixed?
                },
            });
            Object.freeze(this.format);
            Object.freeze(this);
        }
        valueOf(price) {
            // remove separators
            price = price.trim()
                .replace(this.format.groupSeparator, "");
            if (this.format.decimalSeparator != ".")
                price = price.replace(this.format.decimalSeparator, ".") // as expected by parseFloat()
            price = price.replace(/[^\d\.]/g, "");

            let value = parseFloat(price);

            if (Number.isNaN(value))
                return null;
            return value; // this.multiplier?
        }
        stringify(value, withSymbol=true) {
            let sign = value < 0 ? "-" : "";
            value = Math.abs(value);
            let s = value.toFixed(this.format.decimalPlaces), decimals;
            [s, decimals] = s.split('.');
            let g = [], j = s.length;
            for (; j > this.format.groupSize; j -= this.format.groupSize) {
                g.unshift(s.substring(j - this.format.groupSize, j));
            }
            g.unshift(s.substring(0, j));
            s = [sign, g.join(this.format.groupSeparator)];
            if (this.format.decimalPlaces > 0) {
                if (!this.format.hidePlacesWhenZero || parseInt(decimals, 10) > 0) {
                    s.push(this.format.decimalSeparator);
                    s.push(decimals);
                }
            }
            if (withSymbol) {
                if (this.format.postfix) {
                    s.push(this.format.symbol);
                } else {
                    s.unshift(this.format.symbol);
                }
            }
            return s.join("");
        }
        placeholder() {
            let str = `1${this.format.groupSeparator}`;
            let cur = 2;
            for (let i = 0; i < this.format.groupSize; ++i, ++cur) {
                str += cur;
            }

            if (this.format.decimalPlaces === 0) {
                return str;
            }

            str += this.format.decimalSeparator;
            for (let i = 0; i < this.format.decimalPlaces; ++i, ++cur) {
                str += cur;
            }
            return str;
        }
        regExp() {
            let regex = `^(?:\\d{1,${this.format.groupSize}}(?:${StringUtils.escapeRegExp(this.format.groupSeparator)}\\d{${this.format.groupSize}})+|\\d*)`;

            if (this.format.decimalPlaces > 0) {
                regex += `(?:${StringUtils.escapeRegExp(this.format.decimalSeparator)}\\d{0,${this.format.decimalPlaces}})?`;
            }
            regex += '$';
            
            return new RegExp(regex);
        }
    }


    let self = {};

    let indices = {
        'id': {},
        'abbr': {},
        'symbols': {},
    };
    let defaultCurrency = null;
    let re = null;

    self.fromSymbol = function(symbol) {
        return indices.symbols[symbol] || defaultCurrency;
    };

    self.fromType = function(type) {
        return indices.abbr[type] || defaultCurrency;
    };

    self.fromNumber = function(number) {
        return indices.id[number] || defaultCurrency;
    };

    self.fromString = function(price) {
        let match = price.match(re);
        if (!match)
            return defaultCurrency;
        return self.fromSymbol(match[0]);
    };

    Object.defineProperty(self, 'storeCurrency', { get() { return CurrencyRegistry.fromType(Currency.storeCurrency); }});
    Object.defineProperty(self, 'customCurrency', { get() { return CurrencyRegistry.fromType(Currency.customCurrency); }});

    self.init = async function() {
        let currencies = await Background.action('steam.currencies');
        for (let currency of currencies) {
            currency = new SteamCurrency(currency);
            indices.abbr[currency.abbr] = currency;
            indices.id[currency.id] = currency;
            if (currency.symbol) // CNY && JPY use the same symbol
                indices.symbols[currency.symbol] = currency;
        }
        defaultCurrency = indices.id[1]; // USD
        re = new RegExp(Object.keys(indices.symbols).join("|").replace(/\$/g, "\\$"));
    };
    self.then = function(onDone, onCatch) {
        return self.init().then(onDone, onCatch);
    };

    return self;
})();


let Currency = (function() {

    let self = {};

    self.customCurrency = null;
    self.storeCurrency = null;

    let _rates;
    let _promise = null;

    function getCurrencyFromDom() {
        let currencyNode = document.querySelector('meta[itemprop="priceCurrency"]');
        if (currencyNode && currencyNode.hasAttribute("content")) {
            return currencyNode.getAttribute("content");
        }
        return null;
    }

    async function getCurrencyFromWallet() {
        ExtensionLayer.runInPageContext(() =>
            Messenger.postMessage("walletCurrency", typeof g_rgWalletInfo !== 'undefined' && g_rgWalletInfo ? g_rgWalletInfo.wallet_currency : null)
        );

        let walletCurrency = await Messenger.onMessage("walletCurrency");
        if (walletCurrency !== null) {
            return Currency.currencyNumberToType(walletCurrency);
        }
    }

    async function getStoreCurrency() {
        let currency = getCurrencyFromDom();

        if (!currency) {
            currency = await getCurrencyFromWallet();
        }

        if (!currency) {
            try {
                currency = await Background.action('currency');
            } catch(error) {
                console.error("Couldn't load currency" + error);
            }
        }

        if (!currency) {
            currency = "USD"; // fallback
        }

        return currency;
    }

    async function _getCurrency() {
        self.storeCurrency = await getStoreCurrency();
        let currencySetting = SyncedStorage.get("override_price");
        if (currencySetting !== "auto") {
            self.customCurrency = currencySetting;
        } else {
            self.customCurrency = self.storeCurrency;
        }
    }

    async function _getRates() {
        let toCurrencies = [self.storeCurrency,];
        if (self.customCurrency !== self.storeCurrency) {
            toCurrencies.push(self.customCurrency);
        }
        _rates = await Background.action("rates", toCurrencies);
    }

    // load user currency
    self.init = function() {
        if (_promise) { return _promise; }
        return _promise = CurrencyRegistry
            .then(_getCurrency)
            .then(_getRates)
            .catch(e => {
                console.error("Failed to initialize Currency");
                console.error(e);
            });
    };

    self.then = function(onDone, onCatch) {
        return self.init().then(onDone, onCatch);
    };

    self.getRate = function(from, to) {
        if (from === to) { return 1; }

        if (_rates[from] && _rates[from][to]) {
            return _rates[from][to];
        }

        return null;
    };

    self.getCurrencySymbolFromString = function(str) {
        let re = /(?:R\$|S\$|\$|RM|kr|Rp|€|¥|£|฿|pуб|P|₫|₩|TL|₴|Mex\$|CDN\$|A\$|HK\$|NT\$|₹|SR|R |DH|CHF|CLP\$|S\/\.|COL\$|NZ\$|ARS\$|₡|₪|₸|KD|zł|QR|\$U)/;
        let match = str.match(re);
        return match ? match[0] : '';
    };

    self.currencySymbolToType = function(symbol) {
        return CurrencyRegistry.fromSymbol(symbol).abbr;
    };

    self.currencyTypeToNumber = function(type) {
        return CurrencyRegistry.fromType(type).id;
    };

    self.currencyNumberToType = function(number) {
        return CurrencyRegistry.fromNumber(number).abbr;
    };

    return self;
})();

let Price = (function() {
    function Price(value, currency) {
        this.value = value || 0;
        this.currency = currency || Currency.customCurrency;
        Object.freeze(this);
    }

    Price.prototype.formattedValue = function() {
        return CurrencyRegistry.fromType(this.currency).stringify(this.value, false);
    };

    Price.prototype.toString = function() {
        return CurrencyRegistry.fromType(this.currency).stringify(this.value);
    };

    // Not currently in use
    // totalValue = totalValue.add(somePrice)
    Price.prototype.add = function(otherPrice) {
        if (otherPrice.currency !== this.currency) {
            otherPrice = otherPrice.inCurrency(this.currency);
        }
        return new Price(this.value + otherPrice.value, this.currency);
    };

    Price.prototype.inCurrency = function(desiredCurrency) {
        if (this.currency === desiredCurrency) {
            return new Price(this.value, this.currency);
        }
        let rate = Currency.getRate(this.currency, desiredCurrency);
        if (!rate) {
            throw new Error(`Could not establish conversion rate between ${this.currency} and ${desiredCurrency}`);
        }
        return new Price(this.value * rate, desiredCurrency);
    };

    Price.parseFromString = function(str, desiredCurrency) {
        let currency = CurrencyRegistry.fromString(str);
        let value = currency.valueOf(str);
        if (value !== null) {
            value = new Price(value, currency.abbr);
            if (currency.abbr !== desiredCurrency) {
                value = value.inCurrency(desiredCurrency);
            }
        }
        return value;
    };

    return Price;
})();


let Viewport = (function(){

    let self = {};

    // only concerned with vertical at this point
    self.isElementInViewport = function(elem) {
        let elemTop = elem.offsetTop;
        let parent = elem.offsetParent;
        while (parent) {
            elemTop += parent.offsetTop;
            parent = parent.offsetParent;
        }

        let elemBottom = elemTop + elem.getBoundingClientRect().height;
        let viewportTop = window.scrollY;
        let viewportBottom = window.innerHeight + viewportTop;

        return (elemBottom <= viewportBottom && elemTop >= viewportTop);
    };

    return self;
})();

let Stats = (function() {

    let self = {};

    self.getAchievementBar = function(path, appid) {
        return Background.action("stats", path, appid).then(response => {
            let dummy = HTMLParser.htmlToDOM(response);
            let achNode = dummy.querySelector("#topSummaryAchievements");

            if (!achNode) return null;

            achNode.style.whiteSpace = "nowrap";

            if (!achNode.querySelector("img")) {
                // The size of the achievement bars for games without leaderboards/other stats is fine, return
                return achNode.innerHTML;
            }

            let stats = achNode.innerHTML.match(/(\d+) of (\d+) \((\d{1,3})%\)/);

            // 1 full match, 3 group matches
            if (!stats || stats.length !== 4) {
                return null;
            }

            return `<div>${Localization.str.achievements.summary
                .replace("__unlocked__", stats[1])
                .replace("__total__", stats[2])
                .replace("__percentage__", stats[3])}</div>
            <div class="achieveBar">
                <div style="width: ${stats[3]}%;" class="achieveBarProgress"></div>
            </div>`;
        });
    };

    return self;
})();

let EnhancedSteam = (function() {

    let self = {};

    self.addMenu = function() {
        HTML.afterBegin("#global_action_menu",
            `<div id="es_menu">
                <span id="es_pulldown" class="pulldown global_action_link">Augmented Steam</span>
                <div id="es_popup" class="popup_block_new">
                    <div class="popup_body popup_menu">
                        <a class="popup_menu_item" target="_blank" href="${ExtensionResources.getURL("options.html")}">${Localization.str.thewordoptions}</a>
                        <a class="popup_menu_item" id="es_clear_cache" href="#clear_cache">${Localization.str.clear_cache}</a>
                        <div class="hr"></div>
                        <a class="popup_menu_item" target="_blank" href="https://github.com/tfedor/AugmentedSteam">${Localization.str.contribute}</a>
                        <a class="popup_menu_item" target="_blank" href="https://github.com/tfedor/AugmentedSteam/issues">${Localization.str.bug_feature}</a>
                        <div class="hr"></div>
                        <a class="popup_menu_item" target="_blank" href="https://es.isthereanydeal.com/">${Localization.str.website}</a>
                        <a class="popup_menu_item" target="_blank" href="https://isthereanydeal.com/">IsThereAnyDeal</a>
                        <a class="popup_menu_item" target="_blank" href="https://discord.gg/yn57q7f">Discord</a>
                    </div>
                </div>
            </div>
        `);

        let popup = document.querySelector("#es_popup");
        document.querySelector("#es_pulldown").addEventListener("click", function(){
            let width = document.querySelector("#es_pulldown").getBoundingClientRect().width - 19; // padding
            popup.style.left = "-" + width + "px";
            popup.classList.toggle("open");
        });

        document.querySelector("#es_menu").addEventListener("click", function(e){
            e.stopPropagation();
        });

        document.addEventListener("click", function(){
            popup.classList.remove("open");
        });

        document.querySelector("#es_clear_cache").addEventListener("click", function(e){
            e.preventDefault();

            self.clearCache();
            window.location.reload();
        });

    };

    self.addBackToTop = function() {
        if (!SyncedStorage.get("show_backtotop")) { return; }

        let steamButton = document.querySelector("#BackToTop");
        if (steamButton) {
            steamButton.remove();
        }

        HTML.afterBegin("body", `<div class="es_btt">&#9650;</div>`);

        let node = document.querySelector(".es_btt");

        node.addEventListener("click", () => {
            window.scroll({
                top: 0,
                left: 0,
                behavior: 'smooth'
            });
        });

        window.addEventListener("scroll", opacityHandler);

        function opacityHandler() {
            let scrollHeight = document.body.scrollTop || document.documentElement.scrollTop;
            node.classList.toggle("is-visible", scrollHeight >= 400)
        }
    };

    self.clearCache = function() {
        localStorage.clear();
        SyncedStorage.remove("user_currency");
        SyncedStorage.remove("store_sessionid");
        Background.action('cache.clear');
    };

    self.bindLogout = function(){
        // TODO there should be a better detection of logout, probably
        let logoutNode = document.querySelector("a[href$='javascript:Logout();']");
        logoutNode.addEventListener("click", function(e) {
            self.clearCache();
        });
    };

    function addWarning(innerHTML) {
        HTML.afterEnd("#global_header", `<div class="es_warning">${innerHTML}</div>`);
    }

    /**
     * Display warning if browsing using a different language
     */
    self.addLanguageWarning = function() {
        if (!SyncedStorage.get("showlanguagewarning")) { return; }

        let currentLanguage = Language.getCurrentSteamLanguage();
        if (!currentLanguage) return;
        
        if (!SyncedStorage.has("showlanguagewarninglanguage")) {
            SyncedStorage.set("showlanguagewarninglanguage", currentLanguage);
        }
        
        let warningLanguage = SyncedStorage.get("showlanguagewarninglanguage");

        if (currentLanguage === warningLanguage) { return; }

        Localization.loadLocalization(Language.getLanguageCode(warningLanguage)).then(function(strings){
            addWarning(
                `${strings.using_language.replace("__current__", strings.options.lang[currentLanguage] || currentLanguage)}
                <a href="#" id="es_reset_language_code">${strings.using_language_return.replace("__base__", strings.options.lang[warningLanguage] || warningLanguage)}</a>`);

            document.querySelector("#es_reset_language_code").addEventListener("click", function(e){
                e.preventDefault();
                ExtensionLayer.runInPageContext(`() => ChangeLanguage("${warningLanguage}")`);
            });
        });
    };

    let loginWarningAdded = false;
    self.addLoginWarning = function() {
        if (!loginWarningAdded) {
            addWarning(`${Localization.str.community_login.replace("__link__", "<a href='https://steamcommunity.com/login/'>steamcommunity.com</a>")}`);
            console.warn("Are you logged in to steamcommunity.com?");
            loginWarningAdded = true;
        }        
    };

    self.handleInstallSteamButton = function() {
        let option = SyncedStorage.get("installsteam");
        if (option === "hide") {
            DOMHelper.remove("div.header_installsteam_btn");
        } else if (option === "replace") {
            let btn = document.querySelector("div.header_installsteam_btn > a");
            btn.textContent = Localization.str.viewinclient;
            btn.href =  `steam://openurl/${window.location.href}`;
            btn.classList.add("es_steamclient_btn");
        }
    };

    self.removeAboutLinks = function() {
        if (!SyncedStorage.get("hideaboutlinks")) { return; }

        if (User.isSignedIn) {
            DOMHelper.remove(".submenuitem[href^='https://store.steampowered.com/about/']");
        } else {
            DOMHelper.remove(".menuitem[href^='https://store.steampowered.com/about/']");
        }
    };

    self.addHeaderLinks = function(){
        if (!User.isSignedIn || document.querySelector(".supernav_container").length === 0) { return; }

        let submenuUsername = document.querySelector(".supernav_container .submenu_username");
        HTML.afterEnd(submenuUsername.querySelector("a"), `<a class="submenuitem" href="//steamcommunity.com/my/games/">${Localization.str.games}</a>`);
        HTML.afterEnd(submenuUsername.querySelector("a:nth-child(2)"), `<a class="submenuitem" href="//store.steampowered.com/wishlist/">${Localization.str.wishlist}</a>`)
        HTML.beforeEnd(submenuUsername, `<a class="submenuitem" href="//steamcommunity.com/my/recommended/">${Localization.str.reviews}</a>`);
    };

    self.disableLinkFilter = function(){
        if (!SyncedStorage.get("disablelinkfilter")) { return; }

        removeLinksFilter();

        let observer = new MutationObserver(removeLinksFilter);
        observer.observe(document, {childList: true, subtree: true});

        function removeLinksFilter(mutations) {
            let selector = "a.bb_link[href*='/linkfilter/'], div.weblink a[href*='/linkfilter/']";
            if (mutations) {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            node.querySelectorAll(selector).forEach(matchedNode => {
                                matchedNode.setAttribute("href", matchedNode.getAttribute("href").replace(/^.+?\/linkfilter\/\?url=/, ""));
                            });
                        }
                    });
                });
            } else {
                document.querySelectorAll(selector).forEach(node => {
                    node.setAttribute("href", node.getAttribute("href").replace(/^.+?\/linkfilter\/\?url=/, ""));
                });
            }
        }
    };

    self.addRedeemLink = function() {
        HTML.beforeBegin("#account_dropdown .popup_menu_item:last-child:not(.tight)",
            `<a class='popup_menu_item' href='https://store.steampowered.com/account/registerkey'>${Localization.str.activate}</a>`);
    };

    self.replaceAccountName = function() {
        if (!SyncedStorage.get("replaceaccountname")) { return; }

        let accountNameNode = document.querySelector("#account_pulldown");
        let accountName = accountNameNode.textContent.trim();
        let communityName = document.querySelector("#global_header .username").textContent.trim();

        // Present on https://store.steampowered.com/account/history/
        let pageHeader = document.querySelector("h2.pageheader");
        if (pageHeader) {
            pageHeader.textContent = pageHeader.textContent.replace(accountName, communityName);
        }

        accountNameNode.textContent = communityName;

         // Don't replace title on user pages that aren't mine
        let isUserPage = /.*(id|profiles)\/.+/g.test(location.pathname);
        if (!isUserPage || location.pathname.includes(User.profilePath)) {
            document.title = document.title.replace(accountName, communityName);
        }
    };

    self.launchRandomButton = function() {

        HTML.beforeEnd("#es_popup .popup_menu",
            `<div class='hr'></div><a id='es_random_game' class='popup_menu_item' style='cursor: pointer;'>${Localization.str.launch_random}</a>`);

        document.querySelector("#es_random_game").addEventListener("click", async function(){
            let result = await DynamicStore;
            if (!result.rgOwnedApps) { return; }
            let appid = result.rgOwnedApps[Math.floor(Math.random() * result.rgOwnedApps.length)];

            Background.action('appdetails', { 'appids': appid, }).then(response => {
                if (!response || !response[appid] || !response[appid].success) { return; }
                let data = response[appid].data;

                let gameid = appid;
                let gamename;
                if (data.fullgame) {
                    gameid = data.fullgame.appid;
                    gamename = data.fullgame.name;
                } else {
                    gamename = data.name;
                }

                let playGameStr = Localization.str.play_game.replace("__gamename__", gamename.replace("'", "").trim());
                ExtensionLayer.runInPageContext(
                    `function() {
                        var prompt = ShowConfirmDialog('${playGameStr}', "<img src='//steamcdn-a.akamaihd.net/steam/apps/${gameid}/header.jpg'>", null, null, '${Localization.str.visit_store}');
                        prompt.done(function(result) {
                            if (result == 'OK') { window.location.assign('steam://run/${gameid}'); }
                            if (result == 'SECONDARY') { window.location.assign('//store.steampowered.com/app/${gameid}'); }
                        });
                    }`);
            });

        });
    };

    self.skipGotSteam = function() {
        if (!SyncedStorage.get("skip_got_steam")) { return; }

        let node = document.querySelector("a[href^='javascript:ShowGotSteamModal']");
        if (!node) { return; }
        node.setAttribute("href", node.getAttribute("href").split("'")[1]);
    };

    self.keepSteamSubscriberAgreementState = function() {
        let nodes = document.querySelectorAll("#market_sell_dialog_accept_ssa,#market_buynow_dialog_accept_ssa,#accept_ssa");
        for (let i=0, len=nodes.length; i<len; i++) {
            let node = nodes[i];
            node.checked = SyncedStorage.get("keepssachecked");

            node.addEventListener("click", function(){
                SyncedStorage.set("keepssachecked", !SyncedStorage.get("keepssachecked"));
            });
        }
    };

    self.alternateLinuxIcon = function() {
        if (!SyncedStorage.get("show_alternative_linux_icon")) { return; }
        let url = ExtensionResources.getURL("img/alternative_linux_icon.png");
        let style = document.createElement('style');
        style.textContent = `span.platform_img.linux { background-image: url("${url}"); }`;
        document.head.appendChild(style);
        style = null;
    };

    // Hide Trademark and Copyright symbols in game titles for Community pages
    self.hideTrademarkSymbol = function(community) {
        if (!SyncedStorage.get("hidetmsymbols")) { return; }

        // TODO I would try to reduce number of selectors here
        let selectors= "title, .apphub_AppName, .breadcrumbs, h1, h4";
        if(community){
            selectors += ".game_suggestion, .appHubShortcut_Title, .apphub_CardContentNewsTitle, .apphub_CardTextContent, .apphub_CardContentAppName, .apphub_AppName";
        } else {
            selectors += ".game_area_already_owned, .details_block, .game_description_snippet, .game_area_description p, .glance_details, .game_area_dlc_bubble game_area_bubble, .package_contents, .game_area_dlc_name, .tab_desc, .tab_item_name";
        }

        // Replaces "R", "C" and "TM" signs
        function replaceSymbols(node){
            // tfedor I don't trust this won't break any inline JS
            if (!node ||!node.innerHTML) { return; }
            HTML.inner(node, node.innerHTML.replace(/[\u00AE\u00A9\u2122]/g, ""));
        }

        let nodes = document.querySelectorAll(selectors);
        for (let i=0, len=nodes.length; i<len; i++) {
            replaceSymbols(nodes[i]);
        }

        let observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    replaceSymbols(node);
                });
            });
        });

        nodes = document.querySelectorAll("#game_select_suggestions,#search_suggestion_contents,.tab_content_ctn");
        for (let i=0, len=nodes.length; i<len; i++) {
            let node = nodes[i];
            observer.observe(node, {childList:true, subtree:true});

        }
    };

    self.defaultCommunityTab = function() {
        let tab = SyncedStorage.get("community_default_tab");
        if (!tab) { return; }

        let links = document.querySelectorAll("a[href^='https://steamcommunity.com/app/']");
        for (let link of links) {
            if (link.classList.contains("apphub_sectionTab")) { continue; }
            if (!/^\/app\/[0-9]+\/?$/.test(link.pathname)) { continue; }
            if (!link.pathname.endsWith("/")) {
                link.pathname += "/";
            }
            link.pathname += tab + "/";
        }
    };

    return self;
})();

let EarlyAccess = (function(){

    let self = {};

    let imageUrl;

    async function checkNodes(selectors, selectorModifier) {
        selectorModifier = typeof selectorModifier === "string" ? selectorModifier : "";
        let appidsMap = new Map();

        let selector = selectors.map(selector => `${selector}:not(.es_ea_checked)`).join(',');
        let nodes = document.querySelectorAll(selector);
        nodes.forEach(node => {
            node.classList.add("es_ea_checked");

            let linkNode = node.querySelector("a");
            let href = linkNode && linkNode.hasAttribute("href") ? linkNode.getAttribute("href") : node.getAttribute("href");
            let imgHeader = node.querySelector("img" + selectorModifier);
            let appid = GameId.getAppid(href) || GameId.getAppidImgSrc(imgHeader ? imgHeader.getAttribute("src") : null);

            if (appid) appidsMap.set(appid, node);
        });

        let eaAppids = await Background.action("isea", Array.from(appidsMap.keys()).map(key => Number(key)));

        for (let [appid, node] of appidsMap) {
            if (!eaAppids[appid]) continue;

            node.classList.add("es_early_access");

            let imgHeader = node.querySelector("img" + selectorModifier);
            let container = document.createElement("span");
            container.classList.add("es_overlay_container");
            DOMHelper.wrap(container, imgHeader);

            HTML.afterBegin(container, `<span class="es_overlay"><img title="${Localization.str.early_access}" src="${imageUrl}" /></span>`);
        }
    }

    function handleStore() {
        // TODO refactor these checks to appropriate page calls
        switch (true) {
            case /^\/app\/.*/.test(window.location.pathname):
                checkNodes([".game_header_image_ctn", ".small_cap"]);
                break;
            case /^\/(?:genre|browse|tag)\/.*/.test(window.location.pathname):
                checkNodes([".tab_item",
                           ".special_tiny_cap",
                           ".cluster_capsule",
                           ".game_capsule",
                           ".browse_tag_game",
                           ".dq_item:not(:first-child)",
                           ".discovery_queue:not(:first-child)"]);
                break;
            case /^\/search\/.*/.test(window.location.pathname):
                checkNodes([".search_result_row"]);
                break;
            case /^\/recommended/.test(window.location.pathname):
                checkNodes([".friendplaytime_appheader",
                           ".header_image",
                           ".appheader",
                           ".recommendation_carousel_item .carousel_cap",
                           ".game_capsule",
                           ".game_capsule_area",
                           ".similar_grid_capsule"]);
                break;
            case /^\/tag\/.*/.test(window.location.pathname):
                checkNodes([".cluster_capsule",
                           ".tab_row",
                           ".browse_tag_game_cap"]);
                break;
            case /^\/(?:curator|developer|dlc|publisher)\/.*/.test(window.location.pathname):
                checkNodes( [
                    "#curator_avatar_image",
                    ".capsule",
                ]);
                break;
            case /^\/$/.test(window.location.pathname):
                checkNodes( [".cap",
                           ".special",
                           ".game_capsule",
                           ".cluster_capsule",
                           ".recommended_spotlight_ctn",
                           ".curated_app_link",
                           ".dailydeal_ctn a",
                           ".tab_item:last-of-type"]);

                // Sales fields
                checkNodes([".large_sale_caps a", ".small_sale_caps a", ".spotlight_img"]);
                // checkNodes($(".sale_capsule_image").parent()); // TODO check/remove
                break;
        }
    }

    function handleCommunity() {
        // TODO refactor these checks to appropriate page calls
        switch(true) {
            // wishlist, games, and followedgames can be combined in one regex expresion
            case /^\/(?:id|profiles)\/.+\/(wishlist|games|followedgames)/.test(window.location.pathname):
                checkNodes([".gameListRowLogo"]);
                break;
            case /^\/(?:id|profiles)\/.+\/\b(home|myactivity)\b/.test(window.location.pathname):
                checkNodes([".blotter_gamepurchase_content a"]);
                break;
            case /^\/(?:id|profiles)\/.+\/\b(reviews|recommended)\b/.test(window.location.pathname):
                checkNodes([".leftcol"]);
                break;
            case /^\/(?:id|profiles)\/.+/.test(window.location.pathname):
                checkNodes([".game_info_cap",
                           ".showcase_gamecollector_game",
                           ".favoritegame_showcase_game"]);
        }
    }

    self.showEarlyAccess = async function() {
        if (!SyncedStorage.get("show_early_access")) { return; }

        let imageName = "img/overlay/early_access_banner_english.png";
        if (Language.isCurrentLanguageOneOf(["brazilian", "french", "italian", "japanese", "koreana", "polish", "portuguese", "russian", "schinese", "spanish", "latam", "tchinese", "thai"])) {
            imageName = "img/overlay/early_access_banner_" + Language.getCurrentSteamLanguage() + ".png";
        }
        imageUrl = ExtensionResources.getURL(imageName);

        switch (window.location.host) {
            case "store.steampowered.com":
                handleStore();
                break;
            case "steamcommunity.com":
                handleCommunity();
                break;
        }
    };

    return self;
})();


let Inventory = (function(){

    let self = {};

    self.getCoupon = function(appid) {
        return Background.action("coupon", appid);
    };

    self.getAppStatus = async function(appids) {
        function getStatusObject(giftsAndPasses, hasCoupon) {
            return {
                "gift": giftsAndPasses.includes("gifts"),
                "guestPass": giftsAndPasses.includes("passes"),
                "coupon": hasCoupon,
            };
        }

        try {
            let [ giftsAndPasses, coupons ] = await Promise.all([
                Background.action("hasgiftsandpasses", appids),
                Background.action("hascoupon", appids),
            ]);

            if (Array.isArray(appids)) {
                let results = {};
                
                for (let id of appids) {
                    results[id] = getStatusObject(giftsAndPasses[id], coupons[id]);
                }
                
                return results;
            }
            return getStatusObject(giftsAndPasses, coupons);
        } catch (err) {
            if (Array.isArray(appids)) {
                let results = {};
                for (let id of appids) {
                    results[id] = getStatusObject([], null);
                }
                return results;
            }

            return getStatusObject([], null);
        }
    };

    self.hasInInventory6 = function(marketHashes) {
        return Background.action("hasItem", marketHashes);
    };

    return self;
})();

let Highlights = (function(){

    // Attention, the sequence of these entries determines the precendence of the highlights!
    // The later it appears in the array, the higher its precedence
    let highlightTypes = [
        "notinterested",
        "waitlist",
        "wishlist",
        "collection",
        "owned",
        "coupon",
        "inv_guestpass",
        "inv_gift",
    ]

    let self = {};

    let highlightCssLoaded = false;
    let tagCssLoaded = false;

    function addTag(node, tag) {
        let tagShort = SyncedStorage.get("tag_short");

        // Load the colors CSS for tags
        if (!tagCssLoaded) {
            tagCssLoaded = true;

            let tagCss = [];
            for (let name of highlightTypes) {
                let color = SyncedStorage.get(`tag_${name}_color`);
                tagCss.push(`.es_tag_${name} { background-color: ${color}; }`);
            }

            let style = document.createElement('style');
            style.id = 'es_tag_styles';
            style.textContent = tagCss.join("\n");
            document.head.appendChild(style);
            style = null;
        }

        // Add the tags container if needed
        let tags = node.querySelectorAll(".es_tags");
        if (tags.length === 0) {
            tags = HTMLParser.htmlToElement(`<div class="es_tags ${tagShort ? 'es_tags_short' : ''}"/>`);

            let root;
            if (node.classList.contains("tab_row")) { // can't find it
                root = node.querySelector(".tab_desc").classList.remove("with_discount");

                node.querySelector(".tab_discount").style.top = "15px";
                root.querySelector("h4").insertAdjacentElement("afterend", tags);
            }
            else if (node.classList.contains("home_smallcap")) {
                node.querySelector(".home_smallcap_title").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("curated_app_item")) {
                node.querySelector(".home_headerv5_title").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("tab_item")) {
                node.querySelector(".tab_item_name").insertAdjacentElement("afterend", tags);
            }
            else if (node.classList.contains("search_result_row")) {
                node.querySelector("p").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("dailydeal")) { // can't find it
                root = node.parentNode;
                root.querySelector(".game_purchase_action").insertAdjacentElement("beforebegin", tags);
                HTML.beforeBegin(root.querySelector(".game_purchase_action"), '<div style="clear: right;"></div>');
            }
            else if (node.classList.contains("browse_tag_game")) {
                node.querySelector(".browse_tag_game_price").insertAdjacentElement("afterend", tags);
            }
            else if (node.classList.contains("game_area_dlc_row")) {
                node.querySelector(".game_area_dlc_price").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("wishlist_row")) {
                node.querySelector(".addedon").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("match")) {
                node.querySelector(".match_price").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("cluster_capsule")) {
                node.querySelector(".main_cap_platform_area").append(tags);
            }
            else if (node.classList.contains("recommendation_highlight")) {
                node.querySelector(".highlight_description").insertAdjacentElement("afterbegin", tags);
            }
            else if (node.classList.contains("similar_grid_item")) {
                node.querySelector(".regular_price, .discount_block").append(tags);
            }
            else if (node.classList.contains("recommendation_carousel_item")) {
                node.querySelector(".buttons").insertAdjacentElement("beforebegin", tags);
            }
            else if (node.classList.contains("friendplaytime_game")) {
                node.querySelector(".friendplaytime_buttons").insertAdjacentElement("beforebegin", tags);
            }

            tags = [tags];
        }

        // Add the tag
        for (let n of tags) {
            if (!n.querySelector(`es_tag_${tag}`)) {
                HTML.beforeEnd(n, `<span class="es_tag_${tag}">${Localization.str.tag[tag]}</span>`);
            }
        }
    }

    function highlightNode(node) {
        if (SyncedStorage.get("highlight_excludef2p")) {

            if (node.innerHTML.match(/<div class="(tab_price|large_cap_price|col search_price|main_cap_price|price)">\n?(.+)?(Free to Play|Play for Free!)(.+)?<\/div>/i)) {
                return;
            }
            if (node.innerHTML.match(/<h5>(Free to Play|Play for Free!)<\/h5>/i)) {
                return;
            }
            if (node.innerHTML.match(/genre_release/) && node.querySelector(".genre_release").innerHTML.match(/Free to Play/i)) {
                return;
            }
            if (node.classList.contains("search_result_row") && node.innerHTML.match(/Free to Play/i)) {
                return;
            }
        }

        if (!highlightCssLoaded) {
            highlightCssLoaded = true;

            let hlCss = [];

            for (let name of highlightTypes) {
                let color = SyncedStorage.get(`highlight_${name}_color`);
                hlCss.push(
                   `.es_highlighted_${name} { background: ${color} linear-gradient(135deg, rgba(0, 0, 0, 0.70) 10%, rgba(0, 0, 0, 0) 100%) !important; }
                    .carousel_items .es_highlighted_${name}.price_inline, .curator_giant_capsule.es_highlighted_${name}, .hero_capsule.es_highlighted_${name} { outline: solid ${color}; }
                    .apphub_AppName.es_highlighted_${name} { background: none !important; color: ${color}; }`);
            }

            let style = document.createElement('style');
            style.id = 'es_highlight_styles';
            style.textContent = hlCss.join("\n");
            document.head.appendChild(style);
            style = null;
        }

        // Carousel item
        if (node.classList.contains("cluster_capsule")) {
            node = node.querySelector(".main_cap_content").parentNode;
        } else if (node.classList.contains("large_cap")) {
            // Genre Carousel items
            node = node.querySelector(".large_cap_content");
        } else if (node.parentNode.classList.contains("steam_curator_recommendation") && node.parentNode.classList.contains("big")) {
            node = node.previousElementSibling;
        }

        switch(true) {
            // Recommendations on front page when scrolling down
            case node.classList.contains("single"):
                node = node.querySelector(".gamelink");
                // don't break

            case node.parentNode.parentNode.classList.contains("apps_recommended_by_curators_v2"): {
                let r = node.querySelectorAll(".ds_flag");
                r.forEach(node => node.remove());
                r = node.querySelectorAll(".ds_flagged");
                r.forEach(node => node.classList.remove("ds_flagged"));
                break;
            }

            case node.classList.contains("info"):
            case node.classList.contains("spotlight_content"):
                node = node.parentElement;
                // don't break

            default: {
                let r = node.querySelector(".ds_flag");
                if (r) { r.remove(); }
                r = node.querySelector(".ds_flagged");
                if (r) {
                    r.classList.remove("ds_flagged");
                }
                break;
            }
            
        }

        node.classList.remove("ds_flagged");
    }

    function highlightItem(node, name) {
        node.classList.add("es_highlight_checked");

        if (SyncedStorage.get(`highlight_${name}`)) {
            node.classList.add("es_highlighted", `es_highlighted_${name}`);
            highlightNode(node);
        }

        if (SyncedStorage.get(`tag_${name}`)) {
            addTag(node, name);
        }
    }

    self.highlightWishlist = function(node) {
        highlightItem(node, "wishlist");
    };

    self.highlightCoupon = function(node) {
        highlightItem(node, "coupon");
    };

    // Color the tile for items in inventory
    self.highlightInvGift = function(node) {
        highlightItem(node, "inv_gift");
    };

    // Color the tile for items in inventory
    self.highlightInvGuestpass = function(node) {
        highlightItem(node, "inv_guestpass");
    };

    self.highlightNonDiscounts = function(node) {
        if (!SyncedStorage.get("highlight_notdiscounted")) { return; }
        node.style.display = "none";
    };

    self.highlightOwned = function(node) {
        if (SyncedStorage.get("hide_owned") && (node.closest(".search_result_row") || node.closest(".tab_item"))) {
            node.style.display = "none";
        } 
        highlightItem(node, "owned");
    };

    self.highlightNotInterested = function(node) {
        if (SyncedStorage.get("hide_ignored") && (node.closest(".search_result_row") || node.closest(".tab_item"))) {
            node.style.display = "none";
        }
        highlightItem(node, "notinterested");
    };

    self.highlightCollection = function(node) {
        highlightItem(node, "collection");
    };

    self.highlightWaitlist = function(node) {
        highlightItem(node, "waitlist");
    };

    /**
     * Highlights and tags DOM nodes that are owned, wishlisted, ignored, collected, waitlisted
     * or that the user has a gift, a guest pass or coupon for.
     * 
     * Additionally hides non-discounted titles if wished by the user.
     * @param {NodeList} nodes      The nodes that should get highlighted
     * @param {boolean} hasDsInfo   Whether or not the supplied nodes contain dynamic store info.
     * @returns {Promise}           Resolved once the highlighting and tagging completed for the nodes
     */
    self.highlightAndTag = async function(nodes, hasDsInfo = true) {

        let storeIdsMap = new Map();

        for (let node of nodes) {
            let nodeToHighlight = node;

            if (node.classList.contains("item")) {
                nodeToHighlight = node.querySelector(".info");
            } else if (node.classList.contains("home_area_spotlight")) {
                nodeToHighlight = node.querySelector(".spotlight_content");
            } else if (node.parentNode.classList.contains("steam_curator_recommendation") && node.parentNode.classList.contains("big")) {
                nodeToHighlight = node.nextElementSibling;
            } else if (node.parentNode.parentNode.classList.contains("curations")) {
                nodeToHighlight = node.parentNode;
            }

            let aNode = node.querySelector("a");

            let appid = GameId.getAppid(node) || GameId.getAppid(aNode) || GameId.getAppidFromId(node.id);
            let subid = GameId.getSubid(node) || GameId.getSubid(aNode);
            let bundleid = GameId.getBundleid(node) || GameId.getBundleid(aNode);

            let storeId;
            if (appid) {
                storeId = `app/${appid}`;
            } else if (bundleid) {
                storeId = `bundle/${bundleid}`;
            } else if (subid) {
                storeId = `sub/${subid}`;
            }

            if (storeId) {
                if (storeIdsMap.has(storeId)) {
                    let arr = storeIdsMap.get(storeId);
                    arr.push(nodeToHighlight);
                    storeIdsMap.set(storeId, arr);
                } else {
                    storeIdsMap.set(storeId, [ nodeToHighlight ]);
                }
            }

            if (hasDsInfo) {
                if (node.querySelector(".ds_owned_flag")) {
                    self.highlightOwned(nodeToHighlight);
                }
                
                if (node.querySelector(".ds_wishlist_flag")) {
                    self.highlightWishlist(nodeToHighlight);
                }
    
                if (node.querySelector(".ds_ignored_flag")) {
                    self.highlightNotInterested(nodeToHighlight);
                }
            }
            
            if (node.classList.contains("search_result_row") && !node.querySelector(".search_discount span")) {
                self.highlightNonDiscounts(nodeToHighlight);
            }
        }

        let storeIds = Array.from(storeIdsMap.keys());
        let trimmedStoreIds = storeIds.map(id => GameId.trimStoreId(id));

        let [ dsStatus, itadStatus, invStatus ] = await Promise.all([
            hasDsInfo ? Promise.resolve() : DynamicStore.getAppStatus(storeIds),
            ITAD.getAppStatus(storeIds),
            Inventory.getAppStatus(trimmedStoreIds),
        ]);
        
        let it = trimmedStoreIds.values();
        for (let [storeid, nodes] of storeIdsMap) {
            if (dsStatus) {
                if (dsStatus[storeid].owned) nodes.forEach(node => self.highlightOwned(node));
                if (dsStatus[storeid].wishlisted) nodes.forEach(node => self.highlightWishlist(node));
                if (dsStatus[storeid].ignored) nodes.forEach(node => self.highlightNotInterested(node));
            }

            if (itadStatus[storeid].collected) nodes.forEach(node => self.highlightCollection(node));
            if (itadStatus[storeid].waitlisted) nodes.forEach(node => self.highlightWaitlist(node));

            let trimmedId = it.next().value;
            if (invStatus[trimmedId].gift) nodes.forEach(node => self.highlightInvGift(node));
            if (invStatus[trimmedId].guestPass) nodes.forEach(node => self.highlightInvGuestpass(node));
            if (invStatus[trimmedId].coupon) nodes.forEach(node => self.highlightCoupon(node));
        }
        
    }

    self.startHighlightsAndTags = async function(parent) {
        // Batch all the document.ready appid lookups into one storefront call.
        let selector = [
            "div.tab_row",                                  // Storefront rows
            "div.dailydeal_ctn",
            ".store_main_capsule",                          // "Featured & Recommended"
            "div.wishlistRow",                              // Wishlist rows
            "a.game_area_dlc_row",                          // DLC on app pages
            "a.small_cap",                                  // Featured storefront items and "recommended" section on app pages
            "a.home_smallcap",
            ".home_content_item",                           // Small items under "Keep scrolling for more recommendations"
            ".home_content.single",                         // Big items under "Keep scrolling for more recommendations"
            ".home_area_spotlight",                         // "Special offers" big items
            "a.search_result_row",                          // Search result rows
            "a.match",                                      // Search suggestions rows
            ".highlighted_app",                             // For example "Recently Recommended" on curators page
            "a.cluster_capsule",                            // Carousel items
            "div.recommendation_highlight",                 // Recommendation pages
            "div.recommendation_carousel_item",             // Recommendation pages
            "div.friendplaytime_game",                      // Recommendation pages
            ".recommendation_row",                          // "Recent recommendations by friends"
            ".friendactivity_tab_row",                      // "Most played" and "Most wanted" tabs on recommendation pages
            ".friend_game_block",                           // "Friends recently bought"
            ".recommendation",                              // Curator pages and the new DLC pages
            ".curator_giant_capsule",
            "div.carousel_items.curator_featured > div",    // Carousel items on Curator pages
            "div.item_ctn",                                 // Curator list item
            ".store_capsule",                               // All sorts of items on almost every page
            ".home_marketing_message",                      // "Updates and offers"
            "div.dlc_page_purchase_dlc",                    // DLC page rows
            "div.sale_page_purchase_item",                  // Sale pages
            "div.item",                                     // Sale pages / featured pages
            "div.home_area_spotlight",                      // Midweek and weekend deals
            "div.browse_tag_game",                          // Tagged games
            "div.similar_grid_item",                        // Items on the "Similarly tagged" pages
            ".tab_item",                                    // Items on new homepage
            "a.special",                                    // new homepage specials
            "div.curated_app_item",                         // curated app items!
            ".hero_capsule",                                // Summer sale "Featured"
            ".sale_capsule"                                 // Summer sale general capsules
        ].map(sel => `${sel}:not(.es_highlighted)`)
        .join(',');

        parent = parent || document;

        Messenger.onMessage("dynamicStoreReady").then(() => {
            self.highlightAndTag(parent.querySelectorAll(selector));
    
            let searchBoxContents = parent.getElementById("search_suggestion_contents");
            if (searchBoxContents) {
                let observer = new MutationObserver(records => {
                    self.highlightAndTag(records[0].addedNodes);
                });
                observer.observe(searchBoxContents, {childList: true});
            }
        });

        ExtensionLayer.runInPageContext(() => {
            GDynamicStore.OnReady(() => Messenger.postMessage("dynamicStoreReady"));
        });
    };

    return self;
})();

let DynamicStore = (function(){

    let self = {};

    let _promise = null;

    self.clear = function() {
        return Background.action("dynamicstore.clear");
    };

    self.getAppStatus = async function(storeId) {
        let multiple = Array.isArray(storeId);
        let promise;
        let trimmedIds;

        if (multiple) {
            trimmedIds = storeId.map(id => GameId.trimStoreId(id));
            promise = Background.action("dynamicstorestatus", trimmedIds);
        } else {
            promise = Background.action("dynamicstorestatus", GameId.trimStoreId(storeId));
        }

        let statusList;
        let dsStatusList = await promise;

        if (multiple) {
            statusList = {};
            for (let i = 0; i < storeId.length; ++i) {
                let trimmedId = trimmedIds[i];
                let id = storeId[i];
                statusList[id] = {
                    "ignored": dsStatusList[trimmedId].includes("ignored"),
                    "wishlisted": dsStatusList[trimmedId].includes("wishlisted"),
                }
                if (id.startsWith("app/")) {
                    statusList[id].owned = dsStatusList[trimmedId].includes("ownedApps");
                } else if (id.startsWith("sub/")) {
                    statusList[id].owned = dsStatusList[trimmedId].includes("ownedPackages");
                }
            }
        } else {
            statusList = {
                "ignored": dsStatusList.includes("ignored"),
                "wishlisted": dsStatusList.includes("wishlisted"),
            }
            if (storeId.startsWith("app/")) {
                statusList.owned = dsStatusList.includes("ownedApps");
            } else if (storeId.startsWith("sub/")) {
                statusList.owned = dsStatusList.includes("ownedPackages");
            }
        }

        return statusList;
    }

    async function _fetch() {
        if (!User.isSignedIn) {
            return self.clear();
        }
    }

    self.then = function(onDone, onCatch) {
        if (!_promise) {
            _promise = _fetch();
        }
        return _promise.then(onDone, onCatch);
    };

    return self;
})();

let Prices = (function(){

    function Prices() {
        this.appids = [];
        this.subids = [];
        this.bundleids = [];

        this.priceCallback = function(type, id, node) {};
        this.bundleCallback = function(html) {};

        this._bundles = [];
    }

    Prices.prototype._getApiParams = function() {
        let apiParams = {};

        if (!SyncedStorage.get("showallstores") && SyncedStorage.get("stores").length > 0) {
            apiParams.stores = SyncedStorage.get("stores").join(",");
        }

        let cc = User.getCountry();
        if (cc) {
            apiParams.cc = cc;
        }

        apiParams.appids = this.appids.join(",");
        apiParams.subids = this.subids.join(",");
        apiParams.bundleids = this.bundleids.join(",");

        if (SyncedStorage.get("showlowestpricecoupon")) {
            apiParams.coupon = true;
        }

        if (!apiParams.appids && !apiParams.subids && !apiParams.bundleids) { return; }

        return apiParams;
    };

    Prices.prototype._processPrices = function(gameid, meta, info) {
        if (!this.priceCallback) { return; }

        let [type, id] = gameid.split("/");

        let node = document.createElement("div");
        node.classList.add("itad-pricing");
        node.id = "es_price_" + id;

        let pricingStr = Localization.str.pricing;

        let hasData = false;

        // Current best
        if (info.price) {
            hasData = true;
            let priceData = info.price;

            let lowest;
            let voucherStr = '';
            if (SyncedStorage.get("showlowestpricecoupon") && priceData.price_voucher) {
                lowest = new Price(priceData.price_voucher, meta.currency);

                let voucher = HTML.escape(info.price.voucher);
                voucherStr = `${pricingStr.with_voucher.replace("__voucher__", `<span class="itad-pricing__voucher">${voucher}</span>`)} `;
            } else {
                lowest = new Price(priceData.price, meta.currency);
            }
            lowest = lowest.inCurrency(Currency.customCurrency);

            let cutStr = '';
            if (priceData.cut > 0) {
                cutStr = `<span class='itad-pricing__cut'>-${priceData.cut}%</span> `;
            }

            let drmStr = '';
            if (priceData.drm.length > 0 && priceData.store !== "Steam") {
                drmStr = `<span class='itad-pricing__drm'>(${priceData.drm[0]})</span>`;
            }

            let priceUrl = HTML.escape(info.price.url.toString());

            let prices = lowest.toString();
            if (Currency.customCurrency != Currency.storeCurrency) {
                let lowest_alt = lowest.inCurrency(Currency.storeCurrency);
                prices += ` (${lowest_alt.toString()})`;
            }
            let pricesStr = `<span class="itad-pricing__price">${prices}</span>`;

            let storeStr = pricingStr.store.replace("__store__", HTML.escape(priceData.store));
            let infoUrl = HTML.escape(info.urls.info);

            HTML.beforeEnd(node, `<a href="${infoUrl}" target="_blank">${pricingStr.lowest_price}</a>`);
            HTML.beforeEnd(node, pricesStr);
            HTML.beforeEnd(node, `<a href="${priceUrl}" class="itad-pricing__main" target="_blank">${cutStr}${voucherStr}${storeStr}&nbsp;${drmStr}</a>`);
        }

        // Historical low
        if (info.lowest) {
            hasData = true;
            let lowestData = info.lowest;

            let historical = new Price(lowestData.price, meta.currency).inCurrency(Currency.customCurrency);
            let recorded = new Date(info.lowest.recorded * 1000);

            let prices = historical.toString();
            if (Currency.customCurrency !== Currency.storeCurrency) {
                let historical_alt = historical.inCurrency(Currency.storeCurrency);
                prices += ` (${historical_alt.toString()})`;
            }
            let pricesStr = `<span class="itad-pricing__price">${prices}</span>`;

            let cutStr = '';
            if (lowestData.cut > 0) {
                cutStr = `<span class='itad-pricing__cut'>-${lowestData.cut}%</span> `;
            }

            let storeStr = pricingStr.store.replace("__store__", lowestData.store);
            let infoUrl = HTML.escape(info.urls.history);

            HTML.beforeEnd(node, `<a href="${infoUrl}" target="_blank">${pricingStr.historical_low}</div>`);
            HTML.beforeEnd(node, pricesStr);
            HTML.beforeEnd(node, `<div class="itad-pricing__main">${cutStr}${storeStr} ${recorded.toLocaleDateString()}</div>`);
        }

        // times bundled
        if (info.bundles.count > 0) {
            hasData = true;

            let bundlesUrl = HTML.escape(info.urls.bundles || info.urls.bundle_history);
            
            HTML.beforeEnd(node, `<a href="${bundlesUrl}" target="_blank">${pricingStr.bundled}</a>`);

            let bundledStr = pricingStr.bundle_count.replace("__count__", info.bundles.count);
            HTML.beforeEnd(node, `<div class="itad-pricing__bundled">${bundledStr}</div>`);
        }

        if (hasData) {
            this.priceCallback(type, id, node);
        }
    };

    Prices.prototype._processBundles = function(meta, info) {
        if (!this.bundleCallback) { return; }
        if (info.bundles.live.length == 0) { return; }

        let length = info.bundles.live.length;
        let purchase = "";

        for (let i = 0; i < length; i++) {
            let bundle = info.bundles.live[i];
            let endDate;
            if (bundle.expiry) {
                endDate = new Date(bundle.expiry * 1000);
            }

            let currentDate = new Date().getTime();
            if (endDate && currentDate > endDate) { continue; }

            let bundle_normalized = JSON.stringify({
                page:  bundle.page || "",
                title: bundle.title || "",
                url:   bundle.url || "",
                tiers: (function() {
                    let tiers = [];
                    for (let tier in bundle.tiers) {
                        tiers.push((bundle.tiers[tier].games || []).sort());
                    }
                    return tiers;
                })()
            });

            if (this._bundles.indexOf(bundle_normalized) >= 0) { continue; }
            this._bundles.push(bundle_normalized);

            if (bundle.page) {
                let bundlePage = Localization.str.buy_package.replace("__package__", bundle.page + ' ' + bundle.title);
                purchase += `<div class="game_area_purchase_game"><div class="game_area_purchase_platform"></div><h1>${bundlePage}</h1>`;
            } else {
                let bundleTitle = Localization.str.buy_package.replace("__package__", bundle.title);
                purchase += `<div class="game_area_purchase_game_wrapper"><div class="game_area_purchase_game"></div><div class="game_area_purchase_platform"></div><h1>${bundleTitle}</h1>`;
            }

            if (endDate) {
                purchase += `<p class="game_purchase_discount_countdown">${Localization.str.bundle.offer_ends} ${endDate}</p>`;
            }

            purchase += '<p class="package_contents">';

            let bundlePrice;
            let appName = this.appName;

            for (let t=0; t<bundle.tiers.length; t++) {
                let tier = bundle.tiers[t];
                let tierNum = t + 1;

                purchase += '<b>';
                if (bundle.tiers.length > 1) {
                    let tierName = tier.note || Localization.str.bundle.tier.replace("__num__", tierNum);
                    let tierPrice = (new Price(tier.price, meta.currency).inCurrency(Currency.customCurrency)).toString();

                    purchase += Localization.str.bundle.tier_includes.replace("__tier__", tierName).replace("__price__", tierPrice).replace("__num__", tier.games.length);
                } else {
                    purchase += Localization.str.bundle.includes.replace("__num__", tier.games.length);
                }
                purchase += ':</b> ';

                let gameList = tier.games.join(", ");
                if (gameList.includes(appName)) {
                    purchase += gameList.replace(appName, "<u>"+appName+"</u>");
                    bundlePrice = tier.price;
                } else {
                    purchase += gameList;
                }

                purchase += "<br>";
            }

            purchase += "</p>";
            purchase += `<div class="game_purchase_action">
                            <div class="game_purchase_action_bg">
                                 <div class="btn_addtocart btn_packageinfo">
                                    <a class="btnv6_blue_blue_innerfade btn_medium" href="${bundle.details}" target="_blank">
                                         <span>${Localization.str.bundle.info}</span>
                                    </a>
                                </div>
                            </div>`;

            purchase += '\n<div class="game_purchase_action_bg">';
            if (bundlePrice && bundlePrice > 0) {
                purchase += '<div class="game_purchase_price price" itemprop="price">';
                    purchase += (new Price(bundlePrice, meta.currency).inCurrency(Currency.customCurrency)).toString();
                purchase += '</div>';
            }

            purchase += '<div class="btn_addtocart">';
            purchase += '<a class="btnv6_green_white_innerfade btn_medium" href="' + bundle["url"] + '" target="_blank">';
            purchase += '<span>' + Localization.str.buy + '</span>';
            purchase += '</a></div></div></div></div>';
        }

        if (purchase) this.bundleCallback(purchase);
    };

    Prices.prototype.load = function() {
        let that = this;
        let apiParams = this._getApiParams();

        if (!apiParams) { return; }

        Background.action('prices', apiParams).then(response => {
            let meta = response['.meta'];

            for (let [gameid, info] of Object.entries(response.data)) {
                that._processPrices(gameid, meta, info);
                that._processBundles(meta, info);
            }
        });
    };

    return Prices;
})();

let AgeCheck = (function(){

    let self = {};

    self.sendVerification = function(){
        if (!SyncedStorage.get("send_age_info")) { return; }

        let ageYearNode = document.querySelector("#ageYear");
        if (ageYearNode) {
            let myYear = Math.floor(Math.random()*75)+10;
            ageYearNode.value = "19" + myYear;
            document.querySelector(".btnv6_blue_hoverfade").click();
        } else {
            let btn = document.querySelector(".agegate_text_container.btns a");
            if (btn && btn.getAttribute("href") === "#") {
                btn.click();
            }
        }

        let continueNode = document.querySelector("#age_gate_btn_continue");
        if (continueNode) {
            continueNode.click();
        }
    };

    return self;
})();

let Common = (function(){

    let self = {};

    self.init = function() {

        console.log.apply(console, [
            "%c Augmented %cSteam v" + Info.version + " %c https://es.isthereanydeal.com/",
            "background: #000000;color:#046eb2",
            "background: #000000;color: #ffffff",
            "",
        ]);

        ProgressBar.create();
        ProgressBar.loading();
        UpdateHandler.checkVersion(EnhancedSteam.clearCache);
        if (User.isSignedIn) {
            ITAD.create();
        }
        EnhancedSteam.addBackToTop();
        EnhancedSteam.addMenu();
        EnhancedSteam.addLanguageWarning();
        EnhancedSteam.handleInstallSteamButton();
        EnhancedSteam.removeAboutLinks();
        EnhancedSteam.addHeaderLinks();
        EarlyAccess.showEarlyAccess();
        EnhancedSteam.disableLinkFilter();
        EnhancedSteam.skipGotSteam();
        EnhancedSteam.keepSteamSubscriberAgreementState();
        EnhancedSteam.defaultCommunityTab();

        if (User.isSignedIn) {
            EnhancedSteam.addRedeemLink();
            EnhancedSteam.replaceAccountName();
            EnhancedSteam.launchRandomButton();
            // TODO add itad sync
            EnhancedSteam.bindLogout();
        }
    };

    return self;
})();

class Downloader {

    static download(content, filename) {
        let a = document.createElement("a");
        a.href = typeof content === "string" ? content : URL.createObjectURL(content);
        a.download = filename;

        // Explicitly dispatching the click event (instead of just a.click()) will make it work in FF
        a.dispatchEvent(new MouseEvent("click"));
    }
}

let Clipboard = (function(){

    let self = {};

    self.set = function(content) {
        // Based on https://stackoverflow.com/a/12693636
        document.oncopy = function(event) {
            event.clipboardData.setData("Text", content);
            event.preventDefault();
        };
        document.execCommand("Copy");
        document.oncopy = undefined;
    };

    return self;
})();

class MediaPage {

    appPage() {
        if (SyncedStorage.get("showyoutubegameplay")) {
            this._mediaSliderExpander(HTML.beforeEnd, ".home_tabs_row");
        } else {
            this._mediaSliderExpander(HTML.beforeEnd, "#highlight_player_area");
        }
    }

    workshopPage() {
        this._mediaSliderExpander(HTML.beforeEnd, "#highlight_player_area");
    }

    _mediaSliderExpander(insertFunction, selector) {

        let detailsBuilt = false;
        let details  = document.querySelector("#game_highlights .rightcol, .workshop_item_header .col_right");

        if (!details) { return; }
        // If we can't identify a details block to move out of the way, not much point to the rest of this function.

        insertFunction(selector,
            `<div class="es_slider_toggle btnv6_blue_hoverfade btn_medium">
                <div data-slider-tooltip="` + Localization.str.expand_slider + `" class="es_slider_expand"><i class="es_slider_toggle_icon"></i></div>
                <div data-slider-tooltip="` + Localization.str.contract_slider + `" class="es_slider_contract"><i class="es_slider_toggle_icon"></i></div>
            </div>`);

        // Initiate tooltip
        ExtensionLayer.runInPageContext(function() { $J('[data-slider-tooltip]').v_tooltip({'tooltipClass': 'store_tooltip community_tooltip', 'dataName': 'sliderTooltip' }); });

        function buildSideDetails() {
            if (detailsBuilt) { return; }
            detailsBuilt = true;

            if (!details) { return; }

            if (details.matches(".rightcol")) {
                // Clone details on a store page
                let detailsClone = details.querySelector(".glance_ctn");
                if (!detailsClone) return;
                detailsClone = detailsClone.cloneNode(true);
                detailsClone.classList.add("es_side_details", "block", "responsive_apppage_details_left");

                for (let node of detailsClone.querySelectorAll(".app_tag.add_button, .glance_tags_ctn.your_tags_ctn")) {
                    // There are some issues with having duplicates of these on page when trying to add tags
                    node.remove();
                }

                let detailsWrap = HTML.wrap(detailsClone, `<div class='es_side_details_wrap'></div>`);
                detailsWrap.style.display = 'none';
                let target = document.querySelector("div.rightcol.game_meta_data");
                if (target) {
                    target.insertAdjacentElement('afterbegin', detailsWrap);
                }
            } else {
                // Clone details in the workshop
                let detailsClone = details.cloneNode(true);
                detailsClone.style.display = 'none';
                detailsClone.setAttribute("class", "panel es_side_details");
                HTML.adjacent(detailsClone, "afterbegin", `<div class="title">${Localization.str.details}</div><div class="hr padded"></div>`);
                let target = document.querySelector('.sidebar');
                if (target) {
                    target.insertAdjacentElement('afterbegin', detailsClone);
                }

                target = document.querySelector('.highlight_ctn');
                if (target) {
                    HTML.wrap(target, `<div class="leftcol" style="width: 638px; float: left; position: relative; z-index: 1;" />`);
                }

                // Don't overlap Sketchfab's "X"
                // Example: https://steamcommunity.com/sharedfiles/filedetails/?id=606009216
                target = document.querySelector('.highlight_sketchfab_model');
                if (target) {
                    target = document.getElementById('highlight_player_area');
                    target.addEventListener('mouseenter', function() {
                        let el = this.querySelector('.highlight_sketchfab_model');
                        if (!el) { return; }
                        if (el.style.display == 'none') { return; }
                        el = document.querySelector('.es_slider_toggle');
                        if (!el) { return; }
                        el.style.top = '32px';
                    }, false);
                    target.addEventListener('mouseleave', function() {
                        let el = document.querySelector('.es_slider_toggle');
                        if (!el) { return; }
                        el.style.top = null;
                    }, false);
                }
            }
        }

        var expandSlider = LocalStorage.get("expand_slider", false);
        if (expandSlider === true) {
            buildSideDetails();

            for (let node of document.querySelectorAll(".es_slider_toggle, #game_highlights, .workshop_item_header, .es_side_details, .es_side_details_wrap")) {
                node.classList.add("es_expanded");
            }
            for (let node of document.querySelectorAll(".es_side_details_wrap, .es_side_details")) {
                // shrunk => expanded
                node.style.display = null;
                node.style.opacity = 1;
            }

            // Triggers the adjustment of the slider scroll bar
            setTimeout(function(){
                window.dispatchEvent(new Event("resize"));
            }, 250);
        }

        document.querySelector(".es_slider_toggle").addEventListener("click", clickSliderToggle, false);
        function clickSliderToggle(ev) {
            ev.preventDefault();
            ev.stopPropagation();

            let el = ev.target.closest('.es_slider_toggle');
            details.style.display = 'none';
            buildSideDetails();

            // Fade In/Out sideDetails
            let sideDetails = document.querySelector(".es_side_details_wrap, .es_side_details");
            if (sideDetails) {
                if (!el.classList.contains("es_expanded")) {
                    // shrunk => expanded
                    sideDetails.style.display = null;
                    sideDetails.style.opacity = 1;
                } else {
                    // expanded => shrunk
                    sideDetails.style.opacity = 0;
                    setTimeout(function(){
                        // Hide after transition completes
                        if (!el.classList.contains("es_expanded"))
                            sideDetails.style.display = 'none';
                        }, 250);
                }
            }

            // On every animation/transition end check the slider state
            let container = document.querySelector('.highlight_ctn');
            container.addEventListener('transitionend', saveSlider, { 'capture': false, 'once': false, });
            function saveSlider(ev) {
                // Save slider state
                LocalStorage.set('expand_slider', el.classList.contains('es_expanded'));

                // If slider was contracted show the extended details
                if (!el.classList.contains('es_expanded')) {
                    details.style.transition = "";
                    details.style.opacity = "0";
                    details.style.transition = "opacity 250ms";
                    details.style.display = null;
                    details.style.opacity = "1";
                }

                // Triggers the adjustment of the slider scroll bar
                setTimeout(function(){
                    window.dispatchEvent(new Event("resize"));
                }, 250);
            }

            for (let node of document.querySelectorAll(".es_slider_toggle, #game_highlights, .workshop_item_header, .es_side_details, .es_side_details_wrap")) {
                node.classList.toggle("es_expanded");
            }
        }

        this._horizontalScrolling();
    }

    _horizontalScrolling() {
        if (!SyncedStorage.get("horizontalscrolling")) { return; }

        let strip = document.querySelector("#highlight_strip");
        if (strip) {
            new HorizontalScroller(
                strip,
                document.querySelector("#highlight_slider_left"),
                document.querySelector("#highlight_slider_right")
            );
        }

        let nodes = document.querySelectorAll(".store_horizontal_autoslider_ctn");
        for (let node of nodes) {
            new HorizontalScroller(
                node,
                node.parentNode.querySelector(".slider_left"),
                node.parentNode.querySelector(".slider_right")
            )
        }
    }
}


class HorizontalScroller {

    constructor(parentNode, controlLeftNode, controlRightNode) {
        this._controlLeft = controlLeftNode;
        this._controlRight = controlRightNode;

        this._lastScroll = 0;
        parentNode.addEventListener("wheel", (e) => { this._scrollHandler(e); });
    }

    _scrollHandler(e) {
        e.preventDefault();
        e.stopPropagation();

        if (Date.now() - this._lastScroll < 200) { return; }
        this._lastScroll = Date.now();

        let isScrollDown = e.deltaY > 0;
        if (isScrollDown) {
            this._controlRight.click();
        } else {
            this._controlLeft.click();
        }
    }
}

// Most of the code here comes from dselect.js
class Sortbox {

    static init() {
        this._activeDropLists = {};
        this._lastSelectHideTime = 0;

        document.addEventListener("mousedown", e => this._handleMouseClick(e));
    }

    static _handleMouseClick(e) {
        for (let key of Object.keys(this._activeDropLists)) {
			if (!this._activeDropLists[key]) continue;
			
		    let ulAboveEvent = e.target.closest("ul");
		
            if (ulAboveEvent && ulAboveEvent.id === `${key}_droplist`) continue;
		
            this._hide(key);
	    }
    }

    static _highlightItem(id, index, bSetSelected) {
        let droplist = document.querySelector(`#${id}_droplist`);
        let trigger = document.querySelector(`#${id}_trigger`);
        let rgItems = droplist.getElementsByTagName("a");

        if (index >= 0 && index < rgItems.length ) {
            let item = rgItems[index];
            
            if (typeof trigger.highlightedItem !== "undefined" && trigger.highlightedItem !== index)
                rgItems[trigger.highlightedItem].className = "inactive_selection";
                
            trigger.highlightedItem = index;
            rgItems[index].className = "highlighted_selection";
            
            let yOffset = rgItems[index].offsetTop + rgItems[index].clientHeight;
            let curVisibleOffset = droplist.scrollTop + droplist.clientHeight;
            let bScrolledDown = false;
            let nMaxLoopIterations = rgItems.length;
            let nLoopCounter = 0;

            while (curVisibleOffset < yOffset && nLoopCounter++ < nMaxLoopIterations) {
                droplist.scrollTop += rgItems[index].clientHeight;
                curVisibleOffset = droplist.scrollTop+droplist.clientHeight;
                bScrolledDown = true;
            }
            
            if ( !bScrolledDown ) {
                nLoopCounter = 0;
                yOffset = rgItems[index].offsetTop;
                curVisibleOffset = droplist.scrollTop;
                while(curVisibleOffset > yOffset && nLoopCounter++ < nMaxLoopIterations) {
                    droplist.scrollTop -= rgItems[index].clientHeight;
                    curVisibleOffset = droplist.scrollTop;
                }
            }
            
            if (bSetSelected) {
                HTML.inner(trigger, item.innerHTML);
                let input = document.querySelector(`#${id}`);
                input.value = item.id;
                input.dispatchEvent(new Event("change"));
                
                this._hide(id);
            }
        }
    }

    static _onFocus(id) {
        this._activeDropLists[id] = true;
    }

    static _onBlur(id) {
		if (!this._classCheck(document.querySelector(`#${id}_trigger`), "activetrigger"))
	        this._activeDropLists[id] = false;
    }

    static _hide(id) {
        let droplist = document.querySelector(`#${id}_droplist`);
        let trigger = document.querySelector(`#${id}_trigger`);
	
		let d = new Date();
	    this._lastSelectHideTime = d.valueOf();
	
        trigger.className = "trigger";
        droplist.className = "dropdownhidden";
        this._activeDropLists[id] = false;
        trigger.focus();
    }

    static _show(id) {
		let d = new Date();
	    if (d - this._lastSelectHideTime < 50) return;
		
        let droplist = document.querySelector(`#${id}_droplist`);
        let trigger = document.querySelector(`#${id}_trigger`);
        
        trigger.className = "activetrigger";
        droplist.className = "dropdownvisible";
        this._activeDropLists[id] = true;
        trigger.focus();
    }

    static _onTriggerClick(id) {
        if (!this._classCheck(document.querySelector(`#${id}_trigger`), "activetrigger")) {
            this._show(id);
        }
    }

    static _classCheck(element, className) {
        return new RegExp(`\\b${className}\\b`).test(element.className);
    }

    // FOR REVIEWER: Elements returned by this function are already sanitized (calls to HTML class),
    // so they can be safely inserted without being sanitized again.
    // If we would sanitize it again, all event listeners would be lost due to DOMPurify only returning
    // HTML strings.
    static get(name, options, initialOption, changeFn, storageOption) {

        let id = `sort_by_${name}`;
        let reversed = initialOption.endsWith("_DESC");

        let arrowDown = '↓';
        let arrowUp = '↑';
        
        let box = HTML.element(
        `<div class="es-sortbox">
            <div class="es-sortbox__label">${Localization.str.sort_by}</div>
            <div class="es-sortbox__container">
                <input id="${id}" type="hidden" name="${name}" value="${initialOption}">
                <a class="trigger" id="${id}_trigger"></a>
                <div class="es-dropdown">
                    <ul id="${id}_droplist" class="es-dropdown__list dropdownhidden"></ul>
                </div>
            </div>
            <span class="es-sortbox__reverse">${arrowDown}</span>
        </div>`);

        let input = box.querySelector(`#${id}`);
        input.addEventListener("change", function() { onChange(this.value, reversed); });

        // Trigger changeFn for initial option
        if (initialOption !== "default_ASC") {
            input.dispatchEvent(new Event("change"));
        }

        let reverseEl = box.querySelector(".es-sortbox__reverse");
        reverseEl.addEventListener("click", () => {
            reversed = !reversed;
            reverseEl.textContent = reversed ? arrowUp : arrowDown;
            onChange(input.value, reversed);
        });
        if (reversed) reverseEl.textContent = arrowUp;

        let trigger = box.querySelector(`#${id}_trigger`);
        trigger.addEventListener("focus", () => this._onFocus(id));
        trigger.addEventListener("blur", () => this._onBlur(id));
        trigger.addEventListener("click", () => this._onTriggerClick(id));

        let ul = box.querySelector("ul");
        let trimmedOption = getTrimmedValue(initialOption);
        for (let i = 0; i < options.length; ++i) {
            let [key, text] = options[i];

            let toggle = "inactive";
            if (key === trimmedOption) {
                box.querySelector(`#${id}`).value = key;
                box.querySelector(".trigger").textContent = text;
                toggle = "highlighted";
            }

            HTML.beforeEnd(ul,
                `<li>
                    <a class="${toggle}_selection" tabindex="99999" id="${key}">${text}</a>
                </li>`);

            let a = ul.querySelector("li:last-child > a");
            //a.href = "javascript:DSelectNoop()";
            a.addEventListener("mouseover", () => this._highlightItem(id, i, false));
            a.addEventListener("click",     () => this._highlightItem(id, i, true));
        }

        function getTrimmedValue(val) { return val.replace(/(_ASC|_DESC)$/, ''); }

        function onChange(val, reversed) {
            val = getTrimmedValue(val);
            changeFn(val, reversed);
            if (storageOption) { SyncedStorage.set(storageOption, `${val}_${reversed ? "DESC" : "ASC"}`); }
        }

        return box;
    }
}

Sortbox.init();
