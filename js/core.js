const Info = {
    'version': "1.3.1",
    'db_version': 1,
};

/**
 * Shim for Promise.finally() for browsers (Waterfox/FF 56) that don't have it
 * https://github.com/domenic/promises-unwrapping/issues/18#issuecomment-57801572
 */
if (typeof Promise.prototype.finally === 'undefined') {
    Object.defineProperty(Promise.prototype, 'finally', {
        'value': function(callback) {
            var constructor = this.constructor;
            return this.then(function(value) {
                return constructor.resolve(callback()).then(function(){
                    return value;
                });
            }, function(reason) {
                return constructor.resolve(callback()).then(function(){
                    console.error(reason);
                    throw reason;
                });
            });
        },
    });
}

class Version {
    constructor(major, minor=0, patch=0) {
        console.assert([major, minor, patch].filter(Number.isInteger).length === 3, `${major}.${minor}.${patch} must be integers`);
        this.major = major;
        this.minor = minor;
        this.patch = patch;
    }

    static from(version) {
        if (version instanceof Version) {
            return new Version(version.major, version.minor, version.patch);
        }
        if (typeof version == 'string') {
            return Version.fromString(version);
        }
        if (Array.isArray(version)) {
            return Version.fromArray(version);
        }
        throw `Could not construct a Version from ${version}`;
    }
    static fromArray(version) {
        return new Version(...version.map(v => parseInt(v, 10)));
    }
    static fromString(version) {
        return Version.fromArray(version.split('.'));
    }
    static coerce(version) {
        if (version instanceof Version) {
            return version;
        }
        return Version.from(version);
    }

    toString() {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
    toArray() {
        return [this.major, this.minor, this.patch];
    }
    toJSON() {
        return this.toString();
    }

    isCurrent() {
        return this.isSameOrAfter(Info.version);
    }
    isSame(version) {
        version = Version.coerce(version);
        return this.major === version.major
            && this.minor === version.minor
            && this.patch === version.patch;
    }
    isBefore(version) {
        version = Version.coerce(version);
        if (this.major < version.major) { return true; }
        if (this.major > version.major) { return false; }
        // this.major == version.major
        if (this.minor < version.minor) { return true; }
        if (this.minor > version.minor) { return false; }
        // this.minor == version.minor
        if (this.patch < version.patch) { return true; }
        return false;
    }
    isSameOrBefore(version) {
        version = Version.coerce(version);
        if (this.major < version.major) { return true; }
        if (this.major > version.major) { return false; }
        // this.major == version.major
        if (this.minor < version.minor) { return true; }
        if (this.minor > version.minor) { return false; }
        // this.minor == version.minor
        if (this.patch > version.patch) { return false; }
        return true;
    }
    isAfter(version) {
        version = Version.coerce(version);
        return version.isBefore(this);
    }
    isSameOrAfter(version) {
        version = Version.coerce(version);
        return version.isSameOrBefore(this);
    }
}


class UpdateHandler {

    static checkVersion(onUpdate) {
        let lastVersion = Version.fromString(SyncedStorage.get("version"));
        let currentVersion = Version.fromString(Info.version);

        if (currentVersion.isAfter(lastVersion)) {
            if (SyncedStorage.get("version_show")) {
                this._showChangelog();
            }
            onUpdate();
            this._migrateSettings(lastVersion);
        }

        SyncedStorage.set("version", Info.version);
    };

