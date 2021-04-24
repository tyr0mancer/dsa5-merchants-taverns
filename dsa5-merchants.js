/*
/*
import Itemdsa5 from "../../systems/dsa5/modules/item/item-dsa5.js";
*/
import DSA5Payment from "../../systems/dsa5/modules/system/payment.js";
import ActorSheetdsa5NPC from "../../systems/dsa5/modules/actor/npc-sheet.js";

const moduleName = "dsa5-merchants-taverns";

const TRADE_OFFER = [
    {
        name: 'Getränke',
        index: [
            {
                _id: 'axy17',
                name: 'Andergaster Eichenbier',
                price: 0.4,
                img: `modules/${moduleName}/images/taverne/fish.webp`
            },
            {
                _id: 'axy29',
                name: 'Krug Wasser',
                price: 10.1,
                img: `modules/${moduleName}/images/taverne/fish.webp`
            }
        ]
    },
    {
        name: 'Übernachtung',
        index: [
            {
                _id: 'xy17',
                name: 'Nacht im Schlafsaal',
                price: 1,
                img: `modules/${moduleName}/images/taverne/fish.webp`
            },
            {
                _id: 'xy29',
                name: 'Nacht im Heuboden',
                price: 0.4,
                img: `modules/${moduleName}/images/taverne/fish.webp`
            }
        ]
    }
]


Hooks.once("init", () => {
    console.clear()
    Actors.registerSheet("dsa5", TavernSheetDSA5, {types: ["npc"]});
})


export default class TavernSheetDSA5 extends ActorSheetdsa5NPC {
    static get defaultOptions() {
        const options = super.defaultOptions;
        mergeObject(options, {
            classes: options.classes.concat(["dsa5", "actor", "npc-sheet", "merchant-sheet"]),
            width: (game.user.isGM) ? 800 : 400,
            height: 700,
        });
        return options;
    }

    get template() {
        if (this.playerViewEnabled())
            return `modules/${moduleName}/templates/tavern-sheet-player.html`
        else
            return `modules/${moduleName}/templates/tavern-sheet-gm.html`
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("button[name='update-inventory']").click(event => this._updateInventory(event, html));
        html.find("button[name='toggle-show-entry']").click(event => this._toggleShowEntry(event, html));
        html.find("button[name='to-cart']").click(event => this._toCart(event, html));
        html.find("button[name='checkout']").click(event => this._checkout(event, html));
        html.find("button[name='serve']").click(event => this._serve(event, html));
        html.find("button[name='clear']").click(event => this._emptyCart(event, html));
    }

    playerViewEnabled() {
        return !game.user.isGM || getProperty(this.actor.data.data, "merchant.playerView")
    }

    async getData() {
        this.tradeOffer = this.actor.getFlag(moduleName, 'trade-offer') || []
        const data = super.getData();
        mergeObject(data, {
            tradeOffer: this.tradeOffer,
            cart: this.cart,
            totalPrice: this.totalPrice,
        })
        return data;
    }

    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();
        if (game.user.isGM) {
            buttons.unshift({
                class: "playerview",
                icon: `fas fa-toggle-on`,
                onclick: async ev => this._togglePlayerview(ev)
            })
        }
        return buttons
    }

    _togglePlayerview(ev) {
        this.actor.update({"data.merchant.playerView": !getProperty(this.actor.data.data, "merchant.playerView")})
    }

    _updateInventory(event, html) {
        this.actor.setFlag(moduleName, 'trade-offer', TRADE_OFFER)
    }

    _toCart(event, html) {
        const entryId = $(event.currentTarget).attr("data-entry-id")
        if (!this.cart) this.cart = []
        if (!this.totalPrice) this.totalPrice = 0

        const entry = this._thisFindEntry(entryId)
        if (!entry) return

        this.cart.push(entry)
        this.totalPrice += entry.price
        this.render()
    }


    _serve(event, html) {
        let content = ``
        for (let entry of this.cart)
            content += `<img src="${entry.img}" style="width: 48px"/><h2>${entry.name}</h2>`
        ChatMessage.create({content})
        this.render()
    }

    _checkout(event, html) {
        let content = `<h3>Rechnung:</h3><ul>`
        for (let e of this.cart)
            content += '<li>' + e.name + '</li>'
        content += '</ul>'
        ChatMessage.create({content})
        DSA5Payment.createPayChatMessage(this.totalPrice.toString())
        this.cart = []
        this.totalPrice = 0
        this.render()
    }


    _toggleShowEntry(event, html) {
        const entryId = $(event.currentTarget).attr("data-entry-id")
        const dataShow = $(event.currentTarget).attr("data-show")
        const toggleAll = (!entryId || entryId === 'all')
        const tradeOffer = this.tradeOffer.map(c => {
            return {
                ...c,
                index: c.index.map(e => !toggleAll && e._id !== entryId ? e : {
                    ...e,
                    show: (dataShow === undefined || dataShow === "toggle") ? !e.show : (dataShow === "true")
                })
            }
        })
        this.actor.setFlag(moduleName, 'trade-offer', tradeOffer)

    }

    _thisFindEntry(entryId) {
        if (!this.tradeOffer || this.tradeOffer === []) return null
        for (let c of this.tradeOffer) {
            let entry = c.index.find(e => e._id === entryId)
            if (entry)
                return entry
        }
        return null
    }

    _emptyCart(event, html) {
        this.cart = []
        this.totalPrice = 0
        this.render()
    }
}
