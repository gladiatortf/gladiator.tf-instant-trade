// ==UserScript==
// @name            Gladiator.tf Instant Trade
// @namespace       https://gladiator.tf/
// @version         1.0
// @author          Gladiator.TF Team &  manic
// @description     Start a trade with a Gladiator.tf bot in a single click
// @grant           GM_xmlhttpRequest
// @grant           GM_addStyle
// @connect         gladiator.tf
// @license         MIT

// @homepageURL     https://github.com/gladiatortf/gladiator.tf-instant-trade
// @supportURL      https://github.com/gladiatortf/gladiator.tf-instant-trade/issues
// @downloadURL     https://github.com/gladiatortf/gladiator.tf-instant-trade/raw/master/gladiator-instant-trade.user.js
// @updateURL       https://github.com/gladiatortf/gladiator.tf-instant-trade/raw/master/gladiator-instant-trade.user.js

// @run-at          document-end
// @match           https://backpack.tf/*
// @match           https://*.backpack.tf/*

// @require         https://unpkg.com/popper.js@1
// @require         https://unpkg.com/tippy.js@4
// ==/UserScript==

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const URL = "https://gladiator.tf";

let activelyTrading = false;

(async function () {
    'use strict';

    const bots = await getBots();
    if (document.location.hostname === "next.backpack.tf") {
        console.log("Next");
        addLinksNext(bots);
        return;
    }

    console.log("Classic");
    addLinksClassic(bots);
})();

function fetchBots() {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: `${URL}/api/bots`,
            onload: function (data) {
                const response = JSON.parse(data.responseText);
                if (!response.success) {
                    reject(new Error(response.message));
                    return;
                }

                resolve(response.bots);
            },
            onerror: function (err) {
                reject(err);
            },
        });
    })
}

async function getBots() {
    const rawData = localStorage.getItem("gladiator.tf bots");
    if (rawData) {
        const data = JSON.parse(rawData);
        if (Date.now() - data.at < DAY && data.url === URL) {
            return data.bots;
        }
    }

    const bots = await fetchBots().catch((err) => {
        if (rawData) {
            return JSON.parse(rawData).bots;
        }

        throw err;
    });

    localStorage.setItem("gladiator.tf bots", JSON.stringify({ at: new Date(), bots, url: URL }));
    return bots;
}

function startTrade(bot, cart) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: `${URL}/api/start_trade`,
            data: JSON.stringify({ bot, cart }),
            headers: {
                "Content-Type": "application/json"
            },
            onload: function (data) {
                const response = JSON.parse(data.responseText);
                if (!response.success) {
                    reject(new Error(response.message));
                    return;
                }

                resolve(response.tradeOfferURL);
            },
            onerror: function (err) {
                reject(err);
            },
        })
    });
}