    static _showChangelog() {
        RequestData.getHttp(ExtensionResources.getURL("changelog_new.html")).then(
            changelog => {
                changelog = changelog.replace(/\r|\n/g, "").replace(/'/g, "\\'");
                let logo = ExtensionResources.getURL("img/es_128.png");
                let dialog = `<div class="es_changelog"><img src="${logo}"><div>${changelog}</div></div>`;
                ExtensionLayer.runInPageContext(
                    `function() {
                        ShowAlertDialog("${Localization.str.update.updated.replace("__version__", Info.version)}", '${dialog}');
					}`
                );
            }
        );
    }

    static _migrateSettings(oldVersion) {

        if (oldVersion.isSameOrBefore("0.9.4")) {

            // Remove eu1 region
            let priceRegions = SyncedStorage.get('regional_countries');
            let i = priceRegions.includes('eu1');
            if (i !== -1) {
                priceRegions.splice(i, 1);
                SyncedStorage.set('regional_countries', priceRegions);
            }

            // Populate customize_frontpage
            let mapping = {
                'show_featuredrecommended': 'featuredrecommended',
                'show_specialoffers': 'specialoffers',
                'show_trendingamongfriends': 'trendingamongfriends',
                'show_es_discoveryqueue': 'discoveryqueue',
                'show_browsesteam': 'browsesteam',
                'show_curators': 'curators',
                'show_morecuratorrecommendations': 'morecuratorrecommendations',
                'show_recentlyupdated': 'recentlyupdated',
                'show_fromdevelopersandpublishersthatyouknow': 'fromdevelopersandpublishersthatyouknow',
                'show_popularvrgames': 'popularvrgames',
                'show_es_homepagetab': 'homepagetab',
                'show_gamesstreamingnow': 'gamesstreamingnow',
                'show_under': 'under',
                'show_updatesandoffers': 'updatesandoffers',
                'show_es_homepagesidebar': 'homepagesidebar',
            };
            let settings = SyncedStorage.get('customize_frontpage');
            for (let [oldkey, newkey] of Object.entries(mapping)) {
                if (!SyncedStorage.has(oldkey)) { continue; }
                settings[newkey] = SyncedStorage.get(oldkey);
                SyncedStorage.remove(oldkey);
            }
            SyncedStorage.set('customize_frontpage', settings);
            
            // Populate customize_apppage
            mapping = {
                'show_apppage_reviews': 'reviews',
                'show_apppage_about': 'about',
                'show_apppage_surveys': 'surveys',
                'show_apppage_sysreq': 'sysreq',
                'show_apppage_legal': 'legal',
                'show_apppage_morelikethis': 'morelikethis',
                'show_apppage_recommendedbycurators': 'recommendedbycurators',
                'show_apppage_customerreviews': 'customerreviews',
            };
            settings = SyncedStorage.get('customize_apppage');
            for (let [oldkey, newkey] of Object.entries(mapping)) {
                if (!SyncedStorage.has(oldkey)) { continue; }
                settings[newkey] = SyncedStorage.get(oldkey);
                SyncedStorage.remove(oldkey);
            }
            SyncedStorage.set('customize_apppage', settings);
        }
        
        if (oldVersion.isSameOrBefore("0.9.5")) {
            SyncedStorage.remove("version");
            SyncedStorage.remove("showesbg");
            SyncedStorage.set("hideaboutlinks", SyncedStorage.get("hideinstallsteambutton") && SyncedStorage.get("hideaboutmenu"));
            SyncedStorage.remove("hideinstallsteambutton");
            SyncedStorage.remove("hideaboutmenu");
            // Update structure for custom profile links to allow multiple
            if (SyncedStorage.get('profile_custom_name')) {
                let custom_link = {
                    'enabled': SyncedStorage.get('profile_custom'),
                    'name': SyncedStorage.get('profile_custom_name'),
                    'url': SyncedStorage.get('profile_custom_url'),
                    'icon':  SyncedStorage.get('profile_custom_icon'),
                };
                SyncedStorage.set('profile_custom_link', [custom_link,]);
                SyncedStorage.remove('profile_custom');
                SyncedStorage.remove('profile_custom_name');
                SyncedStorage.remove('profile_custom_url');
                SyncedStorage.remove('profile_custom_icon');
            }
            SyncedStorage.set("user_notes", SyncedStorage.get("wishlist_notes"));
            SyncedStorage.remove("wishlist_notes");
        }
        
        if (oldVersion.isSameOrBefore("0.9.7")) {
            SyncedStorage.remove("hide_wishlist");
            SyncedStorage.remove("hide_cart");
            SyncedStorage.remove("hide_notdiscounted");
            SyncedStorage.remove("hide_mixed");
            SyncedStorage.remove("hide_negative");
            SyncedStorage.remove("hide_priceabove");
            SyncedStorage.remove("priceabove_value");
        }
        
        if (oldVersion.isSameOrBefore("1.2.1")) {
            if (!SyncedStorage.get("show_profile_link_images")) {
                SyncedStorage.set("show_profile_link_images", "none");
            }

            if (SyncedStorage.get("showclient")) {
                SyncedStorage.set("showviewinlibrary", true);
                SyncedStorage.set("installsteam", "replace");
            }

            if (SyncedStorage.has("showlanguagewarninglanguage")) {
                SyncedStorage.set("showlanguagewarninglanguage", SyncedStorage.get("showlanguagewarninglanguage").toLowerCase());
            }

            SyncedStorage.remove("html5video");
            SyncedStorage.remove("showclient");
        }

        if (oldVersion.isSameOrBefore("1.3.1")) {
            browser.runtime.sendMessage({ "action": "cache.clear" }) // todo Implement general background communication class

            SyncedStorage.set("horizontalscrolling", SyncedStorage.get("horizontalmediascrolling"));
            SyncedStorage.remove("horizontalmediascrolling");
        }
    }
}

class GameId {
    static parseId(id) {
        if (!id) { return null; }
        
        let intId = parseInt(id);
        if (!intId) { return null; }
        
        return intId;
    }
    
