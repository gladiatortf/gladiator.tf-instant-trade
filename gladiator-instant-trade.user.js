// ==UserScript==
// @name            Gladiator.tf Instant Trade
// @namespace       https://gladiator.tf/
// @version         1.0
// @author          Gladiator.TF Team &  manic
// @description     Start a trade with a Gladiator.tf bot in a single click
// @grant           GM_xmlhttpRequest
// @grant           GM_addStyle
// @connect         gladiator.tf
// @connect         backpack.tf
// @connect         next.backpack.tf
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

	const spinnerClassic = `<i class="fa fa-spin fa-spinner"></i>`;
	const iconClassic = `<i class="fa fa-flash fa-sw"></i>`;

	const SECOND = 1000;
	const MINUTE = 60 * SECOND;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	const URL = "https://gladiator.tf";

	let activelyTrading = false;
	let activeListingId = null;

	const isNext = typeof __NUXT__ !== "undefined";
	const nextWebsite = isNext
		? document.location.hostname
		: "next.backpack.tf"; // In-case update changes the hostname

	const LOGGER = {
		info: msg => {
			console.log("[instant-trade]: " + msg);
		},
		error: err => {
			console.error(
				"[instant-trade] ERROR: " + err.stack || err.message || err
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

	function isCurrentlyActive(listingId) {
		return isTrading() && activeListingId === listingId;
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
						reject(new Error(response.error));
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
		localStorage.removeItem("gladiator.tf bots"); // Clear cache for older script users.

		const key = `instant_trade_${URL}_bots`;
		const rawData = localStorage.getItem(key);
		if (rawData) {
			const data = JSON.parse(rawData);
			if (Date.now() - data.at < DAY) {
				LOGGER.info("Using cached bot set");
				return data.bots;
			}
		}

		const bots = await fetchBots().catch(err => {
			if (rawData) {
				return JSON.parse(rawData).bots;
			}

			throw err;
		});

		localStorage.setItem(key, JSON.stringify({ at: new Date(), bots }));
		return bots;
	}

	function createCart(listingId, itemName, intent) {
		LOGGER.info(
			`Trading - intent=${intent} listingId=${listingId} - ${itemName}`
		);

		const cart = { buy: [], sell: [] };
		if (intent === "sell") {
			const assetid = listingId.split("_")[1];

			cart.buy.push({
				assetid
			});
		} else {
			cart.sell.push(itemName);
		}

		return cart;
	}

	function startTrade(bot, cart, createTradeOfferUrl) {
		LOGGER.info("Sending trade to gladiator network...");

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
						LOGGER.error(response.error);
						reject(new Error(response.error));
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
						window.open(
							`https://${nextWebsite}/account/trade-offers`
						);
					} else {
						window.open("https://backpack.tf/settings##general");
					}

					throw new Error("No trade offer link set on backpack.tf");
				}

				LOGGER.info(`Got ${tradeLink}`);
				return startTrade(bot, cart, tradeLink);
			})
			.then(tradeOfferUrl => {
				LOGGER.info(`Received trade ${tradeOfferUrl}`);
				return [window.open(tradeOfferUrl), tradeOfferUrl];
			})
			.catch(err => {
				if (err.message === "Not signed in") {
					LOGGER.error("No trade offer url found.");
					window.open(`${URL}/auth/steam`);
					return;
				}

				throw err;
			})
			.finally(() => endTransaction());
	}

	function modalRender(title, description) {
		LOGGER.error(`${title} - ${description}`);
		return Modal.render(title, description);
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
				node.getElementsByClassName("instant-trade-popper").length
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
					link.href.startsWith(`https://${nextWebsite}/profiles/`) &&
					link.href.endsWith("/user")
				) {
					bot = link.href
						.replace(`https://${nextWebsite}/profiles/`, "")
						.replace("/user", "");
					continue;
				}

				if (
					link.href.startsWith(`https://${nextWebsite}/classifieds`)
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
				`https://${nextWebsite}/classifieds/`,
				""
			);
			const intent = listingId.split("_").length > 2 ? "buy" : "sell";

			const linkBoxes = node.getElementsByClassName(
				"item-tooltip__content__links"
			);
			const referenceLinkBox = linkBoxes[linkBoxes.length - 1];
			const referenceLink = linkBoxes[0].children[0].cloneNode(true);
			referenceLink.setAttribute("target", "_blank");

			const itPopper = referenceLink.cloneNode(true);
			itPopper.id = `instant-trade-popper-${listingId}`;
			itPopper.classList.add("instant-trade-popper");

			itPopper.innerHTML = ICON(10, 10) + " Instant Trade";

			itPopper.addEventListener("click", function () {
				if (!startTransaction(listingId)) {
					return Modal(
						"Error creating trade",
						"You already have a trade processing! Wait for it to finish before starting another."
					);
				}

				const itBtn = document.getElementById(
					`instant-trade-${listingId}`
				);
				if (itBtn) {
					itBtn.classList.remove("glad-static");
					itBtn.classList.add("glad-loading");
				}

				const cart = createCart(listingId, itemName, intent);
				checkout(bot, cart)
					.then(([windowOpenRes, tradeOfferUrl]) => {
						if (!windowOpenRes) {
							Modal(
								"Your trade offer is ready",
								`<a href="${tradeOfferUrl}" target="_blank">Link</a>`
							);
						}
					})
					.catch(err => Modal("Error creating trade", err.message))
					.finally(() => {
						const itBtn = document.getElementById(
							`instant-trade-${listingId}`
						);
						if (itBtn) {
							itBtn.classList.add("glad-static");
							itBtn.classList.remove("glad-loading");
						}
					});
			});

			addLink(referenceLinkBox, referenceLinkBox, itPopper);
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
					link.href.startsWith(`https://${nextWebsite}/profiles/`) &&
					link.href.endsWith("/user")
				) {
					bot = link.href
						.replace(`https://${nextWebsite}/profiles/`, "")
						.replace("/user", "");
					continue;
				}

				if (
					link.href.startsWith(`https://${nextWebsite}/classifieds`)
				) {
					listingId = link.href.replace(
						`https://${nextWebsite}/classifieds/`,
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

			const buttons = listingNode.getElementsByClassName(
				"listing__details__actions"
			)[0];

			const itBtn = document.createElement("a");
			itBtn.id = `instant-trade-${listingId}`;
			itBtn.setAttribute(
				"data-tippy-content",
				"Gladiator.tf Instant Trade"
			);
			itBtn.classList.add("glad-icon");
			itBtn.classList.add("glad-static");
			buttons.append(itBtn);
			tippy(itBtn);

			itBtn.addEventListener(
				"click",
				function (e) {
					e.preventDefault();

					if (!startTransaction(listingId)) {
						return Modal(
							"Error creating trade",
							"You already have a trade processing! Wait for it to finish before starting another."
						);
					}

					itBtn.classList.remove("glad-static");
					itBtn.classList.add("glad-loading");

					const cart = createCart(listingId, itemName, intent);
					checkout(bot, cart)
						.then(([windowOpenRes, tradeOfferUrl]) => {
							if (!windowOpenRes) {
								Modal(
									"Your trade offer is ready",
									`<a href="${tradeOfferUrl}" target="_blank">Link</a>`
								);
							}
						})
						.catch(err =>
							Modal("Error creating trade", err.message)
						)
						.finally(() => {
							itBtn.classList.add("glad-static");
							itBtn.classList.remove("glad-loading");
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

		$(".listing").each(function () {
			const $listing = $(this);
			const bot = $listing.find(".user-link").attr("data-id");
			if (!bots.includes(bot)) {
				return;
			}

			const $item = $listing.find(".listing-item .item");
			const $buttons = $listing.find(".listing-buttons");

			const itemName = $item.attr("data-original-title");
			const listingId = $listing.attr("id").replace("listing-", "");

			const $itBtn = $(
				`<a id="instant-trade-${listingId}" title="Gladiator.tf Instant Trade" class="btn btn-success btn-bottom btn-xs" data-tip=top style=""></a>`
			);

			$itBtn.css("height", "22px");
			$itBtn.css("width", "23px");
			$itBtn.css(
				"background-image",
				"url(https://gladiator.tf/img/logo.svg)"
			);
			$itBtn.css("background-size", "50%");
			$itBtn.css("background-repeat", "no-repeat");
			$itBtn.css("background-position", "center");
			$buttons.append($itBtn);

			$itBtn.click(() => {
				if (!startTransaction(listingId)) {
					return modalRender(
						"Error creating trade",
						"You already have a trade processing! Wait for it to finish before starting another."
					);
				}

				const intent = $item.data("listing_intent");
				const cart = createCart(listingId, itemName, intent);

				$itBtn.html(spinnerClassic);
				$itBtn.css("background-image", "none");

				const $itPopper = $(`#instant-trade-popper-${listingId}`);
				if ($itPopper.length > 0) {
					$itPopper.html(`${spinnerClassic} Instant Trade`);
					$itPopper.attr("disabled", true);
				}

				checkout(bot, cart)
					.then(([windowOpenRes, tradeOfferUrl]) => {
						if (!windowOpenRes) {
							Modal.render(
								"Your trade offer is ready",
								`<a href="${tradeOfferUrl}" target="_blank">Link</a>`
							);
						}
					})
					.catch(err => {
						modalRender("Error creating trade", err.message);
					})
					.finally(() => {
						const $itPopper = $(
							`instant-trade-popper-${listingId}`
						);
						if ($itPopper.length > 0) {
							$itPopper.html(`${iconClassic} Instant Trade`);
							$itPopper.attr("disabled", false);
						}

						$itBtn.empty();
						$itBtn.css(
							"background-image",
							"url(https://gladiator.tf/img/logo.svg)"
						);
					});
			});
		});
	}

	async function fetchUserTradeLink() {
		return fetchUserTradeLinkClassic();
		// return fetchUserTradeLinkNext().catch(_ => fetchUserTradeLinkClassic());
	}

	function fetchUserTradeLinkClassic() {
		LOGGER.info("Fetching trade offer url from classic");

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
		LOGGER.info("Fetching trade offer url from next");

		return new Promise((resolve, reject) => {
			GM_xmlhttpRequest({
				method: "GET",
				url: `https://${nextWebsite}/cors/_account/getTradeOffersUrl`,
				onload: function (response) {
					if (response.status !== 200) {
						reject(
							new Error("Failed to fetch the trade offer url")
						);
					}

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
		$("body").on("mouseover", ".item", function () {
			const self = this;

			const id = setInterval(function () {
				const $popover = $(self).next();
				if (!$popover.hasClass("popover")) {
					return;
				}

				clearInterval(id);

				let $gladLinks = $("#popover-glad-links");
				if ($gladLinks.length === 0) {
					const $additionalLinks = $popover.find(
						"#popover-additional-links"
					);

					$gladLinks = $additionalLinks.clone();
					$gladLinks.empty();
					$gladLinks.attr("id", "popover-glad-links");

					$(".popover-content").first().append($gladLinks);
				}

				const $listing = $popover.find(".item-popover-listing");
				const $item = $popover
					.parent()
					.parent()
					.find(".listing-item .item");

				const $popParent = $popover.parent().parent();
				if (
					typeof $popParent.attr("id") === "undefined" ||
					!$popParent.attr("id").startsWith("listing-")
				) {
					return;
				}

				const listingId = $popParent.attr("id").replace("listing-", "");

				const itemName = $item.attr("data-original-title");

				if (
					$gladLinks.find(".instant-trade-popper").length != 0 ||
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

				const $itPopper = $(
					`<a id="instant-trade-popper-${listingId}" class="btn btn-default btn-xs instant-trade-popper" target="_blank">${iconClassic}</i> Instant Trade</a>`
				);

				if (isCurrentlyActive(listingId)) {
					$itPopper.html(`${spinnerClassic} Instant Trade`);
					$itPopper.attr("disabled", true);
				}

				$itPopper.click(() => {
					if (!startTransaction(listingId)) {
						return modalRender(
							"Error creating trade",
							"You already have a trade processing! Wait for it to finish before starting another."
						);
					}

					const $itBtn = $(`#instant-trade-${listingId}`);
					if ($itBtn.length > 0) {
						$itBtn.html(spinnerClassic);
						$itBtn.css("background-image", "none");
					}

					$itPopper.html(`${spinnerClassic} Instant Trade`);
					$itPopper.attr("disabled", true);

					const intent = $item.data("listing_intent");
					const cart = createCart(listingId, itemName, intent);
					checkout(bot, cart)
						.then(([windowOpenRes, tradeOfferUrl]) => {
							if (!windowOpenRes) {
								Modal.render(
									"Your trade offer is ready",
									`<a href="${tradeOfferUrl}" target="_blank">Link</a>`
								);
							}
						})
						.catch(err =>
							modalRender("Error creating trade", err.message)
						)
						.finally(() => {
							if ($itBtn.length > 0) {
								$itBtn.empty();
								$itBtn.css(
									"background-image",
									"url(https://gladiator.tf/img/logo.svg)"
								);
							}

							$itPopper.html(`${iconClassic} Instant Trade`);
							$itPopper.attr("disabled", false);
						});
				});

				$gladLinks.append($itPopper);
			}, 50);

			setTimeout(function () {
				clearInterval(id);
			}, 750);
		});
	}

	execute();
})();
