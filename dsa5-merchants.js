import DSA5Payment from "../../systems/dsa5/modules/system/payment.js";
import ActorSheetdsa5NPC from "../../systems/dsa5/modules/actor/npc-sheet.js";

const moduleName = "dsa5-merchants-taverns";

const qualityOptions = [
    {key: 'spelunke', name: "Spelunke", price: 0.75},
    {key: 'taverne', name: "Taverne", price: 1},
    {key: 'herberge', name: "Herberge", price: 1.25},
    {key: 'hotel', name: "Hotel", price: 1.5}
]

Hooks.once("init", () => {
    Actors.registerSheet("dsa5", TavernSheetDSA5, {types: ["npc"]});
    Handlebars.registerHelper('money', function (a) {
        return DSA5Payment._moneyToString(a)
    });
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
        html.find("button[name='serve-and-bill']").click(event => this._serve(event, html));
        html.find("button[name='bill-only']").click(event => this._bill(event, html));
        html.find("button[name='clear']").click(event => this._emptyCart(event, html));
        html.find("button[name='unlock-innkeeper']").click(event => this._unlockInnkeeper(event, html));
        html.find("button[name='lock-innkeeper']").click(event => this._lockInnkeeper(event, html));


        html.find("button[name='checkout']").click(event => this._checkout(event, html));
        html.find("button[name='charge-bill']").click(event => this._chargeBill(event, html));
        html.find("button[name='clear-bill']").click(event => this._clearBill(event, html));


        html.find("button[name='delete-category']").click(event => this._deleteCategory(event, html));
        html.find("button[name='add-category']").click(event => this._addCategory(event, html));
        html.find("input[name='category-name']").change(event => this._changeCategory(event, 'name'));
        html.find("input[name='category-roll']").change(event => this._changeCategory(event, 'roll'));
        html.find("select[name='category-rolltable']").change(event => this._changeCategory(event, 'table'));
        html.find("select[name='quality']").change(event => this._changeQuality(event));
    }

    playerViewEnabled() {
        return !game.user.isGM || getProperty(this.actor.data.data, "merchant.playerView")
    }

    async getData() {
        this.tradeOffer = this.actor.getFlag(moduleName, 'trade-offer') || []
        this.roleTables = this.actor.getFlag(moduleName, 'roleTables') || []
        this.finalBill = this.actor.getFlag(moduleName, 'bill') || []
        this.finalTotalPrice = this.actor.getFlag(moduleName, 'total-price') || 0
        const qualityOption = this.actor.getFlag(moduleName, 'qualityOption') || 2
        const packTables = await game.packs.get(`dsa5-merchants-taverns.rolltables`).getContent()

        const data = super.getData();
        mergeObject(data, {
            qualityOptions, qualityOption,
            packTables: packTables,
            permission: this.actor.data.permission.default,
            tradeOffer: this.tradeOffer,
            roleTables: this.roleTables,
            bill: this.bill,
            cart: this.cart,
            totalPrice: this.totalPrice,
            finalBill: this.finalBill,
            finalTotalPrice: this.finalTotalPrice
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

    async _updateInventory(event, html) {
        console.clear()
        const packTables = await game.packs.get(`dsa5-merchants-taverns.rolltables`).getContent()
        const qualityOption = this.actor.getFlag(moduleName, 'qualityOption') || 'taverne'
        const quality = qualityOptions.find(q => q.key === qualityOption) || {price: 1}

        let tradeOffer = []
        for (let table of this.roleTables) {
            let index = []
            const rolltable = packTables.find(t => t._id === table.table)
            const amount = await rollAmount(table.roll[qualityOption])
            const results = await drawManyWithoutReplacement(rolltable, amount)
            for (let article of results) {
                let pack = game.packs.get(article.collection)
                let itemDetail = await pack.getEntry(article.resultId)
                if (!itemDetail)
                    index.push({
                        _id: null,
                        name: article.text,
                        img: article.img,
                        price: 0,
                        show: false
                    })
                else
                    index.push({
                        _id: itemDetail._id,
                        name: itemDetail.name,
                        img: itemDetail.img,
                        price: itemDetail.data.price.value * (quality.price),
                        show: false
                    })
            }
            tradeOffer.push({
                name: table.name,
                index
            })
        }
        this.actor.setFlag(moduleName, 'trade-offer', tradeOffer)
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
        this._bill()
        this.cart = []
        this.render()
    }

    _bill(event, html) {
        if (!this.bill)
            this.bill = []
        this.bill.push(this.cart)
        this.cart = []
        this.render()
    }

    async _checkout(event, html) {
        const paymentType = $(event.currentTarget).attr("data-payment")
        if (paymentType === 'zusammen') {
            let moneyString = this.finalTotalPrice.toString()
            let money = DSA5Payment._getPaymoney(moneyString)
            if (money) {
                let content = '<h3>Gesamtrechnung:</h3>'
                content += `</p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">${game.i18n.localize("PAYMENT.payButton")}</button>`
                const message = await ChatMessage.create({content})
                console.log(message)
            }
            this.cart = []
            this.totalPrice = 0
        } else if (paymentType === 'dutch') {
            let moneyString = (this.finalTotalPrice / 5).toString()
            let money = DSA5Payment._getPaymoney(moneyString)
            if (money) {
                let content = '<h3>Macht dann pro Kopf:</h3>'
                content += `</p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">${game.i18n.localize("PAYMENT.payButton")}</button>`
                const message = await ChatMessage.create({content})
                console.log(message)
            }
            this.cart = []
            this.totalPrice = 0
        } else if (paymentType === 'aufrunden-silber' || paymentType === 'aufrunden-heller') {

            let price = 0
            if (paymentType === 'aufrunden-silber')
                price = Math.ceil(this.finalTotalPrice)
            if (paymentType === 'aufrunden-heller')
                price = Math.ceil(this.finalTotalPrice * 10) / 10

            let moneyString = price.toString()
            const tippPercentage = Math.floor((price - this.finalTotalPrice) / this.finalTotalPrice * 100)
            let money = DSA5Payment._getPaymoney(moneyString)
            if (money) {
                let content = `<h3>Danke für ${tippPercentage}% Trinkgeld!</h3>`
                content += `</p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">${game.i18n.localize("PAYMENT.payButton")}</button>`
                const message = await ChatMessage.create({content})
                console.log(message)
            }
            this.cart = []
            this.totalPrice = 0
        }
        this.render()
    }

    async _chargeBill() {
        this.actor.setFlag(moduleName, 'bill', this.bill || [])
        this.actor.setFlag(moduleName, 'total-price', this.totalPrice || 0)

        this.bill = []
        this.cart = []
        this.totalPrice = 0
    }

    async _clearBill() {
        this.bill = []
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

    _deleteCategory(event, html) {
        const categoryId = $(event.currentTarget).attr("data-category-id")
        this.roleTables.splice(categoryId, 1)
        this.actor.setFlag(moduleName, 'roleTables', this.roleTables)
    }

    _addCategory(event, html) {
        this.roleTables.push({})
        this.actor.setFlag(moduleName, 'roleTables', this.roleTables)
        this.render()
    }

    _changeCategory(event, key) {
        if (key === 'roll') {

            if (!this.roleTables[$(event.currentTarget).attr("data-category-id")][key] || Array.isArray(this.roleTables[$(event.currentTarget).attr("data-category-id")][key]))
                this.roleTables[$(event.currentTarget).attr("data-category-id")][key] = {}
            this.roleTables[$(event.currentTarget).attr("data-category-id")][key][$(event.currentTarget).attr("data-quality-key")] = $(event.currentTarget)[0].value

        } else
            this.roleTables[$(event.currentTarget).attr("data-category-id")][key] = $(event.currentTarget)[0].value
        this.actor.setFlag(moduleName, 'roleTables', this.roleTables)
    }

    _changeQuality(event) {
        this.actor.setFlag(moduleName, 'qualityOption', $(event.currentTarget)[0].value)
    }

    _unlockInnkeeper(event) {
        const perms = this.actor.data.permission
        perms.default = 1
        this.actor.update({permission: perms})
    }

    _lockInnkeeper(event) {
        const perms = this.actor.data.permission
        perms.default = 0
        this.actor.update({permission: perms})
    }
}


export async function drawManyWithoutReplacement(table, amount) {
    let result = []
    if (!table) return result
    if (amount >= table.data.results.length)
        return table.data.results
    while (result.length < amount) {
        let newResult = await table.draw({displayChat: false})
        let duplicate = result.find(r => r._id === newResult.results[0]._id)
        if (duplicate === undefined)
            result.push(newResult.results[0])
    }
    return result
}

export async function rollAmount(wurf) {
    if (!wurf || wurf === "") return 0
    let roll = new Roll(wurf);
    roll.evaluate();
    return roll.result
}