    static getAppid(text) {
        if (!text) { return null; }

        if (text instanceof HTMLElement) {
            let appid = text.dataset.dsAppid;
            if (appid) return GameId.parseId(appid);
            text = text.href;
            if (!text) return null;
        }

        // app, market/listing
        let m = text.match(/(?:store\.steampowered|steamcommunity)\.com\/(app|market\/listings)\/(\d+)\/?/);
        return m && GameId.parseId(m[2]);
    }
    
    static getSubid(text) {
        if (!text) { return null; }

        if (text instanceof HTMLElement) {
            let subid = text.dataset.dsPackageid;
            if (subid) return GameId.parseId(subid);
            text = text.href;
            if (!text) return null;
        }
        
        let m = text.match(/(?:store\.steampowered|steamcommunity)\.com\/sub\/(\d+)\/?/);
        return m && GameId.parseId(m[2]);
    }

    static getBundleid(text) {
        if (!text) { return null; }

        if (text instanceof HTMLElement) {
            let bundleid = text.dataset.dsBundleid;
            if (bundleid) return GameId.parseId(bundleid);
            text = text.href;
            if (!text) return null;
        }

        let m = text.match(/(?:store\.steampowered|steamcommunity)\.com\/bundle\/(\d+)\/?/);
        return m && GameId.parseId(m[2]);
    }

    static trimStoreId(storeId) {
        return Number(storeId.slice(storeId.indexOf('/') + 1));
    }
    
    static getAppidImgSrc(text) {
        if (!text) { return null; }
        let m = text.match(/(steamcdn-a\.akamaihd\.net\/steam|steamcommunity\/public\/images)\/apps\/(\d+)\//);
        return m && GameId.parseId(m[2]);
    }
    
    static getAppidUriQuery(text) {
        if (!text) { return null; }
        let m = text.match(/appid=(\d+)/);
        return m && GameId.parseId(m[1]);
    }
    
    static getAppids(text) {
        let regex = /(?:store\.steampowered|steamcommunity)\.com\/app\/(\d+)\/?/g;
        let res = [];
        let m;
        while ((m = regex.exec(text)) != null) {
            let id = GameId.parseId(m[1]);
            if (id) {
                res.push(id);
            }
        }
        return res;
    }
    
    static getAppidFromId(text) {
        if (!text) { return null; }
        let m = text.match(/game_(\d+)/);
        return m && GameId.parseId(m[1]);
    }
    
    static getAppidFromGameCard(text) {
        if (!text) { return null; }
        let m = text.match(/\/gamecards\/(\d+)/);
        return m && GameId.parseId(m[1]);
    }
}


class LocalStorage {
    static get(key, defaultValue) {
        let item = localStorage.getItem(key);
        if (!item) return defaultValue;
        try {
            return JSON.parse(item);
        } catch (err) {
            return defaultValue;
        }
    }
    
