// ==UserScript==
// @name         Gladiator.tf Instant Trade
// @namespace    https://steamcommunity.com/profiles/76561198320810968
// @version      0.1
// @author       manic
// @description  Start a trade with a Gladiator.tf bot in a single click
// @grant        GM_xmlhttpRequest
// @connect      gladiator.tf
// @license      MIT

// @homepageURL     https://github.com/mninc/gladiator.tf-instant-trade
// @supportURL      https://github.com/mninc/gladiator.tf-instant-trade/issues
// @downloadURL     https://github.com/mninc/gladiator.tf-instant-trade/raw/master/gladiator-instant-trade.user.js

// @run-at       document-end
// @include      /^https?:\/\/(.*\.)?backpack\.tf(:\d+)?\//
// ==/UserScript==


(function() {
    'use strict';

    const URL = "https://gladiator.tf";
    let data = localStorage.getItem("gladiator.tf bots");
    if (data) {
        data = JSON.parse(data);
        if (new Date() - new Date(data.at) < 1000 * 60 * 60 * 24 && data.url === URL) return addLinks(data.bots);
    }
    console.log("fetching bots");
    GM_xmlhttpRequest({
        method: "GET",
        url: `${URL}/api/bots`,
        onload: function (data) {
            data = JSON.parse(data.responseText);
            if (!data.success) return alert(data.message);

            let bots = data.bots;
            addLinks(bots);
            localStorage.setItem("gladiator.tf bots", JSON.stringify({at: new Date(), bots, url: URL}));
        }
    });

    function addLinks(bots) {
        const spinner = `<i class="fa fa-spin fa-spinner"></i>`;

        let currentlyTrading = false;
        $('.listing').each(function () {
            let listing = $(this);
            let bot = listing.find('.user-link').data("id");
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
                if (currentlyTrading) return Modal.render("Error creating trade", "You already have a trade processing! Wait for it to finish before starting another.");
                console.log("requesting");
                currentlyTrading = true;
                let cart = {buy: [], sell: []};
                if (item.data("listing_intent") === "buy") cart.sell.push(item.attr("title"));
                else cart.buy.push(item.attr("title"));
                instantTrade.html(spinner);
                instantTrade.css("background-image", "none");
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${URL}/api/start_trade`,
                    data: JSON.stringify({bot, cart}),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    onload: function (data) {
                        currentlyTrading = false;
                        data = JSON.parse(data.responseText);
                        console.log(data);
                        instantTrade.empty();
                        instantTrade.css("background-image", "url(https://gladiator.tf/img/logo.svg)");
                        if (data.success) window.open(data.tradeOfferURL);
                        else {
                            if (data.error === "Not signed in") window.open(`${URL}/auth/steam`);
                            else Modal.render("Error creating trade", data.message);
                        }
                    }
                })
            })
        })
    }
})();
