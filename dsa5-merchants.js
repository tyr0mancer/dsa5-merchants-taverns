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
            width: (game.user.isGM) ? 1600 : 400,
            height: (game.user.isGM) ? 1000 : 700,
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
        html.find("a[name='update-inventory']").click(event => this._updateInventory(event, html));
        html.find("button[name='toggle-show-entry']").click(event => this._toggleShowEntry(event, html));
        html.find("a[name='toggle-show-entry']").click(event => this._toggleShowEntry(event, html));
        html.find("button[name='take-order']").click(event => this._takeOrder(event, html));

        html.find("a[name='refresh-name']").click(event => this._refreshName(event, html));


        html.find("a[name='clear-order']").click(event => this._clearOrder(event, html));
        html.find("button[name='show-order']").click(event => this._showOrder(event, html));
        html.find("button[name='serve-order']").click(event => this._serveOrder(event, html));
        html.find("button[name='charge-order']").click(event => this._chargeOrder(event, html));
        html.find("button[name='sell-order']").click(event => this._sellOrder(event, html));
        html.find("a[name='clear-orders']").click(event => this._clearOrders(event, html));

        html.find("button[name='unlock-innkeeper']").click(event => this._unlockInnkeeper(event, html));
        html.find("button[name='lock-innkeeper']").click(event => this._lockInnkeeper(event, html));

        html.find("button[name='checkout']").click(event => this._checkout(event, html));


        html.find("button[name='delete-category']").click(event => this._deleteCategory(event, html));
        html.find("button[name='add-category']").click(event => this._addCategory(event, html));
        html.find("input[name='category-name']").change(event => this._changeCategory(event, 'name'));
        html.find("input[name='category-roll']").change(event => this._changeCategory(event, 'roll'));
        html.find("select[name='category-rolltable']").change(event => this._changeCategory(event, 'table'));
        html.find("select[name='quality']").change(event => this._changeQuality(event));
        html.find("select[name='buyers']").change(event => this._changeBuyers(event));


        html.find("input[name='establishment']").change(event => this._changeEstablishment(event));


    }

    playerViewEnabled() {
        return !game.user.isGM || getProperty(this.actor.data.data, "merchant.playerView")
    }

    async getData() {
        if (!this.buyersCount) this.buyersCount = 3
        this.tradeOffer = this.actor.getFlag(moduleName, 'trade-offer') || []
        this.establishment = this.actor.getFlag(moduleName, 'establishment') || TavernSheetDSA5.getRandomEstablishmentName()
        this.roleTables = this.actor.getFlag(moduleName, 'roleTables') || []
        this.qualityOption = this.actor.getFlag(moduleName, 'qualityOption') || 2
        if (!this.rolltableOptions) {
            this.rolltableOptions = []
            for (let pack of game.packs) {
                if (pack.metadata.entity !== 'RollTable')
                    continue
                const packName = pack.metadata.package + '.' + pack.metadata.name
                const content = await pack.getContent()
                for (let tableOption of content)
                    this.rolltableOptions.push({_id: tableOption._id, packName: packName, name: tableOption.data.name})
            }
            this.rolltableOptions = this.rolltableOptions.sort(function (a, b) {
                if (a.name.toLowerCase() < b.name.toLowerCase()) {
                    return -1;
                }
                if (a.name.toLowerCase() > b.name.toLowerCase()) {
                    return 1;
                }
                return 0;
            })
        }


        const data = super.getData();
        mergeObject(data, {
            qualityOptions,
            qualityOption: this.qualityOption,
            rolltableOptions: this.rolltableOptions,
            locked: (this.actor.data.permission.default !== 1),
            roleTables: this.roleTables,

            establishment: this.establishment,
            tradeOffer: this.tradeOffer,
            tradeOfferPlayer: this.tradeOffer.filter(o => o.index.find(e => e.show)),
            currentOrder: this.currentOrder,
            subTotal: this.subTotal,
            orderTotal: this.orderTotal,
            buyersCount: this.buyersCount,

            bill: this.bill,
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
        const qualityOption = this.actor.getFlag(moduleName, 'qualityOption') || 'taverne'
        const quality = qualityOptions.find(q => q.key === qualityOption) || {price: 1}
        let tradeOffer = []
        for (let table of this.roleTables) {
            let index = []
            const [packName, tableId] = table.table.split(':')
            if (!packName)
                continue
            let packTables = await game.packs.get(packName).getContent()
            let rolltable = packTables.find(t => t._id === tableId)
            const amount = await rollAmount(table.roll[qualityOption])
            const results = await drawManyWithoutReplacement(rolltable, amount)
            for (let article of results) {
                let itemDetail
                if (article.collection) {
                    let pack = game.packs.get(article.collection)
                    itemDetail = await pack.getEntry(article.resultId)
                }
                if (!itemDetail)
                    index.push({
                        _id: article.resultId,
                        name: article.text,
                        img: article.img,
                        description: null,
                        price: 0,
                        show: false
                    })
                else
                    index.push({
                        _id: itemDetail._id,
                        name: itemDetail.name,
                        img: itemDetail.img,
                        description: itemDetail.data?.description?.value,
                        collection: article.collection,
                        price: itemDetail.data?.price.value * (quality.price),
                        show: false
                    })
            }
            tradeOffer.push({
                name: table.name,
                index
            })
        }
        console.log(tradeOffer)
        this.actor.setFlag(moduleName, 'trade-offer', tradeOffer)
    }

    _takeOrder(event, html) {
        const entryId = $(event.currentTarget).attr("data-entry-id")
        if (!this.currentOrder) this.currentOrder = []
        if (!this.subTotal) this.subTotal = 0

        const entry = this._thisFindEntry(entryId)
        if (!entry) return
        this.currentOrder.push(entry)
        this.subTotal += entry.price
        this.render()
    }


    async _checkout(event, html) {
        if (!this.orderTotal)
            return
        const paymentType = $(event.currentTarget).attr("data-payment")
        let content = `<h2>${this.actor.name} bringt euch die Rechnung:</h2>`
        let paymentPrice = this.orderTotal
        if (paymentType === 'dutch') {
            const playerCount = this.buyersCount || 2
            paymentPrice = Math.ceil(this.orderTotal / playerCount * 100) / 100
            content += `<h3>Macht dann pro Kopf (geteilt durch ${playerCount}):</h3>`
        } else {
            content += `<h3>Macht dann zusammen:</h3>`
        }


        const paymentChatContent = (price, paymentPrice = null) => {
            let money = DSA5Payment._getPaymoney(price.toString())
            if (!money)
                return
            if (!paymentPrice)
                return `</p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">Zeche bezahlen</button>`
            let tip = Math.ceil((price - paymentPrice) / paymentPrice * 100)
            return `</p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">${tip}% Trinkgeld</button>`
        }

        content += paymentChatContent(paymentPrice)
        content += paymentChatContent(Math.ceil(paymentPrice / 10) * 10, paymentPrice)
        content += paymentChatContent(Math.ceil(paymentPrice), paymentPrice)
        content += paymentChatContent(Math.ceil(paymentPrice * 10) / 10, paymentPrice)

        const message = await ChatMessage.create({
            speaker: {alias: this.establishment},
            content
        })
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

    _clearOrder(event, html) {
        this.currentOrder = []
        this.subTotal = 0
        this.render()
    }

    //todo wrap up flag setter / getter
    _changeQuality(event) {
        this.actor.setFlag(moduleName, 'qualityOption', $(event.currentTarget)[0].value)
    }

    _changeBuyers(event) {
        this.buyersCount = $(event.currentTarget)[0].value
    }

    _changeEstablishment(event) {
        this.actor.setFlag(moduleName, 'establishment', $(event.currentTarget)[0].value)
    }

    _deleteCategory(event, html) {
        const categoryId = $(event.currentTarget).attr("data-category-id")
        let roleTables = duplicate(this.roleTables);
        roleTables.splice(categoryId, 1)
        this.actor.setFlag(moduleName, 'roleTables', roleTables)
        this.roleTables = roleTables
        this.render()
    }

    _addCategory(event, html) {
        let roleTables = duplicate(this.roleTables);
        roleTables.push({roll: {}, name: 'neu'})
        this.actor.setFlag(moduleName, 'roleTables', roleTables)
        this.roleTables = roleTables
        this.render()
    }

    async _changeCategory(event, key) {
        let roleTables = duplicate(this.roleTables);

        if (key === 'roll') {
            if (!roleTables[$(event.currentTarget).attr("data-category-id")][key] || Array.isArray(roleTables[$(event.currentTarget).attr("data-category-id")][key]))
                roleTables[$(event.currentTarget).attr("data-category-id")][key] = {}
            roleTables[$(event.currentTarget).attr("data-category-id")][key][$(event.currentTarget).attr("data-quality-key")] = $(event.currentTarget)[0].value
            /*
                    } else if (key === 'table') {
                        roleTables[$(event.currentTarget).attr("data-category-id")][key] = $(event.currentTarget)[0].value
            */
        } else {
            roleTables[$(event.currentTarget).attr("data-category-id")][key] = $(event.currentTarget)[0].value
        }

        this.actor.setFlag(moduleName, 'roleTables', roleTables)
        this.roleTables = roleTables
        this.render()
    }


    async _unlockInnkeeper(event) {
        console.clear()
        console.log(this.actor.data.permission)
        const perms = this.actor.data.permission
        perms.default = 1
        const result = await this.actor.update({permission: perms})
        console.log(result)
        console.log(this.actor.data.permission)
        //this.render()
    }

    async _lockInnkeeper(event) {
        console.clear()
        console.log(this.actor.data.permission)
        const perms = this.actor.data.permission
        perms.default = 0
        const result = await this.actor.update({permission: perms})
        console.log(result)
        console.log(this.actor.data.permission)
        //this.render()
    }

    _showOrder(event, html) {
        let content = `<h2>${this.actor.name} zeigt euch:</h2>`
        for (let entry of this.currentOrder) {
            content += `<p><img src="${entry.img}" style="width: 48px; margin-right: 10px"/><b>${entry.name}</b></p>`
            if (entry.description && entry.description !== null)
                content += `<p>${entry.description}</p>`
        }
        ChatMessage.create({
            speaker: {
                alias: this.establishment
            },
            content
        })
    }

    _serveOrder(event, html) {
        let content = `<h2>${this.actor.name} bringt euch:</h2>`
        for (let entry of this.currentOrder) {
            content += `<p><img src="${entry.img}" style="width: 48px; margin-right: 10px"/><b>${entry.name}</b></p>`
        }
        ChatMessage.create({
            speaker: {
                alias: this.establishment
            },
            content
        })
        this._chargeOrder()
        this.currentOrder = []
        this.subTotal = 0
        this.render()
    }

    _chargeOrder(event, html) {
        if (!this.bill)
            this.bill = []
        if (!this.orderTotal)
            this.orderTotal = 0

        this.bill.push(this.currentOrder)
        this.orderTotal += this.subTotal

        this.currentOrder = []
        this.subTotal = 0
        this.render()
    }

    async _sellOrder(event, html) {
        let money = DSA5Payment._getPaymoney(this.subTotal.toString())
        if (!money)
            return

        let content = `<h2>Danke für Euren Einkauf!</h2>`
        for (let entry of this.currentOrder) {
            content += `@Compendium[${entry.collection}.${entry._id}]{${entry.name}}`
        }

        content += `<p>${game.i18n.format("PAYMENT.paySum", {amount: DSA5Payment._moneyToString(money)})}</p><button class="payButton" data-amount="${money}">${game.i18n.localize("PAYMENT.payButton")}</button>`
        await ChatMessage.create({content})

        this.currentOrder = []
        this.subTotal = 0
        this.render()
    }

    async _clearOrders() {
        this.bill = []
        this.orderTotal = 0
        this.currentOrder = []
        this.subTotal = 0
        this.render()
    }

    static getRandomEstablishmentName() {
        const part1 = ['Zur / Zum', 'In der / Im', 'Die / Der / Das']
        const part2 = ['schwarze', 'weiße', 'bunte', 'rote', 'gelbe', 'blaue', 'silberne', 'goldene', 'graue', 'königliche', 'arme', 'fleißige', 'faule', 'kichernde', 'kreischende', 'herrliche', 'schreckliche', 'geheime', 'löbliche', 'räudige', 'rasende', 'hurtige', 'rauchende', 'qualmende', 'dampfende', 'lärmende', 'stille', 'heulende', 'jaulende', 'wimmernde', 'lachende', 'trübe', 'helle', 'warme', 'kalte', 'dunkle', 'heiße', 'gefrorene', 'dumme', 'schlaue', 'fette', 'dürre', 'tote', 'verwundete', 'betrunkene', 'besoffene', 'letzte', 'erste', 'neue', 'alte', 'rostige', 'hohe', 'tiefe', 'lustige', 'traurige', 'ängstliche', 'mutige', 'muntere', 'freundliche', 'teuflische']
        const part3 = ['Eber', 'Hirsch', 'Eulenbär', 'Drachen', 'Fuchs', 'Affe', 'Hahn', 'Adler', 'Vogel', 'Esel', 'Ferdinand', 'Stiefel', 'Schuh', 'Handschuh', 'Rock', 'Riemen', 'Hut', 'Helm', 'Unterrock', 'Hantel', 'Leuchter', 'Strumpf', 'Rauchfang', 'Amboss', 'Kleiderschrank', 'Schemel', 'Sarg', 'Waschzuber', 'Brunnen', 'Haken', 'Strick', 'Krug', 'Kessel', 'Deckel', 'Topf', 'Henkel', 'Pott', 'Nachttopf', 'Spucknapf', 'Becher', 'König', 'Bettler', 'Müller', 'Schuster', 'Jäger', 'Meister', 'Mönch', 'Diener', 'Abt', 'Priester', 'Kesselflicker', 'Mann', 'Bengel', 'Tempel', 'Tümpel', 'See', 'Sumpf', 'Keller', 'Schmerz', 'Triumph', 'Tod', 'Kerl', 'Taugenichts', 'Reiter', 'Schild', 'Speer', 'Morgenstern', 'Dolch', 'Hammer', 'Bogen', 'Langbogen', 'Dreschflegel', 'Dreizack', 'Oger', 'Troll', 'Ork', 'Goblin', 'Hippogreif', 'Bastard', 'Zwerg', 'Halbling', 'Grubentroll', 'Buckel', 'Gruftschrecken', 'Zombie', 'Einhorn', 'Reh', 'Kaninchen', 'Wildschwein', 'Schwein', 'Huhn', 'Schaf', 'Ross', 'Rössl', 'Hemd', 'Amulett', 'Krönchen', 'Strumpfband', 'Regal', 'Geschirr', 'Becken', 'Brauhaus', 'Badehaus', 'Wäldchen', 'Loch', 'Lieschen', 'Männchen', 'Schlachthaus', 'Glück', 'Unglück', 'Vergessen', 'Schwert', 'Schild', 'Messer', 'Beil', 'Herz', 'Köpfchen', 'Nierchen', 'Haus', 'Fass', 'Weib', 'Brathuhn', 'Löckchen', 'Schreckgespenst', 'Gespenst', 'Skelett', 'Äffchen', 'Zimmer', 'Sau', 'Antilope', 'Fledermaus', 'Maus', 'Ratte', 'Kuh', 'Henne', 'Ziege', 'Fliege', 'Mücke', 'Laus', 'Krone', 'Garderobe', 'Socke', 'Locke', 'Leber', 'Niere', 'Todesfee', 'Vettel', 'Amme', 'Eckbank', 'Bank', 'Treppe', 'Leiter', 'Unterkunft', 'Bleibe', 'Brücke', 'Tasse', 'Pfanne', 'Kelle', 'Bratpfanne', 'Bratröhre', 'Lampe', 'Fackel', 'Kugel', 'Königin', 'Bettlerin', 'Müllerin', 'Meisterin', 'Nonne', 'Äbtissin', 'Frau', 'Magd', 'Küche', 'Brauerei', 'Kirche', 'Badestube', 'Müllerstube', 'Backstube', 'Stube', 'Freude', 'Trauer', 'Liebe', 'Verzweiflung', 'Hoffnung', 'Auferstehung', 'Wiedergeburt', 'Armbrust', 'Glefe', 'Mistgabel', 'Heugabel', 'PeitscheZange', 'Hacke', 'Spitzhacke', 'Reitgerte', 'Angel', 'Rute', 'Lanze', 'Axt', 'Streitaxt', 'Machete']
        const rndArr = arr => arr[Math.floor(Math.random() * arr.length)]
        return `${rndArr(part1)} ${rndArr(part2)} ${rndArr(part3)}`
    }

    _refreshName(event, html) {
        let name = TavernSheetDSA5.getRandomEstablishmentName()
        this.actor.setFlag(moduleName, 'establishment', name)
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