    static set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
    
    static remove(key) {
        localStorage.removeItem(key);
    }
    
    static keys() {
        let result = [];
        for (let i = localStorage.length - 1; i >= 0; --i) {
            result.push(localStorage.key(i));
        }
        return result;
    }
    
    static clear() {
        localStorage.clear();
    }
}


class SyncedStorage {
    /**
     * browser.storage.sync limits
     * QUOTA_BYTES = 102400 // 100KB
     * QUOTA_BYTES_PER_ITEM = 8192 // 8KB
     * MAX_ITEMS = 512
     * MAX_WRITE_OPERATIONS_PER_HOUR = 1800
     * MAX_WRITE_OPERATIONS_PER_MINUTE = 120
     */
    static has(key) {
        return Object.prototype.hasOwnProperty.call(this.cache, key);
    }
    static get(key) {
        if (typeof this.cache[key] == 'undefined') {
            if (typeof this.defaults[key] == 'undefined') {
                console.warn(`Unrecognized SyncedStorage key '${key}'`);
            }
            return this.defaults[key];
        }
        return this.cache[key];
    }

    static set(key, value) {
        this.cache[key] = value;
        return this.adapter.set({ [key]: value, });
        // this will throw if MAX_WRITE_*, MAX_ITEMS, QUOTA_BYTES* are exceeded
    }

    static remove(key) {
        if (typeof this.cache[key]) {
            delete this.cache[key];
        }
        return this.adapter.remove(key);
        // can throw if MAX_WRITE* is exceeded
    }

    static keys(prefix='') {
        return Object.keys(this.cache).filter(k => k.startsWith(prefix));
    }

    static clear() {
        this.cache = {};
        return this.adapter.clear();
        // can throw if MAX_WRITE* is exceeded
    }

    // load whole storage and make local copy
    static async init() {
        browser.storage.onChanged.addListener(changes => {
            for (let [key, { newValue: val, }] of Object.entries(changes)) {
                this.cache[key] = val;
            }
            if (typeof ContextMenu === "function" && Object.keys(changes).some(key => key.startsWith("context_"))) {
                ContextMenu.update();
            }
        });

        let storage = await this.adapter.get(null);
        Object.assign(this.cache, storage);

        return this.cache;
    }
    static then(onDone, onCatch) {
        return this.init().then(onDone, onCatch);
    }