function addLinksNext(bots) {
    /* global tippy */
    /* global __NUXT__ */

    GM_addStyle(`
        .glad-icon {
            cursor: pointer;
            height: 22px;
            width: 23px;
            margin-left: 0.5em;
        }

        .glad-icon.glad-static {
            background-image: url(https://gladiator.tf/img/logo.svg);
            background-repeat: no-repeat;
            background-position: center center;
            background-size: 70%;
        }

        .glad-icon.glad-loading {
            display: inline-block;
            width: 22px;
            height: 22px;
        }

        .glad-icon.glad-loading:after {
            content: " ";
            display: block;
            width: 10px;
            height: 10px;
            margin: 2px;
            border-radius: 50%;
            border: 4px solid #fff;
            border-color: #fff transparent #fff transparent;
            animation: lds-dual-ring 1.2s linear infinite;
            }
            @keyframes lds-dual-ring {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }
    `);

    const Modal = function (title, ...content) {
        __NUXT__.state.modal = { title: title, modalBundle: null, modalContext: "gladiator" };

        // wait for modal to be created :)
        setTimeout(() => {
            const dialog = document.getElementsByClassName("page-dialog")[0];
            if (!dialog) {
                return;
            }

            for (const child of content) {
                const p = document.createElement("p");
                p.innerText = child;
                dialog.append(p);
            }
        }, 100);
    }

    const callback = function (mutationsList) {
        for (const mutation of mutationsList) {
            if (mutation.type !== "childList") continue;

            for (const node of mutation.addedNodes) {
                let child = node.children && node.children[0];
                if (!child) continue;
                child = child.children[0];
                if (!child) continue;
                if (child.innerText !== "BOT") continue;
                let listing = node.parentNode.parentNode.parentNode.parentNode;
                let links = listing.getElementsByTagName("a");
                let bot;
                for (const link of links) {
                    let href = link.getAttribute("href");
                    if (href.startsWith("/profiles/")) bot = href.split("/")[2];
                }
                if (!bots.includes(bot)) continue;

                const intent = listing.getElementsByClassName("text-sell").length ? "sell" : "buy";
                const cart = { buy: [], sell: [] };
                if (intent === "sell") {
                    let assetid;
                    for (const link of links) {
                        let href = link.getAttribute("href");
                        if (href.startsWith("/classifieds/")) assetid = href.split("440_")[1];
                    }
                    cart.buy.push({
                        assetid
                    });
                } else {
                    let listingID;
                    for (const link of links) {
                        let href = link.getAttribute("href");
                        if (href.startsWith("/classifieds/")) listingID = href.split("/")[2];
                    }
                    cart.sell.push({
                        listingID
                    });
                }

                const buttons = listing.getElementsByClassName("listing__details__actions")[0];
                const button = document.createElement("a");
                button.setAttribute("data-tippy-content", "Gladiator.tf Instant Trade");
                button.setAttribute("href", `steam://friends/add/${bot}`);
                button.classList.add("glad-icon");
                button.classList.add("glad-static");
                buttons.append(button);
                tippy(button);

                button.addEventListener("click", function () {
                    if (activelyTrading) {
                        return Modal("Error creating trade", "You already have a trade processing! Wait for it to finish before starting another.")
                    }

                    activelyTrading = true;
                    button.classList.remove("glad-static")
                    button.classList.add("glad-loading");

                    startTrade(bot, cart).then((tradeOfferUrl) => window.open(tradeOfferUrl)).catch((err) => {
                        if (err.message === "Not signed in") {
                            window.open(`${URL}/auth/steam`);
                            return;
                        }

                        Modal("Error creating trade", err.message)
                    }).finally(() => {
                        activelyTrading = false;
                        button.classList.add("glad-static")
                        button.classList.remove("glad-loading");
                    })
                }, false);
            }
        }
    };

    new MutationObserver(callback)
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true });
}

function addLinksClassic(bots) {
    /* global Modal */
    /* global $ */

    const spinner = `<i class="fa fa-spin fa-spinner"></i>`;

    $('.listing').each(function () {
        let listing = $(this);
        let bot = listing.find('.user-link').attr("data-id");
        if (!bots.includes(bot)) return;
        let item = listing.find('.listing-item .item');
        let buttons = listing.find('.listing-buttons');
        let instantTrade = $(`<a href='steam://friends/add/${bot}' title='Gladiator.tf Instant Trade' class='btn btn-success btn-bottom btn-xs' data-tip=top style=""></a>`);
        instantTrade.css("height", "22px");
        instantTrade.css("width", "23px");
        instantTrade.css("background-image", "url(https://gladiator.tf/img/logo.svg)");
        instantTrade.css("background-size", "50%");
        instantTrade.css("background-repeat", "no-repeat");
        instantTrade.css("background-position", "center");
        buttons.append(instantTrade);

        instantTrade.click(() => {
            if (activelyTrading) {
                return Modal.render("Error creating trade", "You already have a trade processing! Wait for it to finish before starting another.");
            }

            console.log("requesting");
            activelyTrading = true;
            let cart = {buy: [], sell: []};
            if (item.data("listing_intent") === "buy") cart.sell.push(item.attr("title"));
            else cart.buy.push(item.attr("title"));

            instantTrade.html(spinner);
            instantTrade.css("background-image", "none");

            startTrade(bot, cart).then((tradeOfferUrl) => window.open(tradeOfferUrl)).catch((err) => {
                if (err.message === "Not signed in") {
                    window.open(`${URL}/auth/steam`);
                    return;
                }

                Modal.render("Error creating trade", err.message)
            }).finally(() => {
                activelyTrading = false;

                instantTrade.empty();
                instantTrade.css("background-image", "url(https://gladiator.tf/img/logo.svg)");
            })
        })
    })
}
