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

(async function () {
	"use strict";

	const SECOND = 1000;
	const MINUTE = 60 * SECOND;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	const URL = "https://gladiator.tf";

	let activelyTrading = false;
	let activeListingId = null;

	const isNext = document.location.hostname === "next.backpack.tf";

	const LOGGER = {
		info: msg => {
			console.log("[instant-trade]: " + msg);
		},
		error: err => {
			console.error(
				"[instant-trade]: " + err.stack || err.message || err
			);
		}
	};

	function startTransaction(listingId) {
		if (activelyTrading) {
			return false;
		}

		activelyTrading = true;
		activeListingId = listingId;

		return true;
	}

	function getActiveListingId() {
		return activeListingId;
	}

	function isTrading() {
		return activelyTrading;
	}

	function endTransaction() {
		activelyTrading = false;
		activeListingId = null;
	}

	async function execute() {
		const bots = await getBots();
		if (isNext) {
			LOGGER.info("On next site");
			addLinksNext(bots);
			return;
		}

		LOGGER.info("On classic site");
		addLinksClassic(bots);
		hookPopupsClassic(bots);
	}

	function getSteamIdClassic() {
		/* global Session */
		return Session && Session.steamid ? Session.steamid : null;
	}

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

					LOGGER.info("Fetched latest bot set.");
					resolve(response.bots);
				},
				onerror: function (err) {
					reject(err);
				}
			});
		});
	}

	async function getBots() {
		const rawData = localStorage.getItem("gladiator.tf bots");
		if (rawData) {
			const data = JSON.parse(rawData);
			if (Date.now() - data.at < DAY && data.url === URL) {
				return data.bots;
			}
		}

		const bots = await fetchBots().catch(err => {
			if (rawData) {
				return JSON.parse(rawData).bots;
			}

			throw err;
		});

		localStorage.setItem(
			"gladiator.tf bots",
			JSON.stringify({ at: new Date(), bots, url: URL })
		);
		return bots;
	}

	function startTrade(bot, cart, createTradeOfferUrl) {
		console.log("Start", bot, cart, createTradeOfferUrl);
		return Promise.reject(new Error(""));

		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "POST",
				url: `${URL}/api/start_trade`,
				data: JSON.stringify({ bot, cart, createTradeOfferUrl }),
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
				}
			});
		});
	}

	function checkout(bot, cart) {
		return fetchUserTradeLink()
			.then(tradeLink => {
				if (tradeLink === "") {
					if (isNext) {
						window.open("https://next.backpack.tf/account/trade-offers");
					} else {
						window.open("https://backpack.tf/settings##general");
					}

					throw new Error("No trade offer link set on backpack.tf");
				}

				return startTrade(bot, cart, tradeLink);
			})
			.then(tradeOfferUrl => window.open(tradeOfferUrl))
			.catch(err => {
				if (err.message === "Not signed in") {
					window.open(`${URL}/auth/steam`);
					return;
				}

				throw err;
			})
			.finally(() => endTransaction());
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

		const ICON = (width, height) =>
			`<image xlink:href="https://gladiator.tf/img/logo.svg" src="https://gladiator.tf/img/logo.svg" width="${width}" height="${height}"></image>`;

		function Modal(title, ...content) {
			__NUXT__.state.modal = {
				title: title,
				modalBundle: null,
				modalContext: "gladiator"
			};

			// wait for modal to be created :)
			setTimeout(() => {
				const dialog =
					document.getElementsByClassName("page-dialog")[0];
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

		function addLink(linkBox, referenceLinkBox, newLink) {
			if (linkBox.childElementCount >= 3) {
				let newLinkBox = referenceLinkBox.cloneNode();
				linkBox.parentNode.insertBefore(
					newLinkBox,
					linkBox.nextSibling
				);
				linkBox = newLinkBox;
			}
			linkBox.append(" ");
			linkBox.append(newLink);
			return linkBox;
		}

		function handlePopper(bots, node) {
			const contents = node.getElementsByClassName(
				"item-tooltip__content__section"
			);
			if (contents.length === 0) {
				return;
			}

			const headers = contents[0].getElementsByClassName(
				"item-tooltip__content__section__header"
			);
			if (
				headers.length === 0 ||
				headers[0].textContent.trim() !== "Classifieds Listing"
			) {
				return;
			}

			const titleElem = node.getElementsByClassName(
				"item-tooltip__header__title"
			)[0];
			if (
				!titleElem ||
				node.getElementsByClassName("btn-item-glad-trade").length
			) {
				return;
			}

			let itemName = titleElem.textContent.trim();
			let bot = null;
			for (const link of node.getElementsByTagName("a")) {
				if (!link.href) {
					continue;
				}

				if (
					link.href.startsWith(
						"https://next.backpack.tf/profiles/"
					) &&
					link.href.endsWith("/user")
				) {
					bot = link.href
						.replace("https://next.backpack.tf/profiles/", "")
						.replace("/user", "");
					continue;
				}

				if (
					link.href.startsWith("https://next.backpack.tf/classifieds")
				) {
					const query = new URLSearchParams(link.href.split("?")[1]);
					if (query.get("craftable") === "0") {
						itemName = `Non-Craftable ${itemName}`;
					}
					continue;
				}
			}

			if (!bot || !bots.includes(bot)) {
				return;
			}

			const classifiedsEl =
				document.getElementsByClassName("tippy-active");
			if (classifiedsEl.length === 0 || !classifiedsEl[0].href) {
				return;
			}

			const listingId = classifiedsEl[0].href.replace(
				"https://next.backpack.tf/classifieds/",
				""
			);
			const intent = listingId.split("_").length > 2 ? "buy" : "sell";

			const linkBoxes = node.getElementsByClassName(
				"item-tooltip__content__links"
			);
			const referenceLinkBox = linkBoxes[linkBoxes.length - 1];
			const referenceLink = linkBoxes[0].children[0].cloneNode(true);
			referenceLink.setAttribute("target", "_blank");

			const instantTradeLink = referenceLink.cloneNode(true);
			instantTradeLink.classList.add("btn-item-glad-trade");
			instantTradeLink.innerHTML = ICON(10, 10) + " Instant Trade";
			instantTradeLink.addEventListener("click", function () {
				if (!startTransaction(listingId)) {
					return Modal(
						"Error creating trade",
						"You already have a trade processing! Wait for it to finish before starting another."
					);
				}

				const cart = { buy: [], sell: [] };
				if (intent === "sell") {
					const assetid = listingId.split("_")[1];

					cart.buy.push({
						assetid
					});
				} else {
					const nameHash = listingId.split("_")[2];

					cart.sell.push({
						listingID: nameHash
					});
				}

				checkout(bot, cart).catch(err =>
					Modal("Error creating trade", err.message)
				);
			});

			addLink(referenceLinkBox, referenceLinkBox, instantTradeLink);
		}

		function handleListing(bots, node) {
			let listingNode = node.parentNode.parentNode.parentNode.parentNode;

			let bot = null;
			let listingId = null;
			for (const link of listingNode.getElementsByTagName("a")) {
				if (!link.href) {
					continue;
				}

				if (
					link.href.startsWith(
						"https://next.backpack.tf/profiles/"
					) &&
					link.href.endsWith("/user")
				) {
					bot = link.href
						.replace("https://next.backpack.tf/profiles/", "")
						.replace("/user", "");
					continue;
				}

				if (
					link.href.startsWith("https://next.backpack.tf/classifieds")
				) {
					listingId = link.href.replace(
						"https://next.backpack.tf/classifieds/",
						""
					);
				}
			}

			if (!bot || !listingId || !bots.includes(bot)) {
				return;
			}

			let titleElem = listingNode.getElementsByClassName(
				"listing__details__header"
			);

			if (titleElem.length === 0) {
				return;
			}

			let itemName = titleElem[0].textContent.trim();
			if (
				listingNode
					.querySelector("a")
					.classList.contains("item__uncraftable")
			) {
				itemName = `Non-Craftable ${itemName}`;
			}

			const intent = listingId.split("_").length > 2 ? "buy" : "sell";
			const cart = { buy: [], sell: [] };
			if (intent === "sell") {
				const assetid = listingId.split("_")[1];

				cart.buy.push({
					assetid
				});
			} else {
				const nameHash = listingId.split("_")[2];

				cart.sell.push({
					listingID: nameHash
				});
			}

			const buttons = listingNode.getElementsByClassName(
				"listing__details__actions"
			)[0];
			const button = document.createElement("a");
			button.setAttribute(
				"data-tippy-content",
				"Gladiator.tf Instant Trade"
			);
			button.classList.add("glad-icon");
			button.classList.add("glad-static");
			buttons.append(button);
			tippy(button);

			button.addEventListener(
				"click",
				function () {
					if (!startTransaction(listingId)) {
						return Modal(
							"Error creating trade",
							"You already have a trade processing! Wait for it to finish before starting another."
						);
					}

					button.classList.remove("glad-static");
					button.classList.add("glad-loading");

					checkout()
						.catch(err =>
							Modal("Error creating trade", err.message)
						)
						.finally(() => {
							button.classList.add("glad-static");
							button.classList.remove("glad-loading");
						});
				},
				false
			);
		}

		function observe(mutationsList) {
			for (const mutation of mutationsList) {
				if (mutation.type !== "childList") {
					continue;
				}

				for (const node of mutation.addedNodes) {
					if (node.classList?.contains("tippy-popper")) {
						handlePopper(bots, node);
						continue;
					}

					if (
						!node.children ||
						!node.children[0] ||
						node.children[0].innerText !== "BOT"
					) {
						continue;
					}

					handleListing(bots, node);
				}
			}
		}

		new MutationObserver(observe).observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true
		});
	}

	function addLinksClassic(bots) {
		/* global Modal */
		/* global $ */

		const spinner = `<i class="fa fa-spin fa-spinner"></i>`;

		$(".listing").each(function () {
			const $listing = $(this);
			const bot = $listing.find(".user-link").attr("data-id");
			if (!bots.includes(bot)) {
				return;
			}

			const $item = $listing.find(".listing-item .item");
			const $buttons = $listing.find(".listing-buttons");

			let $instantTrade = $(
				`<a title='Gladiator.tf Instant Trade' class='btn btn-success btn-bottom btn-xs' data-tip=top style=""></a>`
			);
			$instantTrade.css("height", "22px");
			$instantTrade.css("width", "23px");
			$instantTrade.css(
				"background-image",
				"url(https://gladiator.tf/img/logo.svg)"
			);
			$instantTrade.css("background-size", "50%");
			$instantTrade.css("background-repeat", "no-repeat");
			$instantTrade.css("background-position", "center");
			$buttons.append($instantTrade);

			const itemName = $item.attr("data-original-title");
			const listingId = $listing.attr("id").replace("listing-", "");

			$instantTrade.click(() => {
				if (!startTransaction(listingId)) {
					return Modal.render(
						"Error creating trade",
						"You already have a trade processing! Wait for it to finish before starting another."
					);
				}

				let cart = { buy: [], sell: [] };
				if ($item.data("listing_intent") === "buy") {
					cart.sell.push(itemName);
				} else {
					cart.buy.push(itemName);
				}

				$instantTrade.html(spinner);
				$instantTrade.css("background-image", "none");

				checkout(bot, cart)
					.catch(err =>
						Modal.render("Error creating trade", err.message)
					)
					.finally(() => {
						$instantTrade.empty();
						$instantTrade.css(
							"background-image",
							"url(https://gladiator.tf/img/logo.svg)"
						);
					});
			});
		});
	}

	async function fetchUserTradeLink() {
		return fetchUserTradeLinkNext().catch(_ => fetchUserTradeLinkClassic());
	}

	function fetchUserTradeLinkClassic() {
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: `https://backpack.tf/settings`,
				onload: function (response) {
					const parser = new DOMParser();
					const doc = parser.parseFromString(
						response.responseText,
						"text/html"
					);

					const tradeOfferUrl =
						doc.getElementById("tradeoffers_url").value;
					resolve(tradeOfferUrl);
				},
				onerror: function (err) {
					reject(err);
				}
			});
		});
	}

	function fetchUserTradeLinkNext() {
		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: `https://next.backpack.tf/cors/_account/getTradeOffersUrl`,
				onload: function (response) {
					const data = JSON.parse(response.responseText);
					resolve(data.url);
				},
				onerror: function (err) {
					reject(err);
				}
			});
		});
	}

	function hookPopupsClassic(bots) {
		const spinner = `<i class="fa fa-spin fa-spinner"></i>`;

		$("body").on("mouseover", ".item", function () {
			const self = this;

			const id = setInterval(function () {
				const $popover = $(self).next();
				if (!$popover.hasClass("popover")) {
					return;
				}

				clearInterval(id);

				const $priceLinks = $popover.find("#popover-price-links");
				const $listing = $popover.find(".item-popover-listing");
				const $item = $popover
					.parent()
					.parent()
					.find(".listing-item .item");

				const listingId = $popover
					.parent()
					.parent()
					.attr("id")
					.replace("listing-", "");

				const itemName = $item.attr("data-original-title");

				if (
					$priceLinks.find(".gladiator-instant-trade").length != 0 ||
					$listing.length === 0
				) {
					return;
				}

				const bot = $listing
					.find("dd")
					.first()
					.find("a")
					.first()
					.attr("href")
					.replace("/u/", "");

				if (!bots.includes(bot)) {
					return;
				}

				let $instantTrade = $(
					`<a class="btn btn-default btn-xs gladiator-instant-trade" target="_blank"><i class="fa fa-flash fa-sw"></i>Instant Trade</a>`
				);

				$instantTrade.click(() => {
					if (!startTransaction(listingId)) {
						return Modal.render(
							"Error creating trade",
							"You already have a trade processing! Wait for it to finish before starting another."
						);
					}

					let cart = { buy: [], sell: [] };
					if ($item.data("listing_intent") === "buy") {
						cart.sell.push(itemName);
					} else {
						cart.buy.push(itemName);
					}

					$instantTrade.html(`${spinner}Instant Trade`);

					checkout(bot, cart)
						.catch(err =>
							Modal.render("Error creating trade", err.message)
						)
						.finally(() => {});
				});

				$priceLinks.append($instantTrade);
			}, 50);

			setTimeout(function () {
				clearInterval(id);
			}, 750);
		});
	}

	execute();
})();