    static async quota() {
        let maxBytes = this.adapter.QUOTA_BYTES;
        let bytes = await this.adapter.getBytesInUse();
        return bytes / maxBytes; // float 0.0 (0%) -> 1.0 (100%)
    }
}
SyncedStorage.adapter = browser.storage.sync || browser.storage.local;
SyncedStorage.cache = {};
SyncedStorage.defaults = {
    'language': "english",

    'version': Info.version,
    'version_show': true,

    'highlight_owned_color': "#00ce67",
    'highlight_wishlist_color': "#0491bf",
    'highlight_coupon_color': "#a26426",
    'highlight_inv_gift_color': "#800040",
    'highlight_inv_guestpass_color': "#513c73",
    'highlight_notinterested_color': "#4f4f4f",
    'highlight_collection_color': "#856d0e",
    'highlight_waitlist_color': "#4c7521",

    'tag_owned_color': "#00b75b",
    'tag_wishlist_color': "#0383b4",
    'tag_coupon_color': "#c27120",
    'tag_inv_gift_color': "#b10059",
    'tag_inv_guestpass_color': "#65449a",
    'tag_notinterested_color': "#4f4f4f",
    'tag_collection_color': "#856d0e",
    'tag_waitlist_color': "#4c7521",

    'highlight_owned': true,
    'highlight_wishlist': true,
    'highlight_coupon': false,
    'highlight_inv_gift': false,
    'highlight_inv_guestpass': false,
    'highlight_notinterested': false,
    'highlight_excludef2p': false,
    'highlight_notdiscounted': false,
    'highlight_collection': true,
    'highlight_waitlist': true,

    'tag_owned': false,
    'tag_wishlist': false,
    'tag_coupon': false,
    'tag_inv_gift': false,
    'tag_inv_guestpass': false,
    'tag_notinterested': true,
    'tag_collection': false,
    'tag_waitlist': false,
    'tag_short': false,

    'hide_owned': false,
    'hide_ignored': false,
    'hide_dlcunownedgames': false,
    'hide_wishlist': false,
    'hide_cart': false,
    'hide_notdiscounted': false,
    'hide_mixed': false,
    'hide_negative': false,
    'hide_priceabove': false,
    'priceabove_value': "",
    'hidetmsymbols': false,

    'showlowestprice': true,
    'showlowestprice_onwishlist': true,
    'showlowestpricecoupon': true,
    'showallstores': true,
    'stores': [],
    'override_price': "auto",
    'showregionalprice': "mouse",
    'regional_countries': ["us", "gb", "ru", "br", "au", "jp"],

    'show_es_homepagetabs': true,
    'showmarkettotal': false,
    'showsteamrepapi': true,
    'showmcus': true,
    'showoc': true,
    'showhltb': true,
    'showpcgw': true,
    'showcompletionistme': false,
    'showprotondb': false,
    'showviewinlibrary': false,
    'showsteamcardexchange': false,
    'showitadlinks': true,
    'showsteamdb': true,
    'showbartervg': false,
    'showastatslink': true,
    'showyoutubegameplay': true,
    'showyoutubereviews': true,
    'showwsgf': true,
    'exfgls': true,

    'customize_apppage': {
        "recentupdates": true,
        "reviews": true,
        "about": true,
        "contentwarning": true,
        "steamchart": true,
        "steamspy": true,
        "surveys": true,
        "sysreq": true,
        "legal": true,
        "morelikethis": true,
        "recommendedbycurators": true,
        "customerreviews": true
    },

    'customize_frontpage': {
        "featuredrecommended": true,
        "specialoffers": true,
        "trendingamongfriends": true,
        "discoveryqueue": true,
        "browsesteam": true,
        "curators": true,
        "morecuratorrecommendations": true,
        "recentlyupdated": true,
        "fromdevelopersandpublishersthatyouknow": true,
        "popularvrgames": true,
        "homepagetabs": true,
        "gamesstreamingnow": true,
        "under": true,
        "updatesandoffers": true,
        "homepagesidebar": true
    },

    //'show_keylol_links': false, // not in use, option is commented out
    'show_package_info': false,
    'show_sysreqcheck': false,
    'show_steamchart_info': true,
    'show_steamspy_info': true,
    'show_early_access': true,
    'show_alternative_linux_icon': false,
    'show_itad_button': false,
    'skip_got_steam': false,

    'hideaboutlinks': false,
    'installsteam': "show",
    'openinnewtab': false,
    'keepssachecked': false,
    'showemptywishlist': true,
    'showusernotes': true,
    'user_notes': {},
    'replaceaccountname': true,
    'showfakeccwarning': true,
    'showlanguagewarning': true,
    'showlanguagewarninglanguage': "english",
    'homepage_tab_selection': "remember",
    'homepage_tab_last': null,
    'send_age_info': true,
    'mp4video': false,
    'contscroll': true,
    'horizontalscrolling': true,
    'showsupportinfo': true,
    'showdrm': true,
    'regional_hideworld': false,
    'showinvnav': true,
    'quickinv': true,
    'quickinv_diff': -0.01,
    'community_default_tab': "",
    'showallachievements': false,
    'showachinstore': true,
    'showcomparelinks': false,
    'hideactivelistings': false,
    'showlowestmarketprice': true,
    'hidespamcomments': false,
    'spamcommentregex': "[\\u2500-\\u25FF]",
    'wlbuttoncommunityapp': true,
    'removeguideslanguagefilter': false,
    'disablelinkfilter': false,
    'showallfriendsthatown': false,
    'sortfriendsby': "default",
    'show1clickgoo': true,
    'show_profile_link_images': "gray",
    'profile_steamrepcn': true,
    'profile_steamgifts': true,
    'profile_steamtrades': true,
    'profile_bartervg': true,
    'profile_steamrep': true,
    'profile_steamdbcalc': true,
    'profile_astats': true,
    'profile_backpacktf': true,
    'profile_astatsnl': true,
    'profile_permalink': true,
    'profile_custom_link': [
        { 'enabled': true, 'name': "Google", 'url': "google.com/search?q=[ID]", 'icon': "www.google.com/images/branding/product/ico/googleg_lodp.ico", },
    ],
    'group_steamgifts': true,
    'steamcardexchange': true,
    'purchase_dates': true,
    'show_badge_progress': true,
    'show_coupon': true,
    'show_wishlist_link': true,
    'show_wishlist_count': true,
    'show_progressbar': true,
    'show_backtotop': false,

    'profile_showcase_twitch': true,
    'profile_showcase_own_twitch': false,
    'profile_showcase_twitch_profileonly': false,

    'itad_import_library': true,
    'itad_import_wishlist': false,
    'add_to_waitlist': false,

    'context_steam_store': false,
    'context_steam_market': false,
    'context_itad': false,
    'context_bartervg': false,
    'context_steamdb': false,
    'context_steamdb_instant': false,
    'context_steam_keys': false,
};


class ExtensionResources {
    static getURL(pathname) {
        return browser.runtime.getURL(pathname);
    }

    static get(pathname) {
        return fetch(ExtensionResources.getURL(pathname));
    }

    static getJSON(pathname) {
        return ExtensionResources.get(pathname).then(r => r.json());
    }
    static getText(pathname) {
        return ExtensionResources.get(pathname).then(r => r.text());
    }
}

/**
 * DOMPurify setup
 * @see https://github.com/cure53/DOMPurify
 */
(async function() {
    let allowOpenInNewTab = SyncedStorage.defaults.openinnewtab;
    try {
        await SyncedStorage;
        allowOpenInNewTab = SyncedStorage.get("openinnewtab");
    } catch(e) {
        console.error(e);
    }

    /**
     * NOTE FOR ADDON REVIEWER:
     * We are modifying default DOMPurify settings to allow other protocols in URLs
     * and to allow links to safely open in new tabs.
     *
     * We took the original Regex and aded chrome-extension://, moz-extension:// and steam://
     * First two are needed for linking local resources from extension,
     * steam:// protocol is used by Steam store to open their own client (e.g. when you want to launch a game).
     * 
     * The addition of the `target` attribute to the allowed attributes is done in order to be able to open links in a new tab.
     * We only allow target="_blank" while adding rel="noreferrer noopener" to prevent child window to access window.opener
     * as described in https://www.jitbit.com/alexblog/256-targetblank---the-most-underestimated-vulnerability-ever/
     */

    let purifyConfig = {
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|chrome-extension|moz-extension|steam):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    };

    if (allowOpenInNewTab) {
        purifyConfig.ADD_ATTR = ["target"];

        DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
            if (data.attrName === "target") {
                if (data.attrValue === "_blank") {
                    node.setAttribute("rel", "noreferrer noopener");
                } else {
                    data.keepAttr = false;
                }
            }
        });
    }

    DOMPurify.setConfig(purifyConfig);
})();

class HTML {

    static escape(str) {
        // @see https://stackoverflow.com/a/4835406
        let map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return str.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    static fragment(html) {
        let template = document.createElement('template');
        template.innerHTML = DOMPurify.sanitize(html);
        return template.content;
    }

    static element(html) {
        return HTML.fragment(html).firstElementChild;
    }

    static inner(node, html) {
        if (typeof node == 'undefined' || node === null) {
            console.warn(`${node} is not an Element.`);
            return null;
        }
        if (typeof node == "string") {
            node = document.querySelector(node);
        }
        if (!(node instanceof Element)) {
            console.warn(`${node} is not an Element.`);
            return null;
        }
        
        node.innerHTML = DOMPurify.sanitize(html);
        return node;
    }

    static wrap(node, html) {
        if (typeof node == 'undefined' || node === null) {
            console.warn(`${node} is not an Element.`);
            return null;
        }
        if (typeof node == "string") {
            node = document.querySelector(node);
        }
        if (!(node instanceof Element)) {
            console.warn(`${node} is not an Element.`);
            return null;
        }

        let wrapper = HTML.element(html);
        node.replaceWith(wrapper);
        wrapper.appendChild(node);
        return wrapper;
    }

    static adjacent(node, position, html) {
        if (typeof node == 'undefined' || node === null) {
            console.warn(`${node} is not an Element.`);
            return null;
        }
        if (typeof node == "string") {
            node = document.querySelector(node);
        }
        if (!(node instanceof Element)) {
            console.warn(`${node} is not an Element.`);
            return null;
        }
        
        node.insertAdjacentHTML(position, DOMPurify.sanitize(html));
        return node;
    }

    static beforeBegin(node, html) {
        HTML.adjacent(node, "beforebegin", html);
    }

    static afterBegin(node, html) {
        HTML.adjacent(node, "afterbegin", html);
    }

    static beforeEnd(node, html) {
        HTML.adjacent(node, "beforeend", html);
    }

    static afterEnd(node, html) {
        HTML.adjacent(node, "afterend", html);
    }
}

class HTMLParser {
    static clearSpecialSymbols(string) {
        return string.replace(/[\u00AE\u00A9\u2122]/g, "");
    }
    
    static htmlToDOM(html) {
        return HTML.fragment(html);
    }

    static htmlToElement(html) {
        return HTML.element(html);
    };

    static getVariableFromText(text, name, type) {
        let regex;
        if (type === "object") {
            regex = new RegExp(`${name}\\s*=\\s*(\\{.+?\\});`);
        } else if (type === "array") { // otherwise array
            regex = new RegExp(`${name}\\s*=\\s*(\\[.+?\\]);`);
        } else if (type === "int") {
            regex = new RegExp(`${name}\\s*=\\s*(.+?);`);
        } else if (type === "string") {
            regex = new RegExp(`${name}\\s*=\\s*(\\".+?\\");`);
        } else {
            return null;
        }
        
        let m = text.match(regex);
        if (m) {
            if (type === "int") {
                return parseInt(m[1]);
            }
            return JSON.parse(m[1]);
        }
        
        return null;
    }

    static getVariableFromDom(variableName, type, dom) {
        dom = dom || document;
        let nodes = dom.querySelectorAll("script");
        for (let node of nodes) {
            let m = HTMLParser.getVariableFromText(node.textContent, variableName, type)
            if (m) {
                return m;
            }
        }
    };
}

class StringUtils {

    // https://stackoverflow.com/a/6969486/7162651
    static escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    // https://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    static hashCode(string){
        let hash = 0;
        if (string.length === 0) {
            return hash;
        }

        for (let i = 0; i < string.length; i++) {
            let char = string.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // convert to 32bit integer
        }

        return hash;
    }
}

class CommunityLoginError extends Error {
    constructor(msg) {
        super(msg);
        this.name = "CommunityLoginError";
    }
}

class ServerOutageError extends Error {
    constructor(msg) {
        super(msg);
        this.name = "ServerOutageError";
    }
}

function sleep(duration) {
    return new Promise(function(resolve, reject) {
        setTimeout(function() { resolve(); }, duration);
    });
}

class Timestamp {

    static now() {
        return Math.trunc(Date.now() / 1000);
    }
}


class Debug {

    static async executionTime(fn, label) {
        let start = performance.now();
        await fn();
        let end = performance.now();
        console.debug("Took", end - start, "ms to execute", label);
    }
}


